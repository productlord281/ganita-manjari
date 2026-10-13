'use strict';
/* Shared helpers for the Vercel serverless functions. No npm packages needed. */
const crypto = require('crypto');

/* Finds the Upstash/Vercel Redis REST credentials whatever prefix the Vercel integration used. */
function conf() {
  const e = process.env;
  const pairs = [['KV_REST_API_URL', 'KV_REST_API_TOKEN'], ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']];
  for (const [u, t] of pairs) if (e[u] && e[t]) return { url: e[u].replace(/\/+$/, ''), token: e[t] };
  for (const k of Object.keys(e)) {
    const m = k.match(/^(.*)_REST(?:_API)?_URL$/);
    if (m && e[k]) {
      const t = e[m[1] + '_REST_API_TOKEN'] || e[m[1] + '_REST_TOKEN'];
      if (t) return { url: e[k].replace(/\/+$/, ''), token: t };
    }
  }
  return null;
}

async function call(path, body) {
  const c = conf();
  if (!c) { const err = new Error('no-db'); err.code = 'NO_DB'; throw err; }
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(c.url + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal
    });
    const j = await r.json();
    return j;
  } finally { clearTimeout(to); }
}

async function cmd(args) {
  const j = await call('', args);
  if (j && j.error) { const err = new Error(j.error); err.redis = true; throw err; }
  return j.result;
}

async function pipe(list) {
  const j = await call('/pipeline', list);
  if (!Array.isArray(j)) throw new Error('bad-pipeline');
  return j.map(x => { if (x.error) { const err = new Error(x.error); err.redis = true; throw err; } return x.result; });
}

/* Runs a Lua script: tries EVALSHA first (cheap), falls back to EVAL which also caches it. */
async function lua(script, keys, args) {
  const sha = crypto.createHash('sha1').update(script).digest('hex');
  try {
    return await cmd(['EVALSHA', sha, String(keys.length), ...keys, ...args.map(String)]);
  } catch (e) {
    if (e.redis && /NOSCRIPT/i.test(e.message)) return await cmd(['EVAL', script, String(keys.length), ...keys, ...args.map(String)]);
    throw e;
  }
}

async function body(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else raw = await new Promise(res => { let s = ''; req.on('data', d => { s += d; if (s.length > 200000) req.destroy(); }); req.on('end', () => res(s)); req.on('error', () => res('')); });
  try { return JSON.parse(raw || '{}'); } catch (e) { return {}; }
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function fail(res, e) {
  if (e && e.code === 'NO_DB') return send(res, 503, { ok: false, error: 'no-db' });
  console.error('api error', e && e.message);
  return send(res, 502, { ok: false, error: 'db-error' });
}

/* Strips control characters and trims to a length. */
function txt(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n); }
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket && req.socket.remoteAddress || 'x').trim(); }

/* Tiny per-IP rate limit for write endpoints: max n requests per minute. */
async function limited(req, bucket, n) {
  const k = 'rl:' + bucket + ':' + crypto.createHash('sha1').update(clientIp(req)).digest('hex').slice(0, 12);
  const r = await pipe([['INCR', k], ['EXPIRE', k, '60']]);
  return r[0] > n;
}

module.exports = { conf, cmd, pipe, lua, body, send, fail, txt, limited };
