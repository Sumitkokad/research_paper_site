import oracledb from 'oracledb';
import { query, execute } from './db.js';
import { uploadFile, downloadFile } from './storage.js';

// ---- small helpers -------------------------------------------------------

// Oracle needs an explicit format for ISO dates (the "T" and "Z" break the default one).
const TS_MASK = `'YYYY-MM-DD"T"HH24:MI:SS'`;
function ts(value) {
  const d = value ? new Date(value) : new Date();
  return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString().slice(0, 19);
}

// Cut text to the column size so a long value can't crash the insert (ORA-12899).
function cut(value, max) {
  if (value === undefined || value === null) return null;
  return String(value).slice(0, max);
}

// raw_data can come back as a string, or already as an object depending on the column type.
function parseRaw(value) {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

// ---- public API (same names/signatures as before) ------------------------

export async function isStoreConfigured() {
  return Boolean(process.env.ORACLE_DB_CONNECT_STRING && process.env.OCI_S3_ACCESS_KEY);
}

export async function readDatabase() {
  const papersRows = await query('SELECT raw_data FROM papers');
  const papers = papersRows.map(row => parseRaw(row.RAW_DATA)).filter(Boolean);

  const rateLimitsRows = await query('SELECT limit_key, count, started_at FROM rate_limits');
  const rateLimits = {};
  for (const row of rateLimitsRows) {
    rateLimits[row.LIMIT_KEY] = { count: row.COUNT, startedAt: row.STARTED_AT };
  }

  return { schemaVersion: 1, papers, rateLimits, updatedAt: new Date().toISOString() };
}

async function findOrCreateUser(email, name) {
  if (!email) return null;
  const find = async () => {
    const rows = await query('SELECT user_id FROM users WHERE email = :email', { email });
    return rows.length > 0 ? rows[0].USER_ID : null;
  };

  const existing = await find();
  if (existing !== null) return existing;

  try {
    const res = await execute(
      'INSERT INTO users (email, name) VALUES (:email, :name) RETURNING user_id INTO :id',
      {
        email,
        name,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );
    return res.outBinds.id[0];
  } catch (err) {
    // Two requests created the same user at once (unique email) -> just read it back.
    if (err && err.errorNum === 1) {
      const again = await find();
      if (again !== null) return again;
    }
    throw err;
  }
}

export async function updateDatabase(mutator, commitMessage = 'Update') {
  const db = await readDatabase();
  const result = await mutator(db);

  // Some callers return the whole database object, others return just a result value
  // (e.g. the new paper). In the second case we must still save `db`, which the
  // mutator changed in place.
  const returnedDb =
    result && typeof result === 'object' && Array.isArray(result.papers) ? result : null;
  const updatedDb = returnedDb || db;

  if (!Array.isArray(updatedDb.papers)) {
    throw new Error('updateDatabase: database object has no "papers" array');
  }

  const existingRows = await query('SELECT paper_id, raw_data FROM papers');
  const existingMap = new Map(existingRows.map(r => [r.PAPER_ID, r.RAW_DATA]));

  for (const paper of updatedDb.papers) {
    const newRaw = JSON.stringify(paper);
    if (newRaw === existingMap.get(paper.id)) continue; // nothing changed

    const submitterEmail = cut(paper.submitterEmail || '', 255);
    const submitterName = cut(paper.submitterName || '', 255);

    // 1. Find or create the user
    const userId = await findOrCreateUser(submitterEmail, submitterName);

    // 2. Upsert the paper (raw JSON is kept so the site reads exactly what it wrote)
    await execute(
      `MERGE INTO papers t
       USING (SELECT :id AS paper_id FROM dual) s
       ON (t.paper_id = s.paper_id)
       WHEN MATCHED THEN UPDATE SET
         user_id = :user_id, title = :title, status = :status,
         figshare_id = :figshare_id, doi = :doi, pdf_key = :pdf_key, raw_data = :raw_data
       WHEN NOT MATCHED THEN INSERT
         (paper_id, user_id, title, status, figshare_id, doi, pdf_key, submitted_at, raw_data)
         VALUES (:id, :user_id, :title, :status, :figshare_id, :doi, :pdf_key,
                 TO_TIMESTAMP(:submitted_at, ${TS_MASK}), :raw_data)`,
      {
        id: cut(paper.id, 50),
        user_id: userId,
        title: cut(paper.title, 500),
        status: cut(paper.status, 30),
        figshare_id: cut(paper.figshare?.articleId, 100),
        doi: cut(paper.figshare?.doi, 150),
        pdf_key: cut(paper.currentFilePath, 300),
        submitted_at: ts(paper.submittedAt),
        raw_data: newRaw
      }
    );

    // 3. Upsert the payment
    if (paper.payment && paper.payment.utr) {
      const p = paper.payment;
      await execute(
        `MERGE INTO payments t
         USING (SELECT :tid AS transaction_id FROM dual) s
         ON (t.transaction_id = s.transaction_id)
         WHEN MATCHED THEN UPDATE SET amount = :amount, status = :status,
           paid_at = TO_TIMESTAMP(:paid_at, ${TS_MASK})
         WHEN NOT MATCHED THEN INSERT (transaction_id, paper_id, user_id, amount, status, paid_at)
           VALUES (:tid, :pid, :uid, :amount, :status, TO_TIMESTAMP(:paid_at, ${TS_MASK}))`,
        {
          tid: cut(p.utr, 100),
          pid: cut(paper.id, 50),
          uid: userId,
          amount: Number(p.amount) || 0,
          status: cut(p.status || 'submitted', 30),
          paid_at: ts(p.confirmedAt || p.submittedAt)
        }
      );
    }

    // 4. Insert any new certificates
    if (Array.isArray(paper.certificates)) {
      for (const cert of paper.certificates) {
        if (!cert.filePath || !cert.certificateId) continue;
        await execute(
          `MERGE INTO certificates t
           USING (SELECT :vid AS verify_code FROM dual) s
           ON (t.verify_code = s.verify_code)
           WHEN NOT MATCHED THEN INSERT (verify_code, paper_id, cert_key, issued_at)
             VALUES (:vid, :pid, :ckey, TO_TIMESTAMP(:iat, ${TS_MASK}))`,
          {
            vid: cut(cert.certificateId, 60),
            pid: cut(paper.id, 50),
            ckey: cut(cert.filePath, 300),
            iat: ts(cert.generatedAt)
          }
        );
      }
    }
  }

  // Rate limits (unchanged behaviour)
  for (const [key, val] of Object.entries(updatedDb.rateLimits || {})) {
    await execute(
      `MERGE INTO rate_limits t
       USING (SELECT :k AS limit_key FROM dual) s
       ON (t.limit_key = s.limit_key)
       WHEN MATCHED THEN UPDATE SET count = :c, started_at = :sa
       WHEN NOT MATCHED THEN INSERT (limit_key, count, started_at) VALUES (:k, :c, :sa)`,
      { k: key, c: val.count, sa: val.startedAt }
    );
  }

  return result === undefined ? updatedDb : result;
}

export async function writeBinary(path, buffer, commitMessage) {
  await uploadFile(path, buffer);
  return 'success';
}

export async function readBinary(path) {
  if (!path) return null;
  return await downloadFile(path);
}