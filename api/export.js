'use strict';
/* Optional: set an ADMIN_KEY environment variable in Vercel, then open /api/export?key=YOURKEY
   to download every saved problem and every "how I solved it" record as JSON. Without ADMIN_KEY this returns 404. */
const { pipe, cmd, send, fail } = require('./_lib');
module.exports = async (req, res) => {
  const k = process.env.ADMIN_KEY;
  if (!k || String((req.query && req.query.key) || '') !== k) return send(res, 404, { ok: false });
  try {
    const lvs = (await cmd(['SMEMBERS', 'w:lv'])) || [];
    const list = [['LRANGE', 'problems', '0', '-1']];
    lvs.forEach(l => { list.push(['HGETALL', 'w:c:' + l]); list.push(['LRANGE', 'w:n:' + l, '0', '-1']); });
    const r = await pipe(list);
    const ways = {};
    lvs.forEach((l, i) => {
      const flat = r[1 + i * 2] || []; const c = {};
      for (let j = 0; j < flat.length; j += 2) c[flat[j]] = parseInt(flat[j + 1], 10) || 0;
      ways[l] = { counts: c, notes: (r[2 + i * 2] || []).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean) };
    });
    const problems = (r[0] || []).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
    res.setHeader('Content-Disposition', 'attachment; filename="ganita-manjari-export.json"');
    return send(res, 200, { exportedAt: new Date().toISOString(), problems, ways });
  } catch (e) { return fail(res, e); }
};
