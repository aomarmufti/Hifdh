// Scheduling engine.
//
// Everything is derived from two things: what you currently have memorized
// (a page range), and cursors marking how far through each rotation you are.
// Nothing is keyed to the calendar, so a missed day never desynchronises the
// plan - the cursor simply has not moved, and unfinished work is carried.
//
// Three kinds of work, the classical division:
//   sabaq  - the new page, only on lesson days
//   sabqi  - the recently memorized pages, revised hard on a short cycle
//   manzil - everything older, revised on a long rotation
//
// Direction: memorising 'backward' means each new page sits before the range
// you already hold (the usual route for someone who began at Juz 30 and is
// working toward the front). 'forward' extends past the end instead.

import { labelForPages, LAST_PAGE } from './quran.js';

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

/* ---------- pools ---------- */

// The most recently memorized pages - the ones still being strengthened.
export function sabqiWindow(state, config) {
  const span = Math.max(0, config.sabqiWindowPages);
  if (span === 0) return null;
  if (config.direction === 'backward') {
    const to = Math.min(state.memFrom + span - 1, state.memTo);
    return { from: state.memFrom, to };
  }
  const from = Math.max(state.memTo - span + 1, state.memFrom);
  return { from, to: state.memTo };
}

// Everything older than the sabqi window - the long rotation.
export function manzilPool(state, config) {
  const w = sabqiWindow(state, config);
  if (!w) return { from: state.memFrom, to: state.memTo };
  if (config.direction === 'backward') {
    return w.to >= state.memTo ? null : { from: w.to + 1, to: state.memTo };
  }
  return w.from <= state.memFrom ? null : { from: state.memFrom, to: w.from - 1 };
}

/* ---------- rotation ---------- */

// Take the next n pages from a pool starting at cursor. Stops at the end of
// the pool rather than straddling it, so each pass is a clean finished cycle.
export function takeChunk(pool, cursor, n) {
  if (!pool || n <= 0) return null;
  let start = cursor;
  if (start < pool.from || start > pool.to) start = pool.from;
  const end = Math.min(start + n - 1, pool.to);
  const done = end >= pool.to;
  return {
    from: start,
    to: end,
    nextCursor: done ? pool.from : end + 1,
    completesCycle: done
  };
}

export function isLessonDay(isoWeekday, config) {
  return (config.lessonDays || []).includes(isoWeekday);
}
export function isRestDay(isoWeekday, config) {
  return (config.restDays || []).includes(isoWeekday);
}

// Pages the next lesson would add, or null if there is nothing left to take.
export function nextNewPages(state, config) {
  const n = Math.max(0, config.newPagesPerLesson);
  if (n === 0) return null;
  if (config.direction === 'backward') {
    const to = state.memFrom - 1;
    const from = to - n + 1;
    return to < 1 ? null : { from: Math.max(1, from), to };
  }
  const from = state.memTo + 1;
  const to = from + n - 1;
  return from > LAST_PAGE ? null : { from, to: Math.min(LAST_PAGE, to) };
}

/* ---------- one day ---------- */

// Pure: given the state at the start of a day, return that day's work and the
// state to carry into the next day. `state` is never mutated.
export function planDay(state, config, isoWeekday) {
  const tasks = [];
  const next = { ...state };

  if (isLessonDay(isoWeekday, config)) {
    const np = nextNewPages(state, config);
    if (np) {
      tasks.push({
        kind: 'sabaq',
        from: np.from, to: np.to,
        label: labelForPages(np.from, np.to)
      });
    }
  }

  if (!isRestDay(isoWeekday, config)) {
    const w = sabqiWindow(state, config);
    const sab = takeChunk(w, next.sabqiCursor, config.sabqiPagesPerDay);
    if (sab) {
      tasks.push({
        kind: 'sabqi',
        from: sab.from, to: sab.to,
        label: labelForPages(sab.from, sab.to),
        completesCycle: sab.completesCycle
      });
      next.sabqiCursor = sab.nextCursor;
    }

    const pool = manzilPool(state, config);
    const man = takeChunk(pool, next.manzilCursor, config.manzilPagesPerDay);
    if (man) {
      tasks.push({
        kind: 'manzil',
        from: man.from, to: man.to,
        label: labelForPages(man.from, man.to),
        completesCycle: man.completesCycle
      });
      next.manzilCursor = man.nextCursor;
    }
  }

  // Arabic is not page-based, so it carries no range and follows its own days -
  // a Qur'an rest day does not necessarily mean a day off Arabic.
  if (config.arabicEnabled && (config.arabicDays || []).includes(isoWeekday)) {
    tasks.push({
      kind: 'arabic',
      from: 0, to: 0,
      label: (config.arabicText || '').trim() || 'Arabic study'
    });
  }

  return { tasks, next };
}

// Applied when a sabaq is actually completed: the new page joins the
// memorized range. Cursors are re-seated if the pools moved under them.
export function absorbSabaq(state, config, from, to) {
  const s = { ...state };
  if (config.direction === 'backward') s.memFrom = Math.min(s.memFrom, from);
  else s.memTo = Math.max(s.memTo, to);

  const w = sabqiWindow(s, config);
  if (w && (s.sabqiCursor < w.from || s.sabqiCursor > w.to)) s.sabqiCursor = w.from;
  const p = manzilPool(s, config);
  if (p && (s.manzilCursor < p.from || s.manzilCursor > p.to)) s.manzilCursor = p.from;
  return s;
}

/* ---------- projections for the planner ---------- */

export function cycleLengthDays(state, config) {
  const pool = manzilPool(state, config);
  if (!pool || config.manzilPagesPerDay <= 0) return null;
  const pages = pool.to - pool.from + 1;
  const activeDays = 7 - (config.restDays || []).length;
  const revisionDays = Math.ceil(pages / config.manzilPagesPerDay);
  return { revisionDays, calendarDays: Math.ceil(revisionDays * 7 / Math.max(1, activeDays)) };
}

export function totalPages(state) {
  return state.memTo - state.memFrom + 1;
}

// Dry-run the next n days without touching stored state, assuming every day is
// completed. Used by the planner to show the effect of a setting change.
export function preview(state, config, startIsoWeekday, days) {
  let s = { ...state };
  let wd = startIsoWeekday;
  const out = [];
  for (let i = 0; i < days; i++) {
    const { tasks, next } = planDay(s, config, wd);
    s = next;
    for (const t of tasks) {
      if (t.kind === 'sabaq') s = absorbSabaq(s, config, t.from, t.to);
    }
    out.push({ dayOffset: i, isoWeekday: wd, tasks });
    wd = wd === 7 ? 1 : wd + 1;
  }
  return out;
}
