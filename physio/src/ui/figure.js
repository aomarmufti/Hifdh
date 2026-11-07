// Canvas renderer for the demonstration figure.

import { solve, sample, bounds, SEG } from '../core/skeleton.js';

const css = (el, name, fallback) => getComputedStyle(el).getPropertyValue(name).trim() || fallback;

function palette(el) {
  return {
    body: css(el, '--fig-body', '#5f6368'),
    far: css(el, '--fig-far', '#c4c7c5'),
    focus: css(el, '--fig-focus', '#0b57d0'),
    prop: css(el, '--fig-prop', '#dadce0'),
    ground: css(el, '--fig-ground', '#e3e8ef'),
    ghost: css(el, '--fig-ghost', 'rgba(11,87,208,.14)'),
  };
}

function fit(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 200;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/** Pose shown as the faint "target" ghost: the frame furthest into the movement. */
function ghostPose(demo) {
  const f = demo.frames[Math.min(2, demo.frames.length - 1)];
  return { ...demo.base, ...f.pose };
}

function draw(canvas, demo, pose, opts = {}) {
  const { ctx, w, h } = fit(canvas);
  const c = opts.colors ?? palette(canvas);
  const b = opts.box ?? bounds(demo);
  const pad = opts.pad ?? 0.16;
  const bw = b.x1 - b.x0 + pad * 2, bh = b.y1 - b.y0 + pad * 1.6;
  const s = Math.min(w / bw, h / bh);
  const ox = w / 2 - ((b.x0 + b.x1) / 2) * s;
  const groundY = h / 2 + (bh * s) / 2 - pad * 0.5 * s;
  const X = (p) => ox + p[0] * s, Y = (p) => groundY - p[1] * s;
  const lw = Math.max(2.5, s * 0.042);

  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Ground and props
  ctx.strokeStyle = c.ground; ctx.lineWidth = Math.max(1.5, s * 0.006);
  ctx.beginPath(); ctx.moveTo(0, groundY + lw / 2); ctx.lineTo(w, groundY + lw / 2); ctx.stroke();
  for (const p of demo.props ?? []) drawProp(ctx, p, { X, Y, s, b, c, lw, groundY });

  const seg = (a, z, color, width = lw) => {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(z), Y(z)); ctx.stroke();
  };
  const focus = new Set(demo.focus ?? []);

  const figure = (j, ghost) => {
    const col = (key, base) => (ghost ? c.ghost : focus.has(key) ? c.focus : base);
    const limbs = j.view === 'side' ? [['F', c.far], ['N', c.body]] : [['R', c.body], ['L', c.body]];
    const leg = (L, key, base) => {
      seg(L.hip, L.knee, col(key, base)); seg(L.knee, L.ankle, col(key, base));
      seg(L.heel, L.toe, col(key, base), lw * 0.8); seg(L.ankle, L.heel, col(key, base), lw * 0.8);
    };
    const arm = (L, key, base) => { seg(L.shoulder, L.elbow, col(key, base), lw * 0.9); seg(L.elbow, L.wrist, col(key, base), lw * 0.85); };
    const torsoCol = col('torso', c.body);
    if (j.view === 'side') {
      leg(j.F, 'legF', c.far); arm(j.F, 'armF', c.far);
      seg(j.N.hip, j.N.shoulder, torsoCol, lw * 1.5);
      leg(j.N, 'legN', c.body); arm(j.N, 'armN', c.body);
    } else {
      for (const [k] of limbs) leg(j[k], 'leg' + k, c.body);
      seg(j.R.hip, j.L.hip, torsoCol, lw * 1.1);
      seg([(j.R.hip[0] + j.L.hip[0]) / 2, (j.R.hip[1] + j.L.hip[1]) / 2], j.neck, torsoCol, lw * 1.5);
      seg(j.R.shoulder, j.L.shoulder, torsoCol, lw * 1.1);
      for (const [k] of limbs) arm(j[k], 'arm' + k, c.body);
    }
    ctx.fillStyle = ghost ? c.ghost : c.body;
    ctx.beginPath(); ctx.arc(X(j.head), Y(j.head), SEG.head * s, 0, Math.PI * 2); ctx.fill();
    if (!ghost) {
      // Joint markers on the focus limbs
      ctx.fillStyle = c.focus;
      for (const key of focus) {
        const L = key.startsWith('leg') ? j[key.slice(3)] : key.startsWith('arm') ? j[key.slice(3)] : null;
        if (!L) continue;
        const pts = key.startsWith('leg') ? [L.hip, L.knee, L.ankle] : [L.shoulder, L.elbow];
        for (const p of pts) { ctx.beginPath(); ctx.arc(X(p), Y(p), lw * 0.62, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  };

  if (opts.ghost !== false) figure(solve(ghostPose(demo), demo.view), true);
  figure(solve(pose, demo.view), false);
}

function drawProp(ctx, p, { X, Y, s, b, c, lw, groundY }) {
  ctx.strokeStyle = c.prop; ctx.fillStyle = c.prop;
  if (p.type === 'mat') {
    const x0 = X([b.x0 - 0.05, 0]), x1 = X([b.x1 + 0.05, 0]);
    roundRect(ctx, x0, groundY - s * 0.012, x1 - x0, s * 0.014 + lw / 2, s * 0.008); ctx.fill();
  } else if (p.type === 'chair') {
    ctx.lineWidth = Math.max(2, s * 0.018);
    const l = p.x - 0.11, r = p.x + 0.11;
    ctx.beginPath();
    ctx.moveTo(X([l, p.seat]), Y([l, p.seat])); ctx.lineTo(X([r, p.seat]), Y([r, p.seat]));
    ctx.moveTo(X([l + 0.01, p.seat]), Y([0, p.seat])); ctx.lineTo(X([l + 0.01, 0]), groundY);
    ctx.moveTo(X([r - 0.01, p.seat]), Y([0, p.seat])); ctx.lineTo(X([r - 0.01, 0]), groundY);
    const bx = p.back ? l + 0.01 : l + 0.01;
    ctx.moveTo(X([bx, p.seat]), Y([0, p.seat])); ctx.lineTo(X([bx, 0]), Y([0, p.seat + 0.36]));
    ctx.stroke();
  } else if (p.type === 'wall') {
    ctx.lineWidth = Math.max(3, s * 0.03);
    ctx.beginPath(); ctx.moveTo(X([p.x, 0]), groundY); ctx.lineTo(X([p.x, 0]), Y([0, 1.15])); ctx.stroke();
  } else if (p.type === 'step') {
    roundRect(ctx, X([p.x0, 0]), Y([0, p.h]), (p.x1 - p.x0) * s, p.h * s + lw / 2, s * 0.01); ctx.fill();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Static frame — used for thumbnails. `at` is the point in the loop (0–1). */
export function drawStill(canvas, demo, at = 0.45, opts = {}) {
  const t = at * demo.duration;
  draw(canvas, demo, sample(demo, t).pose, { ghost: false, pad: 0.1, ...opts });
}

/** Looping animation. onLabel(text, phase) fires as the caption changes. */
export class FigurePlayer {
  constructor(canvas, demo, { onLabel, speed = 1 } = {}) {
    Object.assign(this, { canvas, demo, onLabel, speed });
    this.box = bounds(demo);
    this.t0 = performance.now();
    this.label = null;
    this.colors = palette(canvas);
    this.running = false;
  }
  start() {
    if (this.running) return;
    this.running = true;
    const tick = (now) => {
      if (!this.running) return;
      const t = ((now - this.t0) / 1000) * this.speed;
      const { pose, label, phase } = sample(this.demo, t);
      draw(this.canvas, this.demo, pose, { box: this.box, colors: this.colors });
      if (label !== this.label) { this.label = label; this.onLabel?.(label, phase); }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  /** Current demo pose — used by the simulated camera. */
  poseAt(now = performance.now()) {
    return sample(this.demo, ((now - this.t0) / 1000) * this.speed).pose;
  }
  restyle() { this.colors = palette(this.canvas); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
}
