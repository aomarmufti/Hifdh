// Scheduling engine.
//
// Everything is derived from what you have memorized and from cursors marking
// how far through each rotation you are. Nothing is keyed to the calendar, so
// a missed day never desynchronises the plan - the cursor simply has not moved,
// and unfinished work is carried.
//
// Three kinds of work, the classical division:
//   sabaq  - the new page, only on lesson days
//   sabqi  - the recently memorized pages, revised hard on a short cycle
//   manzil - everything older, revised on a long rotation
//
// MEMORIZING BACKWARDS is not the same as walking pages backwards. You take
// surahs in descending order, but you learn each one FORWARDS, from its first
// page to its last. Having finished Ad-Dukhan you do not start at the last page
// of Az-Zukhruf; you start at its first page and work down to where Ad-Dukhan
// begins. So mid-surah your memorized pages have a hole in them, and the state
// carries a second range for the surah in progress.

import { labelForPages, surahAtPage, LAST_PAGE } from './quran.js';

export const DEFAULT_CONFIG = {
  direction: 'backward',
  lessonDays: [1, 5],        // ISO weekdays: Monday, Friday
  newPagesPerLesson: 1,
  sabqiWindowPages: 10,
  sabqiPagesPerDay: 5,
  manzilPagesPerDay: 8,
  restDays: [],
  arabicEnabled: true,
  arabicText: '',
  arabicDays: [1, 2, 3, 4, 5, 6, 7]
};

/* ------------------------------------------------------------------ *
 * What is memorized
 * ------------------------------------------------------------------ */

// Every memorized page, ascending. The consolidated block plus the prefix of
// the surah currently being learned, which sits below it with a gap between.
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

export function totalPages(state) {
  return memorizedPages(state).length;
}

// The newest material - what is still being strengthened. Going backwards the
// newest pages are the lowest ones; going forwards, the highest.
export function sabqiPages(state, config) {
  const all = memorizedPages(state);
  const n = Math.min(Math.max(0, config.sabqiWindowPages), all.length);
  if (n === 0) return [];
  return config.direction === 'backward' ? all.slice(0, n) : all.slice(all.length - n);
}

// Everything older than the sabqi window.
export function manzilPages(state, config) {
  const recent = new Set(sabqiPages(state, config));
  return memorizedPages(state).filter((p) => !recent.has(p));
}

/* ------------------------------------------------------------------ *
 * Rotation
 * ------------------------------------------------------------------ */

// Take the next n pages from a pool starting at cursor. Stops at the end of the
// pool rather than wrapping mid-chunk, so each pass is a clean finished cycle.
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

export function labelForRun(pages) {
  return describeRuns(pages).map((r) => r.label).join(' · ');
}

export function isLessonDay(isoWeekday, config) {
  return (config.lessonDays || []).includes(isoWeekday);
}
export function isRestDay(isoWeekday, config) {
  return (config.restDays || []).includes(isoWeekday);
}

/* ------------------------------------------------------------------ *
 * The next new page
 * ------------------------------------------------------------------ */

// Backwards: continue the surah in progress, or open the next surah down at
// its FIRST page. Forwards: simply the page after the block.
export function nextNewPages(state, config) {
  const n = Math.max(0, config.newPagesPerLesson);
  if (n === 0) return null;

  if (config.direction === 'forward') {
    const from = state.memTo + 1;
    if (from > LAST_PAGE) return null;
    return { from, to: Math.min(LAST_PAGE, from + n - 1) };
  }

  const gapEnd = state.memFrom - 1;      // last page not yet held
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
  if (gapEnd < 1) return null;
  return surahAtPage(gapEnd);
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
      tasks.push({ kind: 'sabaq', pages, from: np.from, to: np.to, label: labelForRun(pages) });
    }
  }

  if (!isRestDay(isoWeekday, config)) {
    const sab = takeRun(sabqiPages(state, config), next.sabqiCursor, config.sabqiPagesPerDay);
    if (sab) {
      tasks.push({ kind: 'sabqi', pages: sab.pages, from: sab.from, to: sab.to,
                   label: labelForRun(sab.pages), completesCycle: sab.completesCycle });
      next.sabqiCursor = sab.nextCursor;
    }
    const man = takeRun(manzilPages(state, config), next.manzilCursor, config.manzilPagesPerDay);
    if (man) {
      tasks.push({ kind: 'manzil', pages: man.pages, from: man.from, to: man.to,
                   label: labelForRun(man.pages), completesCycle: man.completesCycle });
      next.manzilCursor = man.nextCursor;
    }
  }

  // Arabic is not page-based, so it carries no range and follows its own days -
  // a Qur'an rest day does not necessarily mean a day off Arabic.
  if (config.arabicEnabled && (config.arabicDays || []).includes(isoWeekday)) {
    tasks.push({ kind: 'arabic', pages: [], from: 0, to: 0,
                 label: (config.arabicText || '').trim() || 'Arabic study' });
  }

  return { tasks, next };
}

// Applied when a sabaq is completed: the new page joins what you hold. Going
// backwards it extends the surah in progress, and once that surah reaches the
// block below it the two merge into one range again.
export function absorbSabaq(state, config, from, to) {
  const s = { ...state };

  if (config.direction === 'forward') {
    s.memTo = Math.max(s.memTo, to);
  } else {
    const pf = s.partialFrom != null ? Math.min(s.partialFrom, from) : from;
    const pt = s.partialTo != null ? Math.max(s.partialTo, to) : to;
    if (pt >= s.memFrom - 1) {          // surah complete - close the gap
      s.memFrom = Math.min(s.memFrom, pf);
      s.partialFrom = null;
      s.partialTo = null;
    } else {
      s.partialFrom = pf;
      s.partialTo = pt;
    }
  }

  // Re-seat any cursor whose pool moved out from under it.
  const sab = sabqiPages(s, config);
  if (sab.length && !sab.includes(s.sabqiCursor)) s.sabqiCursor = sab[0];
  const man = manzilPages(s, config);
  if (man.length && !man.includes(s.manzilCursor)) s.manzilCursor = man[0];
  return s;
}

// Un-ticking a completed new page. Going backwards this may have to re-open a
// surah that had just merged into the block.
export function undoSabaq(state, config, from, to) {
  const s = { ...state };

  if (config.direction === 'forward') {
    if (s.memTo === to) s.memTo = from - 1;
    return s;
  }

  if (s.partialTo === to) {
    // Still mid-surah: shrink the prefix, or drop it entirely.
    if (s.partialFrom >= from) { s.partialFrom = null; s.partialTo = null; }
    else s.partialTo = from - 1;
  } else if (s.partialFrom == null && from >= s.memFrom && to <= s.memTo) {
    // This page had closed the gap, so the surah merged and memFrom moved down
    // to the surah's own start. Re-open it: the block begins again above the
    // undone page, and the rest of the surah returns to being a prefix.
    const surahStart = s.memFrom;
    s.memFrom = to + 1;
    if (from - 1 >= surahStart) { s.partialFrom = surahStart; s.partialTo = from - 1; }
    else { s.partialFrom = null; s.partialTo = null; }
  }
  return s;
}

/* ------------------------------------------------------------------ *
 * Projections for the planner
 * ------------------------------------------------------------------ */

export function cycleLengthDays(state, config) {
  const pool = manzilPages(state, config);
  if (!pool.length || config.manzilPagesPerDay <= 0) return null;
  const activeDays = 7 - (config.restDays || []).length;
  const revisionDays = Math.ceil(pool.length / config.manzilPagesPerDay);
  return { revisionDays, calendarDays: Math.ceil(revisionDays * 7 / Math.max(1, activeDays)) };
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
    for (const t of tasks) if (t.kind === 'sabaq') s = absorbSabaq(s, config, t.from, t.to);
    out.push({ dayOffset: i, isoWeekday: wd, tasks });
    wd = wd === 7 ? 1 : wd + 1;
  }
  return out;
}
