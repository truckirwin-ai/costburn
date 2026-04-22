// Static dashboard + Anthropic Admin API proxy + admin-key management.
// Admin key is held only in this Node process and in the macOS Keychain.
// The browser never receives it; it round-trips through /api/anthropic/*.
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { execFileSync, spawnSync } = require('child_process');

const DIR = __dirname;
const PORT = parseInt(process.env.PORT || '4173', 10);
const API_BASE = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// ---------- admin key (mutable: can be updated at runtime) ----------

function readAdminKeyFromKeychain() {
  if (process.platform !== 'darwin') return '';
  try {
    const out = execFileSync('security', ['find-generic-password', '-s', 'ANTHROPIC_ADMIN_KEY', '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return (out || '').trim();
  } catch {
    return '';
  }
}

function writeAdminKeyToKeychain(value) {
  if (process.platform !== 'darwin') {
    throw new Error('Keychain write only supported on macOS.');
  }
  // Update (or create) the ANTHROPIC_ADMIN_KEY entry. -U flag upserts.
  const res = spawnSync('security', [
    'add-generic-password',
    '-a', process.env.USER || 'user',
    '-s', 'ANTHROPIC_ADMIN_KEY',
    '-l', 'Anthropic Admin Key (codeburn dashboard)',
    '-w', value,
    '-U',
  ], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error('security add-generic-password failed: ' + (res.stderr || '').trim());
  }
}

let ADMIN_KEY = process.env.ANTHROPIC_ADMIN_KEY ? process.env.ANTHROPIC_ADMIN_KEY.trim() : readAdminKeyFromKeychain();

function keyPrefix(k) { return k ? k.slice(0, 20) : null; }
function keySuffix(k) { return k ? '...' + k.slice(-4) : null; }

// ---------- cache ----------

const CACHE = new Map();
const TTL_MS = 5 * 60 * 1000;
function cacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.t > TTL_MS) { CACHE.delete(key); return null; }
  return entry.v;
}
function cacheSet(key, v) { CACHE.set(key, { t: Date.now(), v }); }
function cacheClear() { CACHE.clear(); }

// ---------- Anthropic proxy ----------

async function fetchAnthropic(apiPath, query, { skipCache = false } = {}) {
  if (!ADMIN_KEY) {
    const err = new Error('ANTHROPIC_ADMIN_KEY is not set.');
    err.status = 503;
    throw err;
  }
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach(x => qs.append(k, x));
    else if (v !== undefined && v !== null && v !== '') qs.append(k, v);
  });
  const target = `${API_BASE}${apiPath}?${qs.toString()}`;
  if (!skipCache) {
    const cached = cacheGet(target);
    if (cached) return cached;
  }
  // Retry on 429 (rate limit) and transient 5xx with exponential backoff.
  let attempt = 0, lastErr;
  while (attempt < 4) {
    const res = await fetch(target, {
      headers: {
        'x-api-key': ADMIN_KEY,
        'anthropic-version': API_VERSION,
        'accept': 'application/json',
      },
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (res.ok) {
      if (!skipCache) cacheSet(target, body);
      return body;
    }
    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
    if (!retryable) {
      const err = new Error(body?.error?.message || `Anthropic API ${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10) || (1 << attempt);
    const delayMs = Math.min(10, retryAfter) * 1000;
    lastErr = Object.assign(new Error(body?.error?.message || `Anthropic API ${res.status}`), { status: res.status, body });
    attempt++;
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw lastErr;
}

async function fetchAllPages(apiPath, baseQuery, opts = {}) {
  const pages = [];
  let page = null;
  let safety = 0;
  while (true) {
    const q = { ...baseQuery };
    if (page) q.page = page;
    const body = await fetchAnthropic(apiPath, q, opts);
    pages.push(body);
    if (!body.has_more || !body.next_page) break;
    page = body.next_page;
    if (++safety > 40) break;
  }
  return pages;
}

// ---------- http helpers ----------

function sendJSON(res, status, obj) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  });
  res.end(buf);
}

function readBody(req, limit = 1 << 15) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ---------- API routes ----------

async function handleAPI(req, res, parsed) {
  const p = parsed.pathname;
  try {
    // Admin key info (never returns the full key)
    if (p === '/api/admin-key/info' && req.method === 'GET') {
      return sendJSON(res, 200, {
        hasKey: Boolean(ADMIN_KEY),
        prefix: keyPrefix(ADMIN_KEY),
        suffix: keySuffix(ADMIN_KEY),
        source: process.env.ANTHROPIC_ADMIN_KEY ? 'env' : (process.platform === 'darwin' ? 'keychain' : 'none'),
      });
    }

    // Test the current admin key with a cheap call
    if (p === '/api/admin-key/test' && req.method === 'POST') {
      if (!ADMIN_KEY) return sendJSON(res, 200, { ok: false, reason: 'no key loaded' });
      try {
        const now = new Date();
        const end = now.toISOString().slice(0, 19) + 'Z';
        const start = new Date(now.getTime() - 86400_000).toISOString().slice(0, 19) + 'Z';
        await fetchAnthropic('/v1/organizations/cost_report', { starting_at: start, ending_at: end }, { skipCache: true });
        return sendJSON(res, 200, { ok: true, prefix: keyPrefix(ADMIN_KEY), suffix: keySuffix(ADMIN_KEY) });
      } catch (e) {
        return sendJSON(res, 200, { ok: false, reason: e.message, status: e.status || 0 });
      }
    }

    // Replace the admin key
    if (p === '/api/admin-key' && req.method === 'POST') {
      const raw = await readBody(req);
      let body;
      try { body = JSON.parse(raw); } catch { return sendJSON(res, 400, { error: 'invalid JSON body' }); }
      const newKey = (body?.key || '').trim();
      if (!/^sk-ant-admin01-[A-Za-z0-9_-]{40,}$/.test(newKey)) {
        return sendJSON(res, 400, { error: 'key format looks wrong (expected sk-ant-admin01-...)' });
      }
      try {
        writeAdminKeyToKeychain(newKey);
      } catch (e) {
        return sendJSON(res, 500, { error: 'failed to write to Keychain: ' + e.message });
      }
      ADMIN_KEY = newKey;
      cacheClear();
      // Smoke test
      let test;
      try {
        const now = new Date();
        const end = now.toISOString().slice(0, 19) + 'Z';
        const start = new Date(now.getTime() - 86400_000).toISOString().slice(0, 19) + 'Z';
        await fetchAnthropic('/v1/organizations/cost_report', { starting_at: start, ending_at: end }, { skipCache: true });
        test = { ok: true };
      } catch (e) {
        test = { ok: false, reason: e.message, status: e.status || 0 };
      }
      return sendJSON(res, 200, { saved: true, prefix: keyPrefix(ADMIN_KEY), suffix: keySuffix(ADMIN_KEY), test });
    }

    // Refresh: clear the cache so next fetch hits Anthropic fresh
    if (p === '/api/refresh' && req.method === 'POST') {
      cacheClear();
      return sendJSON(res, 200, { ok: true });
    }

    if (p === '/api/anthropic/cost') {
      const q = parsed.query;
      const starting_at = q.start || q.starting_at;
      const ending_at = q.end || q.ending_at;
      if (!starting_at || !ending_at) return sendJSON(res, 400, { error: 'start/end required (ISO-8601)' });
      const pages = await fetchAllPages('/v1/organizations/cost_report', { starting_at, ending_at });
      const data = pages.flatMap(pg => pg.data || []);
      return sendJSON(res, 200, { data });
    }

    if (p === '/api/anthropic/usage') {
      const q = parsed.query;
      const starting_at = q.start || q.starting_at;
      const ending_at = q.end || q.ending_at;
      const bucket_width = q.bucket || '1d';
      if (!starting_at || !ending_at) return sendJSON(res, 400, { error: 'start/end required (ISO-8601)' });
      const pages = await fetchAllPages('/v1/organizations/usage_report/messages', {
        starting_at, ending_at, bucket_width, 'group_by[]': ['model'],
      });
      const data = pages.flatMap(pg => pg.data || []);
      return sendJSON(res, 200, { data });
    }

    return sendJSON(res, 404, { error: 'unknown api route' });
  } catch (e) {
    return sendJSON(res, e.status || 500, { error: e.message || String(e), details: e.body || null });
  }
}

function serveStatic(req, res, parsed) {
  let rel = decodeURIComponent(parsed.pathname || '/');
  if (rel === '/') rel = '/index.html';
  const fp = path.join(DIR, rel);
  if (!fp.startsWith(DIR)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname && parsed.pathname.startsWith('/api/')) {
    return handleAPI(req, res, parsed);
  }
  return serveStatic(req, res, parsed);
});

server.listen(PORT, () => {
  const keyState = ADMIN_KEY
    ? `admin key loaded (${keyPrefix(ADMIN_KEY)}...)`
    : 'no admin key (governor preview only)';
  console.log(`codeburn dashboard on http://localhost:${PORT}  [${keyState}]`);
});
