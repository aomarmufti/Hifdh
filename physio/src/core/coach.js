// The coaching engine: landmarks in, reps / holds / cues out. No DOM.

import { makeBody, clamp } from './geometry.js';
import { RepCounter, HoldTimer, scoreRep } from './reps.js';

const FAULT_FRAMES = 6;        // a fault must persist ~200ms before we call it
const VIS_MIN = 0.5;
const CUE = {
  tempo: 'Slow down — control the movement',
  eccentric: 'Lower slower — take three seconds',
  partial: 'Almost — go a little further',
  frame: 'Step back so your whole body is in view',
  holdBreak: 'Back into position — the timer is paused',
};
const PRAISE = ['Great rep', 'Nice and controlled', 'Perfect form', 'Strong', 'That’s it'];

export class Coach {
  /** @param ex exercise definition, @param dose {reps|hold} */
  constructor(ex, dose = {}) {
    this.ex = ex;
    this.dose = dose;
    this.span = ex.target - ex.rest;
    this.counter = ex.type === 'reps'
      ? new RepCounter({ min: ex.min ?? 0.7, minSeconds: ex.tempo?.minSeconds ?? 0.8, minLowerSeconds: ex.tempo?.minLowerSeconds ?? 0 })
      : new HoldTimer({ zone: ex.zone ?? 0.8, target: dose.hold ?? ex.defaults.hold ?? 30 });
    this.reset();
  }

  reset() {
    this.counter.reset();
    this.smooth = null;
    this.side = null;
    this.faultRun = {};
    this.cue = null;
    this.reps = [];          // [{score, peak, faults, value}]
    this.bestValue = null;
    this.tracking = false;
  }

  progressOf(v) {
    return (v - this.ex.rest) / this.span;
  }

  /** Choose which side is working: the one further towards the target. */
  pickSide(lms, aspect) {
    const ex = this.ex;
    if (ex.sides === 'none') return makeBody(lms, aspect, 'L');
    const keep = this.counter.phase === 'active' || this.counter.inZone;
    if (keep && this.side) return makeBody(lms, aspect, this.side);
    const bodies = ['L', 'R'].map((s) => makeBody(lms, aspect, s));
    const visible = bodies.filter((b) => b.vis(...ex.needs) >= VIS_MIN);
    const pool = visible.length ? visible : bodies;
    const eligible = ex.candidate ? pool.filter(ex.candidate) : pool;
    const ranked = (eligible.length ? eligible : pool)
      .map((b) => ({ b, p: this.progressOf(ex.measure(b)) }))
      .sort((x, y) => y.p - x.p);
    return ranked[0].b;
  }

  /** Is the working side fully in view? Used before a set starts. */
  visible(lms, aspect = 1) {
    if (!lms) return false;
    return this.pickSide(lms, aspect).vis(...this.ex.needs) >= VIS_MIN;
  }

  /** Start a new set: counting restarts, history and best range are kept. */
  nextSet() {
    this.counter.reset();
    this.smooth = null;
    this.faultRun = {};
    this.cue = null;
  }

  /**
   * Feed one frame.
   * @returns {{tracking, progress, value, display, cue, events}}
   */
  update(lms, t, aspect = 1) {
    const events = [];
    if (!lms) {
      this.tracking = false;
      return this.state(events, { cue: { text: 'Step into view to begin', tone: 'info' } });
    }
    const ex = this.ex;
    const b = this.pickSide(lms, aspect);
    const visible = b.vis(...ex.needs) >= VIS_MIN;
    this.tracking = visible;
    if (!visible) return this.state(events, { cue: { text: CUE.frame, tone: 'info' } });
    this.side = b.side;

    const raw = ex.measure(b);
    this.smooth = this.smooth == null ? raw : this.smooth + (raw - this.smooth) * 0.45;
    const value = this.smooth;
    const progress = clamp(this.progressOf(value), -0.5, 1.6);

    // Form rules, debounced so single noisy frames don't nag.
    const active = this.counter.phase === 'active' || this.counter.inZone || progress > 0.3;
    let fault = null;
    for (const r of ex.rules) {
      const on = (r.when === 'always' || active) && r.test(b);
      this.faultRun[r.id] = on ? (this.faultRun[r.id] ?? 0) + 1 : 0;
      if (this.faultRun[r.id] >= FAULT_FRAMES) {
        fault ??= r;
        if (this.counter.fault) this.counter.fault(r.id);
      }
    }
    if (fault) this.say(fault.cue, 'warn', t, 1.6);

    if (active && (this.bestValue == null || this.progressOf(value) > this.progressOf(this.bestValue))) this.bestValue = value;

    const ev = this.counter.update(progress, t);
    if (ev) {
      events.push(ev);
      if (ev.type === 'rep') {
        const score = scoreRep(ev, ex.min ?? 0.7);
        this.reps.push({ score, peak: ev.peak, faults: ev.faults });
        ev.score = score;
        const named = ev.faults.find((f) => CUE[f]);
        if (named) this.say(CUE[named], 'warn', t, 2.2);
        else if (ev.faults.length) this.say('Rep counted — watch your form', 'warn', t, 1.8);
        else this.say(score >= 95 ? PRAISE[ev.count % PRAISE.length] : 'Good — reach a little further next time', score >= 95 ? 'good' : 'info', t, 1.6);
      } else if (ev.type === 'partial') {
        this.say(CUE.partial, 'info', t, 2);
      } else if (ev.type === 'hold-start') {
        this.say('Hold it there', 'good', t, 1.5);
      } else if (ev.type === 'hold-break') {
        this.say(CUE.holdBreak, 'warn', t, 2);
      } else if (ev.type === 'hold-done') {
        this.say('Done — relax', 'good', t, 2);
      }
    }
    if (this.cue && t > this.cue.until) this.cue = null;
    return this.state(events, { value, progress });
  }

  say(text, tone, t, seconds) {
    if (this.cue && this.cue.text === text) { this.cue.until = t + seconds; return; }
    // A warning is never replaced by praise while it is still showing.
    if (this.cue && this.cue.tone === 'warn' && tone !== 'warn' && t < this.cue.until) return;
    this.cue = { text, tone, until: t + seconds, at: t };
  }

  state(events, extra = {}) {
    const ex = this.ex;
    const value = extra.value ?? this.smooth;
    return {
      tracking: this.tracking,
      side: this.side,
      progress: extra.progress ?? 0,
      value,
      display: value == null ? null : formatValue(ex, value),
      cue: extra.cue ?? this.cue,
      reps: ex.type === 'reps' ? this.counter.count : null,
      held: ex.type === 'hold' ? this.counter.held : null,
      inZone: ex.type === 'hold' ? this.counter.inZone : null,
      events,
    };
  }

  /** Summary of everything since the last reset. */
  summary() {
    const ex = this.ex;
    const scores = this.reps.map((r) => r.score);
    return {
      reps: ex.type === 'reps' ? this.counter.count : (this.counter.done ? 1 : 0),
      held: ex.type === 'hold' ? Math.round(this.counter.held) : null,
      form: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      best: this.bestValue == null ? null : formatValue(ex, this.bestValue),
      bestNumber: this.bestValue == null ? null : displayNumber(ex, this.bestValue),
    };
  }
}

export function displayNumber(ex, v) {
  const fn = ex.display?.fn;
  if (fn) return Math.round(fn(v));
  return Math.round(clamp((v - ex.rest) / (ex.target - ex.rest), 0, 1.5) * 100);
}

export function formatValue(ex, v) {
  return `${displayNumber(ex, v)}${ex.display?.unit ?? ''}`;
}
