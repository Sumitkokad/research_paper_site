import fs from 'node:fs/promises';
import path from 'node:path';

// Load a local .env for one-off migrations; existing shell variables always win.
try {
  const envText = await fs.readFile('.env', 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* .env is optional; CI can provide environment variables directly. */ }

function listFrom(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.papers)) return value.papers;
  if (Array.isArray(value?.records)) return value.records;
  return [];
}

function normalise(paper, index) {
  const id = String(paper.id || paper.paperId || `LEGACY-${index + 1}`).trim();
  const rawAuthors = Array.isArray(paper.authors) ? paper.authors : [{ name: paper.authorName || paper.author || paper.name || 'Author', affiliation: paper.affiliation || '' }];
  const authors = rawAuthors.slice(0, 5).map((author) => typeof author === 'string'
    ? { name: author, affiliation: '', orcid: '' }
    : { name: String(author.name || author.fullName || 'Author'), affiliation: String(author.affiliation || author.institution || ''), orcid: String(author.orcid || '') });
  const statusAliases = { pending: 'submitted', approved: 'accepted', complete: 'published', paid: 'payment_submitted', declined: 'rejected' };
  const statusRaw = String(paper.status || 'submitted').toLowerCase();
  const status = statusAliases[statusRaw] || (['submitted', 'under_review', 'revision_requested', 'revision_submitted', 'accepted', 'payment_submitted', 'publishing', 'published', 'rejected', 'unpublished'].includes(statusRaw) ? statusRaw : 'submitted');
  const oldFile = paper.currentFilePath || paper.filePath || paper.pdfPath || paper.pdf || `submissions/${id}.pdf`;
  return {
    id,
    title: String(paper.title || 'Untitled migrated manuscript'),
    abstract: String(paper.abstract || ''),
    keywords: Array.isArray(paper.keywords) ? paper.keywords : String(paper.keywords || '').split(',').map((x) => x.trim()).filter(Boolean),
    category: String(paper.category || paper.subject || ''),
    articleType: String(paper.articleType || 'Research Article'),
    authors,
    submitterName: String(paper.submitterName || authors[0]?.name || 'Author'),
    submitterEmail: String(paper.submitterEmail || paper.email || ''),
    status,
    paymentStatus: paper.paymentStatus || (paper.payment?.status || (paper.utr ? 'submitted' : 'not_due')),
    version: Number(paper.version || 1),
    versions: Array.isArray(paper.versions) && paper.versions.length ? paper.versions : [{ version: Number(paper.version || 1), filePath: oldFile, filename: `${id}.pdf`, uploadedAt: paper.updatedAt || paper.submittedAt || new Date().toISOString() }],
    currentFilePath: oldFile,
    doi: String(paper.doi || ''),
    issn: String(paper.issn || ''),
    volume: String(paper.volume || ''),
    issue: String(paper.issue || ''),
    publishedAt: paper.publishedAt || paper.publicationDate || null,
    submittedAt: paper.submittedAt || paper.createdAt || new Date().toISOString(),
    history: Array.isArray(paper.history) ? paper.history : [{ type: 'migrated', message: 'Record migrated to the React journal platform. Author tracking access can be reissued using the claim flow.', at: new Date().toISOString(), actor: 'system' }],
    mailLog: Array.isArray(paper.mailLog) ? paper.mailLog : [],
    payment: paper.payment || (paper.utr ? { utr: String(paper.utr), amount: Number(paper.amount || 0), status: paper.paymentStatus || 'submitted' } : null),
    certificates: Array.isArray(paper.certificates) ? paper.certificates : [],
    migration: { sourceIndex: index, migratedAt: new Date().toISOString(), legacyId: String(paper.id || paper.paperId || '') }
  };
}

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run migrate:json -- ./path/to/legacy-db.json [--apply]');
  process.exit(1);
}
const sourcePath = path.resolve(input);
const legacy = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const papers = listFrom(legacy).map(normalise);
const output = { schemaVersion: 1, papers, rateLimits: {}, events: [], updatedAt: new Date().toISOString(), migration: { sourceFile: path.basename(sourcePath), records: papers.length } };
const outPath = path.resolve('migration-output/db.json');
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(output, null, 2));
console.log(`Prepared ${papers.length} records at ${outPath}`);
console.log('PDF paths are preserved as metadata. This script does not upload or move binary PDFs; confirm each path already exists in the repository before applying.');

if (process.argv.includes('--apply')) {
  const owner = process.env.GH_OWNER; const repo = process.env.GH_REPO; const token = process.env.GH_TOKEN; const branch = process.env.GH_BRANCH || 'main';
  if (!owner || !repo || !token) throw new Error('Set GH_OWNER, GH_REPO and GH_TOKEN before using --apply.');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/db.json`;
  const existingResponse = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (existingResponse.ok) {
    const existingFile = await existingResponse.json();
    const existingDb = JSON.parse(Buffer.from((existingFile.content || '').replace(/\n/g, ''), 'base64').toString('utf8'));
    if ((existingDb.papers || []).length && !process.argv.includes('--replace')) {
      throw new Error('The repository already contains paper records. Refusing to overwrite them. Use --replace only after exporting a backup and confirming that replacement is intended.');
    }
  } else if (existingResponse.status !== 404) throw new Error(`Could not inspect current db.json (${existingResponse.status}).`);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const read = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    let sha;
    if (read.ok) sha = (await read.json()).sha;
    else if (read.status !== 404) throw new Error(`Could not read current db.json (${read.status}).`);
    const response = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Migrate journal records to React platform schema', branch, content: Buffer.from(JSON.stringify(output, null, 2)).toString('base64'), ...(sha ? { sha } : {}) }) });
    if (response.ok) { console.log('Migrated db.json to GitHub.'); break; }
    if ((response.status === 409 || response.status === 422) && attempt < 4) continue;
    throw new Error(`Could not apply migrated db.json (${response.status}): ${await response.text()}`);
  }
}
