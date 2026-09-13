// Engine unit tests. Run with: node test/engine.test.js
import {
  DEFAULT_CONFIG, memorizedPages, totalPages, sabqiPages, manzilPages,
  takeRun, describeRuns, labelForRun, nextNewPages, activeSurah,
  planDay, absorbSabaq, undoSabaq, cycleLengthDays, preview
} from '../public/lib/engine.js';
import { pagesForSurahRange, labelForPages, surahByNumber } from '../public/lib/quran.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b),
  `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// The real starting point: Ad-Dukhan (44) .. An-Nas (114) = pages 496-604
const r = pagesForSurahRange(44, 114);
const start = { memFrom: r.from, memTo: r.to, partialFrom: null, partialTo: null,
                sabqiCursor: r.from, manzilCursor: 0 };
const cfg = { ...DEFAULT_CONFIG };
// Most assertions are about Qur'an scheduling; Arabic rides alongside it.
const quran = (res) => res.tasks.filter((t) => t.kind !== 'arabic');
const kind = (res, k) => res.tasks.find((t) => t.kind === k);

console.log('\n[what is held]');
ok('109 pages held', totalPages(start) === 109, String(totalPages(start)));
eq('the block is contiguous', [memorizedPages(start)[0], memorizedPages(start)[108]], [496, 604]);
eq('sabqi window is the 10 newest pages', sabqiPages(start, cfg),
   [496,497,498,499,500,501,502,503,504,505]);
ok('manzil pool is the other 99', manzilPages(start, cfg).length === 99);
eq('manzil pool starts after the window', manzilPages(start, cfg)[0], 506);

const fwd = { ...cfg, direction: 'forward' };
eq('forward: sabqi window is the far end', sabqiPages(start, fwd),
   [595,596,597,598,599,600,601,602,603,604]);
eq('forward: manzil pool ends before it', manzilPages(start, fwd).slice(-1), [594]);

console.log('\n[memorizing backwards means surah by surah, each learned forwards]');
// Having finished Ad-Dukhan you do NOT start at the last page of Az-Zukhruf.
eq('the next new page is the FIRST page of Az-Zukhruf', nextNewPages(start, cfg),
   { from: 489, to: 489 });
ok('which is p489, not p495', nextNewPages(start, cfg).from === surahByNumber(43).page);
eq('the surah in progress is named', activeSurah(start, cfg).name, 'Az-Zukhruf');

let s = { ...start };
const order = [];
for (let i = 0; i < 16; i++) {
  const np = nextNewPages(s, cfg);
  if (!np) break;
  order.push(np.from);
  s = absorbSabaq(s, cfg, np.from, np.to);
}
eq('pages are taken forwards through each surah, surahs descending',
   order, [489,490,491,492,493,494,495, 483,484,485,486,487,488, 477,478,479]);
ok('Az-Zukhruf is finished before Ash-Shura is opened',
   order.indexOf(495) < order.indexOf(483));
ok('Ash-Shura opens at its own first page',
   order[7] === surahByNumber(42).page, String(order[7]));
ok('Fussilat opens at its own first page',
   order[13] === surahByNumber(41).page, String(order[13]));

console.log('\n[the gap while a surah is in progress]');
let mid = { ...start };
for (const p of [489, 490, 491]) mid = absorbSabaq(mid, cfg, p, p);
eq('the block has not moved yet', [mid.memFrom, mid.memTo], [496, 604]);
eq('the part-learned surah is tracked separately', [mid.partialFrom, mid.partialTo], [489, 491]);
ok('112 pages are held', totalPages(mid) === 112, String(totalPages(mid)));
ok('the unlearned middle of the surah is NOT counted as held',
   !memorizedPages(mid).includes(492) && !memorizedPages(mid).includes(495));
eq('the sabqi window straddles the gap', sabqiPages(mid, cfg),
   [489,490,491,496,497,498,499,500,501,502]);
eq('and is described as two honest runs, not one false span',
   describeRuns(sabqiPages(mid, cfg)).map((x) => [x.from, x.to, x.label]),
   [[489, 491, 'Az-Zukhruf'], [496, 502, 'Ad-Dukhan → Al-Ahqaf']]);
ok('the label names both', labelForRun(sabqiPages(mid, cfg)) === 'Az-Zukhruf · Ad-Dukhan → Al-Ahqaf',
   labelForRun(sabqiPages(mid, cfg)));

console.log('\n[closing the gap]');
let closing = { ...mid };
for (const p of [492, 493, 494]) closing = absorbSabaq(closing, cfg, p, p);
ok('still open one page short', closing.partialTo === 494 && closing.memFrom === 496);
closing = absorbSabaq(closing, cfg, 495, 495);
eq('the last page of the surah merges the two ranges',
   [closing.memFrom, closing.memTo, closing.partialFrom, closing.partialTo],
   [489, 604, null, null]);
ok('116 pages held, contiguous', totalPages(closing) === 116 &&
   memorizedPages(closing).length === closing.memTo - closing.memFrom + 1);

console.log('\n[un-ticking a new page]');
let u = absorbSabaq(start, cfg, 489, 489);
eq('undo removes the prefix entirely when it was the only page',
   [undoSabaq(u, cfg, 489, 489).partialFrom, undoSabaq(u, cfg, 489, 489).memFrom],
   [null, 496]);
let u2 = { ...mid };                          // partial 489-491
eq('undo shrinks a longer prefix',
   [undoSabaq(u2, cfg, 491, 491).partialFrom, undoSabaq(u2, cfg, 491, 491).partialTo],
   [489, 490]);
const merged = absorbSabaq({ ...mid, partialTo: 494 }, cfg, 495, 495);
eq('the merge happened', [merged.memFrom, merged.partialFrom], [489, null]);
const reopened = undoSabaq(merged, cfg, 495, 495);
eq('undoing the page that closed the gap re-opens it',
   [reopened.memFrom, reopened.partialFrom, reopened.partialTo], [496, 489, 494]);
ok('and the page count goes back down',
   totalPages(reopened) === totalPages({ ...mid, partialTo: 494 }),
   `${totalPages(reopened)} vs ${totalPages({ ...mid, partialTo: 494 })}`);
eq('forward undo just steps the block back',
   undoSabaq({ ...start, memTo: 605 }, fwd, 605, 605).memTo, 604);

console.log('\n[chunking]');
eq('takes a chunk from the cursor',
   takeRun([506,507,508,509,510], 506, 3),
   { pages: [506,507,508], from: 506, to: 508, nextCursor: 509, completesCycle: false });
eq('stops at the end of the pool rather than wrapping mid-chunk',
   takeRun([506,507,508], 507, 9),
   { pages: [507,508], from: 507, to: 508, nextCursor: 506, completesCycle: true });
eq('a cursor outside the pool restarts it',
   takeRun([506,507,508], 999, 2),
   { pages: [506,507], from: 506, to: 507, nextCursor: 508, completesCycle: false });
ok('an empty pool yields nothing', takeRun([], 1, 8) === null);
ok('zero pages a day yields nothing', takeRun([1,2,3], 1, 0) === null);

console.log('\n[a single day]');
const mon = planDay(start, cfg, 1);     // Monday = lesson day
eq('Monday kinds', quran(mon).map((t) => t.kind), ['sabaq', 'sabqi', 'manzil']);
eq('Monday sabaq is Az-Zukhruf p489', [kind(mon, 'sabaq').from, kind(mon, 'sabaq').label],
   [489, 'Az-Zukhruf']);
eq('Monday manzil opens the rotation', [kind(mon, 'manzil').from, kind(mon, 'manzil').to],
   [506, 513]);
eq('Tuesday has no sabaq', quran(planDay(start, cfg, 2)).map((t) => t.kind), ['sabqi', 'manzil']);
eq('a rest day schedules no Qur’an work', quran(planDay(start, { ...cfg, restDays: [6] }, 6)), []);
eq('a rest day that is also a lesson day still gets the lesson',
   quran(planDay(start, { ...cfg, restDays: [1] }, 1)).map((t) => t.kind), ['sabaq']);

console.log('\n[the cursor is the memory - missing a day cannot desync]');
let c1 = planDay(start, cfg, 2); let st = c1.next;
let c2 = planDay(st, cfg, 3);    st = c2.next;
eq('day 1 manzil', [kind(c1, 'manzil').from, kind(c1, 'manzil').to], [506, 513]);
eq('day 2 continues from it', [kind(c2, 'manzil').from, kind(c2, 'manzil').to], [514, 521]);
const man = (res) => [kind(res, 'manzil').from, kind(res, 'manzil').to];
eq('after skipping days it resumes where it stopped', man(planDay(st, cfg, 5)), [522, 529]);
eq('the same state gives the same portion on any weekday',
   [3,4,6,7].map((wd) => man(planDay(st, cfg, wd))),
   [[522,529],[522,529],[522,529],[522,529]]);

console.log('\n[a full rotation covers everything exactly once]');
let rot = { ...start }, seen = [], days = 0, cycled = false;
while (days < 400 && !cycled) {
  const res = planDay(rot, cfg, (days % 7) + 1);
  const m = kind(res, 'manzil');
  if (m) { seen.push(...m.pages); if (m.completesCycle) cycled = true; }
  rot = res.next; days++;
}
ok('the rotation completes', cycled);
ok('99 pages covered', seen.length === 99, String(seen.length));
ok('no page seen twice', new Set(seen).size === seen.length);
ok('nothing outside the pool', seen.every((p) => p >= 506 && p <= 604));
ok('it took 13 days at 8 pages a day', days === 13, String(days));

console.log('\n[cycle projection matches the simulation]');
ok('projected 13 days', cycleLengthDays(start, cfg).revisionDays === 13,
   JSON.stringify(cycleLengthDays(start, cfg)));
ok('halving the daily pages roughly doubles it',
   cycleLengthDays(start, { ...cfg, manzilPagesPerDay: 4 }).revisionDays === 25);
const withRest = cycleLengthDays(start, { ...cfg, restDays: [6, 7] });
ok('rest days stretch the calendar, not the work',
   withRest.revisionDays === 13 && withRest.calendarDays > 13, JSON.stringify(withRest));

console.log('\n[two lessons a week is two new pages a week]');
const wk = preview(start, cfg, 1, 14);
const fresh = wk.flatMap((d) => d.tasks.filter((t) => t.kind === 'sabaq'));
ok('14 days holds 4 lessons', fresh.length === 4, String(fresh.length));
ok('only on Monday and Friday',
   wk.every((d) => !d.tasks.some((t) => t.kind === 'sabaq') || [1,5].includes(d.isoWeekday)));
eq('and they walk forwards through Az-Zukhruf', fresh.map((t) => t.from), [489, 490, 491, 492]);

console.log('\n[settings change the plan]');
eq('20 pages a day gives a 20-page portion',
   kind(planDay(start, { ...cfg, manzilPagesPerDay: 20 }, 2), 'manzil').pages.length, 20);
const noSabqi = planDay(start, { ...cfg, sabqiWindowPages: 0 }, 2);
eq('no sabqi window means manzil covers everything',
   quran(noSabqi).map((t) => t.kind), ['manzil']);
eq('starting at the very first page held', kind(noSabqi, 'manzil').from, 496);

console.log('\n[arabic]');
const ar = { ...cfg, arabicText: 'Madinah Book 2, lesson 7' };
eq('arabic carries the text you set', kind(planDay(start, ar, 2), 'arabic').label,
   'Madinah Book 2, lesson 7');
eq('and no page range', kind(planDay(start, ar, 2), 'arabic').pages, []);
ok('blank text falls back', kind(planDay(start, cfg, 2), 'arabic').label === 'Arabic study');
ok('arabic can be switched off',
   !kind(planDay(start, { ...ar, arabicEnabled: false }, 2), 'arabic'));
eq('arabic follows its own days',
   planDay(start, { ...ar, arabicDays: [1,2,3,4,5] }, 7).tasks.map((t) => t.kind),
   ['sabqi', 'manzil']);
ok('a Qur’an rest day can still be an arabic day',
   planDay(start, { ...ar, restDays: [6] }, 6).tasks.map((t) => t.kind).join() === 'arabic');
ok('arabic never moves the rotation cursors',
   planDay(start, ar, 2).next.manzilCursor === planDay(start, cfg, 2).next.manzilCursor);

console.log('\n[edge cases]');
const one = { memFrom: 604, memTo: 604, partialFrom: null, partialTo: null,
              sabqiCursor: 604, manzilCursor: 604 };
ok('a single page still schedules something', quran(planDay(one, cfg, 2)).length >= 1);
ok('one page: nothing is older, so no manzil', !kind(planDay(one, cfg, 2), 'manzil'));
ok('an oversized sabqi window clamps to what is held',
   sabqiPages(start, { ...cfg, sabqiWindowPages: 999 }).length === 109);
ok('and leaves no manzil pool',
   manzilPages(start, { ...cfg, sabqiWindowPages: 999 }).length === 0);
ok('nothing left to memorize at page 1',
   nextNewPages({ ...start, memFrom: 1 }, cfg) === null);
ok('forward direction still walks pages up',
   nextNewPages({ ...start, memTo: 500 }, fwd).from === 501);
ok('forward stops at the end of the mushaf',
   nextNewPages({ ...start, memTo: 604 }, fwd) === null);

console.log('\n[purity]');
const frozen = { memFrom: 496, memTo: 604, partialFrom: 489, partialTo: 491,
                 sabqiCursor: 496, manzilCursor: 506 };
const copy = JSON.parse(JSON.stringify(frozen));
planDay(frozen, cfg, 1); absorbSabaq(frozen, cfg, 492, 492); preview(frozen, cfg, 1, 10);
eq('planning never mutates the state it is given', frozen, copy);

console.log(`\n=== engine: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
