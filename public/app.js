import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
const $  = (id) => document.getElementById(id);
const DAYS  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const TASKS = [
  { key: 'sabqi',  label: 'Sabqi'  },
  { key: 'manzil', label: 'Manzil' },
  { key: 'arabic', label: 'Arabic' }
];

// Local-time date key. Never use toISOString() here: it shifts to UTC and
// would roll the day over for anyone east or west of Greenwich.
function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
// ISO weekday: 1 = Monday ... 7 = Sunday
function isoDay(d = new Date()) { return d.getDay() === 0 ? 7 : d.getDay(); }
function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
function toast(msg, isErr = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('is-err', isErr);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */
const state = {
  user: null,
  plan: {},      // weekday(1-7) -> { sabqi, manzil, arabic }
  logs: {},      // 'YYYY-MM-DD' -> log row
  reviews: [],   // newest first
  settings: {},
  view: 'today'
};

/* ------------------------------------------------------------------ *
 * Write queue
 *
 * Postgres is the source of truth. This queue is only an outbox so a
 * check-off survives a dead tunnel on the walk to fajr; it is replayed
 * as soon as a write succeeds or the device comes back online.
 * ------------------------------------------------------------------ */
const QKEY = 'hifdh.outbox.v1';
let outbox = [];
try { outbox = JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { outbox = []; }
let flushing = false;

function saveOutbox() {
  try { localStorage.setItem(QKEY, JSON.stringify(outbox)); } catch { /* private mode */ }
}
function enqueue(op) {
  // One pending write per target row; the newest payload wins.
  outbox = outbox.filter((o) => o.id !== op.id);
  outbox.push(op);
  saveOutbox();
  flush();
}

async function runOp(op) {
  if (op.table === 'weekly_review') {
    return sb.from('weekly_review').upsert(op.row, { onConflict: 'user_id,review_date' });
  }
  if (op.table === 'weekly_plan') {
    return sb.from('weekly_plan').upsert(op.row, { onConflict: 'user_id,weekday' });
  }
  if (op.table === 'daily_log') {
    return sb.from('daily_log').upsert(op.row, { onConflict: 'user_id,log_date' });
  }
  return sb.from('settings').upsert(op.row, { onConflict: 'user_id' });
}

async function flush() {
  if (flushing || !outbox.length || !state.user) return;
  flushing = true;
  try {
    while (outbox.length) {
      const op = outbox[0];
      const { error } = await runOp(op);
      if (error) {
        console.warn('write failed, will retry', error);
        toast('Saved on device, syncing later', true);
        break;
      }
      outbox.shift();
      saveOutbox();
    }
  } finally {
    flushing = false;
  }
}
window.addEventListener('online', flush);

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */
$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim();
  const btn = $('auth-btn');
  const msg = $('auth-msg');
  btn.disabled = true;
  btn.textContent = 'Sending...';
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname }
  });
  btn.disabled = false;
  btn.textContent = 'Send me a sign-in link';
  msg.hidden = false;
  msg.classList.toggle('is-err', !!error);
  msg.textContent = error
    ? error.message
    : 'Check your email and tap the link. You can close this page.';
});

$('signout').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

/* ------------------------------------------------------------------ *
 * Data loading
 * ------------------------------------------------------------------ */
async function loadAll() {
  const since = dateKey(addDays(new Date(), -400));
  const [plan, logs, reviews, settings] = await Promise.all([
    sb.from('weekly_plan').select('*'),
    sb.from('daily_log').select('*').gte('log_date', since),
    sb.from('weekly_review').select('*').order('review_date', { ascending: false }),
    sb.from('settings').select('*').maybeSingle()
  ]);

  if (plan.error) throw plan.error;

  state.plan = {};
  for (const row of plan.data || []) state.plan[row.weekday] = row;

  // The signup trigger seeds the plan; this is the belt-and-braces path for
  // an account that predates it or had rows removed.
  if (!Object.keys(state.plan).length) {
    for (let wd = 1; wd <= 7; wd++) {
      state.plan[wd] = { weekday: wd, sabqi: '', manzil: '', arabic: '' };
    }
  }

  state.logs = {};
  for (const row of logs.data || []) state.logs[row.log_date] = row;

  state.reviews  = reviews.data || [];
  state.settings = settings.data || {};
}

function todayLog() {
  const k = dateKey();
  if (!state.logs[k]) {
    state.logs[k] = {
      user_id: state.user.id, log_date: k,
      sabqi_done: false, manzil_done: false, arabic_done: false,
      sabqi_done_at: null, manzil_done_at: null, arabic_done_at: null
    };
  }
  return state.logs[k];
}

/* ------------------------------------------------------------------ *
 * Today
 * ------------------------------------------------------------------ */
function renderToday() {
  const now = new Date();
  const wd  = isoDay(now);
  const plan = state.plan[wd] || { sabqi: '', manzil: '', arabic: '' };
  const log  = todayLog();

  $('today-weekday').textContent = DAYS[wd - 1];
  $('today-date').textContent = now.toLocaleDateString(undefined, {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  $('today-tasks').innerHTML = TASKS.map(({ key, label }) => {
    const done = log[`${key}_done`];
    const text = (plan[key] || '').trim();
    const at   = log[`${key}_done_at`];
    const time = done && at
      ? new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : '';
    return `
      <button class="task ${done ? 'is-done' : ''}" data-task="${key}"
              type="button" aria-pressed="${done}">
        <span class="box">${done ? '&#10003;' : ''}</span>
        <span>
          <span class="task-label">${label}${time ? ' &middot; ' + esc(time) : ''}</span>
          <span class="task-text ${text ? '' : 'is-empty'}">${
            text ? esc(text) : 'Nothing set - add it in the Week tab'
          }</span>
        </span>
      </button>`;
  }).join('');

  renderStats();
}

function toggleTask(key) {
  const log  = todayLog();
  const next = !log[`${key}_done`];
  log[`${key}_done`] = next;
  log[`${key}_done_at`] = next ? new Date().toISOString() : null;

  renderToday();                       // paint first, sync after
  if (navigator.vibrate) navigator.vibrate(next ? 14 : 8);

  enqueue({
    id: `daily:${log.log_date}`,
    table: 'daily_log',
    row: { ...log, user_id: state.user.id, updated_at: new Date().toISOString() }
  });
}

$('today-tasks').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-task]');
  if (btn) toggleTask(btn.dataset.task);
});

function doneCount(log) {
  if (!log) return 0;
  return (log.sabqi_done ? 1 : 0) + (log.manzil_done ? 1 : 0) + (log.arabic_done ? 1 : 0);
}

function renderStats() {
  // A day counts toward the streak when all three tasks are done. Today is
  // allowed to be unfinished without breaking a streak built up to yesterday.
  let streak = 0;
  let cursor = new Date();
  if (doneCount(state.logs[dateKey(cursor)]) < 3) cursor = addDays(cursor, -1);
  while (doneCount(state.logs[dateKey(cursor)]) === 3) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  let full = 0;
  for (let i = 0; i < 30; i++) {
    if (doneCount(state.logs[dateKey(addDays(new Date(), -i))]) === 3) full++;
  }

  $('stat-streak').textContent = streak;
  $('stat-30').textContent = full;
}

/* ------------------------------------------------------------------ *
 * Week editor
 * ------------------------------------------------------------------ */
function renderWeek() {
  const today = isoDay();
  $('week-list').innerHTML = [1, 2, 3, 4, 5, 6, 7].map((wd) => {
    const p = state.plan[wd] || {};
    const line = (label, v) =>
      `<div class="day-line"><b>${label}</b> ${v ? esc(v) : '&mdash;'}</div>`;
    return `
      <button class="day-row ${wd === today ? 'is-today' : ''}" data-wd="${wd}" type="button">
        <div class="day-name">${DAYS[wd - 1]}${
          wd === today ? '<span class="today-pill">Today</span>' : ''
        }</div>
        ${line('Sabqi', p.sabqi)}
        ${line('Manzil', p.manzil)}
        ${line('Arabic', p.arabic)}
      </button>`;
  }).join('');
}

let editingWd = null;

$('week-list').addEventListener('click', (e) => {
  const row = e.target.closest('[data-wd]');
  if (!row) return;
  editingWd = Number(row.dataset.wd);
  const p = state.plan[editingWd] || {};
  $('sheet-title').textContent = DAYS[editingWd - 1];
  $('ed-sabqi').value  = p.sabqi  || '';
  $('ed-manzil').value = p.manzil || '';
  $('ed-arabic').value = p.arabic || '';
  $('sheet').hidden = false;
});

function closeSheet() { $('sheet').hidden = true; editingWd = null; }

$('ed-cancel').addEventListener('click', closeSheet);
$('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

$('ed-save').addEventListener('click', () => {
  if (!editingWd) return;
  const row = {
    user_id: state.user.id,
    weekday: editingWd,
    sabqi:  $('ed-sabqi').value.trim(),
    manzil: $('ed-manzil').value.trim(),
    arabic: $('ed-arabic').value.trim(),
    updated_at: new Date().toISOString()
  };
  state.plan[editingWd] = row;
  enqueue({ id: `plan:${editingWd}`, table: 'weekly_plan', row });
  closeSheet();
  renderWeek();
  renderToday();
  toast('Saved');
});

/* ------------------------------------------------------------------ *
 * History heatmap - 8 weeks, one hue light to dark by tasks completed
 * ------------------------------------------------------------------ */
function renderHistory() {
  const WEEKS = 8;
  const today = new Date();
  const todayK = dateKey(today);

  // End the grid on the Sunday of the current week so columns are whole weeks.
  const end = addDays(today, 7 - isoDay(today));
  const start = addDays(end, -(WEEKS * 7 - 1));

  // Row labels: a heatmap with no orientation is a wall of squares.
  let html = '<div class="hm-labels">' +
    SHORT.map((d) => `<span class="hm-lbl">${d[0]}</span>`).join('') + '</div>';
  for (let w = 0; w < WEEKS; w++) {
    html += '<div class="hm-col">';
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, w * 7 + d);
      const k = dateKey(day);
      const n = doneCount(state.logs[k]);
      const future = k > todayK;
      const label = day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      html += `<span class="cell lv${n} ${future ? 'is-future' : ''}"
                     data-day="${esc(label)}" data-n="${future ? -1 : n}"
                     title="${esc(label)} - ${n} of 3"></span>`;
    }
    html += '</div>';
  }
  $('heatmap').innerHTML = html;

  let done = 0, partial = 0, tracked = 0;
  for (let i = 0; i < WEEKS * 7; i++) {
    const k = dateKey(addDays(today, -i));
    const n = doneCount(state.logs[k]);
    if (n === 3) done++;
    else if (n > 0) partial++;
    tracked++;
  }
  const pct = tracked ? Math.round((done / tracked) * 100) : 0;
  $('history-summary').innerHTML =
    `Last ${WEEKS} weeks: <b>${done}</b> complete days, <b>${partial}</b> partial ` +
    `&mdash; <b>${pct}%</b> fully done.`;
}

// title= never appears on a touch device, so make a cell tappable.
$('heatmap').addEventListener('click', (e) => {
  const cell = e.target.closest('[data-day]');
  if (!cell) return;
  const n = Number(cell.dataset.n);
  toast(n < 0 ? `${cell.dataset.day} - not yet` : `${cell.dataset.day} - ${n} of 3 done`);
});

/* ------------------------------------------------------------------ *
 * Weekly review + trend chart
 * ------------------------------------------------------------------ */
// "42/48" -> { value: 42, total: 48 }; "42" -> { value: 42, total: null }
function parsePages(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?/);
  if (!m) return null;
  return { value: parseFloat(m[1]), total: m[2] ? parseFloat(m[2]) : null };
}

function renderChart() {
  const pts = state.reviews
    .map((r) => ({ date: r.review_date, p: parsePages(r.zero_hesitation_pages) }))
    .filter((r) => r.p)
    .map((r) => ({ date: r.date, value: r.p.value, total: r.p.total }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const host  = $('chart');
  const empty = $('chart-empty');

  if (pts.length < 2) {
    host.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const W = 320, H = 150;
  const pad = { t: 10, r: 10, b: 24, l: 34 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const maxV = Math.max(...pts.map((p) => p.total || p.value));
  const top  = Math.ceil(maxV * 1.1 / 10) * 10 || 10;

  const x = (i) => pad.l + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / top) * ih;

  const gridVals = [0, top / 2, top];
  const grid = gridVals.map((v) => `
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"
          stroke="#2c3831" stroke-width="1"/>
    <text x="${pad.l - 7}" y="${y(v) + 4}" text-anchor="end"
          font-size="10" fill="#6f8177">${Math.round(v)}</text>`).join('');

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4"
             fill="#3ecf8e" stroke="#18201c" stroke-width="2"/>`).join('');

  // Label only the ends, never every point.
  const endLabels = [0, pts.length - 1].map((i) => {
    const p = pts[i];
    const anchor = i === 0 ? 'start' : 'end';
    const d = parseKey(p.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}"
                  font-size="10" fill="#6f8177">${esc(d)}</text>`;
  }).join('');

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img"
         aria-label="Zero-hesitation pages over ${pts.length} weekly reviews">
      ${grid}
      <path d="${line}" fill="none" stroke="#3ecf8e" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      ${endLabels}
      <line id="cross" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}"
            stroke="#3ecf8e" stroke-width="1" opacity="0"/>
    </svg>
    <div class="tip" id="tip" hidden></div>`;

  const svg   = host.querySelector('svg');
  const tip   = $('tip');
  const cross = host.querySelector('#cross');

  function move(ev) {
    const box = svg.getBoundingClientRect();
    const px  = ((ev.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < pts.length; i++) {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    }
    const p = pts[best];
    const pctTxt = p.total ? ` (${Math.round((p.value / p.total) * 100)}%)` : '';
    const d = parseKey(p.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    tip.innerHTML = `${esc(d)} &middot; <b>${p.value}${p.total ? '/' + p.total : ''}</b>${pctTxt}`;
    tip.hidden = false;
    tip.style.left = `${(x(best) / W) * 100}%`;
    tip.style.top  = `${(y(p.value) / H) * box.height}px`;
    cross.setAttribute('x1', x(best));
    cross.setAttribute('x2', x(best));
    cross.setAttribute('opacity', '.35');
  }
  function leave() { tip.hidden = true; cross.setAttribute('opacity', '0'); }

  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave);
}

function renderReviews() {
  $('review-list').innerHTML = state.reviews.map((r) => {
    const bits = [];
    if (r.zero_hesitation_pages) bits.push(`Zero-hesitation ${esc(r.zero_hesitation_pages)}`);
    if (r.weak_pages)            bits.push(`Weak ${esc(r.weak_pages)}`);
    if (r.arabic_pages_completed != null) bits.push(`Arabic ${r.arabic_pages_completed}p`);
    if (r.vocab_roots_logged != null)     bits.push(`${r.vocab_roots_logged} roots`);
    const d = parseKey(r.review_date).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric'
    });
    return `
      <div class="review-item">
        <div class="review-date">${esc(d)}</div>
        ${bits.length ? `<div class="review-meta">${bits.join(' &middot; ')}</div>` : ''}
        ${r.note ? `<div class="review-note">${esc(r.note)}</div>` : ''}
      </div>`;
  }).join('');
}

function renderReview() {
  if (!$('rv-date').value) $('rv-date').value = dateKey();
  renderChart();
  renderReviews();
}

$('review-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const num = (v) => (v === '' ? null : Number(v));
  const row = {
    user_id: state.user.id,
    review_date: $('rv-date').value,
    zero_hesitation_pages: $('rv-zero').value.trim(),
    weak_pages: $('rv-weak').value.trim(),
    arabic_pages_completed: num($('rv-arabic').value),
    vocab_roots_logged: num($('rv-vocab').value),
    note: $('rv-note').value.trim(),
    updated_at: new Date().toISOString()
  };

  const i = state.reviews.findIndex((r) => r.review_date === row.review_date);
  if (i >= 0) state.reviews[i] = { ...state.reviews[i], ...row };
  else state.reviews.unshift(row);
  state.reviews.sort((a, b) => b.review_date.localeCompare(a.review_date));

  enqueue({ id: `review:${row.review_date}`, table: 'weekly_review', row });

  ['rv-zero', 'rv-weak', 'rv-arabic', 'rv-vocab', 'rv-note'].forEach((id) => { $(id).value = ''; });
  renderReview();

  const msg = $('rv-msg');
  msg.hidden = false;
  msg.classList.remove('is-err');
  msg.textContent = 'Review saved.';
  setTimeout(() => { msg.hidden = true; }, 2600);
});

/* ------------------------------------------------------------------ *
 * Settings + reminder
 *
 * A real push at 5:30am with the app closed needs a push server with VAPID
 * keys. This is the honest subset: while the app is open (or warm in the
 * background) it fires a local notification at the chosen time.
 * ------------------------------------------------------------------ */
let reminderTimer;

function scheduleReminder() {
  clearTimeout(reminderTimer);
  const t = state.settings.reminder_time;
  const status = $('remind-status');

  if (!t) {
    status.textContent = 'No reminder set.';
    return;
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    status.textContent = 'Reminder saved. Allow notifications to receive it.';
    return;
  }

  const [h, m] = t.split(':').map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  const ms = next - now;
  status.textContent = `Next reminder ${next.toLocaleString(undefined, {
    weekday: 'short', hour: 'numeric', minute: '2-digit'
  })}. Fires while the app is open in the background.`;

  // setTimeout saturates past ~24.8 days; the horizon here is under a day.
  reminderTimer = setTimeout(() => {
    try {
      new Notification('Hifdh', { body: "Today's revision is waiting.", tag: 'hifdh-daily' });
    } catch { /* notification blocked */ }
    scheduleReminder();
  }, ms);
}

$('remind-save').addEventListener('click', () => {
  const t = $('set-remind').value;

  // Persist first. The permission prompt is fire-and-forget: if it is
  // dismissed, ignored, or never resolves, the saved time must not be lost.
  state.settings.reminder_time = t || null;
  enqueue({
    id: 'settings',
    table: 'settings',
    row: { user_id: state.user.id, reminder_time: t || null, updated_at: new Date().toISOString() }
  });
  scheduleReminder();
  toast('Reminder saved');

  if (t && 'Notification' in window && Notification.permission === 'default') {
    try {
      Promise.resolve(Notification.requestPermission())
        .then(scheduleReminder)
        .catch(() => { /* denied */ });
    } catch { /* older callback-only API */ }
  }
});

function renderSettings() {
  $('set-email').textContent = state.user.email || '';
  $('set-remind').value = state.settings.reminder_time
    ? state.settings.reminder_time.slice(0, 5)
    : '';
  scheduleReminder();
}

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */
const RENDER = {
  today: renderToday, week: renderWeek, history: renderHistory,
  review: renderReview, settings: renderSettings
};

function show(view) {
  state.view = view;
  for (const v of Object.keys(RENDER)) $(`view-${v}`).hidden = v !== view;
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('is-active', tab.dataset.view === view);
  }
  RENDER[view]();
  window.scrollTo(0, 0);
}

$('tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-view]');
  if (tab) show(tab.dataset.view);
});

// Coming back to a home-screen PWA after midnight must re-render "today".
let lastDay = dateKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  flush();
  if (dateKey() !== lastDay) { lastDay = dateKey(); show('today'); }
  else if (state.view === 'today') renderToday();
});

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */
async function start(session) {
  state.user = session.user;
  try {
    await loadAll();
  } catch (err) {
    console.error(err);
    toast('Could not load data', true);
  }
  $('boot').hidden = true;
  $('auth').hidden = true;
  $('app').hidden = false;
  show('today');
  flush();
}

(async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await start(session);
  } else {
    $('boot').hidden = true;
    $('auth').hidden = false;
  }

  sb.auth.onAuthStateChange((event, s) => {
    if (event === 'SIGNED_IN' && s && !state.user) start(s);
    if (event === 'SIGNED_OUT') location.reload();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache is optional */ });
  }
})();
