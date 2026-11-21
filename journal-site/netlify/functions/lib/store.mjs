const API_ROOT = 'https://api.github.com';
const EMPTY_DB = () => ({ schemaVersion: 1, papers: [], rateLimits: {}, events: [], updatedAt: new Date().toISOString() });

function settings() {
  const owner = process.env.GH_OWNER;
  const repo = process.env.GH_REPO;
  const token = process.env.GH_TOKEN;
  const branch = process.env.GH_BRANCH || 'main';
  if (!owner || !repo || !token) throw new Error('GitHub storage is not configured. Set GH_OWNER, GH_REPO and GH_TOKEN in Netlify environment variables.');
  return { owner, repo, token, branch };
}

function endpoint(path) {
  const { owner, repo } = settings();
  return `${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function headers(accept = 'application/vnd.github+json') {
  const { token } = settings();
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'IJSCI-Journal-Platform'
  };
}

async function getFileInfo(path) {
  const response = await fetch(`${endpoint(path)}?ref=${encodeURIComponent(settings().branch)}`, { headers: headers() });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub read failed (${response.status}): ${await response.text()}`);
  return response.json();
}

export async function readJSON(path = 'db.json') {
  const info = await getFileInfo(path);
  if (!info) return null;
  if (info.encoding !== 'base64' || !info.content) throw new Error(`GitHub JSON file ${path} is not available as base64 content.`);
  return { data: JSON.parse(Buffer.from(info.content.replace(/\n/g, ''), 'base64').toString('utf8')), sha: info.sha };
}

export async function writeJSON(path, data, commitMessage = `Update ${path}`) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await getFileInfo(path);
    const body = {
      message: commitMessage,
      branch: settings().branch,
      content: Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64'),
      ...(current?.sha ? { sha: current.sha } : {})
    };
    const response = await fetch(endpoint(path), { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
    if (response.ok) return (await response.json()).content?.sha || null;
    const detail = await response.text();
    if ((response.status === 409 || response.status === 422) && attempt < 4) continue;
    throw new Error(`GitHub write failed (${response.status}): ${detail}`);
  }
  throw new Error('Could not update the GitHub file after repeated SHA conflicts.');
}

async function writeJSONWithSha(path, data, sha, commitMessage) {
  const body = {
    message: commitMessage,
    branch: settings().branch,
    content: Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64'),
    ...(sha ? { sha } : {})
  };
  const response = await fetch(endpoint(path), { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
  if (response.status === 409 || response.status === 422) return { conflict: true };
  if (!response.ok) throw new Error(`GitHub write failed (${response.status}): ${await response.text()}`);
  return { conflict: false, sha: (await response.json()).content?.sha || null };
}

export async function updateDatabase(mutator, commitMessage = 'Update journal database') {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    // Re-read the latest JSON and re-run the mutator after every SHA conflict.
    const loaded = await readJSON('db.json');
    const db = loaded?.data || EMPTY_DB();
    const result = await mutator(db);
    db.schemaVersion = 1;
    db.updatedAt = new Date().toISOString();
    const saved = await writeJSONWithSha('db.json', db, loaded?.sha, commitMessage);
    if (!saved.conflict) return result === undefined ? db : result;
  }
  throw new Error('Could not merge a concurrent GitHub db.json update after repeated SHA conflicts. Please retry.');
}

export async function readDatabase() {
  const loaded = await readJSON('db.json');
  return loaded?.data || EMPTY_DB();
}

export async function writeBinary(path, buffer, commitMessage = `Upload ${path}`) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await getFileInfo(path);
    const response = await fetch(endpoint(path), {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({
        message: commitMessage,
        branch: settings().branch,
        content: Buffer.from(buffer).toString('base64'),
        ...(current?.sha ? { sha: current.sha } : {})
      })
    });
    if (response.ok) return (await response.json()).content?.sha || null;
    const detail = await response.text();
    if ((response.status === 409 || response.status === 422) && attempt < 3) continue;
    throw new Error(`GitHub binary upload failed (${response.status}): ${detail}`);
  }
  throw new Error('Could not upload file after repeated SHA conflicts.');
}

export async function readBinary(path) {
  const response = await fetch(`${endpoint(path)}?ref=${encodeURIComponent(settings().branch)}`, { headers: headers('application/vnd.github.raw+json') });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub file download failed (${response.status}): ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

export function isStoreConfigured() {
  return Boolean(process.env.GH_OWNER && process.env.GH_REPO && process.env.GH_TOKEN);
}
