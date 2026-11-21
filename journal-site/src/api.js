export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isForm = options.body instanceof FormData;
  if (options.body && !isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, {
    credentials: 'same-origin',
    ...options,
    headers
  });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const raw = await response.text();
    const looksLikeHtml = contentType.includes('text/html') || /^\s*(<!doctype html|<html)/i.test(raw);
    if (looksLikeHtml) {
      throw new Error('The journal API is not running. Start the project with "npx netlify-cli dev"; "npm run dev" starts only the React frontend and cannot process submissions.');
    }
    if (!response.ok) throw new Error(raw || `Request failed (${response.status}).`);
    throw new Error('The journal API returned an unexpected response. Check that the Netlify API function is deployed and running.');
  }
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || payload?.message || `Request failed (${response.status}).`);
  return payload;
}

export const post = (path, payload) => api(path, { method: 'POST', body: payload instanceof FormData ? payload : JSON.stringify(payload) });

export function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...options }).format(date);
}

export function statusLabel(status = '') {
  const labels = {
    submitted: 'Submitted', under_review: 'Under review', revision_requested: 'Revision requested', revision_submitted: 'Revision received',
    accepted: 'Accepted · payment due', payment_submitted: 'Payment submitted', publishing: 'Publishing', published: 'Published', rejected: 'Declined', unpublished: 'Unpublished'
  };
  return labels[status] || status.replaceAll('_', ' ');
}
