import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUpiUri, validatePaymentUtr } from '../netlify/functions/lib/payments.mjs';

test('UPI QR payload contains the configured beneficiary, amount and paper reference', () => {
  const uri = buildUpiUri({ vpa: 'journal@example', payeeName: 'IJSCI Publishing', amount: 950, reference: 'IJSCI-2026-ABC123', note: 'Publication fee IJSCI-2026-ABC123' });
  const parsed = new URL(uri);
  assert.equal(parsed.protocol, 'upi:');
  assert.equal(parsed.searchParams.get('pa'), 'journal@example');
  assert.equal(parsed.searchParams.get('pn'), 'IJSCI Publishing');
  assert.equal(parsed.searchParams.get('am'), '950.00');
  assert.equal(parsed.searchParams.get('cu'), 'INR');
  assert.equal(parsed.searchParams.get('tr'), 'IJSCI-2026-ABC123');
});

test('UPI UTR validation requires exactly 12 numeric digits', () => {
  assert.equal(validatePaymentUtr('123456789012'), true);
  assert.equal(validatePaymentUtr('12345678901'), false);
  assert.equal(validatePaymentUtr('1234567890123'), false);
  assert.equal(validatePaymentUtr('1234AB789012'), false);
});
