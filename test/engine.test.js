// Engine unit tests. Run with: node test/engine.test.js
import {
  DEFAULT_CONFIG, sabqiWindow, manzilPool, takeChunk, nextNewPages,
  planDay, absorbSabaq, cycleLengthDays, preview
} from '../public/lib/engine.js';
import { pagesForSurahRange, labelForPages } from '../public/lib/quran.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b),
  `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// The user's real starting point: Ad-Dukhan (44) .. An-Nas (114) = pages 496-604
const r = pagesForSurahRange(44, 114);
const start = { memFrom: r.from, memTo: r.to, sabqiCursor: r.from, manzilCursor: 0 };
const cfg = { ...DEFAULT_CONFIG };

console.log('\n[pools]');
eq('sabqi window is the 10 newest pages', sabqiWindow(start, cfg), { from: 496, to: 505 });
eq('manzil pool is everything older', manzilPool(start, cfg), { from: 506, to: 604 });
ok('manzil pool is 99 pages', manzilPool(start, cfg).to - manzilPool(start, cfg).from + 1 === 99);
ok('sabqi window sits at the newest end (backward)', sabqiWindow(start, cfg).from === start.memFrom);

const fwd = { ...cfg, direction: 'forward' };
eq('forward: sabqi window is at the far end', sabqiWindow(start, fwd), { from: 595, to: 604 });
eq('forward: manzil pool is the earlier pages', manzilPool(start, fwd), { from: 496, to: 594 });

console.log('\n[chunking]');
eq('takes a chunk from the cursor', takeChunk({ from: 506, to: 604 }, 506, 8),
   { from: 506, to: 513, nextCursor: 514, completesCycle: false });
eq('clamps at the pool end rather than straddling',
   takeChunk({ from: 506, to: 604 }, 600, 8),
   { from: 600, to: 604, nextCursor: 506, completesCycle: true });
eq('a cursor outside the pool restarts it',
   takeChunk({ from: 506, to: 604 }, 999, 8),
   { from: 506, to: 513, nextCursor: 514, completesCycle: false });
ok('no pool means no chunk', takeChunk(null, 1, 8) === null);
ok('zero pages per day means no chunk', takeChunk({ from: 1, to: 10 }, 1, 0) === null);

console.log('\n[new pages]');
eq('backward: next new page is the one before the range', nextNewPages(start, cfg),
   { from: 495, to: 495 });
ok('backward next page is the end of Az-Zukhruf', labelForPages(495, 495) === 'Az-Zukhruf',
   labelForPages(495, 495));
eq('two new pages per lesson', nextNewPages(start, { ...cfg, newPagesPerLesson: 2 }),
   { from: 494, to: 495 });
eq('forward: next new page follows the range',
   nextNewPages({ ...start, memTo: 500 }, fwd), { from: 501, to: 501 });
ok('nothing left to memorize backward from page 1',
   nextNewPages({ ...start, memFrom: 1 }, cfg) === null);

console.log('\n[a single day]');
const mon = planDay(start, cfg, 1);   // Monday = lesson day
ok('Monday has three tasks', mon.tasks.length === 3, String(mon.tasks.length));
eq('Monday kinds', mon.tasks.map((t) => t.kind), ['sabaq', 'sabqi', 'manzil']);
eq('Monday sabaq is the new page', [mon.tasks[0].from, mon.tasks[0].to], [495, 495]);
eq('Monday manzil starts the rotation', [mon.tasks[2].from, mon.tasks[2].to], [506, 513]);

const tue = planDay(start, cfg, 2);   // Tuesday = not a lesson day
eq('Tuesday has no sabaq', tue.tasks.map((t) => t.kind), ['sabqi', 'manzil']);

const rest = planDay(start, { ...cfg, restDays: [6] }, 6);
eq('a rest day schedules nothing', rest.tasks, []);
const restLesson = planDay(start, { ...cfg, restDays: [1] }, 1);
eq('a rest day that is also a lesson day still gets the lesson',
   restLesson.tasks.map((t) => t.kind), ['sabaq']);

console.log('\n[the cursor is the memory - missing a day cannot desync]');
let s = { ...start };
const d1 = planDay(s, cfg, 2); s = d1.next;
const d2 = planDay(s, cfg, 3); s = d2.next;
eq('day 1 manzil', [d1.tasks[1].from, d1.tasks[1].to], [506, 513]);
eq('day 2 manzil continues where day 1 stopped', [d2.tasks[1].from, d2.tasks[1].to], [514, 521]);
// Two days have been planned, so the cursor sits at 522. Now let any number of
// calendar days pass without planning: the rotation must resume at 522, never
// skip ahead to "where it would have been". Friday is a lesson day, so select
// the manzil task by kind rather than by position.
const man = (r) => r.tasks.find((t) => t.kind === 'manzil');
eq('after skipping days the rotation resumes where it stopped',
   [man(planDay(s, cfg, 5)).from, man(planDay(s, cfg, 5)).to], [522, 529]);
eq('the same state gives the same portion on any weekday',
   [3, 4, 6, 7].map((wd) => [man(planDay(s, cfg, wd)).from, man(planDay(s, cfg, wd)).to]),
   [[522, 529], [522, 529], [522, 529], [522, 529]]);
ok('a skipped day costs nothing but time - no pages are lost',
   man(planDay(s, cfg, 5)).from === d2.next.manzilCursor);

console.log('\n[memorizing a new page shifts the pools]');
let s2 = absorbSabaq(start, cfg, 495, 495);
ok('memorized range grew by one page', s2.memFrom === 495, String(s2.memFrom));
eq('sabqi window slid to include the new page', sabqiWindow(s2, cfg), { from: 495, to: 504 });
eq('manzil pool grew at its near edge', manzilPool(s2, cfg), { from: 505, to: 604 });
ok('total memorized is now 110 pages', s2.memTo - s2.memFrom + 1 === 110);
const s3 = absorbSabaq({ ...start, sabqiCursor: 505 }, cfg, 495, 495);
ok('a cursor left outside its pool is re-seated', s3.sabqiCursor === 495, String(s3.sabqiCursor));

console.log('\n[full rotation completes and restarts]');
let st = { ...start }, seen = new Set(), days = 0, cycled = false;
while (days < 400 && !cycled) {
  const r = planDay(st, cfg, ((days % 7) + 1));
  for (const t of r.tasks) {
    if (t.kind === 'manzil') {
      for (let p = t.from; p <= t.to; p++) seen.add(p);
      if (t.completesCycle) cycled = true;
    }
  }
  st = r.next; days++;
}
ok('the rotation completes', cycled);
ok('every page of the manzil pool was covered exactly once per cycle',
   seen.size === 99, String(seen.size));
ok('no page outside the pool was scheduled',
   [...seen].every((p) => p >= 506 && p <= 604));
ok('cycle took 13 days at 8 pages/day', days === 13, String(days));

console.log('\n[cycle projection matches reality]');
const proj = cycleLengthDays(start, cfg);
ok('projected revision days matches the simulation', proj.revisionDays === 13,
   JSON.stringify(proj));
const proj4 = cycleLengthDays(start, { ...cfg, manzilPagesPerDay: 4 });
ok('halving the daily pages roughly doubles the cycle', proj4.revisionDays === 25,
   JSON.stringify(proj4));
const projRest = cycleLengthDays(start, { ...cfg, restDays: [6, 7] });
ok('rest days stretch the calendar length but not the work',
   projRest.revisionDays === 13 && projRest.calendarDays > 13, JSON.stringify(projRest));

console.log('\n[two lessons a week really is two pages a week]');
const wk = preview(start, cfg, 1, 14);
const newPages = wk.flatMap((d) => d.tasks.filter((t) => t.kind === 'sabaq'));
ok('14 days contains 4 lessons', newPages.length === 4, String(newPages.length));
ok('lessons land on Monday and Friday only',
   wk.every((d) => !d.tasks.some((t) => t.kind === 'sabaq') || [1, 5].includes(d.isoWeekday)));
eq('consecutive new pages walk backwards one at a time',
   newPages.map((t) => t.from), [495, 494, 493, 492]);

console.log('\n[settings actually change the plan]');
const heavy = preview(start, { ...cfg, manzilPagesPerDay: 20 }, 1, 1)[0];
eq('20 pages a day gives a 20-page portion',
   heavy.tasks.filter((t) => t.kind === 'manzil').map((t) => t.to - t.from + 1), [20]);
const noSabqi = planDay(start, { ...cfg, sabqiWindowPages: 0 }, 2);
eq('no sabqi window means manzil covers everything',
   noSabqi.tasks.map((t) => t.kind), ['manzil']);
eq('and it starts from the very first memorized page',
   [noSabqi.tasks[0].from], [496]);

console.log('\n[edge cases]');
const tiny = { memFrom: 604, memTo: 604, sabqiCursor: 604, manzilCursor: 604 };
const tinyDay = planDay(tiny, cfg, 2);
ok('a single memorized page still schedules something', tinyDay.tasks.length >= 1);
ok('one page: nothing is older, so there is no manzil',
   !tinyDay.tasks.some((t) => t.kind === 'manzil'));
ok('manzilPool is null when everything fits in the sabqi window',
   manzilPool(tiny, cfg) === null);
const allNew = planDay(start, { ...cfg, sabqiWindowPages: 999 }, 2);
ok('an oversized sabqi window clamps to what is memorized',
   sabqiWindow(start, { ...cfg, sabqiWindowPages: 999 }).to === 604);
ok('and leaves no manzil pool', !allNew.tasks.some((t) => t.kind === 'manzil'));

console.log('\n[purity]');
const frozen = { memFrom: 496, memTo: 604, sabqiCursor: 496, manzilCursor: 506 };
const copy = JSON.parse(JSON.stringify(frozen));
planDay(frozen, cfg, 1); absorbSabaq(frozen, cfg, 495, 495); preview(frozen, cfg, 1, 10);
eq('planning never mutates the state it is given', frozen, copy);

console.log(`\n=== engine: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
