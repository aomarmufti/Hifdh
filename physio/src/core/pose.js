// On-device pose estimation with MediaPipe Pose Landmarker.
// Video never leaves the device: the model runs in WebAssembly / WebGL.

import { EDGES } from './geometry.js';

const VERSION = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let loading = null;

export function loadPoseModel() {
  loading ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import(/* @vite-ignore */ `${CDN}/vision_bundle.mjs`);
    const files = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      return await PoseLandmarker.createFromOptions(files, opts('GPU'));
    } catch {
      return await PoseLandmarker.createFromOptions(files, opts('CPU'));
    }
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

export async function openCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open the camera.');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return () => stream.getTracks().forEach((t) => t.stop());
}

const TONE = { move: '#8ab4f8', good: '#6dd58c', warn: '#fcc934', idle: '#e8eaed' };
const SIDE = { L: 0, R: 1 };
const NAMED = { shoulder: [11, 12], elbow: [13, 14], wrist: [15, 16], hip: [23, 24], knee: [25, 26], ankle: [27, 28] };

/**
 * Paint the tracked body over the live camera picture.
 * Landmarks are normalised to the video frame; `fit` maps them onto the
 * (object-fit: cover) element and `mirror` flips them for a selfie view.
 * The working limb takes the colour of the coaching state, and the measured
 * joint gets an angle arc with a live reading.
 */
export function drawSkeleton(ctx, lms, w, h, { fit, mirror = false, focus = new Set(), side = null, arc = null, bend = false, label = null, tone = 'move' } = {}) {
  ctx.clearRect(0, 0, w, h);
  if (!lms) return;
  const { sx, sy, dx, dy } = fit ?? { sx: w, sy: h, dx: 0, dy: 0 };
  const P = (i) => {
    const x = lms[i].x * sx + dx;
    return [mirror ? w - x : x, lms[i].y * sy + dy];
  };
  const seen = (i) => (lms[i].visibility ?? 1) >= 0.4;
  // Left-side landmarks have odd indices. Once the working side is known, only it is highlighted.
  const working = (i) => focus.has(i) && (side == null || i % 2 === (side === 'L' ? 1 : 0));
  const accent = TONE[tone] ?? TONE.move;
  const lw = Math.max(3, Math.min(w, h) * 0.008);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, .55)';
  ctx.shadowBlur = 6;

  // Bones: everything in white first, then the working limb on top in the state colour.
  for (const pass of [false, true]) {
    for (const [a, b] of EDGES) {
      if (!seen(a) || !seen(b)) continue;
      const on = working(a) && working(b);
      if (on !== pass) continue;
      ctx.strokeStyle = on ? accent : 'rgba(255, 255, 255, .9)';
      ctx.lineWidth = on ? lw * 1.7 : lw;
      ctx.beginPath(); ctx.moveTo(...P(a)); ctx.lineTo(...P(b)); ctx.stroke();
    }
  }

  // Head: a ring centred between the ears, sized from the torso.
  if (seen(7) || seen(8)) {
    const e = [P(7), P(8)];
    const hc = [(e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2];
    const sh = Math.hypot(P(11)[0] - P(12)[0], P(11)[1] - P(12)[1]);
    const torso = Math.hypot(P(11)[0] - P(23)[0], P(11)[1] - P(23)[1]);
    ctx.strokeStyle = 'rgba(255, 255, 255, .85)';
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(...hc, Math.max(sh * 0.32, torso * 0.2, lw * 3), 0, Math.PI * 2); ctx.stroke();
  }

  // Joints: white dots, with a coloured ring on the working limb.
  for (let i = 11; i < 33; i++) {
    if (!seen(i) || (i > 16 && i < 23)) continue;
    const on = working(i);
    const r = on ? lw * 1.35 : lw * 0.95;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(...P(i), r, 0, Math.PI * 2); ctx.fill();
    if (on) {
      ctx.strokeStyle = accent; ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.arc(...P(i), r + lw * 0.5, 0, Math.PI * 2); ctx.stroke();
    }
  }

  if (arc && side != null) {
    const cx = [11, 12, 23, 24].reduce((t, i) => t + P(i)[0], 0) / 4;
    drawArc(ctx, arc.map((n) => NAMED[n][SIDE[side]]), P, seen, accent, label, lw, bend, cx);
  }
  ctx.restore();
}

function drawArc(ctx, [ia, ib, ic], P, seen, color, label, lw, bend, bodyX) {
  if (!seen(ia) || !seen(ib) || !seen(ic)) return;
  const a = P(ia), b = P(ib), c = P(ic);
  // A "bend" reading (e.g. knee flexion) is the angle away from straight, so the
  // wedge starts on the continuation of the upper segment rather than the segment itself.
  const t1 = Math.atan2(a[1] - b[1], a[0] - b[0]) + (bend ? Math.PI : 0);
  let t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  // Sweep the interior (smaller) angle.
  let d = t2 - t1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  t2 = t1 + d;
  const r = Math.max(lw * 5, (bend ? 0.55 : 0.42) * Math.min(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(c[0] - b[0], c[1] - b[1])));

  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.22;
  ctx.beginPath(); ctx.moveTo(...b); ctx.arc(...b, r, t1, t2, d < 0); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color; ctx.lineWidth = lw * 0.8;
  ctx.beginPath(); ctx.arc(...b, r, t1, t2, d < 0); ctx.stroke();

  if (!label) return;
  // The reading sits level with the joint, on the side away from the body, so it
  // never covers a limb.
  ctx.font = `600 ${Math.round(Math.max(13, lw * 4.2))}px Inter, system-ui, sans-serif`;
  const tw = ctx.measureText(label).width, ph = Math.max(24, lw * 7.5), pw = tw + ph * 0.8;
  const away = Math.abs(b[0] - bodyX) > lw * 2 ? Math.sign(b[0] - bodyX) : Math.sign(Math.cos(t1 + d / 2)) || 1;
  const x = b[0] + away * (r + pw / 2 + lw * 2), y = b[1];
  ctx.fillStyle = 'rgba(15, 17, 20, .82)';
  ctx.beginPath(); ctx.roundRect(x - pw / 2, y - ph / 2, pw, ph, ph / 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 1);
}
