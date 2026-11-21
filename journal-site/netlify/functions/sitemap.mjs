import { readDatabase } from './lib/store.mjs';
const blogSlugs = ['prepare-your-research-paper', 'understanding-editorial-review', 'citation-metadata-basics'];

export const config = { path: '/sitemap.xml' };

export default async () => {
  const base = (process.env.JOURNAL_SITE_URL || process.env.URL || 'https://your-journal-domain.example').replace(/\/$/, '');
  try {
    const db = await readDatabase();
    const staticPaths = ['', '/papers', '/submit', '/about', '/guidelines', '/fees', '/contact', '/policies', '/blogs'];
    const urls = staticPaths.map((path) => `<url><loc>${base}${path}</loc></url>`);
    for (const paper of db.papers.filter((item) => item.status === 'published')) {
      urls.push(`<url><loc>${base}/papers/${encodeURIComponent(paper.id)}</loc><lastmod>${new Date(paper.publishedAt || Date.now()).toISOString().slice(0, 10)}</lastmod></url>`);
    }
    for (const slug of blogSlugs) urls.push(`<url><loc>${base}/blogs/${encodeURIComponent(slug)}</loc></url>`);
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  } catch (error) {
    console.error('[sitemap]', error);
    return new Response(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}</loc></url></urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
  }
};
