import { query } from './lib/db.js';

// Runs every day at midnight UTC
export const config = { schedule: "@daily" };

export default async () => {
  try {
    await query('SELECT 1 FROM dual');
    console.log('[keepalive] Database pinged successfully');
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error('[keepalive] Database ping failed:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};