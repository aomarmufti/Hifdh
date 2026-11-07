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

/** Draw the tracked skeleton. Landmarks are normalised to the video frame. */
export function drawSkeleton(ctx, lms, w, h, { color = '#fff', accent = '#8ab4f8', focus = new Set(), fit } = {}) {
  ctx.clearRect(0, 0, w, h);
  if (!lms) return;
  // Map from video space to the (object-fit: cover) element.
  const { sx, sy, dx, dy } = fit ?? { sx: w, sy: h, dx: 0, dy: 0 };
  const P = (i) => [lms[i].x * sx + dx, lms[i].y * sy + dy];
  const lw = Math.max(3, Math.min(w, h) * 0.008);
  ctx.lineCap = 'round';
  for (const [a, b] of EDGES) {
    if ((lms[a].visibility ?? 1) < 0.4 || (lms[b].visibility ?? 1) < 0.4) continue;
    const on = focus.has(a) && focus.has(b);
    ctx.strokeStyle = on ? accent : color;
    ctx.lineWidth = on ? lw * 1.5 : lw;
    ctx.globalAlpha = on ? 1 : 0.75;
    ctx.beginPath(); ctx.moveTo(...P(a)); ctx.lineTo(...P(b)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Head: centred between the ears, sized from the shoulders.
  const e1 = lms[7], e2 = lms[8];
  if ((e1.visibility ?? 1) > 0.4 || (e2.visibility ?? 1) > 0.4) {
    const hc = [((e1.x + e2.x) / 2) * sx + dx, ((e1.y + e2.y) / 2) * sy + dy];
    const sh = Math.hypot((lms[11].x - lms[12].x) * sx, (lms[11].y - lms[12].y) * sy);
    const torso = Math.hypot((lms[11].x - lms[23].x) * sx, (lms[11].y - lms[23].y) * sy);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.arc(...hc, Math.max(sh * 0.32, torso * 0.2, lw * 3), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (let i = 11; i < 33; i++) {
    if ((lms[i].visibility ?? 1) < 0.4 || (i > 16 && i < 23)) continue;
    const on = focus.has(i);
    ctx.fillStyle = on ? accent : color;
    ctx.beginPath(); ctx.arc(...P(i), on ? lw * 1.4 : lw * 0.9, 0, Math.PI * 2); ctx.fill();
  }
}
