export const config = { path: '/robots.txt' };
export default async () => {
  const base = (process.env.JOURNAL_SITE_URL || process.env.URL || 'https://your-journal-domain.example').replace(/\/$/, '');
  const body = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /track\nDisallow: /pay/\nSitemap: ${base}/sitemap.xml\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
