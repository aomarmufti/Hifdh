// Kinematics for the demonstration figure. Pure maths, shared by the canvas
// renderer and by the tests, which turn demo poses into synthetic landmarks.
//
// World units: the figure is ~1 tall, y points up, ground is y = 0.
// Side view faces +x. Limb angles are absolute and measured from straight down,
// positive towards +x, so a value of 90 points forward along the ground.

export const SEG = {
  torso: 0.28, neck: 0.045, head: 0.062,
  thigh: 0.24, shin: 0.24, ankle: 0.07, foot: 0.075, sole: 0.06,
  upper: 0.16, fore: 0.15,
  hipW: 0.085, shoulderW: 0.17,
};

const RAD = Math.PI / 180;
const dirDown = (deg) => [Math.sin(deg * RAD), -Math.cos(deg * RAD)];
const dirUp = (deg) => [Math.sin(deg * RAD), Math.cos(deg * RAD)];
const add = (p, d, l) => [p[0] + d[0] * l, p[1] + d[1] * l];

/** Two-bone IK: knee is placed on the counter-clockwise side of hip→foot. */
function solveLeg(hip, foot) {
  const L = SEG.thigh;
  let dx = foot[0] - hip[0], dy = foot[1] - hip[1];
  let d = Math.hypot(dx, dy);
  const max = 2 * L - 1e-4;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  const base = Math.atan2(dy, dx);
  const a = Math.acos(Math.min(1, d / (2 * L)));
  const knee = [hip[0] + Math.cos(base + a) * L, hip[1] + Math.sin(base + a) * L];
  const ankle = [hip[0] + dx, hip[1] + dy];
  return { knee, ankle };
}

function footPoints(ankle, knee, ankDeg = 90) {
  const shin = Math.atan2(ankle[0] - knee[0], -(ankle[1] - knee[1])) / RAD; // from-down angle
  const fd = dirDown(shin + ankDeg);
  const n = [fd[1], -fd[0]]; // clockwise normal: towards the sole
  const heel = add(add(ankle, fd, -0.02), n, SEG.sole);
  const toe = add(add(ankle, fd, SEG.foot), n, SEG.sole);
  return { heel, toe };
}

function sideLeg(pelvis, pose, s) {
  const foot = pose['foot' + s];
  let knee, ankle;
  if (foot) {
    ({ knee, ankle } = solveLeg(pelvis, foot));
  } else {
    const hipA = pose['hip' + s] ?? 0;
    const kneeA = pose['knee' + s] ?? 0;
    knee = add(pelvis, dirDown(hipA), SEG.thigh);
    ankle = add(knee, dirDown(hipA - kneeA), SEG.shin);
  }
  return { hip: pelvis, knee, ankle, ...footPoints(ankle, knee, pose['ank' + s]) };
}

function sideArm(shoulder, pose, s) {
  const sh = pose['sh' + s] ?? 0;
  const el = pose['el' + s] ?? 0;
  const elbow = add(shoulder, dirDown(sh), SEG.upper);
  const wrist = add(elbow, dirDown(sh + el), SEG.fore);
  return { shoulder, elbow, wrist };
}

/** Joint positions for a side-view or front-view pose. */
export function solve(pose, view = 'side') {
  return view === 'front' ? solveFront(pose) : solveSide(pose);
}

function solveSide(pose) {
  const pelvis = [pose.px ?? 0, pose.py ?? 0.548];
  const up = dirUp(pose.torso ?? 0);
  const shoulder = add(pelvis, up, SEG.torso);
  let head = add(shoulder, up, SEG.neck + SEG.head);
  if (head[1] < SEG.head) head = [head[0], SEG.head]; // rest the head on the floor
  // Offset near/far hips & shoulders a hair so landmarks are not coincident.
  const off = (p, k) => [p[0], p[1] + k];
  return {
    view: 'side',
    head,
    nose: add(head, dirDown(90 + (pose.torso ?? 0)), SEG.head * 0.9),
    N: { ...sideLeg(pelvis, pose, 'N'), ...sideArm(shoulder, pose, 'N') },
    F: { ...sideLeg(off(pelvis, 0.004), pose, 'F'), ...sideArm(off(shoulder, 0.004), pose, 'F') },
  };
}

function solveFront(pose) {
  const pelvis = [pose.px ?? 0, pose.py ?? 0.548];
  const t = pose.torso ?? 0;
  const up = dirUp(t);
  const across = [Math.cos(t * RAD), -Math.sin(t * RAD)];
  const neck = add(pelvis, up, SEG.torso);
  const head = add(neck, up, SEG.neck + SEG.head);
  const limb = (s, sign) => {
    const hip = add(pelvis, across, (sign * SEG.hipW) / 2);
    const hipA = pose['hip' + s] ?? 0;
    const kneeA = pose['knee' + s] ?? 0;
    const flex = pose['flex' + s] ?? 0; // thigh flexion towards camera, foreshortens
    const d = [sign * Math.sin(hipA * RAD), -Math.cos(hipA * RAD)];
    const knee = add(hip, d, SEG.thigh * Math.cos(flex * RAD));
    const shinTilt = Math.cos((flex - kneeA) * RAD);
    const ankle = add(knee, d, SEG.shin * Math.abs(shinTilt));
    const heel = add(ankle, [0, -1], SEG.sole);
    const toe = add(heel, [sign * 0.035, 0], 1);
    const shoulder = add(neck, across, (sign * SEG.shoulderW) / 2);
    const sh = pose['sh' + s] ?? 0;
    const el = pose['el' + s] ?? 0;
    const ad = (deg) => [sign * Math.sin(deg * RAD), -Math.cos(deg * RAD)];
    const elbow = add(shoulder, ad(sh), SEG.upper);
    const wrist = add(elbow, ad(sh + el), SEG.fore);
    return { hip, knee, ankle, heel, toe, shoulder, elbow, wrist };
  };
  // Screen-left limbs belong to the person's right side when they face the camera.
  return { view: 'front', head, nose: head, neck, R: limb('R', -1), L: limb('L', 1) };
}

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function lerpPose(a, b, k) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[key] ?? b[key], vb = b[key] ?? a[key];
    out[key] = Array.isArray(va)
      ? [va[0] + (vb[0] - va[0]) * k, va[1] + (vb[1] - va[1]) * k]
      : typeof va === 'number' ? va + (vb - va) * k : vb;
  }
  return out;
}

/** Pose and caption of a demo at time t (seconds). Loops over demo.duration. */
export function sample(demo, t) {
  const frames = demo.frames;
  const u = ((t % demo.duration) + demo.duration) % demo.duration / demo.duration;
  let i = 0;
  while (i < frames.length - 2 && u >= frames[i + 1].at) i++;
  const a = frames[i], b = frames[i + 1];
  const span = b.at - a.at || 1;
  const k = ease(Math.min(1, Math.max(0, (u - a.at) / span)));
  const pose = lerpPose({ ...demo.base, ...a.pose }, { ...demo.base, ...b.pose }, k);
  return { pose, label: (k < 0.5 ? a : b).label ?? a.label ?? '', phase: u };
}

/** World-space bounds over a full loop, for fitting the figure to its canvas. */
export function bounds(demo) {
  let x0 = Infinity, x1 = -Infinity, y0 = 0, y1 = -Infinity;
  const eat = (p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); };
  for (let i = 0; i <= 24; i++) {
    const j = solve(sample(demo, (i / 24) * demo.duration).pose, demo.view);
    eat([j.head[0] - SEG.head, j.head[1] + SEG.head]);
    eat([j.head[0] + SEG.head, j.head[1]]);
    for (const s of j.view === 'side' ? ['N', 'F'] : ['L', 'R']) Object.values(j[s]).forEach(eat);
  }
  for (const p of demo.props ?? []) {
    if (p.type === 'chair') { eat([p.x - 0.12, 0]); eat([p.x + 0.12, p.seat + 0.25]); }
    if (p.type === 'wall') { eat([p.x, 0]); }
    if (p.type === 'step') { eat([p.x0, p.h]); eat([p.x1, p.h]); }
  }
  return { x0, x1, y0, y1 };
}

/**
 * Convert solved joints to a MediaPipe-shaped landmark array, so the coaching
 * engine can be driven by the demo itself (tests, and the ?simulate mode).
 */
export function toLandmarks(j, { aspect = 4 / 3, span = 1.25, cx = 0, cy = 0.5 } = {}) {
  const P = (p) => ({ x: 0.5 + (p[0] - cx) / (span * aspect), y: 0.5 - (p[1] - cy) / span, visibility: 0.98 });
  const lm = Array.from({ length: 33 }, () => P(j.head));
  const [Ls, Rs] = j.view === 'side' ? ['N', 'F'] : ['L', 'R'];
  const put = (iL, iR, key) => { lm[iL] = P(j[Ls][key]); lm[iR] = P(j[Rs][key]); };
  lm[0] = P(j.nose);
  put(11, 12, 'shoulder'); put(13, 14, 'elbow'); put(15, 16, 'wrist');
  put(17, 18, 'wrist'); put(19, 20, 'wrist'); put(21, 22, 'wrist');
  put(23, 24, 'hip'); put(25, 26, 'knee'); put(27, 28, 'ankle');
  put(29, 30, 'heel'); put(31, 32, 'toe');
  return lm;
}
