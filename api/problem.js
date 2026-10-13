'use strict';
/* Problems and clues players create are SAVED here for good and never sent back to any player.
   There is deliberately no GET: nothing in the game can read them. Use /api/export (admin key) to download them. */
const { pipe, body, send, fail, txt, limited } = require('./_lib');
const LV = /^\d{1,2}-\d{1,2}$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { ok: false });
  try {
    const b = await body(req);
    const lv = String(b.lv || '');
    const clue = txt(b.clue, 200);
    if (!LV.test(lv) || !clue) return send(res, 400, { ok: false });
    if (await limited(req, 'p', 20)) return send(res, 429, { ok: false });
    const pts = (Array.isArray(b.pts) ? b.pts : []).slice(0, 12).map(p => [parseInt(p && p[0], 10) || 0, parseInt(p && p[1], 10) || 0]);
    const rec = { lv, kind: txt(b.kind, 20) || 'problem', clue, pts, n: txt(b.n, 14), room: txt(b.room, 5), t: Date.now() };
    await pipe([['LPUSH', 'problems', JSON.stringify(rec)], ['LTRIM', 'problems', '0', '49999']]);
    return send(res, 200, { ok: true });
  } catch (e) { return fail(res, e); }
};
