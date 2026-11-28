import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Manually load .env file so it works everywhere
async function loadEnv() {
  try {
    const envPath = path.resolve(__dirname, '../.env');
    const envFile = await fs.readFile(envPath, 'utf8');
    envFile.split(/\r?\n/).forEach(line => {
      if (!line || line.startsWith('#')) return;
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = (match[2] || '').trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[key] = value;
      }
    });
    console.log("✅ Manually loaded .env file");
  } catch (err) {
    console.log("⚠️ No .env file found. Relying on system environment variables.");
  }
}

async function run() {
  console.log("=== STARTING MIGRATION ===");
  
  await loadEnv();

  let execute, uploadFile;
  try {
    const dbModule = await import('../netlify/functions/lib/db.js');
    execute = dbModule.execute;
    console.log("✅ Loaded db.js successfully.");
  } catch (err) {
    console.error("❌ Failed to load db.js. Did you run `npm install`?", err.message);
    return;
  }

  try {
    const storageModule = await import('../netlify/functions/lib/storage.js');
    uploadFile = storageModule.uploadFile;
    console.log("✅ Loaded storage.js successfully.");
  } catch (err) {
    console.error("❌ Failed to load storage.js.", err.message);
    return;
  }

  let rawData;
  try {
    const dbPath = path.resolve(__dirname, '../db.json');
    rawData = await fs.readFile(dbPath, 'utf8');
    console.log(`✅ Read db.json successfully from ${dbPath}`);
  } catch (err) {
    console.error("❌ Failed to read db.json. Ensure it is in the project root.", err.message);
    return;
  }

  const db = JSON.parse(rawData);
  console.log(`🚀 Found ${db.papers.length} papers to migrate.\n`);

  for (const paper of db.papers) {
    console.log(`Processing paper: ${paper.id}`);
    
    const filesToUpload = new Set();
    if (paper.currentFilePath) filesToUpload.add(paper.currentFilePath);
    if (paper.versions) paper.versions.forEach(v => { if(v.filePath) filesToUpload.add(v.filePath) });
    if (paper.payment?.receiptFilePath) filesToUpload.add(paper.payment.receiptFilePath);
    if (paper.certificates) paper.certificates.forEach(c => { if(c.filePath) filesToUpload.add(c.filePath) });

    for (const key of filesToUpload) {
      try {
        const filePath = path.resolve(__dirname, `../migrate-files/${key}`);
        const fileBuffer = await fs.readFile(filePath);
        await uploadFile(key, fileBuffer);
        console.log(`  -> Uploaded to Oracle S3: ${key}`);
      } catch (err) {
        console.warn(`  -> ⚠️ Could not upload ${key}. (Is it in migrate-files/?)`);
      }
    }

    let userId = null;
    if (paper.submitterEmail) {
      try {
        const res = await execute(
          'INSERT INTO users (email, name) VALUES (:email, :name) RETURNING user_id INTO :id',
          { email: paper.submitterEmail, name: paper.submitterName || paper.authors?.[0]?.name || 'Author', id: { dir: 3003, type: 2 } }
        );
        userId = res.outBinds.id[0];
        console.log(`  -> Created user: ${paper.submitterEmail}`);
      } catch (err) {
        try {
            const rows = await execute('SELECT user_id FROM users WHERE email = :email', [paper.submitterEmail]);
            if (rows.rows.length > 0) {
                userId = rows.rows[0].USER_ID;
                console.log(`  -> Found existing user: ${paper.submitterEmail}`);
            } else {
                console.error(`  -> ❌ Failed to find user:`, err.message);
                continue;
            }
        } catch (fetchErr) {
            console.error(`  -> ❌ Failed to create/fetch user:`, fetchErr.message);
            continue;
        }
      }
    }

    try {
      await execute(
        `INSERT INTO papers (paper_id, user_id, title, status, figshare_id, doi, pdf_key, submitted_at, raw_data)
         VALUES (:id, :user_id, :title, :status, :figshare_id, :doi, :pdf_key, TO_TIMESTAMP_TZ(:submitted_at), :raw_data)`,
        {
          id: paper.id, user_id: userId, title: paper.title, status: paper.status,
          figshare_id: paper.figshare?.articleId || null, doi: paper.figshare?.doi || null,
          pdf_key: paper.currentFilePath || null, submitted_at: paper.submittedAt || new Date().toISOString(),
          raw_data: JSON.stringify(paper)
        }
      );
      console.log(`  -> ✅ Saved paper to DB.`);
    } catch (err) {
      console.error(`  -> ❌ Failed to save paper:`, err.message);
      continue;
    }

    if (paper.payment && paper.payment.utr) {
      const p = paper.payment;
      try {
        await execute(
          `INSERT INTO payments (transaction_id, paper_id, user_id, amount, status, paid_at)
           VALUES (:tid, :pid, :uid, :amount, :status, TO_TIMESTAMP_TZ(:paid_at))`,
          { tid: p.utr, pid: paper.id, uid: userId, amount: p.amount || 0, status: p.status || 'submitted', paid_at: p.confirmedAt || p.submittedAt || new Date().toISOString() }
        );
        console.log(`  -> ✅ Saved payment (${p.utr}).`);
      } catch (err) {
        console.error(`  -> ❌ Failed to save payment:`, err.message);
      }
    }

    if (Array.isArray(paper.certificates)) {
      for (const cert of paper.certificates) {
        if (!cert.filePath) continue;
        try {
            await execute(
            `INSERT INTO certificates (verify_code, paper_id, cert_key, issued_at)
             VALUES (:vid, :pid, :ckey, TO_TIMESTAMP_TZ(:iat))`,
            { vid: cert.certificateId, pid: paper.id, ckey: cert.filePath, iat: cert.generatedAt || new Date().toISOString() }
            );
            console.log(`  -> ✅ Saved certificate (${cert.certificateId}).`);
        } catch (err) {
            console.error(`  -> ❌ Failed to save certificate:`, err.message);
        }
      }
    }
  }
  
  console.log("\n🎉 === MIGRATION COMPLETE ===");
  process.exit(0);
}

run().catch(err => {
    console.error("❌ Unhandled Fatal Error:", err);
});