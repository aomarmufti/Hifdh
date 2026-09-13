// Static server for public/ plus an in-memory stand-in for Postgres.
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const E2E    = __dirname;
const CDN    = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
const UID    = 'user-probe-0001';
const PORT   = Number(process.env.PORT || 4188);

const INSPIRATIONS = [
  { id: 1, kind: 'ayah', body: 'And We have certainly made the Qur’an easy for remembrance, so is there any who will remember?', source: 'Al-Qamar 54:17', encouragement: 'The difficulty you feel is the work, not a verdict on you.' },
  { id: 2, kind: 'hadith', body: 'The best of you are those who learn the Qur’an and teach it.', source: 'Sahih al-Bukhari 5027', encouragement: 'What you hold is meant to be passed on.' },
  { id: 3, kind: 'ayah', body: 'Indeed, with hardship comes ease.', source: 'Ash-Sharh 94:6', encouragement: 'The page that resists you today is the one that will feel easiest in a month.' }
];

let db, session;
function reset(seeded) {
  db = { plan_config: [], progress: [], daily_tasks: [], weekly_review: [],
         settings: [], inspirations: INSPIRATIONS.slice() };
  session = null;
  if (seeded) {
    db.plan_config.push({ user_id: UID, direction: 'backward', lesson_days: [1,5],
      new_pages_per_lesson: 1, sabqi_window_pages: 10, sabqi_pages_per_day: 5,
      manzil_pages_per_day: 8, rest_days: [],
      arabic_enabled: true, arabic_text: '', arabic_days: [1,2,3,4,5,6,7] });
    db.progress.push({ user_id: UID, mem_from: 496, mem_to: 604,
      sabqi_cursor: 496, manzil_cursor: 0, last_planned_date: null });
  }
}
reset(false);

const KEYS = {
  plan_config: ['user_id'], progress: ['user_id'], settings: ['user_id'],
  weekly_review: ['user_id', 'review_date'], daily_tasks: ['id']
};
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png' };

const body = (req) => new Promise((r) => {
  let b = ''; req.on('data', (c) => b += c); req.on('end', () => r(b ? JSON.parse(b) : {}));
});
const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

function match(row, filters) {
  for (const [kind, col, val] of filters || []) {
    if (kind === 'eq'  && String(row[col]) !== String(val)) return false;
    if (kind === 'lt'  && !(String(row[col]) <  String(val))) return false;
    if (kind === 'gte' && !(String(row[col]) >= String(val))) return false;
    if (kind === 'in'  && !val.map(String).includes(String(row[col]))) return false;
  }
  return true;
}

let idSeq = 1;

const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;

  if (p.startsWith('/mock/')) {
    const op = p.slice(6);
    const b = await body(req);

    if (op === 'session') return send(res, 200, { session });
    if (op === 'signin')  { session = { user: { id: UID, email: b.email } }; return send(res, 200, { session }); }
    if (op === 'signout') { session = null; return send(res, 200, {}); }
    if (op === 'reset')   { reset(!!b.seeded); return send(res, 200, {}); }
    if (op === 'authed')  { session = { user: { id: UID, email: 'probe@example.com' } }; return send(res, 200, {}); }
    if (op === 'dump')    return send(res, 200, db);
    if (op === 'poke')    { // let a test fabricate rows directly
      db[b.table].push(...b.rows); return send(res, 200, {}); }

    if (op === 'select') {
      let rows = (db[b.table] || []).filter((r) => r.user_id === undefined || r.user_id === UID);
      rows = rows.filter((r) => match(r, b.filters));
      return send(res, 200, { rows });
    }
    if (op === 'insert') {
      const rows = b.rows.map((r) => ({ id: 'row-' + (idSeq++), done: false, done_at: null,
                                        carried_from: null, ...r }));
      db[b.table].push(...rows);
      return send(res, 200, { rows });
    }
    if (op === 'update') {
      const hit = db[b.table].filter((r) => match(r, b.filters));
      for (const r of hit) Object.assign(r, b.row);
      return send(res, 200, { rows: hit });
    }
    if (op === 'delete') {
      db[b.table] = db[b.table].filter((r) => !match(r, b.filters));
      return send(res, 200, {});
    }
    if (op === 'upsert') {
      const keys = KEYS[b.table];
      const rows = db[b.table];
      const i = rows.findIndex((r) => keys.every((k) => String(r[k]) === String(b.row[k])));
      if (i >= 0) rows[i] = { ...rows[i], ...b.row };
      else rows.push({ id: 'row-' + (idSeq++), ...b.row });
      return send(res, 200, { rows: [b.row] });
    }
    return send(res, 404, {});
  }

  let file = p === '/' ? '/index.html' : p;
  let full = path.join(PUBLIC, file);
  if (!fs.existsSync(full)) full = path.join(E2E, file);
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end('nope'); }

  let data = fs.readFileSync(full);
  if (file === '/app.js') data = Buffer.from(data.toString().replace(CDN, './mock-supabase.js'));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'text/plain' });
  res.end(data);
});

server.listen(PORT, () => console.log('ready on ' + PORT));
