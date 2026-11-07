// Body areas → conditions → programmes. Programmes reference the exercise
// library by id and may override the dose (sets, reps or hold seconds, rest).
//
// Content is general education modelled on common physiotherapy protocols.
// It is not a substitute for a personalised plan from a clinician.

import { EXERCISES } from './exercises.js';

export const AREAS = [
  {
    id: 'knee', name: 'Knee', blurb: 'Ligament, cartilage and kneecap problems.', tint: 'blue', joint: 'knee',
    conditions: [
      {
        id: 'acl', name: 'ACL reconstruction', aka: 'Anterior cruciate ligament', stage: 'Weeks 2–12 post-op',
        summary: 'Restore full knee straightening and bend, wake up the quadriceps, then rebuild strength and control.',
        goals: ['Full knee extension', '120°+ knee bend', 'Quadriceps control', 'Single-leg strength'],
        caution: 'Follow your surgeon’s protocol first. Avoid deep squats and twisting until you are cleared.',
        plan: [
          { id: 'heel-slide', sets: 3, reps: 10 },
          { id: 'straight-leg-raise', sets: 3, reps: 10 },
          { id: 'mini-squat', sets: 3, reps: 12 },
          { id: 'hamstring-curl', sets: 3, reps: 10 },
          { id: 'calf-raise', sets: 3, reps: 15 },
          { id: 'wall-sit', sets: 3, hold: 30 },
        ],
      },
      {
        id: 'pfps', name: 'Runner’s knee', aka: 'Patellofemoral pain syndrome', stage: 'All stages',
        summary: 'Pain around the kneecap eases when the hips and quadriceps share the load better.',
        goals: ['Hip strength', 'Pain-free squatting', 'Return to running'],
        caution: 'Keep exercise pain at 3/10 or less, settling within 24 hours.',
        plan: [
          { id: 'straight-leg-raise', sets: 3, reps: 12 },
          { id: 'hip-abduction', sets: 3, reps: 12 },
          { id: 'glute-bridge', sets: 3, reps: 12 },
          { id: 'mini-squat', sets: 3, reps: 12 },
          { id: 'wall-sit', sets: 3, hold: 20 },
        ],
      },
      {
        id: 'meniscus', name: 'Meniscus tear', aka: 'Cartilage injury', stage: 'Conservative or post-op',
        summary: 'Calm the knee, regain movement, then build strength without deep, loaded bending.',
        goals: ['Reduce swelling', 'Full range', 'Leg strength'],
        caution: 'Stop and seek review if the knee locks, gives way or swells sharply.',
        plan: [
          { id: 'heel-slide', sets: 3, reps: 10 },
          { id: 'straight-leg-raise', sets: 3, reps: 10 },
          { id: 'mini-squat', sets: 3, reps: 10 },
          { id: 'hamstring-curl', sets: 3, reps: 10 },
          { id: 'calf-raise', sets: 2, reps: 15 },
        ],
      },
      {
        id: 'knee-oa', name: 'Knee osteoarthritis', aka: 'Wear-and-tear arthritis', stage: 'Long-term',
        summary: 'Strong muscles are the best-evidenced treatment for arthritic knee pain.',
        goals: ['Less pain on stairs', 'Easier standing up', 'Stronger thighs'],
        caution: 'Some aching is normal. Ease off if it is worse the next morning.',
        plan: [
          { id: 'sit-to-stand', sets: 2, reps: 10 },
          { id: 'seated-knee-extension', sets: 3, reps: 12 },
          { id: 'straight-leg-raise', sets: 3, reps: 10 },
          { id: 'calf-raise', sets: 2, reps: 15 },
        ],
      },
    ],
  },
  {
    id: 'shoulder', name: 'Shoulder', blurb: 'Rotator cuff, stiffness and impingement.', tint: 'violet', joint: 'shoulder',
    conditions: [
      {
        id: 'rotator-cuff', name: 'Rotator cuff tendinopathy', aka: 'Painful arc', stage: 'All stages',
        summary: 'Graded loading helps the tendons of the rotator cuff tolerate lifting again.',
        goals: ['Pain-free reaching', 'Cuff strength', 'Overhead control'],
        caution: 'Work below shoulder height first if raising the arm is painful.',
        plan: [
          { id: 'scaption', sets: 3, reps: 12 },
          { id: 'shoulder-flexion', sets: 3, reps: 10 },
          { id: 'wall-slide', sets: 3, reps: 10 },
          { id: 'cross-body-stretch', sets: 2, hold: 30 },
        ],
      },
      {
        id: 'frozen-shoulder', name: 'Frozen shoulder', aka: 'Adhesive capsulitis', stage: 'Stiffening & thawing',
        summary: 'Frequent, gentle range-of-motion work keeps the shoulder moving while it recovers.',
        goals: ['Reach overhead', 'Reach behind your back', 'Sleep comfortably'],
        caution: 'Work into stiffness, never into sharp pain. Little and often beats forcing it.',
        plan: [
          { id: 'shoulder-flexion', sets: 3, reps: 10 },
          { id: 'shoulder-abduction', sets: 3, reps: 10 },
          { id: 'cross-body-stretch', sets: 3, hold: 30 },
          { id: 'wall-slide', sets: 2, reps: 10 },
        ],
      },
      {
        id: 'impingement', name: 'Shoulder impingement', aka: 'Subacromial pain', stage: 'All stages',
        summary: 'Better shoulder-blade control makes room for the tendons as you lift.',
        goals: ['Shoulder-blade control', 'Pain-free overhead', 'Posture'],
        caution: 'Avoid repeated overhead lifting at work or the gym while symptoms settle.',
        plan: [
          { id: 'scaption', sets: 3, reps: 12 },
          { id: 'wall-slide', sets: 3, reps: 10 },
          { id: 'shoulder-flexion', sets: 2, reps: 10 },
        ],
      },
    ],
  },
  {
    id: 'hip', name: 'Hip & thigh', blurb: 'Hamstrings, hip joint and replacements.', tint: 'teal', joint: 'hip',
    conditions: [
      {
        id: 'hamstring-strain', name: 'Hamstring strain', aka: 'Pulled hamstring', stage: 'Sub-acute',
        summary: 'Progressive strengthening reduces the high re-injury rate of hamstring strains.',
        goals: ['Pain-free stretch', 'Hamstring strength', 'Return to sprinting'],
        caution: 'Stretch gently. No sprinting until strength matches the other side.',
        plan: [
          { id: 'glute-bridge', sets: 3, reps: 12 },
          { id: 'hamstring-curl', sets: 3, reps: 10 },
          { id: 'hip-extension', sets: 3, reps: 10 },
          { id: 'hamstring-stretch', sets: 3, hold: 30 },
        ],
      },
      {
        id: 'hip-oa', name: 'Hip osteoarthritis', aka: 'Arthritic hip', stage: 'Long-term',
        summary: 'Strength around the hip eases pain and keeps walking and stairs easier.',
        goals: ['Walk further', 'Easier stairs', 'Hip strength'],
        caution: 'Aching up to 3/10 during exercise is acceptable if it settles quickly.',
        plan: [
          { id: 'sit-to-stand', sets: 2, reps: 10 },
          { id: 'hip-abduction', sets: 3, reps: 10 },
          { id: 'glute-bridge', sets: 3, reps: 10 },
          { id: 'hip-extension', sets: 3, reps: 10 },
        ],
      },
      {
        id: 'hip-replacement', name: 'Hip replacement', aka: 'Total hip arthroplasty', stage: 'Weeks 2–8 post-op',
        summary: 'Early exercise rebuilds the muscles that steady your new hip.',
        goals: ['Walk without aids', 'Hip strength', 'Independence'],
        caution: 'Follow your surgical hip precautions. Don’t bend the hip past 90° unless cleared.',
        plan: [
          { id: 'heel-slide', sets: 2, reps: 10 },
          { id: 'hip-abduction', sets: 3, reps: 10 },
          { id: 'hip-extension', sets: 3, reps: 10 },
          { id: 'mini-squat', sets: 2, reps: 10 },
        ],
      },
    ],
  },
  {
    id: 'ankle', name: 'Ankle & foot', blurb: 'Sprains, Achilles and heel pain.', tint: 'amber', joint: 'ankle',
    conditions: [
      {
        id: 'ankle-sprain', name: 'Ankle sprain', aka: 'Rolled ankle', stage: 'After the first week',
        summary: 'Balance training after a sprain halves the chance of spraining it again.',
        goals: ['Full movement', 'Balance', 'Calf strength'],
        caution: 'If you could not take four steps after the injury, get it checked for a fracture.',
        plan: [
          { id: 'calf-raise', sets: 3, reps: 15 },
          { id: 'single-leg-balance', sets: 3, hold: 30 },
          { id: 'calf-stretch', sets: 2, hold: 30 },
          { id: 'mini-squat', sets: 2, reps: 12 },
        ],
      },
      {
        id: 'achilles', name: 'Achilles tendinopathy', aka: 'Achilles tendon pain', stage: '12-week programme',
        summary: 'Heavy, slow loading is the cornerstone of Achilles tendon recovery.',
        goals: ['Tendon capacity', 'Pain-free walking', 'Return to running'],
        caution: 'Pain up to 5/10 during heel drops is acceptable if it settles by the next morning.',
        plan: [
          { id: 'heel-drop', sets: 3, reps: 15 },
          { id: 'calf-raise', sets: 3, reps: 15 },
          { id: 'calf-stretch', sets: 2, hold: 30 },
        ],
      },
      {
        id: 'plantar-fasciitis', name: 'Plantar heel pain', aka: 'Plantar fasciitis', stage: 'All stages',
        summary: 'Stretching and strengthening the calf takes strain off the sole of the foot.',
        goals: ['Easier first steps', 'Calf flexibility', 'Foot strength'],
        caution: 'Wear supportive shoes. Seek review if there is numbness or night pain.',
        plan: [
          { id: 'calf-stretch', sets: 3, hold: 30 },
          { id: 'calf-raise', sets: 3, reps: 12 },
          { id: 'single-leg-balance', sets: 2, hold: 30 },
        ],
      },
    ],
  },
  {
    id: 'back', name: 'Lower back', blurb: 'Back pain and sciatica.', tint: 'rose', joint: 'back',
    conditions: [
      {
        id: 'low-back-pain', name: 'Low back pain', aka: 'Non-specific', stage: 'All stages',
        summary: 'Staying active and building trunk strength is the most effective self-care for back pain.',
        goals: ['Move with confidence', 'Core endurance', 'Flexibility'],
        caution: 'Seek urgent care for numbness around the groin, or new bladder or bowel changes.',
        plan: [
          { id: 'knee-to-chest', sets: 2, hold: 30 },
          { id: 'glute-bridge', sets: 3, reps: 12 },
          { id: 'bird-dog', sets: 3, reps: 8 },
          { id: 'hamstring-stretch', sets: 2, hold: 30 },
        ],
      },
      {
        id: 'sciatica', name: 'Sciatica', aka: 'Nerve-related leg pain', stage: 'Settling phase',
        summary: 'Gentle movement keeps the nerve gliding and stops the back stiffening up.',
        goals: ['Reduce leg pain', 'Move comfortably', 'Stay active'],
        caution: 'Stop any exercise that sends pain further down the leg.',
        plan: [
          { id: 'knee-to-chest', sets: 3, hold: 30 },
          { id: 'glute-bridge', sets: 2, reps: 10 },
          { id: 'bird-dog', sets: 2, reps: 8 },
        ],
      },
    ],
  },
];

const CONDITIONS = new Map(AREAS.flatMap((a) => a.conditions.map((c) => [c.id, { ...c, area: a }])));

export const getArea = (id) => AREAS.find((a) => a.id === id);
export const getCondition = (id) => CONDITIONS.get(id);

/** A plan item merged with its exercise and filled-in dose. */
export function planItems(condition) {
  return condition.plan.map((p) => {
    const ex = EXERCISES[p.id];
    const d = ex.defaults;
    return {
      ex,
      sets: p.sets ?? d.sets,
      reps: ex.type === 'reps' ? p.reps ?? d.reps : null,
      hold: ex.type === 'hold' ? p.hold ?? d.hold : null,
      rest: p.rest ?? d.rest ?? 30,
    };
  });
}

export const doseLabel = (it) => (it.hold ? `${it.sets} × ${it.hold}s hold` : `${it.sets} × ${it.reps}`);

/** Rough minutes: work at ~3s a rep plus rests between sets. */
export function minutes(items) {
  const s = items.reduce((t, it) => t + it.sets * (it.hold ?? it.reps * 3.2) + (it.sets - 1) * it.rest + 25, 0);
  return Math.max(5, Math.round(s / 60));
}
