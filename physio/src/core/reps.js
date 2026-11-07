// Rep and hold state machines. They see only "progress": 0 at the rest
// position, 1 at the target position. Direction and units live in the exercise.

/**
 * Counts reps from a stream of progress values.
 * A rep starts when progress rises past `start`, and completes when it falls
 * back under `end`. It counts if its peak reached `min`; it is "full" at 1.
 */
export class RepCounter {
  constructor({ start = 0.3, end = 0.12, min = 0.7, minSeconds = 0.8, minLowerSeconds = 0 } = {}) {
    Object.assign(this, { start, end, min, minSeconds, minLowerSeconds });
    this.reset();
  }

  reset() {
    this.count = 0;
    this.phase = 'rest';
    this.peak = 0;
    this.t0 = 0;
    this.tPeak = 0;
    this.faults = new Set();
  }

  /** Mark a form fault against the rep in progress. */
  fault(id) {
    if (this.phase === 'active') this.faults.add(id);
  }

  /** @returns {null | {type:'rep'|'partial', peak, seconds, lowerSeconds, faults:string[], count}} */
  update(p, t) {
    if (this.phase === 'rest') {
      if (p >= this.start) {
        this.phase = 'active';
        this.peak = p;
        this.t0 = t;
        this.tPeak = t;
        this.faults = new Set();
      }
      return null;
    }
    if (p > this.peak) { this.peak = p; this.tPeak = t; }
    if (p > this.end) return null;

    this.phase = 'rest';
    const ev = {
      peak: this.peak,
      seconds: t - this.t0,
      lowerSeconds: t - this.tPeak,
      faults: [...this.faults],
    };
    if (this.peak < this.min) return { type: 'partial', ...ev, count: this.count };
    if (ev.seconds < this.minSeconds) ev.faults.push('tempo');
    if (this.minLowerSeconds && ev.lowerSeconds < this.minLowerSeconds) ev.faults.push('eccentric');
    this.count += 1;
    return { type: 'rep', ...ev, count: this.count };
  }
}

/** Accumulates time spent holding a position at or beyond `zone` progress. */
export class HoldTimer {
  constructor({ zone = 0.8, target = 30, grace = 0.6 } = {}) {
    Object.assign(this, { zone, target, grace });
    this.reset();
  }

  reset() {
    this.held = 0;
    this.last = null;
    this.outSince = null;
    this.inZone = false;
    this.done = false;
  }

  /** @returns {null | {type:'hold-start'|'hold-break'|'hold-done'}} */
  update(p, t) {
    const dt = this.last == null ? 0 : Math.min(0.25, t - this.last);
    this.last = t;
    if (this.done) return null;
    if (p >= this.zone) {
      this.outSince = null;
      const started = !this.inZone;
      this.inZone = true;
      this.held += dt;
      if (this.held >= this.target) { this.done = true; return { type: 'hold-done' }; }
      return started ? { type: 'hold-start' } : null;
    }
    if (this.inZone) {
      // Brief wobbles out of position are forgiven.
      this.outSince ??= t;
      if (t - this.outSince < this.grace) { this.held += dt; return null; }
      this.inZone = false;
      return { type: 'hold-break' };
    }
    return null;
  }
}

/** Score 0–100 for one rep: depth first, minus deductions for each fault. */
export function scoreRep({ peak, faults = [] }, min = 0.7) {
  const depth = peak >= 1 ? 100 : 60 + 40 * Math.max(0, (peak - min) / (1 - min));
  return Math.max(0, Math.round(depth - 12 * new Set(faults).size));
}
