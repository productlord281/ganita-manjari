'use strict';
const { lua, body, send, fail, txt } = require('./_lib');
const SCRIPT = require('./_sync.lua.js');

const DAY = 86400;
const TTL_LIVE = 30 * DAY;   /* an unfinished room is kept 30 days after its last activity */
const TTL_WON = 7 * DAY;     /* a finished room is kept 7 more days, or removed as soon as only the hero is left */

const CODE = /^[A-Z0-9]{5}$/;
const ID = /^[a-z0-9]{1,24}$/;
const KEY = /^[a-zA-Z0-9]{1,24}$/;

function jstr(v, max) { const s = JSON.stringify(v); return s && s.length <= max ? s : null; }
function int(v, lo, hi, d) { v = parseInt(v, 10); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); }

function cleanOps(list, now) {
  const out = []; let create = false;
  (Array.isArray(list) ? list : []).slice(0, 14).forEach(op => {
    if (!op || typeof op !== 'object') return;
    if (op.t === 'meta' && op.v && typeof op.v === 'object') {
      const flat = [];
      ['code', 'hero', 'created', 'started', 'won'].forEach(k => {
        if (op.v[k] === undefined) return;
        const s = jstr(op.v[k], 600); if (s === null) return;
        flat.push(k, s);
      });
      if (!flat.length) return;
      if (op.v.created !== undefined) create = true;
      out.push({ t: 'meta', v: flat });
    } else if (op.t === 'player' && KEY.test(String(op.k))) {
      if (op.v === false || op.v == null) out.push({ t: 'player', k: String(op.k), v: false });
      else if (typeof op.v === 'string') {
        let p; try { p = JSON.parse(op.v); } catch (e) { return; }
        const s = jstr({ n: txt(p.n, 14), s: int(p.s, -1, 9, -1), j: int(p.j, 0, 4e12, now) }, 300);
        if (s) out.push({ t: 'player', k: String(op.k), v: s });
      }
    } else if (op.t === 'say' && typeof op.v === 'string') {
      let m; try { m = JSON.parse(op.v); } catch (e) { return; }
      const x = txt(m.x, 140); if (!x || !ID.test(String(m.id)) || !KEY.test(String(m.k))) return;
      const msg = { id: String(m.id), k: String(m.k), n: txt(m.n, 14), s: int(m.s, -1, 9, -1), t: now, x };
      if (m.sys) msg.sys = 1;
      out.push({ t: 'say', v: JSON.stringify(msg) });
    } else if (op.t === 'sol' && KEY.test(String(op.k)) && typeof op.v === 'string') {
      let b; try { b = JSON.parse(op.v); } catch (e) { return; }
      const e = (Array.isArray(b.e) ? b.e : []).slice(-8).map(z => ({ t: txt(z && z.t, 40), m: txt(z && z.m, 40), n: txt(z && z.n, 140) }));
      const s = jstr({ n: txt(b.n, 14), s: int(b.s, -1, 9, -1), e }, 6000);
      if (s) out.push({ t: 'sol', k: String(op.k), v: s });
    }
  });
  return { ops: out, create };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { ok: false });
  try {
    const b = await body(req);
    const code = String(b.c || '').toUpperCase();
    if (!CODE.test(code)) return send(res, 400, { ok: false, error: 'code' });
    const now = Date.now();
    const q = { ver: txt(b.ver, 12), since: int(b.since, 0, 4e12, 0) };
    if (b.probe) q.probe = 1;
    else {
      const o = cleanOps(b.ops, now);
      q.ops = o.ops;
      if (o.create) q.create = 1;
      if (b.tab && ID.test(String(b.tab))) {
        q.tab = String(b.tab);
        if (b.leave) q.leave = 1;
        else if (typeof b.pres === 'string' && b.pres.length <= 700) q.pres = b.pres;
      }
    }
    const r = await lua(SCRIPT, ['r:' + code + ':'], [JSON.stringify(q), now, TTL_LIVE, TTL_WON]);
    if (!Array.isArray(r)) return send(res, 502, { ok: false });
    return send(res, 200, { ok: true, s: r[0], now, r });
  } catch (e) { return fail(res, e); }
};
