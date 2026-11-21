import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEmail } from '../netlify/functions/lib/email.mjs';

test('email template escapes untrusted titles and editorial comments', () => {
  const email = makeEmail('revision', {
    id: 'ijrise-2026-TEST',
    title: '<img src=x onerror=alert(1)>',
    submitterName: 'Author',
    authors: [{ name: 'Author' }]
  }, { comments: '<script>alert(1)</script>' });
  assert.doesNotMatch(email.html, /<img src=x|<script>alert/);
  assert.match(email.html, /&lt;img/);
  assert.match(email.html, /&lt;script&gt;/);
});

test('email plain text includes private author tracking link', () => {
  const email = makeEmail('submitted', { id: 'ijrise-2026-TEST', title: 'Test title', submitterName: 'Author', authors: [] }, { trackingUrl: 'https://journal.example/track?token=secret' });
  assert.match(email.text, /https:\/\/journal\.example\/track\?token=secret/);
});
