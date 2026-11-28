import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../netlify/functions/lib/db.js'; // Fixed path here

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function test() {
  // Load .env manually from the root folder
  try {
    const envFile = await fs.readFile(path.resolve(__dirname, '../.env'), 'utf8');
    envFile.split(/\r?\n/).forEach(line => {
      if (!line || line.startsWith('#')) return;
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) process.env[match[1]] = (match[2] || '').trim().replace(/^["']|["']$/g, '');
    });
    console.log("✅ Loaded .env variables.");
  } catch {
    console.log("⚠️ No .env file, using system variables.");
  }

  try {
    console.log("⏳ Connecting to Oracle...");
    const rows = await query('SELECT table_name FROM user_tables');
    console.log("✅ Successfully connected to Oracle Autonomous Database!");
    console.log("📋 Tables found in your database:", rows.map(r => r.TABLE_NAME).join(', '));
  } catch (err) {
    console.error("❌ Connection failed:", err.message);
  }
  process.exit(0);
}

test();