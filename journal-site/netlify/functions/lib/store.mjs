// import oracledb from 'oracledb';
// import { query, execute } from './db.js';
// import { uploadFile, downloadFile } from './storage.js';

// // ---- small helpers -------------------------------------------------------

// // Oracle needs an explicit format for ISO dates (the "T" and "Z" break the default one).
// const TS_MASK = `'YYYY-MM-DD"T"HH24:MI:SS'`;
// function ts(value) {
//   const d = value ? new Date(value) : new Date();
//   return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString().slice(0, 19);
// }

// // Cut text to the column size so a long value can't crash the insert (ORA-12899).
// function cut(value, max) {
//   if (value === undefined || value === null) return null;
//   return String(value).slice(0, max);
// }

// // raw_data can come back as a string, or already as an object depending on the column type.
// function parseRaw(value) {
//   if (value === undefined || value === null) return null;
//   return typeof value === 'string' ? JSON.parse(value) : value;
// }

// // ---- public API (same names/signatures as before) ------------------------

// export async function isStoreConfigured() {
//   return Boolean(process.env.ORACLE_DB_CONNECT_STRING && process.env.OCI_S3_ACCESS_KEY);
// }

// export async function readDatabase() {
//   const papersRows = await query('SELECT raw_data FROM papers');
//   const papers = papersRows.map(row => parseRaw(row.RAW_DATA)).filter(Boolean);

//   const rateLimitsRows = await query('SELECT limit_key, count, started_at FROM rate_limits');
//   const rateLimits = {};
//   for (const row of rateLimitsRows) {
//     rateLimits[row.LIMIT_KEY] = { count: row.COUNT, startedAt: row.STARTED_AT };
//   }

//   return { schemaVersion: 1, papers, rateLimits, updatedAt: new Date().toISOString() };
// }

// async function findOrCreateUser(email, name) {
//   if (!email) return null;
//   const find = async () => {
//     const rows = await query('SELECT user_id FROM users WHERE email = :email', { email });
//     return rows.length > 0 ? rows[0].USER_ID : null;
//   };

//   const existing = await find();
//   if (existing !== null) return existing;

//   try {
//     const res = await execute(
//       'INSERT INTO users (email, name) VALUES (:email, :name) RETURNING user_id INTO :id',
//       {
//         email,
//         name,
//         id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
//       }
//     );
//     return res.outBinds.id[0];
//   } catch (err) {
//     // Two requests created the same user at once (unique email) -> just read it back.
//     if (err && err.errorNum === 1) {
//       const again = await find();
//       if (again !== null) return again;
//     }
//     throw err;
//   }
// }

// export async function updateDatabase(mutator, commitMessage = 'Update') {
//   const db = await readDatabase();
//   const result = await mutator(db);

//   // Some callers return the whole database object, others return just a result value
//   // (e.g. the new paper). In the second case we must still save `db`, which the
//   // mutator changed in place.
//   const returnedDb =
//     result && typeof result === 'object' && Array.isArray(result.papers) ? result : null;
//   const updatedDb = returnedDb || db;

//   if (!Array.isArray(updatedDb.papers)) {
//     throw new Error('updateDatabase: database object has no "papers" array');
//   }

//   const existingRows = await query('SELECT paper_id, raw_data FROM papers');
//   const existingMap = new Map(existingRows.map(r => [r.PAPER_ID, r.RAW_DATA]));

//   for (const paper of updatedDb.papers) {
//     const newRaw = JSON.stringify(paper);
//     if (newRaw === existingMap.get(paper.id)) continue; // nothing changed

//     const submitterEmail = cut(paper.submitterEmail || '', 255);
//     const submitterName = cut(paper.submitterName || '', 255);

//     // 1. Find or create the user
//     const userId = await findOrCreateUser(submitterEmail, submitterName);

//     // 2. Upsert the paper (raw JSON is kept so the site reads exactly what it wrote)
//     await execute(
//       `MERGE INTO papers t
//        USING (SELECT :id AS paper_id FROM dual) s
//        ON (t.paper_id = s.paper_id)
//        WHEN MATCHED THEN UPDATE SET
//          user_id = :user_id, title = :title, status = :status,
//          figshare_id = :figshare_id, doi = :doi, pdf_key = :pdf_key, raw_data = :raw_data
//        WHEN NOT MATCHED THEN INSERT
//          (paper_id, user_id, title, status, figshare_id, doi, pdf_key, submitted_at, raw_data)
//          VALUES (:id, :user_id, :title, :status, :figshare_id, :doi, :pdf_key,
//                  TO_TIMESTAMP(:submitted_at, ${TS_MASK}), :raw_data)`,
//       {
//         id: cut(paper.id, 50),
//         user_id: userId,
//         title: cut(paper.title, 500),
//         status: cut(paper.status, 30),
//         figshare_id: cut(paper.figshare?.articleId, 100),
//         doi: cut(paper.figshare?.doi, 150),
//         pdf_key: cut(paper.currentFilePath, 300),
//         submitted_at: ts(paper.submittedAt),
//         raw_data: newRaw
//       }
//     );

//     // 3. Upsert the payment
//     if (paper.payment && paper.payment.utr) {
//       const p = paper.payment;
//       await execute(
//         `MERGE INTO payments t
//          USING (SELECT :tid AS transaction_id FROM dual) s
//          ON (t.transaction_id = s.transaction_id)
//          WHEN MATCHED THEN UPDATE SET amount = :amount, status = :status,
//            paid_at = TO_TIMESTAMP(:paid_at, ${TS_MASK})
//          WHEN NOT MATCHED THEN INSERT (transaction_id, paper_id, user_id, amount, status, paid_at)
//            VALUES (:tid, :pid, :uid, :amount, :status, TO_TIMESTAMP(:paid_at, ${TS_MASK}))`,
//         {
//           tid: cut(p.utr, 100),
//           pid: cut(paper.id, 50),
//           uid: userId,
//           amount: Number(p.amount) || 0,
//           status: cut(p.status || 'submitted', 30),
//           paid_at: ts(p.confirmedAt || p.submittedAt)
//         }
//       );
//     }

//     // 4. Insert any new certificates
//     if (Array.isArray(paper.certificates)) {
//       for (const cert of paper.certificates) {
//         if (!cert.filePath || !cert.certificateId) continue;
//         await execute(
//           `MERGE INTO certificates t
//            USING (SELECT :vid AS verify_code FROM dual) s
//            ON (t.verify_code = s.verify_code)
//            WHEN NOT MATCHED THEN INSERT (verify_code, paper_id, cert_key, issued_at)
//              VALUES (:vid, :pid, :ckey, TO_TIMESTAMP(:iat, ${TS_MASK}))`,
//           {
//             vid: cut(cert.certificateId, 60),
//             pid: cut(paper.id, 50),
//             ckey: cut(cert.filePath, 300),
//             iat: ts(cert.generatedAt)
//           }
//         );
//       }
//     }
//   }

//   // Rate limits (unchanged behaviour)
//   for (const [key, val] of Object.entries(updatedDb.rateLimits || {})) {
//     await execute(
//       `MERGE INTO rate_limits t
//        USING (SELECT :k AS limit_key FROM dual) s
//        ON (t.limit_key = s.limit_key)
//        WHEN MATCHED THEN UPDATE SET count = :c, started_at = :sa
//        WHEN NOT MATCHED THEN INSERT (limit_key, count, started_at) VALUES (:k, :c, :sa)`,
//       { k: key, c: val.count, sa: val.startedAt }
//     );
//   }

//   return result === undefined ? updatedDb : result;
// }

// export async function writeBinary(path, buffer, commitMessage) {
//   await uploadFile(path, buffer);
//   return 'success';
// }

// export async function readBinary(path) {
//   if (!path) return null;
//   return await downloadFile(path);
// }











import oracledb from 'oracledb';
import { query, execute } from './db.js';
import { uploadFile, downloadFile } from './storage.js';

// ---- Oracle configuration -----------------------------------------------

// ✅ FIX: closing single quote added after SS
const TS_MASK = `'YYYY-MM-DD"T"HH24:MI:SS'`;

// Convert dates to Oracle-compatible ISO timestamps.
function ts(value) {
  const d = value ? new Date(value) : new Date();

  return (
    Number.isNaN(d.getTime()) ? new Date() : d
  ).toISOString().slice(0, 19);
}

// Cut strings according to Oracle VARCHAR2 byte limits.
// This assumes the database uses UTF-8 (AL32UTF8).
function cut(value, maxBytes) {
  if (value === undefined || value === null) return null;

  const input = String(value);

  if (Buffer.byteLength(input, 'utf8') <= maxBytes) {
    return input;
  }

  let output = '';

  for (const char of input) {
    if (Buffer.byteLength(output + char, 'utf8') > maxBytes) {
      break;
    }

    output += char;
  }

  return output;
}

// Read an Oracle CLOB or an already fetched string.
async function readClob(value) {
  if (value === undefined || value === null) return null;

  if (typeof value === 'string') return value;

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }

  if (typeof value[Symbol.asyncIterator] === 'function') {
    let result = '';

    for await (const chunk of value) {
      result += Buffer.isBuffer(chunk)
        ? chunk.toString('utf8')
        : String(chunk);
    }

    return result;
  }

  if (typeof value.getData === 'function') {
    const result = await value.getData();

    return Buffer.isBuffer(result)
      ? result.toString('utf8')
      : String(result);
  }

  throw new Error('Unsupported Oracle CLOB value returned from database');
}

// Convert RAW_DATA into the original JavaScript object.
async function parseRaw(value) {
  const raw = await readClob(value);

  if (raw === null || raw === '') return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Unable to parse PAPERS.RAW_DATA: ${error.message}`
    );
  }
}

// ---- Public API ----------------------------------------------------------

export async function isStoreConfigured() {
  return Boolean(
    process.env.ORACLE_DB_CONNECT_STRING &&
    process.env.OCI_S3_ACCESS_KEY
  );
}

export async function readDatabase() {
  const papersRows = await query(
    'SELECT raw_data FROM papers'
  );

  const papers = (
    await Promise.all(
      papersRows.map(row => parseRaw(row.RAW_DATA))
    )
  ).filter(Boolean);

  const rateLimitsRows = await query(
    'SELECT limit_key, count, started_at FROM rate_limits'
  );

  const rateLimits = {};

  for (const row of rateLimitsRows) {
    rateLimits[row.LIMIT_KEY] = {
      count: row.COUNT,
      startedAt: row.STARTED_AT
    };
  }

  return {
    schemaVersion: 1,
    papers,
    rateLimits,
    updatedAt: new Date().toISOString()
  };
}

// ---- User management -----------------------------------------------------

async function findOrCreateUser(email, name) {
  if (!email) return null;

  const normalizedEmail = cut(email, 255);

  const find = async () => {
    const rows = await query(
      `SELECT user_id
       FROM users
       WHERE email = :user_email`,
      {
        user_email: normalizedEmail
      }
    );

    return rows.length > 0 ? rows[0].USER_ID : null;
  };

  const existing = await find();

  if (existing !== null) {
    return existing;
  }

  try {
    const res = await execute(
      `INSERT INTO users (email, name)
       VALUES (:user_email, :user_name)
       RETURNING user_id INTO :output_user_id`,
      {
        user_email: normalizedEmail,
        user_name: cut(name, 255),
        output_user_id: {
          dir: oracledb.BIND_OUT,
          type: oracledb.NUMBER
        }
      }
    );

    return res.outBinds.output_user_id[0];

  } catch (err) {
    // Another request may have created this user simultaneously.
    if (err && err.errorNum === 1) {
      const again = await find();

      if (again !== null) {
        return again;
      }
    }

    throw err;
  }
}

// ---- Main database update -----------------------------------------------

export async function updateDatabase(
  mutator,
  commitMessage = 'Update'
) {
  const db = await readDatabase();

  const result = await mutator(db);

  const returnedDb =
    result &&
    typeof result === 'object' &&
    Array.isArray(result.papers)
      ? result
      : null;

  const updatedDb = returnedDb || db;

  if (!Array.isArray(updatedDb.papers)) {
    throw new Error(
      'updateDatabase: database object has no papers array'
    );
  }

  // Read existing papers and their CLOB data.
  const existingRows = await query(
    'SELECT paper_id, raw_data FROM papers'
  );

  const existingMap = new Map();

  for (const row of existingRows) {
    existingMap.set(
      row.PAPER_ID,
      await readClob(row.RAW_DATA)
    );
  }

  // ---- Papers, payments and certificates -------------------------------

  for (const paper of updatedDb.papers) {
    if (!paper || !paper.id) {
      throw new Error(
        'Cannot save paper: paper.id is missing'
      );
    }

    const paperId = cut(paper.id, 100);
    const newRaw = JSON.stringify(paper);

    if (newRaw === existingMap.get(paperId)) {
      continue;
    }

    const submitterEmail = cut(
      paper.submitterEmail || '',
      255
    );

    const submitterName = cut(
      paper.submitterName || '',
      255
    );

    // 1. Find or create user.
    const userId = await findOrCreateUser(
      submitterEmail,
      submitterName
    );

    // 2. Insert or update paper.
    await execute(
      `MERGE INTO papers t
       USING (
         SELECT :paper_id AS paper_id FROM dual
       ) s
       ON (t.paper_id = s.paper_id)

       WHEN MATCHED THEN UPDATE SET
         t.user_id = :paper_user_id,
         t.title = :paper_title,
         t.status = :paper_status,
         t.figshare_id = :figshare_id,
         t.doi = :doi_value,
         t.pdf_key = :pdf_key,
         t.raw_data = :raw_json

       WHEN NOT MATCHED THEN INSERT (
         paper_id,
         user_id,
         title,
         status,
         figshare_id,
         doi,
         pdf_key,
         submitted_at,
         raw_data
       )
       VALUES (
         :paper_id,
         :paper_user_id,
         :paper_title,
         :paper_status,
         :figshare_id,
         :doi_value,
         :pdf_key,
         TO_TIMESTAMP(:submitted_at, ${TS_MASK}),
         :raw_json
       )`,
      {
        paper_id: paperId,
        paper_user_id: userId,
        paper_title: cut(paper.title, 1000),
        paper_status: cut(paper.status, 50),
        figshare_id: cut(
          paper.figshare?.articleId,
          255
        ),
        doi_value: cut(paper.figshare?.doi, 255),
        pdf_key: cut(paper.currentFilePath, 500),
        submitted_at: ts(paper.submittedAt),
        raw_json: {
          val: newRaw,
          type: oracledb.CLOB
        }
      }
    );

    // 3. Insert or update payment.
    if (paper.payment && paper.payment.utr) {
      const p = paper.payment;

      await execute(
        `MERGE INTO payments t
         USING (
           SELECT :transaction_id AS transaction_id FROM dual
         ) s
         ON (t.transaction_id = s.transaction_id)

         WHEN MATCHED THEN UPDATE SET
           t.amount = :payment_amount,
           t.status = :payment_status,
           t.paid_at = TO_TIMESTAMP(
             :payment_paid_at,
             ${TS_MASK}
           )

         WHEN NOT MATCHED THEN INSERT (
           transaction_id,
           paper_id,
           user_id,
           amount,
           status,
           paid_at
         )
         VALUES (
           :transaction_id,
           :payment_paper_id,
           :payment_user_id,
           :payment_amount,
           :payment_status,
           TO_TIMESTAMP(:payment_paid_at, ${TS_MASK})
         )`,
        {
          transaction_id: cut(p.utr, 255),
          payment_paper_id: paperId,
          payment_user_id: userId,
          payment_amount: Number(p.amount) || 0,
          payment_status: cut(
            p.status || 'submitted',
            50
          ),
          payment_paid_at: ts(
            p.confirmedAt || p.submittedAt
          )
        }
      );
    }

    // 4. Insert certificates if they do not already exist.
    if (Array.isArray(paper.certificates)) {
      for (const cert of paper.certificates) {
        if (!cert.filePath || !cert.certificateId) {
          continue;
        }

        await execute(
          `MERGE INTO certificates t
           USING (
             SELECT :verify_code AS verify_code FROM dual
           ) s
           ON (t.verify_code = s.verify_code)

           WHEN NOT MATCHED THEN INSERT (
             verify_code,
             paper_id,
             cert_key,
             issued_at
           )
           VALUES (
             :verify_code,
             :certificate_paper_id,
             :certificate_key,
             TO_TIMESTAMP(:certificate_issued_at, ${TS_MASK})
           )`,
          {
            verify_code: cut(
              cert.certificateId,
              100
            ),
            certificate_paper_id: paperId,
            certificate_key: cut(
              cert.filePath,
              500
            ),
            certificate_issued_at: ts(
              cert.generatedAt
            )
          }
        );
      }
    }
  }

  // ---- Rate limits ------------------------------------------------------

  for (
    const [key, val] of Object.entries(
      updatedDb.rateLimits || {}
    )
  ) {
    await execute(
      `MERGE INTO rate_limits t
       USING (
         SELECT :limit_key AS limit_key FROM dual
       ) s
       ON (t.limit_key = s.limit_key)

       WHEN MATCHED THEN UPDATE SET
         t.count = :limit_count,
         t.started_at = :limit_started_at

       WHEN NOT MATCHED THEN INSERT (
         limit_key,
         count,
         started_at
       )
       VALUES (
         :limit_key,
         :limit_count,
         :limit_started_at
       )`,
      {
        limit_key: cut(key, 255),
        limit_count: Number(val.count) || 0,
        limit_started_at: Number(val.startedAt) || 0
      }
    );
  }

  return result === undefined ? updatedDb : result;
}

// ---- Binary storage ------------------------------------------------------

export async function writeBinary(
  path,
  buffer,
  commitMessage
) {
  await uploadFile(path, buffer);

  return 'success';
}

export async function readBinary(path) {
  if (!path) return null;

  return await downloadFile(path);
}