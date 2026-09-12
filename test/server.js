// Static server for public/ + an in-memory stand-in for Postgres.
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const E2E    = __dirname;
const SEED   = JSON.parse(fs.readFileSync(path.join(E2E, 'seed.json'), 'utf8'));
const CDN    = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
const UID    = 'user-probe-0001';

let db, session;
function reset() {
  db = { weekly_plan: [], daily_log: [], weekly_review: [], settings: [] };
  for (const wd of Object.keys(SEED)) {          // mirrors the signup trigger
    db.weekly_plan.push({ user_id: UID, weekday: Number(wd), ...SEED[wd] });
  }
  session = null;
}
reset();

const KEYS = {
  weekly_plan:   ['user_id', 'weekday'],
  daily_log:     ['user_id', 'log_date'],
  weekly_review: ['user_id', 'review_date'],
  settings:      ['user_id']
};

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png'
};

function body(req) {
  return new Promise((r) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b ? JSON.parse(b) : {}));
  });
}
const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p.startsWith('/mock/')) {
    const op = p.slice(6);
    const b = await body(req);

    if (op === 'session')  return send(res, 200, { session });
    if (op === 'signin')   { session = { user: { id: UID, email: b.email } }; return send(res, 200, { session }); }
    if (op === 'signout')  { session = null; return send(res, 200, {}); }
    if (op === 'reset')    { reset(); return send(res, 200, {}); }
    if (op === 'dump')     return send(res, 200, db);
    if (op === 'authed')   { session = { user: { id: UID, email: 'probe@example.com' } }; return send(res, 200, {}); }

    if (op === 'select') {
      let rows = (db[b.table] || []).filter((r) => r.user_id === UID);
      for (const [kind, col, val] of b.filters || []) {
        if (kind === 'gte') rows = rows.filter((r) => String(r[col]) >= String(val));
      }
      return send(res, 200, { rows });
    }
    if (op === 'upsert') {
      const keys = KEYS[b.table];
      const rows = db[b.table];
      const i = rows.findIndex((r) => keys.every((k) => String(r[k]) === String(b.row[k])));
      if (i >= 0) rows[i] = { ...rows[i], ...b.row };
      else rows.push({ ...b.row });
      return send(res, 200, { error: null });
    }
    return send(res, 404, {});
  }

  // Static files, with the CDN import rewritten to the mock client.
  let file = p === '/' ? '/index.html' : p;
  let full = path.join(PUBLIC, file);
  if (!fs.existsSync(full)) full = path.join(E2E, file);
  if (!fs.existsSync(full)) { res.writeHead(404); return res.end('nope'); }

  let data = fs.readFileSync(full);
  if (file === '/app.js') {
    data = Buffer.from(data.toString().replace(CDN, './mock-supabase.js'));
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'text/plain' });
  res.end(data);
});

server.listen(4188, () => console.log('ready on 4188'));
