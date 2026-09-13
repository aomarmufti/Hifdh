import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { SURAHS, surahsInPages, pagesForSurahRange, labelForPages } from './lib/quran.js';
import {
  DEFAULT_CONFIG, planDay, absorbSabaq, cycleLengthDays,
  sabqiWindow, manzilPool, preview
} from './lib/engine.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/* ══════════════════════ helpers ══════════════════════ */
const $ = (id) => document.getElementById(id);
const DAYS_LONG  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_INITIAL = ['M','T','W','T','F','S','S'];

const pad = (n) => String(n).padStart(2, '0');
// Local date key. toISOString() would shift to UTC and roll the day over.
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };
const isoDay = (d = new Date()) => (d.getDay() === 0 ? 7 : d.getDay());
const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate()+n); return c; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const ICONS = {
  today:    'M3 9h18M7 3v3m10-3v3M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z',
  plan:     'M4 6h16M4 12h16M4 18h10M18 16v5m2.5-2.5h-5',
  progress: 'M3 20V10m6 10V4m6 16v-7m6 7V8',
  more:     'M12 5h.01M12 12h.01M12 19h.01',
  check:    'M20 6 9 17l-5-5'
};
const svg = (d, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

let toastT;
function toast(msg, err = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('is-err', err);
  el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, 2400);
}
const buzz = (ms) => { if (navigator.vibrate) navigator.vibrate(ms); };

/* ══════════════════════ state ══════════════════════ */
const state = {
  user: null,
  config: { ...DEFAULT_CONFIG },
  progress: null,          // { memFrom, memTo, sabqiCursor, manzilCursor, lastPlanned }
  tasks: [],               // today's tasks
  history: {},             // dateKey -> { total, done }
  reviews: [],
  settings: {},
  inspirations: [],
  view: 'today'
};

/* ══════════════════════ offline outbox ══════════════════════ */
// Postgres is the source of truth; this only survives a dead tunnel.
const QKEY = 'hifdh.outbox.v2';
let outbox = [];
try { outbox = JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { outbox = []; }
let flushing = false;
const saveOutbox = () => { try { localStorage.setItem(QKEY, JSON.stringify(outbox)); } catch {} };

function enqueue(op) {
  outbox = outbox.filter((o) => o.id !== op.id);
  outbox.push(op);
  saveOutbox();
  flush();
}
async function runOp(op) {
  if (op.type === 'upsert') {
    return sb.from(op.table).upsert(op.row, { onConflict: op.onConflict });
  }
  if (op.type === 'update') {
    return sb.from(op.table).update(op.row).eq('id', op.rowId);
  }
  return { error: null };
}
async function flush() {
  if (flushing || !outbox.length || !state.user) return;
  flushing = true;
  try {
    while (outbox.length) {
      const { error } = await runOp(outbox[0]);
      if (error) { console.warn('write deferred', error); break; }
      outbox.shift(); saveOutbox();
    }
  } finally { flushing = false; }
}
window.addEventListener('online', flush);

/* ══════════════════════ config <-> db ══════════════════════ */
const cfgFromRow = (r) => ({
  direction: r.direction,
  lessonDays: r.lesson_days || [],
  newPagesPerLesson: r.new_pages_per_lesson,
  sabqiWindowPages: r.sabqi_window_pages,
  sabqiPagesPerDay: r.sabqi_pages_per_day,
  manzilPagesPerDay: r.manzil_pages_per_day,
  restDays: r.rest_days || [],
  arabicEnabled: r.arabic_enabled !== false,
  arabicText: r.arabic_text || '',
  arabicDays: r.arabic_days || [1,2,3,4,5,6,7]
});
const cfgToRow = (c) => ({
  user_id: state.user.id,
  direction: c.direction,
  lesson_days: c.lessonDays,
  new_pages_per_lesson: c.newPagesPerLesson,
  sabqi_window_pages: c.sabqiWindowPages,
  sabqi_pages_per_day: c.sabqiPagesPerDay,
  manzil_pages_per_day: c.manzilPagesPerDay,
  rest_days: c.restDays,
  arabic_enabled: c.arabicEnabled,
  arabic_text: c.arabicText,
  arabic_days: c.arabicDays,
  updated_at: new Date().toISOString()
});
const progToRow = (p) => ({
  user_id: state.user.id,
  mem_from: p.memFrom, mem_to: p.memTo,
  sabqi_cursor: p.sabqiCursor, manzil_cursor: p.manzilCursor,
  last_planned_date: p.lastPlanned,
  updated_at: new Date().toISOString()
});
function saveConfig() {
  enqueue({ id: 'config', type: 'upsert', table: 'plan_config',
            row: cfgToRow(state.config), onConflict: 'user_id' });
}
function saveProgress() {
  enqueue({ id: 'progress', type: 'upsert', table: 'progress',
            row: progToRow(state.progress), onConflict: 'user_id' });
}

/* ══════════════════════ load ══════════════════════ */
async function loadAll() {
  const since = dateKey(addDays(new Date(), -70));
  const [cfg, prog, tasks, reviews, settings, insp] = await Promise.all([
    sb.from('plan_config').select('*').maybeSingle(),
    sb.from('progress').select('*').maybeSingle(),
    sb.from('daily_tasks').select('*').gte('task_date', since).order('task_date'),
    sb.from('weekly_review').select('*').order('review_date', { ascending: false }),
    sb.from('settings').select('*').maybeSingle(),
    sb.from('inspirations').select('*').order('id')
  ]);

  state.config = cfg.data ? cfgFromRow(cfg.data) : { ...DEFAULT_CONFIG };
  state.progress = prog.data ? {
    memFrom: prog.data.mem_from, memTo: prog.data.mem_to,
    sabqiCursor: prog.data.sabqi_cursor, manzilCursor: prog.data.manzil_cursor,
    lastPlanned: prog.data.last_planned_date
  } : null;

  state.reviews = reviews.data || [];
  state.settings = settings.data || {};
  state.inspirations = insp.data || [];

  // Every row counts toward its own date, carried-away ones included: a day you
  // left work on should read as incomplete, and the copy lives on a later date.
  const all = tasks.data || [];
  state.tasks = all.filter((t) => t.task_date === dateKey() && !t.carried_away);
  state.history = {};
  for (const t of all) {
    const h = state.history[t.task_date] || (state.history[t.task_date] = { total: 0, done: 0 });
    h.total++; if (t.done) h.done++;
  }
}

/* ══════════════════════ the day ══════════════════════
   Carry anything unfinished forward, then plan today once.
   Days the app was never opened generate nothing, so a week away
   does not return as a week of backlog.
   ═══════════════════════════════════════════════════ */
async function ensureDayPlanned() {
  const today = dateKey();
  if (!state.progress) return;

  // 1. Carry unfinished work forward onto today.
  //
  // The original row stays on its own date and is flagged carried_away; a copy
  // is made for today. Moving the row instead would erase the fact that the
  // earlier day had work left undone, and the heatmap would score a missed day
  // as a complete one.
  const { data: stale } = await sb.from('daily_tasks').select('*')
    .eq('done', false).eq('carried_away', false).lt('task_date', today);
  if (stale && stale.length) {
    await sb.from('daily_tasks').update({ carried_away: true })
      .in('id', stale.map((t) => t.id));
    await sb.from('daily_tasks').insert(stale.map((t) => ({
      user_id: state.user.id, task_date: today, kind: t.kind,
      page_from: t.page_from, page_to: t.page_to, label: t.label,
      carried_from: t.carried_from || t.task_date
    })));
  }

  // 2. Plan today, once.
  if (state.progress.lastPlanned !== today) {
    const { tasks, next } = planDay(state.progress, state.config, isoDay());
    if (tasks.length) {
      const rows = tasks.map((t) => ({
        user_id: state.user.id, task_date: today, kind: t.kind,
        page_from: t.from, page_to: t.to, label: t.label
      }));
      const { error } = await sb.from('daily_tasks').insert(rows);
      if (error) { console.error('could not plan today', error); return; }
    }
    state.progress = { ...next, lastPlanned: today };
    saveProgress();
  }

  await refreshToday();
}

// Today's working set excludes anything already carried away.
async function refreshToday() {
  const today = dateKey();
  const { data } = await sb.from('daily_tasks').select('*')
    .eq('task_date', today).eq('carried_away', false);
  state.tasks = data || [];
  const h = state.history[today] || (state.history[today] = { total: 0, done: 0 });
  h.total = state.tasks.length;
  h.done = state.tasks.filter((t) => t.done).length;
}

// A settings change should show up in today's portion straight away. Undone
// generated rows are dropped and the cursors rewound to where they started
// (a chunk's first page IS the cursor before it was taken), then replanned.
async function regenerateToday() {
  const today = dateKey();
  const mine = state.tasks.filter((t) => !t.carried_from);
  const undone = mine.filter((t) => !t.done);
  if (!undone.length && mine.length) return;   // nothing to redo

  const rewound = { ...state.progress };
  for (const t of undone) {
    if (t.kind === 'manzil') rewound.manzilCursor = t.page_from;
    if (t.kind === 'sabqi')  rewound.sabqiCursor  = t.page_from;
  }
  if (undone.length) {
    await sb.from('daily_tasks').delete().in('id', undone.map((t) => t.id));
  }

  // Don't re-issue a kind that was already completed today.
  const doneKinds = new Set(mine.filter((t) => t.done).map((t) => t.kind));
  const { tasks, next } = planDay(rewound, state.config, isoDay());
  const fresh = tasks.filter((t) => !doneKinds.has(t.kind));
  if (fresh.length) {
    await sb.from('daily_tasks').insert(fresh.map((t) => ({
      user_id: state.user.id, task_date: today, kind: t.kind,
      page_from: t.from, page_to: t.to, label: t.label
    })));
  }
  state.progress = { ...next, lastPlanned: today };
  saveProgress();
  await refreshToday();
}

/* ══════════════════════ Today ══════════════════════ */
function todaysInspiration() {
  const n = state.inspirations.length;
  if (!n) return null;
  // Stable for the whole day, moves on at midnight.
  const days = Math.floor(parseKey(dateKey()).getTime() / 86400000);
  return state.inspirations[((days % n) + n) % n];
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function renderToday() {
  const now = new Date();
  $('t-eyebrow').textContent =
    `${DAYS_LONG[isoDay(now)-1]} · ${now.toLocaleDateString(undefined,{day:'numeric',month:'long'})}`;
  $('t-greeting').textContent = greeting();

  const ins = todaysInspiration();
  if (ins) {
    $('insp-body').textContent = ins.body;
    $('insp-src').textContent = ins.source;
    $('insp-note').textContent = ins.encouragement || '';
    $('insp-note').hidden = !ins.encouragement;
    $('inspire').hidden = false;
  } else { $('inspire').hidden = true; }

  // Ring: pages remaining today.
  const pagesOf = (t) => (t.kind === 'arabic' ? 0 : t.page_to - t.page_from + 1);
  const total = state.tasks.reduce((a, t) => a + pagesOf(t), 0);
  const left  = state.tasks.filter((t) => !t.done).reduce((a, t) => a + pagesOf(t), 0);
  const frac  = total ? (total - left) / total : 0;
  const C = 2 * Math.PI * 52;
  $('ring-fg').style.strokeDashoffset = String(C * (1 - frac));
  $('ring-num').textContent = total === 0 ? '—' : (left === 0 ? '✓' : left);
  $('ring-lbl').textContent = total === 0 ? 'nothing due'
                            : (left === 0 ? 'all done' : (left === 1 ? 'page left' : 'pages left'));

  $('m-streak').textContent = streak();
  $('m-known').textContent = state.progress ? state.progress.memTo - state.progress.memFrom + 1 : 0;
  const cyc = state.progress ? cycleLengthDays(state.progress, state.config) : null;
  $('m-cycle').textContent = cyc ? cyc.revisionDays : '—';

  const KIND = {
    sabaq:  { label: 'New page', cls: 'k-sabaq' },
    sabqi:  { label: 'Sabqi',    cls: 'k-sabqi' },
    manzil: { label: 'Manzil',   cls: 'k-manzil' },
    arabic: { label: 'Arabic',   cls: 'k-arabic' }
  };
  const order = { sabaq: 0, sabqi: 1, manzil: 2, arabic: 3 };
  const sorted = [...state.tasks].sort((a,b) => order[a.kind] - order[b.kind]);

  $('tasks').innerHTML = sorted.map((t) => {
    const k = KIND[t.kind];
    const pages = t.page_to - t.page_from + 1;
    const isPaged = t.kind !== 'arabic';
    const range = t.page_from === t.page_to ? `p.${t.page_from}` : `p.${t.page_from}–${t.page_to}`;
    const carried = t.carried_from
      ? `<span class="chip">From ${DAYS_SHORT[isoDay(parseKey(t.carried_from))-1]}</span>` : '';
    return `
      <button class="task ${t.done?'is-done':''} ${t.carried_from?'is-carried':''}"
              data-id="${t.id}" type="button" aria-pressed="${t.done}">
        <span class="tick">${svg(ICONS.check)}</span>
        <span>
          <span class="task-top"><span class="kind ${k.cls}">${k.label}</span>${carried}</span>
          <span class="task-name">${esc(t.label)}</span>
          ${isPaged ? `<span class="task-meta">${range} · ${pages} page${pages>1?'s':''}</span>` : ''}
        </span>
      </button>`;
  }).join('');

  const none = state.tasks.length === 0;
  $('today-empty').hidden = !none;
  $('today-empty').textContent = state.config.restDays.includes(isoDay())
    ? 'Rest day. Nothing scheduled.' : 'Nothing due today.';
}

function streak() {
  let n = 0;
  let c = new Date();
  const full = (k) => { const h = state.history[k]; return h && h.total > 0 && h.done === h.total; };
  if (!full(dateKey(c))) c = addDays(c, -1);
  while (full(dateKey(c))) { n++; c = addDays(c, -1); }
  return n;
}

$('tasks').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-id]');
  if (!btn) return;
  const t = state.tasks.find((x) => x.id === btn.dataset.id);
  if (!t) return;

  t.done = !t.done;
  t.done_at = t.done ? new Date().toISOString() : null;
  buzz(t.done ? 12 : 8);

  const h = state.history[dateKey()] || (state.history[dateKey()] = { total: state.tasks.length, done: 0 });
  h.done = state.tasks.filter((x) => x.done).length;
  renderToday();

  enqueue({ id: `task:${t.id}`, type: 'update', table: 'daily_tasks',
            rowId: t.id, row: { done: t.done, done_at: t.done_at } });

  // Finishing the new page is what actually grows the memorized range.
  if (t.kind === 'sabaq') {
    if (t.done) {
      state.progress = { ...absorbSabaq(state.progress, state.config, t.page_from, t.page_to),
                         lastPlanned: state.progress.lastPlanned };
      toast('New page added to your rotation');
    } else if (state.config.direction === 'backward' && state.progress.memFrom === t.page_from) {
      state.progress = { ...state.progress, memFrom: t.page_to + 1 };
    } else if (state.config.direction === 'forward' && state.progress.memTo === t.page_to) {
      state.progress = { ...state.progress, memTo: t.page_from - 1 };
    }
    saveProgress();
  }
});

/* ══════════════════════ Plan ══════════════════════ */
function surahOptions(sel, value) {
  sel.innerHTML = SURAHS.map((s) =>
    `<option value="${s.n}" ${s.n===value?'selected':''}>${s.n}. ${esc(s.name)}</option>`).join('');
}
function dayButtons(host, selected, onToggle) {
  host.innerHTML = DAY_INITIAL.map((d, i) =>
    `<button type="button" data-d="${i+1}" class="${selected.includes(i+1)?'on':''}">${d}</button>`).join('');
  host.onclick = (e) => {
    const b = e.target.closest('[data-d]');
    if (b) onToggle(Number(b.dataset.d));
  };
}

function renderPlan() {
  const p = state.progress, c = state.config;

  // Range pickers reflect the surahs the page range currently covers.
  const cur = currentSurahRange();
  surahOptions($('p-from'), cur.from);
  surahOptions($('p-to'), cur.to);

  for (const btn of $('p-direction').children) btn.classList.toggle('on', btn.dataset.v === c.direction);
  dayButtons($('p-days'), c.lessonDays, (d) => {
    c.lessonDays = c.lessonDays.includes(d) ? c.lessonDays.filter((x)=>x!==d) : [...c.lessonDays, d].sort();
    commitPlan();
  });
  dayButtons($('p-rest'), c.restDays, (d) => {
    c.restDays = c.restDays.includes(d) ? c.restDays.filter((x)=>x!==d) : [...c.restDays, d].sort();
    commitPlan();
  });
  for (const key of ['new_pages_per_lesson','manzil_pages_per_day','sabqi_pages_per_day','sabqi_window_pages']) {
    $('v-' + key).textContent = c[camel(key)];
  }

  $('p-arabic-on').checked = c.arabicEnabled;
  $('p-arabic-text').value = c.arabicText;
  dayButtons($('p-arabic-days'), c.arabicDays, (d) => {
    c.arabicDays = c.arabicDays.includes(d)
      ? c.arabicDays.filter((x) => x !== d) : [...c.arabicDays, d].sort();
    commitPlan();
  });

  // Headline: what this configuration actually means.
  const cyc = cycleLengthDays(p, c);
  const held = p.memTo - p.memFrom + 1;
  const perWeek = c.lessonDays.length * c.newPagesPerLesson;
  $('plan-summary').innerHTML = `
    <p class="summary-big">Everything every ${cyc ? cyc.revisionDays : '—'} days</p>
    <p class="summary-sub">${held} pages held · ${labelForPages(p.memFrom, p.memTo)}<br>
      ${perWeek} new page${perWeek===1?'':'s'} a week from ${c.lessonDays.length} lesson${c.lessonDays.length===1?'':'s'}</p>`;

  renderPreview();
}

const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function currentSurahRange() {
  const p = state.progress;
  const list = surahsInPages(p.memFrom, p.memTo);
  return list.length
    ? { from: list[0].n, to: list[list.length - 1].n }
    : { from: 44, to: 114 };
}

function renderPreview() {
  // The stored cursors have already advanced past today's portion, so a preview
  // from here begins with tomorrow. Today is on the Today tab; labelling this
  // row "Today" would show tomorrow's pages under today's name.
  const tomorrow = isoDay() === 7 ? 1 : isoDay() + 1;
  const rows = preview(state.progress, state.config, tomorrow, 7);
  $('preview').innerHTML = rows.map((d, i) => {
    const name = i === 0 ? 'Tomorrow' : DAYS_LONG[d.isoWeekday - 1];
    const lesson = d.tasks.some((t) => t.kind === 'sabaq');
    const quran = d.tasks.filter((t) => t.kind !== 'arabic');
    if (!d.tasks.length) {
      return `<div class="pv"><div class="pv-day">${name}</div>
              <div class="pv-rest">Rest day</div></div>`;
    }
    const lines = d.tasks.map((t) => {
      const kind = t.kind === 'sabaq' ? 'New' : t.kind;
      const range = t.kind === 'arabic' ? ''
        : ` · ${t.from === t.to ? `p.${t.from}` : `p.${t.from}–${t.to}`}`;
      return `<div class="pv-line"><span class="pv-k">${kind}</span>
                <span><span class="pv-t">${esc(t.label)}</span>
                <span class="pv-p">${range}</span></span></div>`;
    }).join('');
    const rest = !quran.length ? '<div class="pv-rest">Qur\u2019an rest day</div>' : '';
    return `<div class="pv"><div class="pv-day ${lesson?'is-lesson':''}">${name}${lesson?' · Lesson':''}</div>${rest}${lines}</div>`;
  }).join('');
}

// Every plan control funnels through here: persist, re-plan today, repaint.
let commitT;
async function commitPlan() {
  saveConfig();
  renderPlan();
  clearTimeout(commitT);
  commitT = setTimeout(async () => {
    await regenerateToday();
    if (state.view === 'today') renderToday();
  }, 400);
}

$('p-arabic-on').addEventListener('change', (e) => {
  state.config.arabicEnabled = e.target.checked;
  commitPlan();
});
let arabicT;
$('p-arabic-text').addEventListener('input', (e) => {
  state.config.arabicText = e.target.value;
  clearTimeout(arabicT);
  arabicT = setTimeout(() => commitPlan(), 500);
});

$('p-direction').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  state.config.direction = b.dataset.v;
  commitPlan();
});

for (const el of document.querySelectorAll('.stepper')) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const key = camel(el.dataset.key);
    const lim = { newPagesPerLesson: [0,10], manzilPagesPerDay: [0,60],
                  sabqiPagesPerDay: [0,60], sabqiWindowPages: [0,120] }[key];
    const v = Math.min(lim[1], Math.max(lim[0], state.config[key] + Number(b.dataset.d)));
    if (v === state.config[key]) return;
    state.config[key] = v;
    buzz(6);
    commitPlan();
  });
}

for (const id of ['p-from','p-to']) {
  $(id).addEventListener('change', () => {
    let a = Number($('p-from').value), b = Number($('p-to').value);
    if (a > b) { if (id === 'p-from') b = a; else a = b; }
    const r = pagesForSurahRange(a, b);
    const p = state.progress;
    state.progress = { ...p, memFrom: r.from, memTo: r.to,
      sabqiCursor: clamp(p.sabqiCursor, r.from, r.to),
      manzilCursor: clamp(p.manzilCursor, r.from, r.to) };
    saveProgress();
    commitPlan();
  });
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ══════════════════════ Progress ══════════════════════ */
function renderProgress() {
  const WEEKS = 8, today = new Date(), todayK = dateKey(today);
  const end = addDays(today, 7 - isoDay(today));
  const start = addDays(end, -(WEEKS*7 - 1));

  let html = '<div class="hm-labels">' +
    DAY_INITIAL.map((d) => `<span class="hm-lbl">${d}</span>`).join('') + '</div>';
  for (let w = 0; w < WEEKS; w++) {
    html += '<div class="hm-col">';
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, w*7 + d), k = dateKey(day);
      const h = state.history[k];
      let lv = 0;
      if (h && h.total) {
        const f = h.done / h.total;
        lv = f === 0 ? 0 : f < .5 ? 1 : f < 1 ? 2 : 3;
      }
      const label = day.toLocaleDateString(undefined,{day:'numeric',month:'short'});
      html += `<button class="cell l${lv} ${k>todayK?'is-future':''}" type="button"
                 data-k="${k}" data-day="${esc(label)}" data-n="${k>todayK?-1:(h?h.done:0)}"
                 data-t="${h?h.total:0}" aria-label="${esc(label)}"></button>`;
    }
    html += '</div>';
  }
  $('heatmap').innerHTML = html;

  let done = 0, tracked = 0;
  for (let i = 0; i < WEEKS*7; i++) {
    const h = state.history[dateKey(addDays(today, -i))];
    if (h && h.total) { tracked++; if (h.done === h.total) done++; }
  }
  $('s-done').textContent = done;
  $('s-rate').textContent = tracked ? Math.round(done/tracked*100) + '%' : '0%';

  if (!$('rv-date').value) $('rv-date').value = dateKey();
  renderChart();
  renderReviews();
}

$('heatmap').addEventListener('click', (e) => {
  const c = e.target.closest('[data-day]');
  if (!c) return;
  const n = Number(c.dataset.n), t = Number(c.dataset.t);
  toast(n < 0 ? `${c.dataset.day} — not yet`
      : t === 0 ? `${c.dataset.day} — nothing scheduled`
      : `${c.dataset.day} — ${n} of ${t} done`);
});

function parsePages(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?/);
  return m ? { value: parseFloat(m[1]), total: m[2] ? parseFloat(m[2]) : null } : null;
}

function renderChart() {
  const pts = state.reviews
    .map((r) => ({ date: r.review_date, p: parsePages(r.zero_hesitation_pages) }))
    .filter((r) => r.p)
    .map((r) => ({ date: r.date, value: r.p.value, total: r.p.total }))
    .sort((a,b) => a.date.localeCompare(b.date));

  if (pts.length < 2) { $('chart').innerHTML = ''; $('chart-empty').hidden = false; return; }
  $('chart-empty').hidden = true;

  const W = 320, H = 140, P = { t: 8, r: 8, b: 22, l: 30 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const top = Math.ceil(Math.max(...pts.map((p) => p.total || p.value)) * 1.1 / 10) * 10 || 10;
  const x = (i) => P.l + (pts.length === 1 ? iw/2 : i/(pts.length-1)*iw);
  const y = (v) => P.t + ih - (v/top)*ih;

  const css = getComputedStyle(document.body);
  const accent = css.getPropertyValue('--accent').trim();
  const line = css.getPropertyValue('--line').trim();
  const ink3 = css.getPropertyValue('--ink-3').trim();
  const surface = css.getPropertyValue('--surface').trim();

  const grid = [0, top/2, top].map((v) => `
    <line x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}" stroke="${line}" stroke-width="1"/>
    <text x="${P.l-6}" y="${y(v)+3.5}" text-anchor="end" font-size="9.5" fill="${ink3}">${Math.round(v)}</text>`).join('');
  const path = pts.map((p,i) => `${i?'L':'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const dots = pts.map((p,i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.6"
             fill="${accent}" stroke="${surface}" stroke-width="2"/>`).join('');
  const ends = [0, pts.length-1].map((i) =>
    `<text x="${x(i).toFixed(1)}" y="${H-5}" text-anchor="${i?'end':'start'}"
           font-size="9.5" fill="${ink3}">${esc(parseKey(pts[i].date)
             .toLocaleDateString(undefined,{day:'numeric',month:'short'}))}</text>`).join('');

  $('chart').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img"
         aria-label="Zero-hesitation pages across ${pts.length} reviews">
      ${grid}
      <path d="${path}" fill="none" stroke="${accent}" stroke-width="2.2"
            stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}${ends}
      <line id="cross" x1="0" x2="0" y1="${P.t}" y2="${P.t+ih}" stroke="${accent}"
            stroke-width="1" opacity="0"/>
    </svg><div class="tip" id="tip" hidden></div>`;

  const el = $('chart').querySelector('svg'), tip = $('tip'), cross = $('chart').querySelector('#cross');
  const move = (ev) => {
    const box = el.getBoundingClientRect();
    const px = ((ev.clientX - box.left)/box.width)*W;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(x(i)-px) < Math.abs(x(best)-px)) best = i;
    const p = pts[best];
    const pct = p.total ? ` (${Math.round(p.value/p.total*100)}%)` : '';
    tip.innerHTML = `${esc(parseKey(p.date).toLocaleDateString(undefined,{day:'numeric',month:'short'}))}
                     · <b>${p.value}${p.total?'/'+p.total:''}</b>${pct}`;
    tip.hidden = false;
    tip.style.left = `${x(best)/W*100}%`;
    tip.style.top  = `${y(p.value)/H*box.height}px`;
    cross.setAttribute('x1', x(best)); cross.setAttribute('x2', x(best));
    cross.setAttribute('opacity', '.3');
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerdown', move);
  el.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('opacity','0'); });
}

function renderReviews() {
  $('review-list').innerHTML = state.reviews.map((r) => {
    const bits = [];
    if (r.zero_hesitation_pages) bits.push(`Zero hesitation ${esc(r.zero_hesitation_pages)}`);
    if (r.weak_pages) bits.push(`Weak ${esc(r.weak_pages)}`);
    if (r.arabic_pages_completed != null) bits.push(`Arabic ${r.arabic_pages_completed}p`);
    if (r.vocab_roots_logged != null) bits.push(`${r.vocab_roots_logged} roots`);
    return `<div class="review-item">
      <div class="review-date">${esc(parseKey(r.review_date)
        .toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}))}</div>
      ${bits.length?`<div class="review-meta">${bits.join(' · ')}</div>`:''}
      ${r.note?`<div class="review-note">${esc(r.note)}</div>`:''}</div>`;
  }).join('');
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
  if (i >= 0) state.reviews[i] = { ...state.reviews[i], ...row }; else state.reviews.unshift(row);
  state.reviews.sort((a,b) => b.review_date.localeCompare(a.review_date));
  enqueue({ id: `review:${row.review_date}`, type: 'upsert', table: 'weekly_review',
            row, onConflict: 'user_id,review_date' });
  for (const id of ['rv-zero','rv-weak','rv-arabic','rv-vocab','rv-note']) $(id).value = '';
  renderProgress();
  toast('Review saved');
});

/* ══════════════════════ More ══════════════════════ */
let remindT;
function scheduleReminder() {
  clearTimeout(remindT);
  const t = state.settings.reminder_time;
  const st = $('remind-status');
  if (!t) { st.textContent = 'No reminder set.'; return; }
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    st.textContent = 'Saved. Allow notifications to receive it.'; return;
  }
  const [h, m] = t.split(':').map(Number);
  const next = new Date(); next.setHours(h, m, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  st.textContent = `Next ${next.toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'})}. Fires while the app is open in the background.`;
  remindT = setTimeout(() => {
    try { new Notification('Hifdh', { body: "Today's portion is waiting.", tag: 'hifdh' }); } catch {}
    scheduleReminder();
  }, next - new Date());
}

$('remind-save').addEventListener('click', () => {
  const t = $('set-remind').value;
  // Save first: a dismissed permission prompt must not lose the setting.
  state.settings.reminder_time = t || null;
  enqueue({ id: 'settings', type: 'upsert', table: 'settings',
            row: { user_id: state.user.id, reminder_time: t || null,
                   updated_at: new Date().toISOString() }, onConflict: 'user_id' });
  scheduleReminder();
  toast('Reminder saved');
  if (t && 'Notification' in window && Notification.permission === 'default') {
    try { Promise.resolve(Notification.requestPermission()).then(scheduleReminder).catch(()=>{}); } catch {}
  }
});

function renderMore() {
  $('set-email').textContent = state.user.email || '';
  $('set-remind').value = state.settings.reminder_time ? state.settings.reminder_time.slice(0,5) : '';
  scheduleReminder();
}

$('signout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

/* ══════════════════════ nav ══════════════════════ */
const VIEWS = {
  today:    { label: 'Today',    icon: ICONS.today,    render: renderToday },
  plan:     { label: 'Plan',     icon: ICONS.plan,     render: renderPlan },
  progress: { label: 'Progress', icon: ICONS.progress, render: renderProgress },
  more:     { label: 'More',     icon: ICONS.more,     render: renderMore }
};

$('tabs').innerHTML = Object.entries(VIEWS).map(([k, v]) =>
  `<button class="tab" data-view="${k}" type="button">${svg(v.icon)}<span>${v.label}</span></button>`).join('');

function show(view) {
  state.view = view;
  for (const k of Object.keys(VIEWS)) $(`view-${k}`).hidden = k !== view;
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.view === view);
  VIEWS[view].render();
  window.scrollTo(0, 0);
}
$('tabs').addEventListener('click', (e) => {
  const t = e.target.closest('[data-view]');
  if (t) { buzz(4); show(t.dataset.view); }
});

// Coming back after midnight must re-plan, not show yesterday.
let lastDay = dateKey();
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  flush();
  if (dateKey() !== lastDay) {
    lastDay = dateKey();
    await ensureDayPlanned();
    show('today');
  } else if (state.view === 'today') renderToday();
});

/* ══════════════════════ auth ══════════════════════ */
$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('auth-btn'), msg = $('auth-msg');
  btn.disabled = true; btn.textContent = 'Sending…';
  const { error } = await sb.auth.signInWithOtp({
    email: $('email').value.trim(),
    options: { emailRedirectTo: window.location.origin + window.location.pathname }
  });
  btn.disabled = false; btn.textContent = 'Continue';
  msg.hidden = false;
  msg.classList.toggle('is-err', !!error);
  msg.textContent = error ? error.message : 'Check your email and tap the link.';
});

/* ══════════════════════ first run ══════════════════════ */
function renderSetup() {
  surahOptions($('su-from'), 44);
  surahOptions($('su-to'), 114);
  let days = [1, 5];
  const paintDays = () => dayButtons($('su-days'), days, (d) => {
    days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    renderSetup.days = days;
    paintDays();
  });
  paintDays();
  renderSetup.days = days;

  const sync = () => {
    let a = Number($('su-from').value), b = Number($('su-to').value);
    if (a > b) [a, b] = [b, a];
    const r = pagesForSurahRange(a, b);
    $('setup-summary').textContent =
      `${r.to - r.from + 1} pages · ${labelForPages(r.from, r.to)}`;
  };
  $('su-from').onchange = sync; $('su-to').onchange = sync;
  sync();

  $('setup-go').onclick = async () => {
    let a = Number($('su-from').value), b = Number($('su-to').value);
    if (a > b) [a, b] = [b, a];
    const r = pagesForSurahRange(a, b);
    state.config = { ...DEFAULT_CONFIG, lessonDays: [...renderSetup.days].sort() };
    state.progress = { memFrom: r.from, memTo: r.to, sabqiCursor: r.from,
                       manzilCursor: 0, lastPlanned: null };
    await sb.from('plan_config').upsert(cfgToRow(state.config), { onConflict: 'user_id' });
    await sb.from('progress').upsert(progToRow(state.progress), { onConflict: 'user_id' });
    $('setup').hidden = true;
    await ensureDayPlanned();
    $('app').hidden = false;
    show('today');
  };
}

/* ══════════════════════ boot ══════════════════════ */
async function start(session) {
  state.user = session.user;
  try { await loadAll(); } catch (err) { console.error(err); toast('Could not load', true); }
  $('boot').hidden = true; $('auth').hidden = true;

  if (!state.progress) { $('setup').hidden = false; renderSetup(); return; }
  await ensureDayPlanned();
  $('app').hidden = false;
  show('today');
  flush();
}

(async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await start(session);
  else { $('boot').hidden = true; $('auth').hidden = false; }

  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === 'SIGNED_IN' && s && !state.user) start(s);
    if (ev === 'SIGNED_OUT') location.reload();
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
