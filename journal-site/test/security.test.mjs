import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminCookie, verifyAdminCookie, setAdminCookie, clearAdminCookie } from '../netlify/functions/lib/security.mjs';

test('admin cookie is signed, expires after 12 hours and rejects tampering', () => {
  const now = 1_800_000_000_000;
  const cookie = createAdminCookie('a-strong-session-secret', now);
  assert.equal(verifyAdminCookie(cookie, 'a-strong-session-secret', now + 1), true);
  assert.equal(verifyAdminCookie(cookie, 'wrong-secret', now + 1), false);
  assert.equal(verifyAdminCookie(`${cookie}x`, 'a-strong-session-secret', now + 1), false);
  assert.equal(verifyAdminCookie(cookie, 'a-strong-session-secret', now + 12 * 60 * 60 * 1000 + 1), false);
});

test('admin session cookie is HTTP-only and SameSite Strict', () => {
  const cookie = setAdminCookie('signed-token');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=43200/);
  assert.match(clearAdminCookie(), /Max-Age=0/);
});


test('admin cookie adds Secure on HTTPS deployment URLs even without NODE_ENV', () => {
  const priorNodeEnv = process.env.NODE_ENV;
  const priorSiteUrl = process.env.JOURNAL_SITE_URL;
  const priorUrl = process.env.URL;
  try {
    delete process.env.NODE_ENV;
    process.env.JOURNAL_SITE_URL = 'https://journal.example.org';
    delete process.env.URL;
    assert.match(setAdminCookie('signed-token'), /; Secure$/);
    assert.match(clearAdminCookie(), /; Secure$/);
  } finally {
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = priorNodeEnv;
    if (priorSiteUrl === undefined) delete process.env.JOURNAL_SITE_URL; else process.env.JOURNAL_SITE_URL = priorSiteUrl;
    if (priorUrl === undefined) delete process.env.URL; else process.env.URL = priorUrl;
  }
});
