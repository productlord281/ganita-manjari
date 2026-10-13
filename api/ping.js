'use strict';
const { cmd, send, fail, conf } = require('./_lib');
module.exports = async (req, res) => {
  if (!conf()) return send(res, 200, { ok: true, db: false, seen: Object.keys(process.env).filter(k => /redis|kv|upstash/i.test(k)).sort() });
  try { await cmd(['PING']); return send(res, 200, { ok: true, db: true }); }
  catch (e) { return fail(res, e); }
};
