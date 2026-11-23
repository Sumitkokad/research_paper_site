
const API_ROOT = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 5;

const EMPTY_DB = () => ({
  schemaVersion: 1,
  papers: [],
  rateLimits: {},
  events: [],
  updatedAt: new Date().toISOString()
});

function settings() {
  const owner = process.env.GH_OWNER;
  const repo = process.env.GH_REPO;
  const token = process.env.GH_TOKEN;
  const branch = process.env.GH_BRANCH || 'main';

  if (!owner || !repo || !token) {
    throw new Error(
      'GitHub storage is not configured. Set GH_OWNER, GH_REPO and GH_TOKEN.'
    );
  }

  return { owner, repo, token, branch };
}

function endpoint(path) {
  const { owner, repo } = settings();

  return `${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function blobEndpoint(sha) {
  const { owner, repo } = settings();

  return `${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`;
}

function headers(accept = 'application/vnd.github+json') {
  const { token } = settings();

  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'ijros-Journal-Platform'
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt, response) {
  const retryAfter = Number(response?.headers?.get('retry-after'));

  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 30000);
  }

  const reset = Number(response?.headers?.get('x-ratelimit-reset'));

  if (
    response?.status === 403 &&
    Number.isFinite(reset) &&
    reset > 0
  ) {
    const wait = reset * 1000 - Date.now();

    if (wait > 0) return Math.min(wait, 30000);
  }

  return Math.min(500 * (2 ** attempt), 8000);
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

async function githubRequest(url, options = {}, retries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;

    try {
      response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      lastError = error;

      if (attempt >= retries) break;

      await sleep(Math.min(500 * (2 ** attempt), 8000));
      continue;
    }

    if (response.ok || response.status === 404) {
      return response;
    }

    const detail = await response.text();

    const rateLimited =
      response.status === 403 &&
      (
        response.headers.get('x-ratelimit-remaining') === '0' ||
        detail.toLowerCase().includes('rate limit')
      );

    if (
      (isRetryableStatus(response.status) || rateLimited) &&
      attempt < retries
    ) {
      await sleep(retryDelay(attempt, response));
      continue;
    }

    const error = new Error(
      `GitHub API request failed (${response.status}): ${detail.slice(0, 1200)}`
    );

    error.status = response.status;
    error.responseBody = detail;

    throw error;
  }

  throw new Error(
    `GitHub API request failed after retries: ${lastError?.message || 'Network timeout'}`
  );
}

function isShaConflict(status, detail = '') {
  if (status === 409) return true;

  if (status !== 422) return false;

  const message = String(detail).toLowerCase();

  return (
    message.includes('sha') ||
    message.includes('does not match') ||
    message.includes('already exists') ||
    message.includes('must match')
  );
}

async function getFileInfo(path) {
  const { branch } = settings();

  const response = await githubRequest(
    `${endpoint(path)}?ref=${encodeURIComponent(branch)}`,
    { headers: headers() }
  );

  if (response.status === 404) return null;

  return response.json();
}

async function readBlob(sha) {
  const response = await githubRequest(
    blobEndpoint(sha),
    { headers: headers() }
  );

  const blob = await response.json();

  if (blob.encoding !== 'base64' || !blob.content) {
    throw new Error('GitHub returned an unsupported file encoding.');
  }

  return Buffer.from(
    blob.content.replace(/\n/g, ''),
    'base64'
  );
}

export async function readJSON(path = 'db.json') {
  const info = await getFileInfo(path);

  if (!info) return null;

  let buffer;

  if (info.encoding === 'base64' && info.content) {
    buffer = Buffer.from(
      info.content.replace(/\n/g, ''),
      'base64'
    );
  } else if (info.sha) {
    // Contents API may omit content for larger files.
    buffer = await readBlob(info.sha);
  } else {
    throw new Error(
      `GitHub JSON file ${path} has no readable content or blob SHA.`
    );
  }

  let data;

  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error(
      `GitHub JSON file ${path} contains invalid JSON. No changes were saved.`
    );
  }

  return {
    data,
    sha: info.sha
  };
}

async function putFile(path, content, sha, commitMessage) {
  const { branch } = settings();

  const body = {
    message: commitMessage,
    branch,
    content: Buffer.from(content).toString('base64'),
    ...(sha ? { sha } : {})
  };

  const response = await githubRequest(
    endpoint(path),
    {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(body)
    },
    2
  );

  if (response.status === 409) {
    return { conflict: true };
  }

  const result = await response.json();

  return {
    conflict: false,
    sha: result.content?.sha || null
  };
}

async function writeJSONWithSha(path, data, sha, commitMessage) {
  const content = JSON.stringify(data, null, 2);

  try {
    return await putFile(path, content, sha, commitMessage);
  } catch (error) {
    if (isShaConflict(error.status, error.responseBody)) {
      return { conflict: true };
    }

    throw error;
  }
}

export async function writeJSON(
  path,
  data,
  commitMessage = `Update ${path}`
) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const current = await getFileInfo(path);

    const result = await writeJSONWithSha(
      path,
      data,
      current?.sha || null,
      commitMessage
    );

    if (!result.conflict) return result.sha;

    await sleep(250 * (attempt + 1));
  }

  throw new Error(
    `Could not update ${path}: repeated GitHub SHA conflicts. Please retry.`
  );
}

export async function updateDatabase(
  mutator,
  commitMessage = 'Update journal database'
) {
  if (typeof mutator !== 'function') {
    throw new TypeError('Database mutator must be a function.');
  }

  for (let attempt = 0; attempt < MAX_RETRIES + 1; attempt += 1) {
    // Always load the newest version before applying the mutation.
    const loaded = await readJSON('db.json');
    const db = loaded?.data || EMPTY_DB();

    if (!Array.isArray(db.papers)) db.papers = [];
    if (!db.rateLimits || typeof db.rateLimits !== 'object') {
      db.rateLimits = {};
    }
    if (!Array.isArray(db.events)) db.events = [];

    const result = await mutator(db);

    db.schemaVersion = 1;
    db.updatedAt = new Date().toISOString();

    const saved = await writeJSONWithSha(
      'db.json',
      db,
      loaded?.sha || null,
      commitMessage
    );

    if (!saved.conflict) {
      return result === undefined ? db : result;
    }

    await sleep(250 * (attempt + 1));
  }

  throw new Error(
    'Database update failed because of repeated concurrent changes. Please retry.'
  );
}

export async function readDatabase() {
  const loaded = await readJSON('db.json');

  if (!loaded) return EMPTY_DB();

  const db = loaded.data;

  if (!db || typeof db !== 'object' || Array.isArray(db)) {
    throw new Error('GitHub db.json has an invalid database structure.');
  }

  if (!Array.isArray(db.papers)) db.papers = [];
  if (!db.rateLimits || typeof db.rateLimits !== 'object') {
    db.rateLimits = {};
  }
  if (!Array.isArray(db.events)) db.events = [];

  return db;
}

export async function writeBinary(
  path,
  buffer,
  commitMessage = `Upload ${path}`
) {
  if (!Buffer.isBuffer(buffer)) {
    buffer = Buffer.from(buffer);
  }

  if (buffer.length === 0) {
    throw new Error(`Cannot upload an empty file: ${path}`);
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const current = await getFileInfo(path);

    try {
      const result = await putFile(
        path,
        buffer,
        current?.sha || null,
        commitMessage
      );

      if (!result.conflict) return result.sha;
    } catch (error) {
      if (!isShaConflict(error.status, error.responseBody)) {
        throw error;
      }
    }

    await sleep(250 * (attempt + 1));
  }

  throw new Error(
    `Could not upload ${path}: repeated GitHub SHA conflicts.`
  );
}

export async function readBinary(path) {
  const { branch } = settings();

  const response = await githubRequest(
    `${endpoint(path)}?ref=${encodeURIComponent(branch)}`,
    { headers: headers() }
  );

  if (response.status === 404) return null;

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const info = await response.json();

    if (info.encoding === 'base64' && info.content) {
      return Buffer.from(
        info.content.replace(/\n/g, ''),
        'base64'
      );
    }

    if (info.sha) return readBlob(info.sha);

    throw new Error(`GitHub could not return binary content for ${path}.`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export function isStoreConfigured() {
  return Boolean(
    process.env.GH_OWNER &&
    process.env.GH_REPO &&
    process.env.GH_TOKEN
  );
}
