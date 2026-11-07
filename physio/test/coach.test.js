// The demo figure is the reference movement. Driving the coach with it checks
// that every exercise's thresholds, side selection and form rules agree with
// what we show people: a perfect demo must count perfectly, with no faults.

import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES } from '../src/data/exercises.js';
import { solve, sample, toLandmarks } from '../src/core/skeleton.js';
import { Coach } from '../src/core/coach.js';
import { RepCounter, HoldTimer, scoreRep } from '../src/core/reps.js';

const FPS = 30;

function drive(ex, coach, seconds, { mirror = false, slow = 1 } = {}) {
  const events = [];
  const cues = new Set();
  for (let i = 0; i <= seconds * FPS; i++) {
    const t = i / FPS;
    const { pose } = sample(ex.demo, t / slow);
    let lm = toLandmarks(solve(pose, ex.demo.view));
    if (mirror) lm = lm.map((p) => ({ ...p, x: 1 - p.x }));
    const s = coach.update(lm, t, 4 / 3);
    events.push(...s.events);
    if (s.cue?.tone === 'warn') cues.add(s.cue.text);
  }
  return { events, cues };
}

for (const ex of Object.values(EXERCISES)) {
  test(`${ex.id}: demo is counted cleanly`, () => {
    if (ex.type === 'reps') {
      const coach = new Coach(ex, { reps: 10 });
      const loops = 3;
      // Slow the demo down 1.4× so tempo checks see a realistic pace.
      const { events, cues } = drive(ex, coach, ex.demo.duration * loops * 1.4, { slow: 1.4 });
      const reps = events.filter((e) => e.type === 'rep');
      assert.equal(reps.length, loops, `expected ${loops} reps, got ${reps.length}`);
      assert.deepEqual([...cues], [], 'no form warnings on a perfect demo');
      for (const r of reps) assert.ok(r.score >= 95, `rep score ${r.score}`);
    } else {
      const coach = new Coach(ex, { hold: 2 });
      const { events, cues } = drive(ex, coach, ex.demo.duration);
      assert.ok(events.some((e) => e.type === 'hold-done'), 'hold completes');
      assert.deepEqual([...cues], []);
    }
  });

  test(`${ex.id}: mirrored camera counts the same`, () => {
    if (ex.type !== 'reps') return;
    const coach = new Coach(ex, { reps: 10 });
    const { events } = drive(ex, coach, ex.demo.duration * 2 * 1.4, { mirror: true, slow: 1.4 });
    assert.equal(events.filter((e) => e.type === 'rep').length, 2);
  });
}

test('standing still never counts a rep', () => {
  const ex = EXERCISES['mini-squat'];
  const coach = new Coach(ex);
  const lm = toLandmarks(solve(ex.demo.base, 'side'));
  for (let i = 0; i < 300; i++) assert.deepEqual(coach.update(lm, i / FPS, 4 / 3).events, []);
});

test('no person in frame asks the user to step in', () => {
  const s = new Coach(EXERCISES['mini-squat']).update(null, 0);
  assert.equal(s.tracking, false);
  assert.match(s.cue.text, /step into view/i);
});

test('rep counter: partial reps are not counted', () => {
  const c = new RepCounter({ min: 0.7 });
  const seq = [0, 0.4, 0.6, 0.5, 0.1, 0];
  const evs = seq.map((p, i) => c.update(p, i)).filter(Boolean);
  assert.equal(evs[0].type, 'partial');
  assert.equal(c.count, 0);
});

test('rep counter: rushing a rep is flagged as tempo', () => {
  const c = new RepCounter({ minSeconds: 1 });
  [0, 0.5, 1, 0.5, 0].forEach((p, i) => c.update(p, i * 0.1));
  const ev = [0.4, 1, 0.05].map((p, i) => c.update(p, 1 + i * 0.1)).filter(Boolean)[0];
  assert.ok(ev.faults.includes('tempo'));
});

test('hold timer forgives a brief wobble but pauses on a real break', () => {
  const h = new HoldTimer({ zone: 0.8, target: 10, grace: 0.5 });
  for (let t = 0; t <= 3; t += 0.1) h.update(1, t);
  h.update(0.5, 3.1); h.update(1, 3.3);
  assert.ok(h.inZone);
  for (let t = 3.4; t <= 5; t += 0.1) h.update(0.2, t);
  assert.equal(h.inZone, false);
  const before = h.held;
  h.update(0.2, 5.2);
  assert.equal(h.held, before);
});

test('scores: full clean rep is 100, faults cost points', () => {
  assert.equal(scoreRep({ peak: 1.1, faults: [] }), 100);
  assert.ok(scoreRep({ peak: 1.1, faults: ['lean'] }) < 100);
  assert.ok(scoreRep({ peak: 0.75, faults: [] }) < scoreRep({ peak: 0.95, faults: [] }));
});
