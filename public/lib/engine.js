// Scheduling engine.
//
// One idea: you hold a set of pages, and you go through them N a day, in
// order, over and over. That is the whole revision model. When you reach the
// end you start again, so "everything every 9 days" is a promise the app can
// actually keep and you can check.
//
// There used to be two rotations here - a short one for recent pages and a
// long one for older pages, the classical sabqi/manzil split. It was correct
// and nobody could understand it. One cycle, one dial.
//
// Memorizing new pages is separate and only happens on lesson days. It takes
// surahs in descending order but learns each one FORWARDS, from its first
// page: having finished Ad-Dukhan you start Az-Zukhruf at p.489, not p.495.
// So mid-surah the pages you hold have a hole in them, and the state carries a
// second range for the surah in progress.

import { labelForPages, surahAtPage, LAST_PAGE } from './quran.js';

export const DEFAULT_CONFIG = {
  direction: 'backward',
  lessonDays: [1, 5],          // ISO weekdays: Monday, Friday
  newPagesPerLesson: 1,
  revisionPagesPerDay: 10,
  restDays: [],
  arabicEnabled: false,
  arabicText: '',
  arabicDays: [1, 2, 3, 4, 5, 6, 7]
};

/* ------------------------------------------------------------------ *
 * What you hold
 * ------------------------------------------------------------------ */

// Every memorized page, ascending: the settled block plus the prefix of the
// surah being learned, which sits below it with a gap between.
export function memorizedPages(state) {
  const out = [];
  if (state.partialFrom != null && state.partialTo != null) {
    for (let p = state.partialFrom; p <= state.partialTo; p++) out.push(p);
  }
  for (let p = state.memFrom; p <= state.memTo; p++) {
    if (!out.includes(p)) out.push(p);
  }
  return out.sort((a, b) => a - b);
}

export const totalPages = (state) => memorizedPages(state).length;

// The revision pool is simply everything you hold.
export const revisionPages = (state) => memorizedPages(state);

/* ------------------------------------------------------------------ *
 * Rotation
 * ------------------------------------------------------------------ */

// Take the next n pages from the pool starting at cursor. Stops at the end
// rather than wrapping mid-chunk, so each pass is a clean finished cycle.
export function takeRun(pool, cursor, n) {
  if (!pool.length || n <= 0) return null;
  let i = pool.indexOf(cursor);
  if (i < 0) i = 0;
  const pages = pool.slice(i, i + n);
  const end = i + pages.length;
  const completesCycle = end >= pool.length;
  return {
    pages,
    from: pages[0],
    to: pages[pages.length - 1],
    nextCursor: completesCycle ? pool[0] : pool[end],
    completesCycle
  };
}

// Split a page list into contiguous runs, each labelled with its surahs, so a
// portion that straddles the gap reads honestly rather than as one false span.
export function describeRuns(pages) {
  const runs = [];
  for (const p of pages) {
    const last = runs[runs.length - 1];
    if (last && p === last.to + 1) last.to = p;
    else runs.push({ from: p, to: p });
  }
  return runs.map((r) => ({ ...r, label: labelForPages(r.from, r.to) }));
}

export const labelForRun = (pages) =>
  describeRuns(pages).map((r) => r.label).join(' · ');

export const isLessonDay = (isoWeekday, config) =>
  (config.lessonDays || []).includes(isoWeekday);
export const isRestDay = (isoWeekday, config) =>
  (config.restDays || []).includes(isoWeekday);

/* ------------------------------------------------------------------ *
 * The next new page
 * ------------------------------------------------------------------ */

export function nextNewPages(state, config) {
  const n = Math.max(0, config.newPagesPerLesson);
  if (n === 0) return null;

  if (config.direction === 'forward') {
    const from = state.memTo + 1;
    if (from > LAST_PAGE) return null;
    return { from, to: Math.min(LAST_PAGE, from + n - 1) };
  }

  const gapEnd = state.memFrom - 1;            // last page not yet held
  if (gapEnd < 1) return null;

  const inProgress = state.partialFrom != null && state.partialTo != null;
  const from = inProgress ? state.partialTo + 1 : surahAtPage(gapEnd).page;
  if (from > gapEnd) return null;
  return { from, to: Math.min(from + n - 1, gapEnd) };
}

// The surah currently being learned, for display.
export function activeSurah(state, config) {
  if (config.direction !== 'backward') return null;
  const gapEnd = state.memFrom - 1;
  return gapEnd < 1 ? null : surahAtPage(gapEnd);
}

/* ------------------------------------------------------------------ *
 * One day
 * ------------------------------------------------------------------ */

// Pure: given the state at the start of a day, return that day's work and the
// state to carry into the next. `state` is never mutated.
export function planDay(state, config, isoWeekday) {
  const tasks = [];
  const next = { ...state };

  if (isLessonDay(isoWeekday, config)) {
    const np = nextNewPages(state, config);
    if (np) {
      const pages = [];
      for (let p = np.from; p <= np.to; p++) pages.push(p);
      tasks.push({ kind: 'new', pages, from: np.from, to: np.to, label: labelForRun(pages) });
    }
  }

  if (!isRestDay(isoWeekday, config)) {
    const run = takeRun(revisionPages(state), next.revisionCursor, config.revisionPagesPerDay);
    if (run) {
      tasks.push({ kind: 'revision', pages: run.pages, from: run.from, to: run.to,
                   label: labelForRun(run.pages), completesCycle: run.completesCycle });
      next.revisionCursor = run.nextCursor;
    }
  }

  if (config.arabicEnabled && (config.arabicDays || []).includes(isoWeekday)) {
    tasks.push({ kind: 'arabic', pages: [], from: 0, to: 0,
                 label: (config.arabicText || '').trim() || 'Arabic study' });
  }

  return { tasks, next };
}

// Applied when a new page is completed: it joins what you hold. Going
// backwards it extends the surah in progress, and once that surah reaches the
// block below it the two merge into one range again.
export function absorbNew(state, config, from, to) {
  const s = { ...state };

  if (config.direction === 'forward') {
    s.memTo = Math.max(s.memTo, to);
  } else {
    const pf = s.partialFrom != null ? Math.min(s.partialFrom, from) : from;
    const pt = s.partialTo != null ? Math.max(s.partialTo, to) : to;
    if (pt >= s.memFrom - 1) {              // surah complete - close the gap
      s.memFrom = Math.min(s.memFrom, pf);
      s.partialFrom = null;
      s.partialTo = null;
    } else {
      s.partialFrom = pf;
      s.partialTo = pt;
    }
  }

  const pool = revisionPages(s);
  if (pool.length && !pool.includes(s.revisionCursor)) s.revisionCursor = pool[0];
  return s;
}

// Un-ticking a completed new page; may have to re-open a surah that had just
// merged into the block.
export function undoNew(state, config, from, to) {
  const s = { ...state };

  if (config.direction === 'forward') {
    if (s.memTo === to) s.memTo = from - 1;
    return s;
  }

  if (s.partialTo === to) {
    if (s.partialFrom >= from) { s.partialFrom = null; s.partialTo = null; }
    else s.partialTo = from - 1;
  } else if (s.partialFrom == null && from >= s.memFrom && to <= s.memTo) {
    const surahStart = s.memFrom;
    s.memFrom = to + 1;
    if (from - 1 >= surahStart) { s.partialFrom = surahStart; s.partialTo = from - 1; }
    else { s.partialFrom = null; s.partialTo = null; }
  }
  return s;
}

/* ------------------------------------------------------------------ *
 * Projections
 * ------------------------------------------------------------------ */

// The headline promise: everything you hold, covered, every this many days.
export function cycleLengthDays(state, config) {
  const pool = revisionPages(state);
  if (!pool.length || config.revisionPagesPerDay <= 0) return null;
  const activeDays = 7 - (config.restDays || []).length;
  const revisionDays = Math.ceil(pool.length / config.revisionPagesPerDay);
  return { revisionDays, calendarDays: Math.ceil(revisionDays * 7 / Math.max(1, activeDays)) };
}

// How far through the current pass you are, for a progress bar you can trust.
export function cyclePosition(state, config) {
  const pool = revisionPages(state);
  if (!pool.length) return null;
  const i = Math.max(0, pool.indexOf(state.revisionCursor));
  return { done: i, total: pool.length, fraction: i / pool.length };
}

// Dry-run the next n days without touching stored state, assuming each is
// finished. Used by the planner to show the effect of a change.
export function preview(state, config, startIsoWeekday, days) {
  let s = { ...state };
  let wd = startIsoWeekday;
  const out = [];
  for (let i = 0; i < days; i++) {
    const { tasks, next } = planDay(s, config, wd);
    s = next;
    for (const t of tasks) if (t.kind === 'new') s = absorbNew(s, config, t.from, t.to);
    out.push({ dayOffset: i, isoWeekday: wd, tasks });
    wd = wd === 7 ? 1 : wd + 1;
  }
  return out;
}
