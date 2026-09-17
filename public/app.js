import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY, VAPID_PUBLIC_KEY } from './config.js';
import { SURAHS, surahsInPages, pagesForSurahRange, labelForPages,
         ayahCount, formatRef } from './lib/quran.js';
import {
  isNative, nativePermission, scheduleNativeReminders, cancelNativeReminders, tapFeedback
} from './lib/native.js';
import {
  DEFAULT_CONFIG, planDay, absorbNew, undoNew, cycleLengthDays, cyclePosition,
  preview, totalPages, describeRuns, activeSurah, nextNewPages, readingFinish
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
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// Plain English first; the traditional term kept as a quiet subtitle for those
// who know it. Nobody should have to learn a word to use this.
const KINDS = {
  new:      { label: 'New page', arabic: 'Sabaq',      cls: 'k-new' },
  revision: { label: 'Revision', arabic: 'Murājaʿah', cls: 'k-revision' },
  reading:  { label: 'Reading',  arabic: 'Til\u0101wah',  cls: 'k-reading' },
  arabic:   { label: 'Arabic',   arabic: '',            cls: 'k-arabic' }
};
const ORDER = { new: 0, revision: 1, reading: 2, arabic: 3 };
// A kind we do not recognise must never blank a whole screen.
const kindOf = (k) => KINDS[k] || { label: k, arabic: '', cls: '' };

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
const buzz = (ms) => {
  if (isNative()) { tapFeedback(ms >= 12 ? 'heavy' : 'light'); return; }
  if (navigator.vibrate) navigator.vibrate(ms);
};

/* ══════════════════════ state ══════════════════════ */
const state = {
  user: null,
  anonymous: false,
  config: { ...DEFAULT_CONFIG },
  progress: null,
  tasks: [],
  history: {},
  reviews: [],
  settings: {},
  reading: null,            // the reading plan, with its own cursor
  reflections: [],
  calMonth: null,           // which month the calendar is showing
  inspirations: [],
  pushReady: false,
  view: 'today'
};

/* ══════════════════════ offline outbox ══════════════════════ */
const QKEY = 'hifdh.outbox.v3';
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
  if (op.type === 'upsert') return sb.from(op.table).upsert(op.row, { onConflict: op.onConflict });
  if (op.type === 'update') return sb.from(op.table).update(op.row).eq('id', op.rowId);
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
  revisionPagesPerDay: r.revision_pages_per_day,
  restDays: r.rest_days || [],
  arabicEnabled: r.arabic_enabled === true,
  arabicText: r.arabic_text || '',
  arabicDays: r.arabic_days || [1,2,3,4,5,6,7]
});
const cfgToRow = (c) => ({
  user_id: state.user.id,
  direction: c.direction,
  lesson_days: c.lessonDays,
  new_pages_per_lesson: c.newPagesPerLesson,
  revision_pages_per_day: c.revisionPagesPerDay,
  rest_days: c.restDays,
  arabic_enabled: c.arabicEnabled,
  arabic_text: c.arabicText,
  arabic_days: c.arabicDays,
  updated_at: new Date().toISOString()
});
const progToRow = (p) => ({
  user_id: state.user.id,
  mem_from: p.memFrom, mem_to: p.memTo,
  partial_from: p.partialFrom ?? null, partial_to: p.partialTo ?? null,
  revision_cursor: p.revisionCursor,
  last_planned_date: p.lastPlanned,
  updated_at: new Date().toISOString()
});
const readFromRow = (r) => r ? ({
  enabled: r.enabled, fromSurah: r.from_surah, toSurah: r.to_surah,
  pagesPerDay: r.pages_per_day, days: r.days || [1,2,3,4,5,6,7],
  cursor: r.cursor, startedOn: r.started_on
}) : null;
const readToRow = (r) => ({
  user_id: state.user.id, enabled: r.enabled,
  from_surah: r.fromSurah, to_surah: r.toSurah,
  pages_per_day: r.pagesPerDay, days: r.days, cursor: r.cursor,
  started_on: r.startedOn, updated_at: new Date().toISOString()
});
const saveReading = () => state.reading && enqueue({
  id: 'reading', type: 'upsert', table: 'reading_plan',
  row: readToRow(state.reading), onConflict: 'user_id' });

const saveConfig = () => enqueue({ id: 'config', type: 'upsert', table: 'plan_config',
                                   row: cfgToRow(state.config), onConflict: 'user_id' });
const saveProgress = () => enqueue({ id: 'progress', type: 'upsert', table: 'progress',
                                     row: progToRow(state.progress), onConflict: 'user_id' });

/* ══════════════════════ load ══════════════════════ */
async function loadAll() {
  const since = dateKey(addDays(new Date(), -70));
  const [cfg, prog, tasks, reviews, settings, insp, reading, refl] = await Promise.all([
    sb.from('plan_config').select('*').maybeSingle(),
    sb.from('progress').select('*').maybeSingle(),
    sb.from('daily_tasks').select('*').gte('task_date', since).order('task_date'),
    sb.from('weekly_review').select('*').order('review_date', { ascending: false }),
    sb.from('settings').select('*').maybeSingle(),
    sb.from('inspirations').select('*').order('id'),
    sb.from('reading_plan').select('*').maybeSingle(),
    sb.from('reflections').select('*').order('on_date', { ascending: false })
  ]);

  state.config = cfg.data ? cfgFromRow(cfg.data) : { ...DEFAULT_CONFIG };
  state.progress = prog.data ? {
    memFrom: prog.data.mem_from, memTo: prog.data.mem_to,
    partialFrom: prog.data.partial_from, partialTo: prog.data.partial_to,
    revisionCursor: prog.data.revision_cursor,
    lastPlanned: prog.data.last_planned_date
  } : null;

  state.reviews = reviews.data || [];
  state.settings = settings.data || {};
  state.inspirations = insp.data || [];
  state.reading = readFromRow(reading.data);
  state.reflections = refl.data || [];

  const all = tasks.data || [];
  state.tasks = all.filter((t) => t.task_date === dateKey() && !t.carried_away);
  state.history = {};
  for (const t of all) {
    const h = state.history[t.task_date] || (state.history[t.task_date] = { total: 0, done: 0 });
    h.total++; if (t.done) h.done++;
  }
}

/* ══════════════════════ the day ══════════════════════ */
async function ensureDayPlanned() {
  const today = dateKey();
  if (!state.progress) return;

  // Carry unfinished work forward. The original row stays on its own date and
  // is flagged, so a day you left work on still reads as incomplete.
  const { data: stale } = await sb.from('daily_tasks').select('*')
    .eq('done', false).eq('carried_away', false).lt('task_date', today);
  if (stale && stale.length) {
    await sb.from('daily_tasks').update({ carried_away: true })
      .in('id', stale.map((t) => t.id));
    await sb.from('daily_tasks').insert(stale.map((t) => ({
      user_id: state.user.id, task_date: today, kind: t.kind,
      page_from: t.page_from, page_to: t.page_to, pages: t.pages || [],
      label: t.label, carried_from: t.carried_from || t.task_date
    })));
  }

  if (state.progress.lastPlanned !== today) {
    const { tasks, next } = planDay(state.progress, state.config, isoDay(), activeReading());
    if (tasks.length) {
      const { error } = await sb.from('daily_tasks').insert(tasks.map((t) => ({
        user_id: state.user.id, task_date: today, kind: t.kind,
        page_from: t.from, page_to: t.to, pages: t.pages, label: t.label
      })));
      if (error) { console.error('could not plan today', error); return; }
    }
    state.progress = { ...next, lastPlanned: today };
    saveProgress();
    if (state.reading && next.readingCursor != null) {
      state.reading = { ...state.reading, cursor: next.readingCursor };
      saveReading();
    }
  }
  await refreshToday();
}

// The plan only counts when switched on and given a pace.
const activeReading = () =>
  (state.reading && state.reading.enabled && state.reading.pagesPerDay > 0)
    ? state.reading : null;

async function refreshToday() {
  const today = dateKey();
  const { data } = await sb.from('daily_tasks').select('*')
    .eq('task_date', today).eq('carried_away', false);
  state.tasks = data || [];
  const h = state.history[today] || (state.history[today] = { total: 0, done: 0 });
  h.total = state.tasks.length;
  h.done = state.tasks.filter((t) => t.done).length;
}

// A settings change should show in today's portion straight away. Undone rows
// are dropped and the cursor rewound to where it started, then replanned.
async function regenerateToday() {
  const today = dateKey();
  const mine = state.tasks.filter((t) => !t.carried_from);
  const undone = mine.filter((t) => !t.done);
  const doneKinds = new Set(mine.filter((t) => t.done).map((t) => t.kind));

  // Rewind only the cursors belonging to work that has NOT been done: a chunk's
  // first page is exactly where the cursor stood before it was taken.
  const rewound = { ...state.progress };
  for (const t of undone) {
    const first = (t.pages && t.pages.length) ? t.pages[0] : t.page_from;
    if (t.kind === 'revision') rewound.revisionCursor = first;
    if (t.kind === 'reading' && state.reading) state.reading.cursor = first;
  }

  const { tasks, next } = planDay(rewound, state.config, isoDay(), activeReading());
  // Anything already finished today stays finished; a kind that has appeared
  // because the plan changed (adding a lesson day, say) still gets scheduled.
  const fresh = tasks.filter((t) => !doneKinds.has(t.kind));
  if (!undone.length && !fresh.length) return;

  if (undone.length) await sb.from('daily_tasks').delete().in('id', undone.map((t) => t.id));
  if (fresh.length) {
    await sb.from('daily_tasks').insert(fresh.map((t) => ({
      user_id: state.user.id, task_date: today, kind: t.kind,
      page_from: t.from, page_to: t.to, pages: t.pages, label: t.label
    })));
  }

  // Only advance the revision cursor if the revision portion was actually
  // re-issued. If it was already done, it must stay where it is or a day's
  // worth of pages would be silently skipped.
  const reissuedRevision = fresh.some((t) => t.kind === 'revision');
  state.progress = reissuedRevision
    ? { ...next, lastPlanned: today }
    : { ...state.progress, lastPlanned: today };
  saveProgress();
  if (state.reading && fresh.some((t) => t.kind === 'reading') && next.readingCursor != null) {
    state.reading = { ...state.reading, cursor: next.readingCursor };
    saveReading();
  }
  await refreshToday();
}

/* ══════════════════════ Today ══════════════════════ */
function todaysInspiration() {
  const n = state.inspirations.length;
  if (!n) return null;
  const days = Math.floor(parseKey(dateKey()).getTime() / 86400000);
  return state.inspirations[((days % n) + n) % n];
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function renderToday() {
  const now = new Date();
  $('t-date').textContent =
    `${DAYS_LONG[isoDay(now)-1]} · ${now.toLocaleDateString(undefined,{day:'numeric',month:'long'})}`;
  $('t-greeting').textContent = greeting();

  const ins = todaysInspiration();
  if (ins) {
    $('insp-body').textContent = ins.body;
    $('insp-src').textContent = ins.source;
    $('inspire').hidden = false;
  } else { $('inspire').hidden = true; }

  const sorted = [...state.tasks].sort((a,b) => ORDER[a.kind] - ORDER[b.kind]);
  $('tasks').innerHTML = sorted.map((t) => {
    const k = kindOf(t.kind);

    let pageList = (t.pages && t.pages.length) ? t.pages : [];
    if (!pageList.length && t.kind !== 'arabic' && t.page_to >= t.page_from) {
      for (let p = t.page_from; p <= t.page_to; p++) pageList.push(p);
    }
    const runs = pageList.length ? describeRuns(pageList) : [];
    const n = pageList.length;
    const carried = t.carried_from
      ? `<span class="chip">From ${DAYS_SHORT[isoDay(parseKey(t.carried_from))-1]}</span>` : '';

    let body;
    if (!runs.length) {
      body = `<span class="task-name">${esc(t.label)}</span>`;
    } else if (runs.length === 1) {
      const r = runs[0];
      const range = r.from === r.to ? `p.${r.from}` : `p.${r.from}–${r.to}`;
      body = `<span class="task-name">${esc(r.label)}</span>
              <span class="task-meta">${range} · ${n} page${n>1?'s':''}</span>`;
    } else {
      body = runs.map((r) => {
        const range = r.from === r.to ? `p.${r.from}` : `p.${r.from}–${r.to}`;
        return `<span class="task-run"><span class="task-run-name">${esc(r.label)}</span>
                  <span class="task-run-pages">${range}</span></span>`;
      }).join('') + `<span class="task-meta">${n} pages in two parts</span>`;
    }

    return `
      <button class="task ${t.done?'is-done':''} ${t.carried_from?'is-carried':''}"
              data-id="${t.id}" type="button" aria-pressed="${t.done}">
        <span class="tick">${svg(ICONS.check)}</span>
        <span class="task-body">
          <span class="task-top">
            <span class="kind ${k.cls}">${k.label}</span>
            ${k.arabic ? `<span class="kind-ar">${k.arabic}</span>` : ''}
            ${carried}
          </span>
          ${body}
        </span>
      </button>`;
  }).join('');

  const none = state.tasks.length === 0;
  $('today-empty').hidden = !none;
  $('today-empty').textContent = state.config.restDays.includes(isoDay())
    ? 'A day off. Nothing scheduled.' : 'Nothing due today.';

  // One quiet line: the promise, and how far through it you are.
  const pos = state.progress ? cyclePosition(state.progress, state.config) : null;
  const cyc = state.progress ? cycleLengthDays(state.progress, state.config) : null;
  if (pos && cyc) {
    $('cycle-line').hidden = false;
    $('cycle-fill').style.width = `${Math.round(pos.fraction * 100)}%`;
    $('cycle-text').textContent =
      `${pos.done} of ${pos.total} pages this round · everything every ${cyc.revisionDays} days`;
  } else { $('cycle-line').hidden = true; }

  renderReflectCard();
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

  // Finishing a new page is what grows what you hold. Apply before painting so
  // nothing on screen is a step behind.
  if (t.kind === 'new') {
    const moved = t.done
      ? absorbNew(state.progress, state.config, t.page_from, t.page_to)
      : undoNew(state.progress, state.config, t.page_from, t.page_to);
    state.progress = { ...moved, lastPlanned: state.progress.lastPlanned };
    saveProgress();
  }

  renderToday();
  enqueue({ id: `task:${t.id}`, type: 'update', table: 'daily_tasks',
            rowId: t.id, row: { done: t.done, done_at: t.done_at } });
  if (t.kind === 'new' && t.done) toast('Added to your revision');
});

/* ══════════════════════ Reflection ══════════════════════
   Not a chore to tick off. A verse you sat with, and what you saw in it,
   kept against the day so the calendar can show it back to you.
   ═══════════════════════════════════════════════════════ */
let editingReflection = null;

const reflectionsOn = (k) => state.reflections.filter((r) => r.on_date === k);
const refLabel = (r) => formatRef(r.surah, r.ayah_from, r.ayah_to);

function renderReflectCard() {
  const todays = reflectionsOn(dateKey());
  const body = $('reflect-body');
  if (todays.length) {
    const r = todays[0];
    body.innerHTML = `<span class="reflect-ref">${esc(refLabel(r))}</span>` +
      (r.note ? `<span class="reflect-note">${esc(r.note)}</span>` : '');
    $('reflect-card').classList.add('has-note');
  } else {
    body.textContent = 'A verse you sat with today';
    $('reflect-card').classList.remove('has-note');
  }
}

function openReflection(existing) {
  editingReflection = existing || null;
  const sel = $('rf-surah');
  sel.innerHTML = SURAHS.map((x) =>
    `<option value="${x.n}">${x.n}. ${esc(x.name)}</option>`).join('');
  sel.value = String(existing ? existing.surah : 1);
  $('rf-from').value = existing && existing.ayah_from ? existing.ayah_from : '';
  $('rf-to').value = existing && existing.ayah_to ? existing.ayah_to : '';
  $('rf-note').value = existing ? existing.note : '';
  $('rf-delete').hidden = !existing;
  syncRefPreview();
  $('reflect-sheet').hidden = false;
}

// Keep the reference honest: you cannot reflect on Al-Kawthar 9.
function syncRefPreview() {
  const n = Number($('rf-surah').value);
  const max = ayahCount(n);
  $('rf-from').max = max; $('rf-to').max = max;
  let from = Number($('rf-from').value) || null;
  let to = Number($('rf-to').value) || null;
  if (from && from > max) { from = max; $('rf-from').value = max; }
  if (to && to > max) { to = max; $('rf-to').value = max; }
  if (from && to && to < from) { to = from; $('rf-to').value = from; }
  $('rf-ref').textContent = `${formatRef(n, from, to)} · ${max} ayat in this surah`;
}
for (const id of ['rf-surah','rf-from','rf-to']) $(id).addEventListener('input', syncRefPreview);

$('reflect-card').addEventListener('click', () => {
  const todays = reflectionsOn(dateKey());
  openReflection(todays[0] || null);
});
$('rf-cancel').addEventListener('click', () => { $('reflect-sheet').hidden = true; });
$('reflect-sheet').addEventListener('click', (e) => {
  if (e.target.id === 'reflect-sheet') $('reflect-sheet').hidden = true;
});

$('rf-save').addEventListener('click', async () => {
  const surah = Number($('rf-surah').value);
  const note = $('rf-note').value.trim();
  const from = Number($('rf-from').value) || null;
  const to = Number($('rf-to').value) || null;
  if (!note && !from) { toast('Add a verse or a note', true); return; }

  const row = {
    user_id: state.user.id, on_date: dateKey(), surah,
    ayah_from: from, ayah_to: to, note, updated_at: new Date().toISOString()
  };
  if (editingReflection) {
    row.id = editingReflection.id;
    Object.assign(editingReflection, row);
  } else {
    // Optimistic id so the card updates before the round trip.
    const temp = { ...row, id: 'temp-' + Date.now() };
    state.reflections.unshift(temp);
    editingReflection = temp;
  }
  $('reflect-sheet').hidden = true;
  renderReflectCard();

  const { data, error } = await sb.from('reflections')
    .upsert(editingReflection.id.startsWith('temp-') ? row : { ...row, id: row.id })
    .select().maybeSingle();
  if (error) { console.error(error); toast('Could not save reflection', true); return; }
  if (data) {
    const i = state.reflections.findIndex((r) => r.id === editingReflection.id);
    if (i >= 0) state.reflections[i] = data;
    renderReflectCard();
  }
  toast('Reflection saved');
});

$('rf-delete').addEventListener('click', async () => {
  if (!editingReflection) return;
  const id = editingReflection.id;
  state.reflections = state.reflections.filter((r) => r.id !== id);
  $('reflect-sheet').hidden = true;
  renderReflectCard();
  if (!String(id).startsWith('temp-')) await sb.from('reflections').delete().eq('id', id);
  toast('Reflection removed');
});

/* ══════════════════════ shared controls ══════════════════════ */
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
const toggleDay = (list, d) =>
  list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort();

/* ══════════════════════ Plan ══════════════════════ */
function currentSurahRange() {
  const p = state.progress;
  const list = surahsInPages(p.memFrom, p.memTo);
  return list.length ? { from: list[0].n, to: list[list.length-1].n } : { from: 44, to: 114 };
}

function setRange(fromSurah, toSurah) {
  const r = pagesForSurahRange(fromSurah, toSurah);
  const p = state.progress;
  state.progress = { ...p, memFrom: r.from, memTo: r.to,
    partialFrom: null, partialTo: null,
    revisionCursor: clamp(p.revisionCursor, r.from, r.to) };
  saveProgress();
}

function renderPlan() {
  const p = state.progress, c = state.config;
  const cur = currentSurahRange();
  surahOptions($('p-from'), cur.from);
  surahOptions($('p-to'), cur.to);

  $('v-revision_pages_per_day').textContent = c.revisionPagesPerDay;
  $('v-new_pages_per_lesson').textContent = c.newPagesPerLesson;

  const learning = c.lessonDays.length > 0 && c.newPagesPerLesson > 0;
  $('p-learning').checked = learning;
  $('p-lesson-wrap').hidden = !learning;
  $('p-arabic-on').checked = c.arabicEnabled;
  $('p-arabic-wrap').hidden = !c.arabicEnabled;
  $('p-arabic-text').value = c.arabicText;

  for (const b of $('p-direction').children) b.classList.toggle('on', b.dataset.v === c.direction);
  dayButtons($('p-days'), c.lessonDays, (d) => { c.lessonDays = toggleDay(c.lessonDays, d); commitPlan(); });
  dayButtons($('p-rest'), c.restDays, (d) => { c.restDays = toggleDay(c.restDays, d); commitPlan(); });
  dayButtons($('p-arabic-days'), c.arabicDays, (d) => { c.arabicDays = toggleDay(c.arabicDays, d); commitPlan(); });

  renderReadingControls();

  const cyc = cycleLengthDays(p, c);
  const held = totalPages(p);
  const next = nextNewPages(p, c);
  const active = activeSurah(p, c);
  const perWeek = c.lessonDays.length * c.newPagesPerLesson;
  const line2 = learning && next && active
    ? `Now learning ${esc(active.name)} · ${perWeek} new page${perWeek===1?'':'s'} a week`
    : 'Revision only';

  $('plan-summary').innerHTML = `
    <p class="summary-big">Everything every ${cyc ? cyc.revisionDays : '—'} days</p>
    <p class="summary-sub">${held} pages · ${esc(labelForPages(p.memFrom, p.memTo))}<br>${line2}</p>`;

  renderPreview();
}

function renderPreview() {
  const tomorrow = isoDay() === 7 ? 1 : isoDay() + 1;
  $('preview').innerHTML = preview(state.progress, state.config, tomorrow, 7, activeReading())
    .map((d, i) => {
    const name = i === 0 ? 'Tomorrow' : DAYS_LONG[d.isoWeekday - 1];
    const lesson = d.tasks.some((t) => t.kind === 'new');
    if (!d.tasks.length) {
      return `<div class="pv"><div class="pv-day">${name}</div><div class="pv-rest">Day off</div></div>`;
    }
    const lines = d.tasks.map((t) => {
      const range = t.kind === 'arabic' ? ''
        : ` · ${t.from === t.to ? `p.${t.from}` : `p.${t.from}–${t.to}`}`;
      return `<div class="pv-line"><span class="pv-k">${kindOf(t.kind).label}</span>
                <span><span class="pv-t">${esc(t.label)}</span>
                <span class="pv-p">${range}</span></span></div>`;
    }).join('');
    return `<div class="pv"><div class="pv-day ${lesson?'is-lesson':''}">${name}${lesson?' · Lesson':''}</div>${lines}</div>`;
  }).join('');
}

const DEFAULT_READING = {
  enabled: false, fromSurah: 1, toSurah: 114, pagesPerDay: 4,
  days: [1,2,3,4,5,6,7], cursor: 1, startedOn: null
};

function renderReadingControls() {
  const r = state.reading || DEFAULT_READING;
  $('p-reading-on').checked = r.enabled;
  $('p-reading-wrap').hidden = !r.enabled;
  surahOptions($('rp-from'), r.fromSurah);
  surahOptions($('rp-to'), r.toSurah);
  $('rp-pages').textContent = r.pagesPerDay;
  dayButtons($('rp-days'), r.days, (d) => {
    state.reading = { ...r, days: toggleDay(r.days, d) };
    saveReading(); commitPlan();
  });

  // The question anyone setting a reading goal actually has: when do I finish?
  const fin = r.enabled ? readingFinish(r) : null;
  $('rp-finish').textContent = fin
    ? `${fin.remaining} of ${fin.total} pages left · finishes ${fin.date.toLocaleDateString(undefined,
        { day: 'numeric', month: 'long' })}`
    : '';
}

function updateReading(patch) {
  const base = state.reading || DEFAULT_READING;
  const next = { ...base, ...patch };
  // Changing the range moves the cursor inside it, or the plan stalls silently.
  const { from, to } = pagesForSurahRange(next.fromSurah, next.toSurah);
  if (next.cursor < from || next.cursor > to) next.cursor = from;
  if (next.enabled && !next.startedOn) next.startedOn = dateKey();
  state.reading = next;
  saveReading();
  commitPlan();
}

$('p-reading-on').addEventListener('change', (e) => updateReading({ enabled: e.target.checked }));
for (const id of ['rp-from','rp-to']) {
  $(id).addEventListener('change', () => {
    let a = Number($('rp-from').value), b = Number($('rp-to').value);
    if (a > b) { if (id === 'rp-from') b = a; else a = b; }
    updateReading({ fromSurah: a, toSurah: b });
  });
}
$('rp-stepper').addEventListener('click', (e) => {
  const b = e.target.closest('[data-d]');
  if (!b) return;
  const base = state.reading || DEFAULT_READING;
  const v = clamp(base.pagesPerDay + Number(b.dataset.d), 1, 60);
  if (v === base.pagesPerDay) return;
  buzz(6);
  updateReading({ pagesPerDay: v });
});

let commitT;
async function commitPlan() {
  saveConfig();
  renderPlan();
  clearTimeout(commitT);
  commitT = setTimeout(async () => {
    await regenerateToday();
    if (state.view === 'today') renderToday();
    if (isNative() && state.pushReady && state.settings.reminder_time) {
      try { await scheduleNativeReminders(state.settings.reminder_time.slice(0,5), reminderBodies()); }
      catch (e) { console.warn('reschedule failed', e); }
    }
  }, 400);
}

$('p-learning').addEventListener('change', (e) => {
  // Turning learning off means no lesson days; turning it back on restores a
  // sensible default rather than leaving an empty, silently-broken state.
  state.config.lessonDays = e.target.checked
    ? (state.config.lessonDays.length ? state.config.lessonDays : [1, 5]) : [];
  if (e.target.checked && state.config.newPagesPerLesson < 1) state.config.newPagesPerLesson = 1;
  commitPlan();
});
$('p-arabic-on').addEventListener('change', (e) => {
  state.config.arabicEnabled = e.target.checked;
  commitPlan();
});
let arabicT;
$('p-arabic-text').addEventListener('input', (e) => {
  state.config.arabicText = e.target.value;
  clearTimeout(arabicT);
  arabicT = setTimeout(commitPlan, 500);
});
$('p-direction').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  state.config.direction = b.dataset.v;
  commitPlan();
});
for (const el of document.querySelectorAll('#view-plan .stepper')) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const key = camel(el.dataset.key);
    const lim = { revisionPagesPerDay: [1, 60], newPagesPerLesson: [1, 10] }[key];
    const v = clamp(state.config[key] + Number(b.dataset.d), lim[0], lim[1]);
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
    setRange(a, b);
    commitPlan();
  });
}

/* ══════════════════════ Progress ══════════════════════ */
function streak() {
  let n = 0, c = new Date();
  const full = (k) => { const h = state.history[k]; return h && h.total > 0 && h.done === h.total; };
  if (!full(dateKey(c))) c = addDays(c, -1);
  while (full(dateKey(c))) { n++; c = addDays(c, -1); }
  return n;
}

function renderCalendar() {
  if (!state.calMonth) { const n = new Date(); state.calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
  const month = state.calMonth;
  const todayK = dateKey();

  $('cal-month').textContent =
    month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  $('cal-dows').innerHTML = DAY_INITIAL.map((d) => `<span>${d}</span>`).join('');

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = isoDay(first) - 1;          // Monday-first grid

  let html = '';
  for (let i = 0; i < lead; i++) html += '<span class="cal-pad"></span>';

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(month.getFullYear(), month.getMonth(), d);
    const k = dateKey(date);
    const h = state.history[k];
    const future = k > todayK;

    // Turning up at all is never red. Red is only a day that had work and
    // none of it was done.
    let cls = 'd-empty';
    if (h && h.total) {
      if (h.done === h.total) cls = 'd-full';
      else if (h.done > 0) cls = 'd-part';
      else if (!future) cls = 'd-none';
    }
    const lesson = (state.config.lessonDays || []).includes(isoDay(date));
    const hasNote = reflectionsOn(k).length > 0;

    html += `<button class="cal-day ${cls}${future ? ' is-future' : ''}` +
            `${lesson ? ' is-lesson' : ''}${k === todayK ? ' is-today' : ''}"` +
            ` type="button" data-k="${k}" aria-label="${esc(k)}">` +
            `<span class="cal-n">${d}</span>` +
            (hasNote ? '<span class="cal-note-dot"></span>' : '') +
            `</button>`;
  }
  $('cal-grid').innerHTML = html;

  // Turning up, not perfection: a day counts if anything at all was done.
  let turnedUp = 0, tracked = 0;
  for (let i = 0; i < 56; i++) {
    const h = state.history[dateKey(addDays(new Date(), -i))];
    if (h && h.total) { tracked++; if (h.done > 0) turnedUp++; }
  }
  $('s-streak').textContent = streak();
  $('s-rate').textContent = tracked ? Math.round(turnedUp / tracked * 100) + '%' : '0%';

  if (!$('rv-date').value) $('rv-date').value = dateKey();
  renderChart();
  renderReviews();
}

$('cal-prev').addEventListener('click', () => {
  state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1);
  renderCalendar();
});
$('cal-next').addEventListener('click', () => {
  state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1);
  renderCalendar();
});

// Tapping a day shows everything that happened on it.
$('cal-grid').addEventListener('click', async (e) => {
  const cell = e.target.closest('[data-k]');
  if (!cell) return;
  const k = cell.dataset.k;
  const date = parseKey(k);

  $('day-title').textContent =
    date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  const { data } = await sb.from('daily_tasks').select('*')
    .eq('task_date', k).eq('carried_away', false);
  const tasks = (data || []).sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9));
  const notes = reflectionsOn(k);
  const lesson = (state.config.lessonDays || []).includes(isoDay(date));

  let body = '';
  if (lesson) body += '<p class="day-lesson">Lesson day \u2014 you read to your teacher</p>';

  if (!tasks.length && !notes.length) {
    body += '<p class="day-empty">Nothing recorded for this day.</p>';
  } else {
    body += tasks.map((t) => {
      const kd = kindOf(t.kind);
      const n = (t.pages && t.pages.length) ? t.pages.length : 0;
      return `<div class="day-row ${t.done ? 'is-done' : ''}">
        <span class="day-tick">${t.done ? '\u2713' : '\u00b7'}</span>
        <span><span class="day-kind">${kd.label}</span>
        <span class="day-label">${esc(t.label)}</span>
        ${n ? `<span class="day-pages">${n} page${n > 1 ? 's' : ''}</span>` : ''}</span>
      </div>`;
    }).join('');

    body += notes.map((r) => `
      <div class="day-reflection">
        <div class="day-kind">Reflection</div>
        <div class="day-ref">${esc(refLabel(r))}</div>
        ${r.note ? `<div class="day-note">${esc(r.note)}</div>` : ''}
      </div>`).join('');
  }

  $('day-body').innerHTML = body;
  $('day-sheet').hidden = false;
});
$('day-close').addEventListener('click', () => { $('day-sheet').hidden = true; });
$('day-sheet').addEventListener('click', (e) => {
  if (e.target.id === 'day-sheet') $('day-sheet').hidden = true;
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
  const sage = css.getPropertyValue('--sage').trim();
  const line = css.getPropertyValue('--line').trim();
  const ink3 = css.getPropertyValue('--ink-3').trim();
  const surface = css.getPropertyValue('--surface').trim();

  const grid = [0, top/2, top].map((v) => `
    <line x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}" stroke="${line}" stroke-width="1"/>
    <text x="${P.l-6}" y="${y(v)+3.5}" text-anchor="end" font-size="9.5" fill="${ink3}">${Math.round(v)}</text>`).join('');
  const path = pts.map((p,i) => `${i?'L':'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const dots = pts.map((p,i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.6"
             fill="${sage}" stroke="${surface}" stroke-width="2"/>`).join('');
  const ends = [0, pts.length-1].map((i) =>
    `<text x="${x(i).toFixed(1)}" y="${H-5}" text-anchor="${i?'end':'start'}"
           font-size="9.5" fill="${ink3}">${esc(parseKey(pts[i].date)
             .toLocaleDateString(undefined,{day:'numeric',month:'short'}))}</text>`).join('');

  $('chart').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img"
         aria-label="Zero-hesitation pages across ${pts.length} reviews">
      ${grid}
      <path d="${path}" fill="none" stroke="${sage}" stroke-width="2.2"
            stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}${ends}
      <line id="cross" x1="0" x2="0" y1="${P.t}" y2="${P.t+ih}" stroke="${sage}"
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
    return `<div class="review-item">
      <div class="review-date">${esc(parseKey(r.review_date)
        .toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}))}</div>
      ${bits.length?`<div class="review-meta">${bits.join(' · ')}</div>`:''}
      ${r.note?`<div class="review-note">${esc(r.note)}</div>`:''}</div>`;
  }).join('');
}

$('review-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const row = {
    user_id: state.user.id,
    review_date: $('rv-date').value,
    zero_hesitation_pages: $('rv-zero').value.trim(),
    weak_pages: $('rv-weak').value.trim(),
    note: $('rv-note').value.trim(),
    updated_at: new Date().toISOString()
  };
  const i = state.reviews.findIndex((r) => r.review_date === row.review_date);
  if (i >= 0) state.reviews[i] = { ...state.reviews[i], ...row }; else state.reviews.unshift(row);
  state.reviews.sort((a,b) => b.review_date.localeCompare(a.review_date));
  enqueue({ id: `review:${row.review_date}`, type: 'upsert', table: 'weekly_review',
            row, onConflict: 'user_id,review_date' });
  for (const id of ['rv-zero','rv-weak','rv-note']) $(id).value = '';
  renderCalendar();
  toast('Review saved');
});

/* ══════════════════════ push ══════════════════════ */
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - base64.length % 4) % 4))
    .replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(padded)].map((c) => c.charCodeAt(0)));
}

function pushState() {
  if (isNative()) {
    return (typeof Notification !== 'undefined' && Notification.permission === 'denied')
      ? { code: 'denied', text: 'Notifications are off. Turn them on in Settings → Hifdh.' }
      : { code: state.pushReady ? 'on' : 'off', text: null };
  }
  if (!pushSupported()) {
    return { code: 'unsupported', text: 'This browser cannot deliver reminders. On iPhone use Safari.' };
  }
  if (isIOS() && !isInstalled()) {
    return { code: 'needs-install',
      text: 'Add Hifdh to your Home Screen first — tap Share, then Add to Home Screen. iOS only sends notifications to installed apps.' };
  }
  if (Notification.permission === 'denied') {
    return { code: 'denied', text: 'Notifications are blocked. Turn them on for Hifdh in iOS Settings → Notifications.' };
  }
  return { code: (Notification.permission === 'granted' && state.pushReady) ? 'on' : 'off', text: null };
}

// What each weekday's reminder should say, from settings alone - arithmetic,
// so it is true without a server and without guessing at the rotation.
function reminderBodies() {
  const c = state.config;
  const out = [];
  for (let iso = 1; iso <= 7; iso++) {
    const rest = (c.restDays || []).includes(iso);
    const lesson = (c.lessonDays || []).includes(iso);
    if (rest && !lesson) { out.push(null); continue; }
    let pages = rest ? 0 : c.revisionPagesPerDay;
    if (lesson) pages += c.newPagesPerLesson;
    out.push(pages > 0
      ? `${pages} page${pages === 1 ? '' : 's'} to revise` + (lesson ? ', including a new page' : '')
      : null);
  }
  return out;
}

async function enablePush() {
  if (isNative()) {
    if (!(await nativePermission())) { toast('Notifications not allowed', true); return false; }
    const t = state.settings.reminder_time;
    if (!t) return false;
    await scheduleNativeReminders(t.slice(0, 5), reminderBodies());
    state.pushReady = true;
    return true;
  }

  const st = pushState();
  if (['unsupported', 'needs-install', 'denied'].includes(st.code)) {
    toast(st.code === 'needs-install' ? 'Add to Home Screen first' : 'Notifications unavailable', true);
    return false;
  }
  if (await Notification.requestPermission() !== 'granted') {
    toast('Notifications not allowed', true); return false;
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
  }
  const raw = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert({
    user_id: state.user.id, endpoint: sub.endpoint,
    p256dh: raw.keys.p256dh, auth: raw.keys.auth,
    user_agent: navigator.userAgent.slice(0, 300), failures: 0
  }, { onConflict: 'endpoint' });
  if (error) { console.error(error); toast('Could not register for reminders', true); return false; }

  state.pushReady = true;
  return true;
}

async function disablePush() {
  if (isNative()) { await cancelNativeReminders(); state.pushReady = false; return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (e) { console.warn('unsubscribe failed', e); }
  state.pushReady = false;
}

async function refreshPushState() {
  state.pushReady = false;
  if (isNative()) {
    try {
      const { pendingNativeReminders } = await import('./lib/native.js');
      state.pushReady = (await pendingNativeReminders()).length > 0;
    } catch { /* plugin unavailable */ }
    return;
  }
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const { data } = await sb.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint);
    if (data && data.length) { state.pushReady = true; return; }
    await enablePush();
  } catch (e) { console.warn('push state check failed', e); }
}

if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'resubscribe') enablePush();
  });
}

/* ══════════════════════ More ══════════════════════ */
function renderReminderStatus() {
  const st = pushState();
  const line = $('remind-status'), btn = $('remind-save');
  const t = state.settings.reminder_time;

  if (st.text) {
    line.textContent = st.text;
    btn.textContent = st.code === 'needs-install' ? 'Add to Home Screen to enable' : 'Reminders unavailable';
    btn.disabled = true;
    return;
  }
  btn.disabled = false;
  if (st.code === 'on' && t) {
    line.textContent = `On. You'll be nudged at ${t.slice(0,5)} each day, even with the app closed.`;
    btn.textContent = 'Update reminder';
  } else {
    line.textContent = 'Get the day’s portion at a time you choose.';
    btn.textContent = 'Turn on reminders';
  }
}

$('remind-save').addEventListener('click', async () => {
  const t = $('set-remind').value;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  state.settings.reminder_time = t || null;
  state.settings.timezone = tz;
  enqueue({ id: 'settings', type: 'upsert', table: 'settings',
            row: { user_id: state.user.id, reminder_time: t || null, timezone: tz,
                   updated_at: new Date().toISOString() }, onConflict: 'user_id' });
  if (t) { if (await enablePush()) toast(`Reminder set for ${t}`); }
  else { await disablePush(); toast('Reminder cleared'); }
  renderReminderStatus();
});

async function renderMore() {
  const anon = state.anonymous;
  $('account-anon').hidden = !anon;
  $('account-known').hidden = anon;
  $('account-hr').hidden = anon;
  $('account-signout').hidden = anon;
  $('set-email').textContent = state.user.email || '';
  $('set-remind').value = state.settings.reminder_time
    ? state.settings.reminder_time.slice(0, 5) : '';
  renderReminderStatus();
  await refreshPushState();
  renderReminderStatus();
}

// Attaching an email to an anonymous account keeps the data and adds a way
// back in. The code is typed here, so nothing ever escapes to Safari.
$('link-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('link-email').value.trim();
  const msg = $('link-msg');
  $('link-btn').disabled = true;
  const { error } = await sb.auth.updateUser({ email });
  $('link-btn').disabled = false;
  msg.hidden = false;
  if (error) { msg.textContent = error.message; return; }
  msg.textContent = `We sent a code to ${email}. Enter it below.`;
  $('link-code-form').hidden = false;
});

$('link-code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('link-msg');
  const { error } = await sb.auth.verifyOtp({
    email: $('link-email').value.trim(),
    token: $('link-code').value.trim(),
    type: 'email_change'
  });
  if (error) { msg.hidden = false; msg.textContent = error.message; return; }
  const { data: { user } } = await sb.auth.getUser();
  state.user = user;
  state.anonymous = !user.email;
  toast('Progress saved to your email');
  renderMore();
});

$('signout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

/* ══════════════════════ nav ══════════════════════ */
const VIEWS = {
  today:    { label: 'Today',    icon: ICONS.today,    render: renderToday },
  plan:     { label: 'Plan',     icon: ICONS.plan,     render: renderPlan },
  calendar: { label: 'Calendar', icon: ICONS.progress, render: renderCalendar },
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

/* ══════════════════════ auth ══════════════════════
   Nobody should meet a sign-up wall. A session is created silently on first
   open; email is optional and only ever entered as a code, because a link
   tapped in Mail opens in Safari - which on iOS is a different storage box
   from the installed app, so the session would land somewhere unreachable.
   ═══════════════════════════════════════════════════ */
let pendingEmail = '';

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('auth-btn'), msg = $('auth-msg');
  pendingEmail = $('email').value.trim();
  btn.disabled = true; btn.textContent = 'Sending…';
  const { error } = await sb.auth.signInWithOtp({
    email: pendingEmail, options: { shouldCreateUser: true }
  });
  btn.disabled = false; btn.textContent = 'Email me a code';
  msg.hidden = false;
  msg.classList.toggle('is-err', !!error);
  if (error) { msg.textContent = error.message; return; }
  msg.textContent = `Code sent to ${pendingEmail}.`;
  $('auth-form').hidden = true;
  $('code-form').hidden = false;
  $('code').focus();
});

$('code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('auth-msg');
  const { data, error } = await sb.auth.verifyOtp({
    email: pendingEmail, token: $('code').value.trim(), type: 'email'
  });
  msg.hidden = false;
  if (error) { msg.classList.add('is-err'); msg.textContent = error.message; return; }
  if (data.session) start(data.session);
});

$('code-back').addEventListener('click', () => {
  $('code-form').hidden = true;
  $('auth-form').hidden = false;
  $('auth-msg').hidden = true;
});

$('auth-skip').addEventListener('click', async () => {
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    const msg = $('auth-msg');
    msg.hidden = false; msg.classList.add('is-err');
    msg.textContent = 'Anonymous accounts are turned off for this project. Use an email for now.';
    return;
  }
  start(data.session);
});

/* ══════════════════════ setup ══════════════════════ */
function renderSetup() {
  let from = 44, to = 114, pages = 10, learning = true, days = [1, 5];

  surahOptions($('su-from'), from);
  surahOptions($('su-to'), to);

  const paintDays = () => dayButtons($('su-days'), days, (d) => {
    days = toggleDay(days, d);
    paintDays();
    sync();
  });

  const sync = () => {
    from = Number($('su-from').value); to = Number($('su-to').value);
    if (from > to) [from, to] = [to, from];
    const r = pagesForSurahRange(from, to);
    const held = r.to - r.from + 1;
    $('su-held').textContent = `${held} pages · ${labelForPages(r.from, r.to)}`;
    $('su-pages').textContent = pages;
    const cycle = Math.ceil(held / Math.max(1, pages));
    $('su-cycle').textContent =
      `You'll go through all of it every ${cycle} day${cycle === 1 ? '' : 's'}.`;
    $('su-lesson-wrap').hidden = !learning;
  };

  $('su-from').onchange = sync;
  $('su-to').onchange = sync;
  $('su-stepper').onclick = (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    pages = clamp(pages + Number(b.dataset.d), 1, 60);
    buzz(6); sync();
  };
  $('su-learning').onchange = (e) => { learning = e.target.checked; sync(); };
  paintDays();
  sync();

  $('setup-go').onclick = async () => {
    const r = pagesForSurahRange(from, to);
    state.config = { ...DEFAULT_CONFIG,
      revisionPagesPerDay: pages,
      lessonDays: learning ? [...days].sort() : [],
      newPagesPerLesson: learning ? 1 : 0 };
    state.progress = { memFrom: r.from, memTo: r.to, partialFrom: null, partialTo: null,
                       revisionCursor: r.from, lastPlanned: null };
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
  state.anonymous = !session.user.email;
  try { await loadAll(); } catch (err) { console.error(err); toast('Could not load', true); }
  $('boot').hidden = true; $('auth').hidden = true;

  if (!state.progress) { $('setup').hidden = false; renderSetup(); return; }
  await ensureDayPlanned();
  $('setup').hidden = true;
  $('app').hidden = false;
  show('today');
  flush();
}

(async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { await start(session); }
  else {
    // No wall: try to start a session silently. Only if anonymous sign-in is
    // unavailable do we fall back to asking for an email.
    const { data, error } = await sb.auth.signInAnonymously();
    if (!error && data.session) await start(data.session);
    else { $('boot').hidden = true; $('auth').hidden = false; }
  }

  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === 'SIGNED_IN' && s && !state.user) start(s);
    if (ev === 'SIGNED_OUT') location.reload();
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
