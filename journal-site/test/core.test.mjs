import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureCertificates, issueSignedToken, verifySignedToken, isValidUtr } from '../netlify/functions/lib/core.mjs';
import { generateCertificatePdf, generatePaymentReceiptPdf } from '../netlify/functions/lib/certificates.mjs';

test('UTR validation accepts exactly 12 digits', () => {
  assert.equal(isValidUtr('123456789012'), true);
  assert.equal(isValidUtr('12345678901'), false);
  assert.equal(isValidUtr('12345678901A'), false);
  assert.equal(isValidUtr(' 123456789012 '), true);
});

test('signed author/payment tokens validate and expire', () => {
  const now = 1_800_000_000_000;
  const token = issueSignedToken('a-long-test-secret', 'paper-1', 60, now);
  assert.equal(verifySignedToken(token, 'a-long-test-secret', now)?.sub, 'paper-1');
  assert.equal(verifySignedToken(token, 'wrong-secret', now), null);
  assert.equal(verifySignedToken(token, 'a-long-test-secret', now + 61_000), null);
});

test('certificate allocation is idempotent and returns one certificate per author', () => {
  let count = 0;
  const makeId = () => `CERT-${++count}`;
  const paper = { authors: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] };
  ensureCertificates(paper, makeId);
  ensureCertificates(paper, makeId);
  assert.equal(paper.certificates.length, 3);
  assert.deepEqual(paper.certificates.map((item) => item.authorIndex), [0, 1, 2]);
  assert.equal(count, 3);
});

test('certificate generator produces a valid PDF with a verification QR', async () => {
  const buffer = await generateCertificatePdf({
    paper: { id: 'ijrise-2026-TEST', title: 'A test paper title for certificate layout', authors: [{ name: 'Author One' }, { name: 'Author Two' }], publishedAt: '2026-11-21T00:00:00.000Z', volume: 'Vol. 1', issue: 'Issue 11' },
    certificate: { certificateId: 'ijrise-CERT-2026-TEST', authorIndex: 0, authorName: 'Author One' },
    verifyUrl: 'https://example.org/verify/ijrise-CERT-2026-TEST'
  });
  assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(buffer.length > 1500);
});

test('payment receipt generator produces a valid PDF', async () => {
  const buffer = await generatePaymentReceiptPdf({
    paper: { id: 'ijrise-2026-TEST', title: 'A test research paper', submitterName: 'Author One' },
    payment: { receiptId: 'RCPT-TEST', amount: 1234, utr: '123456789012', submittedAt: '2026-11-21T00:00:00.000Z', confirmedAt: '2026-11-21T01:00:00.000Z' }
  });
  assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-');
});
