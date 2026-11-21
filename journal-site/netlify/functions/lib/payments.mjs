import { isValidUtr } from './core.mjs';

export function getPaymentConfig() {
  const amount = Number(process.env.PUBLICATION_FEE_INR || 0);
  const vpa = String(process.env.UPI_VPA || '').trim();
  const payeeName = String(process.env.UPI_PAYEE_NAME || '').trim();
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    vpa: vpa || null,
    payeeName: payeeName || null,
    note: process.env.UPI_NOTE || 'Journal publication fee',
    ready: Boolean(amount > 0 && vpa && payeeName),
    currency: 'INR'
  };
}

export function buildUpiUri({ vpa, payeeName, amount, reference, note }) {
  if (!vpa || !payeeName || !amount || Number(amount) <= 0) throw new Error('UPI payment details are not configured.');
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    am: Number(amount).toFixed(2),
    cu: 'INR',
    tr: String(reference).slice(0, 35),
    tn: String(note || 'Journal publication fee').slice(0, 80)
  });
  return `upi://pay?${params.toString()}`;
}

export function validatePaymentUtr(utr) {
  return isValidUtr(utr);
}
