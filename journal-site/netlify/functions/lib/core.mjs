import crypto from 'node:crypto';

export function isValidUtr(value) {
  return /^\d{12}$/.test(String(value ?? '').trim());
}

export function makeRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function issueSignedToken(secret, subject, ttlSeconds, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub: subject, iat: now, exp: now + ttlSeconds * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySignedToken(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [payload, signature, extra] = String(token).split('.');
  if (!payload || !signature || extra) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!timingSafeEqualText(signature, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp <= now || !data.sub) return null;
    return data;
  } catch {
    return null;
  }
}

export function ensureCertificates(paper, makeId = () => `ijros-CERT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`) {
  const certificates = Array.isArray(paper.certificates) ? [...paper.certificates] : [];
  const authors = Array.isArray(paper.authors) ? paper.authors : [];
  const byAuthor = new Map(certificates.map((cert) => [cert.authorIndex, cert]));
  for (let index = 0; index < authors.length; index += 1) {
    if (!byAuthor.has(index)) {
      const cert = {
        certificateId: makeId(),
        authorIndex: index,
        authorName: authors[index]?.name || `Author ${index + 1}`,
        filePath: null,
        generatedAt: null
      };
      certificates.push(cert);
      byAuthor.set(index, cert);
    }
  }
  paper.certificates = certificates.sort((a, b) => a.authorIndex - b.authorIndex);
  return paper;
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function cleanText(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

export function safeFilename(value) {
  const name = String(value || 'manuscript.pdf').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80);
  return (name || 'manuscript').toLowerCase().endsWith('.pdf') ? (name || 'manuscript.pdf') : `${name || 'manuscript'}.pdf`;
}

export function addTimeline(paper, type, message, actor = 'system', extra = {}) {
  paper.history = Array.isArray(paper.history) ? paper.history : [];
  paper.history.push({ type, message: cleanText(message, 500), actor, at: new Date().toISOString(), ...extra });
  return paper;
}

export function assignArchive(paper, publishedAt = new Date().toISOString(), launchYear = 2026) {
  const date = new Date(publishedAt);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  if (!paper.volume) paper.volume = `Vol. ${Math.max(1, year - Number(launchYear) + 1)}`;
  if (!paper.issue) paper.issue = `Issue ${month}`;
  return paper;
}
