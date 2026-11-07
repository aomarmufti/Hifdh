// The exercise library. Each exercise says three things:
//   1. how to measure it from a pose      (measure, rest → target)
//   2. what good form looks like          (rules, each with a coaching cue)
//   3. how to demonstrate it              (demo keyframes for the guide figure)
//
// `measure(b)` receives a side-aware body (see core/geometry.js) and returns a
// number. Progress is (value − rest) / (target − rest): 0 at rest, 1 at target.

import { fromDown } from '../core/geometry.js';

const knee = (b) => b.angle('hip', 'knee', 'ankle');
const hip = (b) => b.angle('shoulder', 'hip', 'knee');
const shoulder = (b) => b.angle('hip', 'shoulder', 'elbow');
const elbow = (b) => b.angle('shoulder', 'elbow', 'wrist');

// ── Demo building blocks ────────────────────────────────────────────────────
const STAND = { px: 0, py: 0.548, torso: 0, footN: [0.02, 0.07], footF: [-0.01, 0.07], shN: 6, elN: 12, shF: -4, elF: 12 };
const STAND_HOLD = { ...STAND, shN: 42, elN: 28, shF: 38, elF: 30 }; // hands resting on a support in front
const SUPINE = { px: 0, py: 0.09, torso: -90, footN: [0.478, 0.088], footF: [0.476, 0.086], shN: 82, elN: 0, shF: 80, elF: 0 };
const FRONT = { px: 0, py: 0.548, torso: 0, shL: 8, shR: 8, elL: 6, elR: 6 };
const SEATED = { px: -0.04, py: 0.36, torso: -4, hipN: 88, kneeN: 88, hipF: 86, kneeF: 86, shN: 22, elN: 62, shF: 18, elF: 64 };

const loop = (a, b, labels = ['Start', 'Move', 'Return'], hold = 0.12) => [
  { at: 0, pose: a, label: labels[0] },
  { at: 0.1, pose: a, label: labels[0] },
  { at: 0.45, pose: b, label: labels[1] },
  { at: 0.45 + hold, pose: b, label: labels[1] },
  { at: 0.95, pose: a, label: labels[2] },
  { at: 1, pose: a, label: labels[2] },
];
const into = (a, b, labels = ['Get set', 'Hold']) => [
  { at: 0, pose: a, label: labels[0] },
  { at: 0.12, pose: a, label: labels[0] },
  { at: 0.35, pose: b, label: labels[1] },
  { at: 0.9, pose: b, label: labels[1] },
  { at: 1, pose: a, label: 'Relax' },
];

const kneeRules = [
  { id: 'lean', when: 'active', cue: 'Lift your chest — keep your back tall', test: (b) => b.trunkLean() > 48 },
];

export const EXERCISES = {
  // ── Knee & leg ────────────────────────────────────────────────────────────
  'heel-slide': {
    name: 'Heel slides',
    summary: 'Restores knee bend gently, without load.',
    muscles: 'Knee flexion range',
    type: 'reps', camera: 'side', cameraTip: 'Lie on your back with your side to the camera, whole body in frame.',
    steps: ['Lie on your back, legs straight.', 'Slide your heel towards your bottom, bending the knee as far as is comfortable.', 'Pause, then slide it back out until the leg is straight.'],
    cues: ['Keep your heel on the floor', 'Move slowly and smoothly', 'Mild stretch is fine — sharp pain is not'],
    needs: ['hip', 'knee', 'ankle'], sides: 'auto',
    measure: knee, rest: 168, target: 100, min: 0.65,
    display: { label: 'Knee bend', fn: (v) => 180 - v, unit: '°' },
    rules: [],
    defaults: { sets: 3, reps: 10, rest: 30 },
    demo: { view: 'side', duration: 4.2, base: SUPINE, focus: ['legN'], props: [{ type: 'mat' }],
      frames: loop({}, { footN: [0.3, 0.07] }, ['Legs straight', 'Slide heel in', 'Slide out']) },
  },

  'straight-leg-raise': {
    name: 'Straight leg raise',
    summary: 'Builds quadriceps strength while protecting the knee.',
    muscles: 'Quadriceps, hip flexors',
    type: 'reps', camera: 'side', cameraTip: 'Lie on your back, side-on to the camera.',
    steps: ['Lie on your back, bend the other knee with that foot flat.', 'Tighten the thigh to lock the knee straight.', 'Lift the leg to the height of the other knee, then lower slowly.'],
    cues: ['Lock the knee before you lift', 'Lift to knee height — no higher', 'Lower for a slow count of three'],
    needs: ['shoulder', 'hip', 'knee', 'ankle'], sides: 'auto',
    // The resting leg is bent, which also reads as hip flexion: only a straight leg can be the working one.
    candidate: (b) => knee(b) > 145,
    measure: hip, rest: 174, target: 142, min: 0.7,
    tempo: { minSeconds: 1.6 },
    display: { label: 'Leg lift', fn: (v) => 180 - v, unit: '°' },
    rules: [{ id: 'bent-knee', when: 'active', cue: 'Keep your knee locked straight', test: (b) => knee(b) < 158 }],
    defaults: { sets: 3, reps: 10, rest: 30 },
    demo: { view: 'side', duration: 4.4, base: { ...SUPINE, footN: undefined, hipN: 90, kneeN: 0, footF: [0.28, 0.07] }, focus: ['legN'], props: [{ type: 'mat' }],
      frames: loop({ hipN: 90 }, { hipN: 132 }, ['Lock the knee', 'Lift', 'Lower slowly']) },
  },

  'mini-squat': {
    name: 'Mini squats',
    summary: 'Strength through a safe, shallow range.',
    muscles: 'Quadriceps, glutes',
    type: 'reps', camera: 'side', cameraTip: 'Stand side-on, about 2–3 m from the camera, head to feet in frame.',
    steps: ['Stand with feet hip-width apart, holding a support if needed.', 'Sit your hips back and bend the knees about a third of the way.', 'Push through your heels to stand tall.'],
    cues: ['Knees track over your toes', 'Weight in your heels', 'Shallow is the point — about 45°'],
    needs: ['hip', 'knee', 'ankle'], sides: 'auto',
    measure: knee, rest: 170, target: 132, min: 0.7,
    display: { label: 'Knee bend', fn: (v) => 180 - v, unit: '°' },
    rules: [...kneeRules, { id: 'deep', when: 'active', cue: 'That’s deeper than needed — keep it shallow', test: (b) => knee(b) < 95 }],
    defaults: { sets: 3, reps: 12, rest: 40 },
    demo: { view: 'side', duration: 3.4, base: STAND, focus: ['legN'],
      frames: loop({}, { px: -0.06, py: 0.475, torso: 22, shN: 62, elN: 0, shF: 58, elF: 0 }, ['Stand tall', 'Sit back', 'Drive up']) },
  },

  'sit-to-stand': {
    name: 'Sit to stand',
    summary: 'A functional strength builder you use every day.',
    muscles: 'Quadriceps, glutes',
    type: 'reps', camera: 'side', cameraTip: 'Set a chair side-on to the camera with your whole body in frame.',
    steps: ['Sit near the front of a firm chair, feet flat and hip-width apart.', 'Lean forward, “nose over toes”, and stand up without using your hands.', 'Lower back down slowly with control.'],
    cues: ['Nose over toes to stand', 'Arms crossed if you can', 'Control the sit — don’t drop'],
    needs: ['hip', 'knee', 'ankle'], sides: 'auto',
    measure: knee, rest: 168, target: 102, min: 0.75,
    tempo: { minSeconds: 1.4 },
    display: { label: 'Knee bend', fn: (v) => 180 - v, unit: '°' },
    rules: [],
    defaults: { sets: 2, reps: 10, rest: 45 },
    demo: { view: 'side', duration: 3.8, base: { ...STAND, shN: 70, elN: 0, shF: 66, elF: 0 }, focus: ['legN'], props: [{ type: 'chair', x: -0.2, seat: 0.3 }],
      frames: loop({}, { px: -0.14, py: 0.34, torso: 34 }, ['Stand tall', 'Sit down slowly', 'Stand up']) },
  },

  'wall-sit': {
    name: 'Wall sit',
    summary: 'Isometric quadriceps hold — strength without movement.',
    muscles: 'Quadriceps',
    type: 'hold', camera: 'side', cameraTip: 'Stand with your back to a wall, side-on to the camera.',
    steps: ['Lean your back against a wall, feet about 50 cm out.', 'Slide down until your knees are bent to roughly 90°, or less if it hurts.', 'Hold, breathing steadily.'],
    cues: ['Back flat on the wall', 'Knees over ankles, not toes', 'Breathe — don’t hold your breath'],
    needs: ['hip', 'knee', 'ankle'], sides: 'auto',
    measure: knee, rest: 168, target: 104, zone: 0.8,
    display: { label: 'Knee bend', fn: (v) => 180 - v, unit: '°' },
    rules: [{ id: 'low', when: 'always', cue: 'Too low — come up a little', test: (b) => knee(b) < 70 }],
    defaults: { sets: 3, hold: 30, rest: 30 },
    demo: { view: 'side', duration: 6, base: { ...STAND, px: -0.13, py: 0.5, footN: [0.1, 0.07], footF: [0.08, 0.07], shN: 10, shF: 6 }, focus: ['legN'], props: [{ type: 'wall', x: -0.2 }],
      frames: into({}, { py: 0.31, footN: [0.12, 0.07], footF: [0.1, 0.07] }, ['Back to the wall', 'Hold']) },
  },

  'seated-knee-extension': {
    name: 'Seated knee extension',
    summary: 'Strengthens the quadriceps through the end of range.',
    muscles: 'Quadriceps',
    type: 'reps', camera: 'side', cameraTip: 'Sit on a chair side-on to the camera.',
    steps: ['Sit tall, thighs supported by the chair.', 'Straighten one knee fully and squeeze the thigh.', 'Hold for a moment, then lower slowly.'],
    cues: ['Sit tall — don’t lean back', 'Squeeze at the top', 'Slow on the way down'],
    needs: ['hip', 'knee', 'ankle'], sides: 'auto',
    measure: knee, rest: 95, target: 165, min: 0.75,
    tempo: { minSeconds: 1.4 },
    display: { label: 'Knee straight', fn: (v) => v, unit: '°' },
    rules: [{ id: 'lean-back', when: 'active', cue: 'Sit tall — don’t lean back', test: (b) => b.trunkLean() > 25 }],
    defaults: { sets: 3, reps: 12, rest: 30 },
    demo: { view: 'side', duration: 3.8, base: SEATED, focus: ['legN'], props: [{ type: 'chair', x: -0.1, seat: 0.3 }],
      frames: loop({}, { kneeN: 4 }, ['Sit tall', 'Straighten', 'Lower slowly']) },
  },

  'hamstring-curl': {
    name: 'Standing hamstring curl',
    summary: 'Strengthens the hamstrings that bend the knee.',
    muscles: 'Hamstrings',
    type: 'reps', camera: 'side', cameraTip: 'Stand side-on holding a chair, whole body in frame.',
    steps: ['Stand tall holding a chair for balance.', 'Bend one knee, bringing the heel towards your bottom.', 'Lower slowly back to standing.'],
    cues: ['Keep your knees side by side', 'Thigh stays vertical', 'Slow and controlled'],
    needs: ['hip', 'knee', 'ankle'], sides: 'auto',
    measure: knee, rest: 166, target: 98, min: 0.7,
    display: { label: 'Knee bend', fn: (v) => 180 - v, unit: '°' },
    rules: [{ id: 'thigh', when: 'active', cue: 'Keep your thigh vertical — knees together', test: (b) => b.fromDown('hip', 'knee') > 28 }],
    defaults: { sets: 3, reps: 10, rest: 30 },
    demo: { view: 'side', duration: 3.6, base: { ...STAND_HOLD, footN: undefined, hipN: 0, kneeN: 0 }, focus: ['legN'], props: [{ type: 'chair', x: 0.32, seat: 0.3, back: true }],
      frames: loop({}, { kneeN: 92 }, ['Stand tall', 'Curl heel up', 'Lower']) },
  },

  'glute-bridge': {
    name: 'Glute bridge',
    summary: 'Wakes up the glutes and supports the back, hips and knees.',
    muscles: 'Glutes, hamstrings',
    type: 'reps', camera: 'side', cameraTip: 'Lie on your back, side-on to the camera.',
    steps: ['Lie on your back, knees bent, feet flat.', 'Squeeze your glutes and lift your hips until knees, hips and shoulders line up.', 'Hold for a breath, then roll down slowly.'],
    cues: ['Squeeze your glutes to lift', 'Ribs down — don’t arch', 'Hips level, side to side'],
    needs: ['shoulder', 'hip', 'knee'], sides: 'auto',
    measure: hip, rest: 135, target: 164, min: 0.7,
    display: { label: 'Hip lift', fn: (v) => v, unit: '°' },
    rules: [],
    defaults: { sets: 3, reps: 12, rest: 30 },
    demo: { view: 'side', duration: 4, base: { ...SUPINE, footN: [0.3, 0.07], footF: [0.29, 0.07], shN: 92, shF: 90 }, focus: ['legN', 'torso'], props: [{ type: 'mat' }],
      frames: loop({}, { px: -0.02, py: 0.215, torso: -116 }, ['Knees bent', 'Lift hips', 'Lower']) },
  },

  'hip-abduction': {
    name: 'Standing hip abduction',
    summary: 'Strengthens the hip muscles that keep your knee and pelvis level.',
    muscles: 'Gluteus medius',
    type: 'reps', camera: 'front', cameraTip: 'Face the camera, standing 2–3 m back, whole body in frame.',
    steps: ['Stand tall facing the camera, holding a support if needed.', 'Keeping your toes pointing forward, lift one leg out to the side.', 'Lower slowly with control.'],
    cues: ['Toes point forward', 'Stay tall — don’t lean', 'Small, controlled lift'],
    needs: ['hip', 'knee'], sides: 'none',
    measure: (b) => angleBetweenKnees(b),
    rest: 22, target: 46, min: 0.65,
    display: { label: 'Leg spread', fn: (v) => v, unit: '°' },
    rules: [{ id: 'side-lean', when: 'active', cue: 'Stay tall — don’t lean over', test: (b) => b.trunkLean() > 12 }],
    defaults: { sets: 3, reps: 10, rest: 30 },
    demo: { view: 'front', duration: 3.6, base: FRONT, focus: ['legL'],
      frames: loop({}, { hipL: 32, torso: -2 }, ['Stand tall', 'Lift out', 'Lower']) },
  },

  'hip-extension': {
    name: 'Standing hip extension',
    summary: 'Strengthens the glutes that drive you forward.',
    muscles: 'Glutes',
    type: 'reps', camera: 'side', cameraTip: 'Stand side-on holding a chair, whole body in frame.',
    steps: ['Stand tall holding a chair.', 'Keeping the knee straight, take one leg back behind you.', 'Return slowly — don’t swing.'],
    cues: ['Stay tall — no leaning forward', 'Squeeze the glute', 'Small range is fine'],
    needs: ['shoulder', 'hip', 'knee'], sides: 'auto',
    measure: (b) => {
      const back = Math.sign(b.pt('knee').x - b.pt('hip').x) === -b.facing() ? 1 : -1;
      return back * b.fromDown('hip', 'knee');
    },
    rest: 3, target: 20, min: 0.65,
    display: { label: 'Leg back', fn: (v) => v, unit: '°' },
    rules: [{ id: 'lean', when: 'active', cue: 'Stay tall — don’t lean forward', test: (b) => b.trunkLean() > 16 }],
    defaults: { sets: 3, reps: 10, rest: 30 },
    demo: { view: 'side', duration: 3.4, base: { ...STAND_HOLD, footN: undefined, hipN: 0, kneeN: 2 }, focus: ['legN'], props: [{ type: 'chair', x: 0.32, seat: 0.3, back: true }],
      frames: loop({}, { hipN: -24, torso: 4 }, ['Stand tall', 'Leg back', 'Return']) },
  },

  'hamstring-stretch': {
    name: 'Standing hamstring stretch',
    summary: 'Eases tight hamstrings behind the thigh.',
    muscles: 'Hamstrings',
    type: 'hold', camera: 'side', cameraTip: 'Stand side-on to the camera.',
    steps: ['Stand tall, feet together, knees soft.', 'Hinge forward from the hips, keeping your back long.', 'Stop at a gentle stretch behind the thighs and hold.'],
    cues: ['Hinge at the hips, not the back', 'Knees soft but straight', 'Gentle stretch — never bounce'],
    needs: ['shoulder', 'hip', 'knee'], sides: 'auto',
    measure: hip, rest: 172, target: 118, zone: 0.8,
    display: { label: 'Hip hinge', fn: (v) => 180 - v, unit: '°' },
    rules: [{ id: 'bent-knee', when: 'always', cue: 'Straighten your knees a little more', test: (b) => knee(b) < 150 }],
    defaults: { sets: 3, hold: 30, rest: 20 },
    demo: { view: 'side', duration: 6, base: STAND, focus: ['legN', 'torso'],
      frames: into({}, { px: -0.05, torso: 60, shN: 0, shF: 0, elN: 0, elF: 0 }, ['Stand tall', 'Hinge & hold']) },
  },

  // ── Ankle & foot ──────────────────────────────────────────────────────────
  'calf-raise': {
    name: 'Calf raises',
    summary: 'Builds calf and Achilles strength for walking and running.',
    muscles: 'Calves, Achilles',
    type: 'reps', camera: 'side', cameraTip: 'Stand side-on with your feet clearly in frame.',
    steps: ['Stand tall holding a support.', 'Rise up onto the balls of your feet as high as you can.', 'Lower slowly back down.'],
    cues: ['Rise straight up, not forward', 'Pause at the top', 'Three seconds down'],
    needs: ['ankle', 'heel', 'foot'], sides: 'auto',
    measure: (b) => (b.pt('foot').y - b.pt('heel').y) / b.legLen(),
    rest: 0.01, target: 0.075, min: 0.6,
    display: { label: 'Heel lift', fn: null, unit: '%' },
    rules: [],
    defaults: { sets: 3, reps: 15, rest: 30 },
    demo: { view: 'side', duration: 3, base: STAND_HOLD, focus: ['legN'], props: [{ type: 'chair', x: 0.32, seat: 0.3, back: true }],
      frames: loop({}, { py: 0.598, footN: [0.02, 0.12], footF: [-0.01, 0.12], ankN: 52, ankF: 52 }, ['Feet flat', 'Rise up', 'Lower slowly'], 0.1) },
  },

  'heel-drop': {
    name: 'Eccentric heel drops',
    summary: 'The evidence-based loading programme for Achilles tendons.',
    muscles: 'Calves, Achilles tendon',
    type: 'reps', camera: 'side', cameraTip: 'Stand side-on on a step, feet clearly in frame.',
    steps: ['Stand on the edge of a step with your heels hanging off.', 'Rise up on both feet.', 'Shift onto the affected leg and lower your heel slowly below the step.'],
    cues: ['Up on two, down on one', 'Lower for three full seconds', 'Some discomfort is expected; settle by next day'],
    needs: ['ankle', 'heel', 'foot'], sides: 'auto',
    measure: (b) => (b.pt('foot').y - b.pt('heel').y) / b.legLen(),
    rest: 0.005, target: 0.07, min: 0.6,
    tempo: { minLowerSeconds: 2 },
    display: { label: 'Heel lift', fn: null, unit: '%' },
    rules: [],
    defaults: { sets: 3, reps: 15, rest: 45 },
    demo: { view: 'side', duration: 5, base: { ...STAND_HOLD, py: 0.668, footN: [0.02, 0.19], footF: [-0.01, 0.19] }, focus: ['legN'], props: [{ type: 'step', x0: -0.04, x1: 0.32, h: 0.12 }],
      frames: [
        { at: 0, pose: { ankN: 90, ankF: 90 }, label: 'On the step' },
        { at: 0.2, pose: { py: 0.718, footN: [0.02, 0.24], footF: [-0.01, 0.24], ankN: 50, ankF: 50 }, label: 'Rise up' },
        { at: 0.3, pose: { py: 0.718, footN: [0.02, 0.24], footF: [-0.01, 0.24], ankN: 50, ankF: 50 }, label: 'Lower — 3 seconds' },
        { at: 0.85, pose: { py: 0.638, footN: [0.02, 0.16], footF: [-0.01, 0.16], ankN: 118, ankF: 118 }, label: 'Heel below step' },
        { at: 1, pose: { ankN: 90, ankF: 90 }, label: 'Reset' },
      ] },
  },

  'single-leg-balance': {
    name: 'Single-leg balance',
    summary: 'Retrains ankle stability and balance reactions.',
    muscles: 'Ankle stabilisers, balance',
    type: 'hold', camera: 'side', cameraTip: 'Stand side-on near a support, feet in frame.',
    steps: ['Stand near a counter or chair.', 'Lift one foot off the floor.', 'Hold steady, eyes forward. Touch the support only if needed.'],
    cues: ['Soft standing knee', 'Eyes on a fixed point', 'Progress: try it eyes closed'],
    needs: ['hip', 'ankle'], sides: 'none',
    measure: (b) => Math.abs(b.pt('ankle', 0).y - b.pt('ankle', 1).y) / b.legLen(),
    rest: 0.01, target: 0.13, zone: 0.75,
    display: { label: 'Foot lift', fn: null, unit: '%' },
    rules: [],
    defaults: { sets: 3, hold: 30, rest: 20 },
    demo: { view: 'side', duration: 6, base: { ...STAND, shN: 22, shF: 18, elN: 20, elF: 20, footF: [0.0, 0.07] }, focus: ['legF'],
      frames: into({}, { footN: undefined, hipN: 40, kneeN: 82 }, ['Stand tall', 'Balance']) },
  },

  'calf-stretch': {
    name: 'Wall calf stretch',
    summary: 'Lengthens the calf and Achilles — key for heel pain.',
    muscles: 'Calves, Achilles',
    type: 'hold', camera: 'side', cameraTip: 'Stand side-on to the camera, facing a wall.',
    steps: ['Face a wall with your hands on it.', 'Step one foot back, keeping that knee straight and heel down.', 'Bend the front knee and lean in until you feel the calf stretch.'],
    cues: ['Back heel stays down', 'Back knee straight', 'Toes point forward'],
    needs: ['hip', 'knee', 'ankle'], sides: 'none',
    measure: (b) => Math.abs(b.pt('ankle', 0).x - b.pt('ankle', 1).x) / b.legLen(),
    rest: 0.1, target: 0.6, zone: 0.8,
    display: { label: 'Stride', fn: null, unit: '%' },
    rules: [{ id: 'back-knee', when: 'always', cue: 'Straighten your back knee, heel down', test: (b) => Math.max(knee(b), knee(b.flip())) < 158 }],
    defaults: { sets: 3, hold: 30, rest: 20 },
    demo: { view: 'side', duration: 6, base: { ...STAND, shN: 80, elN: 8, shF: 76, elF: 8 }, focus: ['legF'], props: [{ type: 'wall', x: 0.42 }],
      frames: into({}, { px: -0.06, py: 0.5, torso: 16, footN: [0.13, 0.07], footF: [-0.3, 0.07] }, ['Face the wall', 'Lean & hold']) },
  },

  // ── Shoulder ──────────────────────────────────────────────────────────────
  'shoulder-flexion': {
    name: 'Shoulder flexion',
    summary: 'Restores the ability to reach up and overhead.',
    muscles: 'Anterior deltoid, rotator cuff',
    type: 'reps', camera: 'side', cameraTip: 'Stand side-on, upper body and hips in frame.',
    steps: ['Stand tall, arm by your side, thumb up.', 'Raise the arm forwards and up as far as comfortable.', 'Lower slowly.'],
    cues: ['Thumb leads the way', 'Ribs down — no arching', 'Stop before pain, not after'],
    needs: ['hip', 'shoulder', 'elbow'], sides: 'auto',
    measure: shoulder, rest: 22, target: 150, min: 0.7,
    tempo: { minSeconds: 1.6 },
    display: { label: 'Arm raise', fn: (v) => v, unit: '°' },
    rules: [
      { id: 'elbow', when: 'active', cue: 'Keep your elbow straight', test: (b) => elbow(b) < 140 },
      { id: 'arch', when: 'active', cue: 'Ribs down — don’t arch your back', test: (b) => b.trunkLean() > 15 },
    ],
    defaults: { sets: 3, reps: 10, rest: 30 },
    demo: { view: 'side', duration: 4.2, base: STAND, focus: ['armN'],
      frames: loop({ shN: 6, elN: 4 }, { shN: 165, elN: 2 }, ['Arm by side', 'Raise up', 'Lower slowly']) },
  },

  'shoulder-abduction': {
    name: 'Shoulder abduction',
    summary: 'Restores lifting the arm out to the side.',
    muscles: 'Deltoid, supraspinatus',
    type: 'reps', camera: 'front', cameraTip: 'Face the camera, upper body and hips in frame.',
    steps: ['Stand tall facing the camera.', 'Raise one arm out to the side, palm facing forward.', 'Go as high as comfortable, then lower slowly.'],
    cues: ['Palm forward as you pass shoulder height', 'Shoulders stay level', 'Slow on the way down'],
    needs: ['hip', 'shoulder', 'elbow'], sides: 'auto',
    measure: shoulder, rest: 22, target: 145, min: 0.65,
    tempo: { minSeconds: 1.6 },
    display: { label: 'Arm raise', fn: (v) => v, unit: '°' },
    rules: [
      { id: 'elbow', when: 'active', cue: 'Keep your elbow straight', test: (b) => elbow(b) < 140 },
      { id: 'tilt', when: 'active', cue: 'Keep your shoulders level — don’t lean', test: (b) => b.trunkLean() > 10 },
    ],
    defaults: { sets: 3, reps: 10, rest: 30 },
    demo: { view: 'front', duration: 4.2, base: FRONT, focus: ['armL'],
      frames: loop({}, { shL: 158 }, ['Arm by side', 'Raise out', 'Lower slowly']) },
  },

  scaption: {
    name: 'Scaption raise',
    summary: 'Rotator cuff strength in the shoulder’s most natural plane.',
    muscles: 'Supraspinatus, deltoid',
    type: 'reps', camera: 'front', cameraTip: 'Face the camera, upper body in frame.',
    steps: ['Stand tall, arms by your sides, thumbs up.', 'Raise both arms in a “V”, slightly forward of your body.', 'Stop at shoulder height, then lower slowly.'],
    cues: ['Thumbs up the whole time', 'Stop at shoulder height', 'Shoulders down, away from ears'],
    needs: ['hip', 'shoulder', 'elbow'], sides: 'auto',
    measure: shoulder, rest: 20, target: 88, min: 0.7,
    tempo: { minSeconds: 1.4 },
    display: { label: 'Arm raise', fn: (v) => v, unit: '°' },
    rules: [
      { id: 'high', when: 'active', cue: 'Stop at shoulder height', test: (b) => shoulder(b) > 125 },
      { id: 'elbow', when: 'active', cue: 'Keep your elbows straight', test: (b) => elbow(b) < 140 },
    ],
    defaults: { sets: 3, reps: 12, rest: 30 },
    demo: { view: 'front', duration: 3.6, base: FRONT, focus: ['armL', 'armR'],
      frames: loop({}, { shL: 90, shR: 90 }, ['Thumbs up', 'Raise to shoulder height', 'Lower']) },
  },

  'wall-slide': {
    name: 'Wall slides',
    summary: 'Improves overhead reach with good shoulder-blade control.',
    muscles: 'Serratus anterior, lower trapezius',
    type: 'reps', camera: 'front', cameraTip: 'Face the camera, arms and hips in frame.',
    steps: ['Stand with your back to a wall, arms in a “goalpost”.', 'Slide your arms up the wall as high as you can while keeping contact.', 'Slide back down to the goalpost.'],
    cues: ['Both arms move together', 'Ribs down, back flat', 'Elbows and wrists touch the wall'],
    needs: ['hip', 'shoulder', 'elbow'], sides: 'auto',
    measure: shoulder, rest: 95, target: 152, min: 0.7,
    tempo: { minSeconds: 1.6 },
    display: { label: 'Arm raise', fn: (v) => v, unit: '°' },
    rules: [{ id: 'uneven', when: 'active', cue: 'Raise both arms together', test: (b) => Math.abs(shoulder(b) - shoulder(b.flip())) > 30 }],
    defaults: { sets: 3, reps: 10, rest: 30 },
    demo: { view: 'front', duration: 4, base: { ...FRONT, shL: 90, shR: 90, elL: 90, elR: 90 }, focus: ['armL', 'armR'],
      frames: loop({}, { shL: 160, shR: 160, elL: 18, elR: 18 }, ['Goalpost arms', 'Slide up', 'Slide down']) },
  },

  'cross-body-stretch': {
    name: 'Cross-body stretch',
    summary: 'Eases the back of the shoulder and capsule.',
    muscles: 'Posterior shoulder',
    type: 'hold', camera: 'front', cameraTip: 'Face the camera, upper body in frame.',
    steps: ['Stand tall facing the camera.', 'Bring one arm across your chest.', 'Use the other hand to ease it closer and hold.'],
    cues: ['Keep the shoulder down', 'Gentle pull — no pain', 'Breathe out into the stretch'],
    needs: ['shoulder', 'wrist'], sides: 'auto',
    measure: (b) => {
      const s = b.pt('shoulder'), o = b.other('shoulder'), w = b.pt('wrist');
      return ((w.x - s.x) * Math.sign(o.x - s.x)) / b.shoulderWidth();
    },
    rest: 0, target: 1.25, zone: 0.75,
    display: { label: 'Reach across', fn: null, unit: '%' },
    rules: [],
    defaults: { sets: 3, hold: 30, rest: 15 },
    demo: { view: 'front', duration: 6, base: FRONT, focus: ['armR'],
      frames: into({}, { shR: -98, elR: 0, shL: -40, elL: -95 }, ['Arm by side', 'Across & hold']) },
  },

  // ── Back ──────────────────────────────────────────────────────────────────
  'bird-dog': {
    name: 'Bird dog',
    summary: 'Trains the deep trunk muscles that steady your spine.',
    muscles: 'Core, glutes, back extensors',
    type: 'reps', camera: 'side', cameraTip: 'Kneel on all fours, side-on to the camera.',
    steps: ['Start on hands and knees: hands under shoulders, knees under hips.', 'Reach one arm forward and the opposite leg back until both are level.', 'Hold for a breath, return, and switch sides.'],
    cues: ['Back flat like a table', 'Reach long, not high', 'Hips stay square to the floor'],
    needs: ['shoulder', 'hip', 'knee'], sides: 'auto',
    measure: hip, rest: 95, target: 160, min: 0.7,
    tempo: { minSeconds: 1.6 },
    display: { label: 'Leg reach', fn: (v) => v, unit: '°' },
    rules: [],
    defaults: { sets: 3, reps: 8, rest: 30 },
    demo: { view: 'side', duration: 4.4, base: { px: 0, py: 0.3, torso: -90, footN: undefined, footF: undefined, hipN: 2, kneeN: -88, hipF: -2, kneeF: -88, shN: -2, elN: 0, shF: 2, elF: 0 }, focus: ['armN', 'legF'], props: [{ type: 'mat' }],
      frames: loop({}, { hipF: 88, kneeF: 0, shN: -96, py: 0.31 }, ['All fours', 'Reach long', 'Return']) },
  },

  'knee-to-chest': {
    name: 'Knee to chest',
    summary: 'Gently stretches the lower back and glutes.',
    muscles: 'Lower back, glutes',
    type: 'hold', camera: 'side', cameraTip: 'Lie on your back, side-on to the camera.',
    steps: ['Lie on your back, legs straight or bent.', 'Bring one knee up and hug it towards your chest.', 'Hold, keeping your other leg relaxed.'],
    cues: ['Head stays on the floor', 'Pull gently with your hands', 'Breathe slowly'],
    needs: ['shoulder', 'hip', 'knee'], sides: 'auto',
    measure: hip, rest: 172, target: 76, zone: 0.8,
    display: { label: 'Hip bend', fn: (v) => 180 - v, unit: '°' },
    rules: [],
    defaults: { sets: 3, hold: 30, rest: 15 },
    demo: { view: 'side', duration: 6, base: { ...SUPINE, footN: undefined, hipN: 90, kneeN: 0 }, focus: ['legN'], props: [{ type: 'mat' }],
      frames: into({}, { hipN: 200, kneeN: 112, shN: 140, elN: 24 }, ['Lie flat', 'Hug & hold']) },
  },
};

function angleBetweenKnees(b) {
  const h = b.both('hip');
  const l = b.pt('knee', 0), r = b.pt('knee', 1);
  const a = fromDown(h, l), c = fromDown(h, r);
  return Math.sign(l.x - h.x) === Math.sign(r.x - h.x) ? Math.abs(a - c) : a + c;
}

for (const [id, ex] of Object.entries(EXERCISES)) ex.id = id;
