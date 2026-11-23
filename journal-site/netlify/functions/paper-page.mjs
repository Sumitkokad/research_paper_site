import fs from 'node:fs/promises';
import path from 'node:path';
import { readDatabase } from './lib/store.mjs';

export const config = { path: '/papers/*' };

const paperCache = new Map();
const CACHE_MS = Math.min(3600, Math.max(30, Number(process.env.SITE_REVALIDATE_SECONDS || 300))) * 1000;

async function cachedPaper(id) {
  const cached = paperCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const db = await readDatabase();
  const value = id === 'papers' ? null : (db.papers.find((item) => item.id === id && item.status === 'published') || null);
  paperCache.set(id, { value, expiresAt: Date.now() + CACHE_MS });
  return value;
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export default async (request) => {
  const url = new URL(request.url);
  const paperId = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '');
  try {
    const paper = await cachedPaper(paperId);
    if (paperId !== 'papers' && !paper) return new Response('Published paper not found', { status: 404 });
    const site = (process.env.JOURNAL_SITE_URL || process.env.URL || url.origin).replace(/\/$/, '');
    const paperUrl = paper ? `${site}/papers/${encodeURIComponent(paper.id)}` : `${site}/papers`;
    const pdfUrl = paper ? `${site}/api/download/${encodeURIComponent(paper.id)}` : '';
    const authors = (paper?.authors || []).map((author) => author.name).filter(Boolean);
    const date = paper?.publishedAt ? new Date(paper.publishedAt).toISOString().slice(0, 10) : '';
    const title = paper ? `${paper.title} | ${process.env.JOURNAL_SHORT_NAME || 'ijros'}` : `${process.env.JOURNAL_SHORT_NAME || 'ijros'} — Published papers`;
    const tags = paper ? [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(paper.abstract || paper.title)}">`,
      `<link rel="canonical" href="${esc(paperUrl)}">`,
      `<meta property="og:type" content="article">`,
      `<meta property="og:title" content="${esc(paper.title)}">`,
      `<meta property="og:description" content="${esc(paper.abstract || '')}">`,
      `<meta property="og:url" content="${esc(paperUrl)}">`,
      `<meta name="citation_title" content="${esc(paper.title)}" data-paper-meta="true">`,
      ...authors.map((author) => `<meta name="citation_author" content="${esc(author)}" data-paper-meta="true">`),
      ...(date ? [`<meta name="citation_publication_date" content="${esc(date)}" data-paper-meta="true">`] : []),
      `<meta name="citation_pdf_url" content="${esc(pdfUrl)}" data-paper-meta="true">`,
      ...(paper.issn || process.env.JOURNAL_ISSN ? [`<meta name="citation_issn" content="${esc(paper.issn || process.env.JOURNAL_ISSN)}" data-paper-meta="true">`] : []),
      ...(paper.volume ? [`<meta name="citation_volume" content="${esc(paper.volume)}" data-paper-meta="true">`] : []),
      ...(paper.issue ? [`<meta name="citation_issue" content="${esc(paper.issue)}" data-paper-meta="true">`] : []),
      ...(paper.doi ? [`<meta name="citation_doi" content="${esc(paper.doi)}" data-paper-meta="true">`] : []),
      `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'ScholarlyArticle', headline: paper.title, abstract: paper.abstract, datePublished: date || undefined, identifier: paper.doi || paper.id, author: (paper.authors || []).map((author) => ({ '@type': 'Person', name: author.name, affiliation: author.affiliation ? { '@type': 'Organization', name: author.affiliation } : undefined })), isPartOf: { '@type': 'Periodical', name: process.env.JOURNAL_NAME || 'International Journal of Research and Innovation in Science and Engineering' }, url: paperUrl, encoding: pdfUrl }).replace(/</g, '\\u003c')}</script>`
    ] : [`<title>${esc(title)}</title>`, `<meta name="description" content="Published research archive of ${esc(process.env.JOURNAL_NAME || 'ijros')}">`];
    const htmlMeta = tags.join('\n');
    const htmlPath = path.resolve(process.cwd(), 'dist/index.html');
    let html = await fs.readFile(htmlPath, 'utf8');
    html = html.replace(/<title>.*?<\/title>/s, '').replace('</head>', `${htmlMeta}\n</head>`);
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } });
  } catch (error) {
    console.error('[paper-page]', error);
    return new Response('Could not load paper page.', { status: 503 });
  }
};
