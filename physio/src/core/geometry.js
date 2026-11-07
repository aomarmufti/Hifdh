// Pure 2D geometry on pose landmarks. No DOM, so it runs under Node for tests.

/** MediaPipe Pose landmark indices, as [left, right] pairs where they exist. */
export const LM = {
  nose: 0,
  shoulder: [11, 12],
  elbow: [13, 14],
  wrist: [15, 16],
  hip: [23, 24],
  knee: [25, 26],
  ankle: [27, 28],
  heel: [29, 30],
  foot: [31, 32],
};

/** Skeleton edges drawn over the camera feed. */
export const EDGES = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

const DEG = 180 / Math.PI;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Interior angle at b, in degrees, 0–180. */
export function angle(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (!n) return 0;
  return Math.acos(clamp((v1x * v2x + v1y * v2y) / n, -1, 1)) * DEG;
}

/** Angle of the segment a→b away from straight down (image y grows downward), 0–180. */
export function fromDown(a, b) {
  return angle({ x: a.x, y: a.y + 1 }, a, b);
}

/** Angle of the segment a→b away from straight up, 0–180. */
export function fromUp(a, b) {
  return angle({ x: a.x, y: a.y - 1 }, a, b);
}

export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });

/**
 * A side-aware view over one frame of landmarks.
 * Landmarks are normalised image coordinates; x is scaled by the aspect ratio so
 * angles are measured in true proportions rather than squashed by the frame.
 */
export function makeBody(landmarks, aspect = 1, side = 'L') {
  const k = side === 'L' ? 0 : 1;
  const raw = (i) => {
    const p = landmarks[i];
    return { x: p.x * aspect, y: p.y, v: p.visibility ?? 1 };
  };
  const pt = (name, s = k) => {
    const idx = LM[name];
    return raw(Array.isArray(idx) ? idx[s] : idx);
  };
  const other = (name) => pt(name, 1 - k);
  const both = (name) => mid(pt(name, 0), pt(name, 1));

  const body = {
    side,
    pt,
    other,
    both,
    angle: (a, b, c) => angle(pt(a), pt(b), pt(c)),
    fromDown: (a, b) => fromDown(pt(a), pt(b)),
    /** Minimum visibility over named points on this side. */
    vis: (...names) => Math.min(...names.map((n) => pt(n).v)),
    legLen: () => (dist(pt('hip'), pt('knee')) + dist(pt('knee'), pt('ankle'))) || 1e-6,
    shoulderWidth: () => dist(pt('shoulder', 0), pt('shoulder', 1)) || 1e-6,
    /** Trunk angle away from vertical, using the mid-shoulder and mid-hip. */
    trunkLean: () => fromUp(both('hip'), both('shoulder')),
    /** +1 when the person faces +x in the image, −1 otherwise (side view). */
    facing: () => Math.sign(raw(LM.nose).x - both('shoulder').x) || 1,
    flip: () => makeBody(landmarks, aspect, side === 'L' ? 'R' : 'L'),
  };
  return body;
}
