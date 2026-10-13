'use strict';
/* "How did you solve it?" answers are kept for every level and keep growing.
   GET  /api/ways?lv=0-2  -> method counts + the latest notes, shown to players on the results screen
   POST /api/ways         -> adds one player's method (and optional one-line note) */
const { pipe, body, send, fail, txt, limited } = require('./_lib');
const LV = /^\d{1,2}-\d{1,2}$/;

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const lv = String((req.query && req.query.lv) || '');
      if (!LV.test(lv)) return send(res, 400, { ok: false });
      const r = await pipe([['HGETALL', 'w:c:' + lv], ['LRANGE', 'w:n:' + lv, '0', '14']]);
      const c = {}; const flat = r[0] || [];
      for (let i = 0; i < flat.length; i += 2) c[flat[i]] = parseInt(flat[i + 1], 10) || 0;
      const n = (r[1] || []).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
      return send(res, 200, { ok: true, c, n });
    }
    if (req.method === 'POST') {
      const b = await body(req);
      const lv = String(b.lv || '');
      const m = txt(b.m, 60);
      if (!LV.test(lv) || !m) return send(res, 400, { ok: false });
      if (await limited(req, 'w', 40)) return send(res, 429, { ok: false });
      const x = txt(b.x, 140);
      const cmds = [['SADD', 'w:lv', lv], ['HINCRBY', 'w:c:' + lv, m, '1']];
      if (x) {
        cmds.push(['LPUSH', 'w:n:' + lv, JSON.stringify({ n: txt(b.n, 14), m, x, t: Date.now() })]);
        cmds.push(['LTRIM', 'w:n:' + lv, '0', '299']);
      }
      await pipe(cmds);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { ok: false });
  } catch (e) { return fail(res, e); }
};
