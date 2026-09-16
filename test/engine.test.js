// Engine unit tests. Run with: node test/engine.test.js
import {
  DEFAULT_CONFIG, memorizedPages, totalPages, revisionPages,
  takeRun, describeRuns, labelForRun, nextNewPages, activeSurah,
  planDay, absorbNew, undoNew, cycleLengthDays, cyclePosition, preview
} from '../public/lib/engine.js';
import { pagesForSurahRange, surahByNumber } from '../public/lib/quran.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b),
  `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// Ad-Dukhan (44) .. An-Nas (114) = pages 496-604
const r = pagesForSurahRange(44, 114);
const start = { memFrom: r.from, memTo: r.to, partialFrom: null, partialTo: null,
                revisionCursor: r.from };
const cfg = { ...DEFAULT_CONFIG };
const kind = (res, k) => res.tasks.find((t) => t.kind === k);
const quran = (res) => res.tasks.filter((t) => t.kind !== 'arabic');

console.log('\n[what you hold]');
ok('109 pages', totalPages(start) === 109, String(totalPages(start)));
eq('the revision pool is simply everything held',
   [revisionPages(start).length, revisionPages(start)[0], revisionPages(start)[108]],
   [109, 496, 604]);

console.log('\n[one dial, one promise]');
ok('10 a day covers everything in 11 days',
   cycleLengthDays(start, { ...cfg, revisionPagesPerDay: 10 }).revisionDays === 11);
ok('5 a day takes 22', cycleLengthDays(start, { ...cfg, revisionPagesPerDay: 5 }).revisionDays === 22);
ok('20 a day takes 6', cycleLengthDays(start, { ...cfg, revisionPagesPerDay: 20 }).revisionDays === 6);
ok('no pool means no promise',
   cycleLengthDays({ ...start, memFrom: 1, memTo: 0 }, cfg) === null ||
   cycleLengthDays(start, { ...cfg, revisionPagesPerDay: 0 }) === null);

// The promise has to be literally true, not roughly true.
const c10 = { ...cfg, revisionPagesPerDay: 10 };
let s = { ...start }, seen = [], days = 0, cycled = false;
while (days < 200 && !cycled) {
  const res = planDay(s, c10, (days % 7) + 1);
  const rev = kind(res, 'revision');
  if (rev) { seen.push(...rev.pages); if (rev.completesCycle) cycled = true; }
  s = res.next; days++;
}
ok('a full pass completes', cycled);
ok('in exactly the promised 11 days', days === 11, String(days));
ok('covering all 109 pages', seen.length === 109, String(seen.length));
ok('with nothing revised twice', new Set(seen).size === 109);
ok('and nothing outside what is held', seen.every((p) => p >= 496 && p <= 604));

console.log('\n[progress through the pass is knowable]');
eq('at the start you are 0 of 109', cyclePosition(start, cfg).done, 0);
const after2 = planDay(planDay(start, c10, 2).next, c10, 3).next;
eq('after two days you are 20 of 109',
   [cyclePosition(after2, c10).done, cyclePosition(after2, c10).total], [20, 109]);

console.log('\n[chunking]');
eq('takes from the cursor', takeRun([1,2,3,4,5], 1, 3),
   { pages: [1,2,3], from: 1, to: 3, nextCursor: 4, completesCycle: false });
eq('stops at the end rather than wrapping mid-chunk', takeRun([1,2,3], 2, 9),
   { pages: [2,3], from: 2, to: 3, nextCursor: 1, completesCycle: true });
eq('a cursor outside the pool restarts it', takeRun([1,2,3], 99, 2),
   { pages: [1,2], from: 1, to: 2, nextCursor: 3, completesCycle: false });
ok('an empty pool yields nothing', takeRun([], 1, 5) === null);
ok('zero a day yields nothing', takeRun([1,2,3], 1, 0) === null);

console.log('\n[memorizing: surah by surah, each learned forwards]');
eq('the next new page is the FIRST page of Az-Zukhruf', nextNewPages(start, cfg),
   { from: 489, to: 489 });
ok('not the last page of it', nextNewPages(start, cfg).from !== 495);
eq('the surah in progress is named', activeSurah(start, cfg).name, 'Az-Zukhruf');

let walk = { ...start };
const order = [];
for (let i = 0; i < 16; i++) {
  const np = nextNewPages(walk, cfg);
  if (!np) break;
  order.push(np.from);
  walk = absorbNew(walk, cfg, np.from, np.to);
}
eq('pages run forwards through each surah, surahs descending',
   order, [489,490,491,492,493,494,495, 483,484,485,486,487,488, 477,478,479]);
ok('Ash-Shura opens at its own first page', order[7] === surahByNumber(42).page);
ok('Fussilat opens at its own first page', order[13] === surahByNumber(41).page);

console.log('\n[the gap while a surah is in progress]');
let mid = { ...start };
for (const p of [489, 490, 491]) mid = absorbNew(mid, cfg, p, p);
eq('the settled block has not moved', [mid.memFrom, mid.memTo], [496, 604]);
eq('the part-learned surah is tracked apart', [mid.partialFrom, mid.partialTo], [489, 491]);
ok('112 pages held', totalPages(mid) === 112);
ok('the unlearned middle is NOT counted as held',
   !memorizedPages(mid).includes(492) && !memorizedPages(mid).includes(495));
eq('a portion straddling the gap is two honest runs, not one false span',
   describeRuns([489,490,491,496,497]).map((x) => [x.from, x.to, x.label]),
   [[489, 491, 'Az-Zukhruf'], [496, 497, 'Ad-Dukhan']]);
ok('and is labelled as both', labelForRun([489,490,491,496,497]) === 'Az-Zukhruf · Ad-Dukhan');
ok('revision now includes the new pages', revisionPages(mid).length === 112);

console.log('\n[closing the gap]');
let closing = { ...mid };
for (const p of [492, 493, 494]) closing = absorbNew(closing, cfg, p, p);
ok('still open one page short', closing.partialTo === 494 && closing.memFrom === 496);
closing = absorbNew(closing, cfg, 495, 495);
eq('the last page merges the ranges',
   [closing.memFrom, closing.partialFrom, closing.partialTo], [489, null, null]);
ok('116 held, contiguous', totalPages(closing) === 116);

console.log('\n[un-ticking a new page]');
const one = absorbNew(start, cfg, 489, 489);
eq('undo clears a single-page prefix',
   [undoNew(one, cfg, 489, 489).partialFrom, undoNew(one, cfg, 489, 489).memFrom], [null, 496]);
eq('undo shrinks a longer prefix',
   [undoNew(mid, cfg, 491, 491).partialFrom, undoNew(mid, cfg, 491, 491).partialTo], [489, 490]);
const reopened = undoNew(absorbNew({ ...mid, partialTo: 494 }, cfg, 495, 495), cfg, 495, 495);
eq('undoing the page that closed a gap re-opens it',
   [reopened.memFrom, reopened.partialFrom, reopened.partialTo], [496, 489, 494]);

console.log('\n[a day]');
const mon = planDay(start, cfg, 1);
eq('Monday is a lesson day: new plus revision',
   quran(mon).map((t) => t.kind), ['new', 'revision']);
eq('Tuesday is revision only', quran(planDay(start, cfg, 2)).map((t) => t.kind), ['revision']);
eq('a rest day schedules no Qur’an work',
   quran(planDay(start, { ...cfg, restDays: [6] }, 6)), []);
eq('a rest day that is also a lesson day still gets the lesson',
   quran(planDay(start, { ...cfg, restDays: [1] }, 1)).map((t) => t.kind), ['new']);

console.log('\n[a missed day costs time, not sync]');
let d1 = planDay(start, c10, 2); let st2 = d1.next;
let d2 = planDay(st2, c10, 3);   st2 = d2.next;
const rev = (res) => [kind(res, 'revision').from, kind(res, 'revision').to];
eq('day 2 continues from day 1', rev(d2), [506, 515]);
eq('after skipping days it resumes where it stopped', rev(planDay(st2, c10, 5)), [516, 525]);
eq('the same state gives the same portion on any weekday',
   [3,4,6,7].map((wd) => rev(planDay(st2, c10, wd))),
   [[516,525],[516,525],[516,525],[516,525]]);

console.log('\n[two lessons a week is two new pages a week]');
const wk = preview(start, cfg, 1, 14);
const fresh = wk.flatMap((d) => d.tasks.filter((t) => t.kind === 'new'));
ok('14 days holds 4 lessons', fresh.length === 4, String(fresh.length));
ok('only on Monday and Friday',
   wk.every((d) => !d.tasks.some((t) => t.kind === 'new') || [1,5].includes(d.isoWeekday)));
eq('walking forwards through Az-Zukhruf', fresh.map((t) => t.from), [489, 490, 491, 492]);

console.log('\n[arabic]');
const ar = { ...cfg, arabicEnabled: true, arabicText: 'Madinah Book 2' };
eq('carries the text you set', kind(planDay(start, ar, 2), 'arabic').label, 'Madinah Book 2');
ok('off by default', !kind(planDay(start, cfg, 2), 'arabic'));
ok('a Qur’an rest day can still be an arabic day',
   planDay(start, { ...ar, restDays: [6] }, 6).tasks.map((t) => t.kind).join() === 'arabic');
ok('arabic never moves the revision cursor',
   planDay(start, ar, 2).next.revisionCursor === planDay(start, cfg, 2).next.revisionCursor);

console.log('\n[edge cases]');
const single = { memFrom: 604, memTo: 604, partialFrom: null, partialTo: null, revisionCursor: 604 };
eq('one page still schedules revision', quran(planDay(single, cfg, 2)).map((t) => t.kind), ['revision']);
ok('a pool smaller than the daily dose is one short day',
   kind(planDay(single, cfg, 2), 'revision').pages.length === 1);
ok('nothing left to memorize at page 1', nextNewPages({ ...start, memFrom: 1 }, cfg) === null);
ok('forward stops at the end of the mushaf',
   nextNewPages({ ...start, memTo: 604 }, { ...cfg, direction: 'forward' }) === null);

console.log('\n[purity]');
const frozen = { memFrom: 496, memTo: 604, partialFrom: 489, partialTo: 491, revisionCursor: 500 };
const copy = JSON.parse(JSON.stringify(frozen));
planDay(frozen, cfg, 1); absorbNew(frozen, cfg, 492, 492); preview(frozen, cfg, 1, 10);
eq('planning never mutates the state it is given', frozen, copy);

console.log(`\n=== engine: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
