import crypto from 'node:crypto';
import { timingSafeEqualText, verifySignedToken } from './core.mjs';

const SESSION_COOKIE = 'ijsci_admin';

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

export function text(data, status = 200, headers = {}) {
  return new Response(data, { status, headers });
}

export function getCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  const match = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!match) return '';
  try { return decodeURIComponent(match.slice(name.length + 1)); }
  catch { return ''; }
}

export function createAdminCookie(secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub: 'admin', exp: now + 12 * 60 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAdminCookie(value, secret, now = Date.now()) {
  if (!value || !secret) return false;
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!timingSafeEqualText(signature, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.sub === 'admin' && Number(data.exp) > now;
  } catch {
    return false;
  }
}

function secureCookieSuffix() {
  const deployedHttps = [process.env.JOURNAL_SITE_URL, process.env.URL]
    .some((value) => /^https:\/\//i.test(String(value || '')));
  return process.env.NODE_ENV === 'production' || deployedHttps ? '; Secure' : '';
}

export function setAdminCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=43200${secureCookieSuffix()}`;
}

export function clearAdminCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secureCookieSuffix()}`;
}

export function isAdminRequest(request) {
  return verifyAdminCookie(getCookie(request, SESSION_COOKIE), process.env.ADMIN_SESSION_SECRET);
}

export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function readJson(request) {
  try { return await request.json(); }
  catch { return {}; }
}

export function requestIp(request, context) {
  return context?.ip || request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export function verifyOpaqueToken(token, expectedHash) {
  if (!token || !expectedHash) return false;
  const actual = crypto.createHash('sha256').update(String(token)).digest('hex');
  return timingSafeEqualText(actual, expectedHash);
}

export function requireAdmin(request) {
  return isAdminRequest(request) ? null : json({ error: 'Please sign in to continue.' }, 401);
}
