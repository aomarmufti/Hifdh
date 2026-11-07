# Kine — AI physiotherapy coach

A browser app that coaches rehab exercises through the camera. Pick a body area and condition
(e.g. **Knee → ACL reconstruction**) and you get a programme of exercises. Each one opens in a
**split view**: an animated demonstration on the left, your live camera on the right with
real-time form feedback, automatic rep, hold and set counting, rest timers and voice cues.
Sessions, form scores, range of motion and pain ratings are tracked over time.

Pose tracking runs **on the device** (MediaPipe Pose Landmarker, WebAssembly/WebGL).
No video is recorded or uploaded. Progress is stored in `localStorage`.

## Run it

```bash
cd physio
npm start            # python3 -m http.server 5173
open http://localhost:5173
```

Browsers only allow the camera over `https://` or on `localhost`. Phones need an HTTPS deploy.

Append `?simulate` to any session URL (e.g. `#/session/acl/2?simulate`) to drive the coach with
the demo figure instead of a camera. The **Watch a demo** button does the same.

## What's in it

| | |
|---|---|
| **5 body areas** | Knee · Shoulder · Hip & thigh · Ankle & foot · Lower back |
| **15 conditions** | ACL reconstruction, runner's knee, meniscus tear, knee OA, rotator cuff tendinopathy, frozen shoulder, impingement, hamstring strain, hip OA, hip replacement, ankle sprain, Achilles tendinopathy, plantar heel pain, low back pain, sciatica |
| **22 exercises** | Each with its own measurement, thresholds, form rules, coaching cues and animated demo |

## How the coaching works

```
camera → MediaPipe (33 landmarks) → exercise.measure(body) → progress 0..1 → RepCounter / HoldTimer
                                   ↘ exercise.rules → debounced form cues ↗
```

- **Measure.** Every exercise maps a pose to one number: a joint angle (knee, hip, shoulder),
  a heel lift, a stance width and so on. Progress is `(value − rest) / (target − rest)`, so the
  state machines don't need to know about direction or units.
- **Side selection.** The working side is the one further towards the target and fully visible.
  It is locked for the length of a rep.
- **Reps** count when progress reaches `min`. A rep that falls short is reported, but not counted.
  Tempo and eccentric (lowering) speed are checked per rep.
- **Form rules** must hold for about 200 ms before a cue fires, so camera noise doesn't trigger them.
- **Score** per rep: depth reached, minus a deduction for each form fault.

| Path | |
|---|---|
| `src/core/geometry.js` | Landmark indices, angles, side-aware body accessor |
| `src/core/reps.js` | `RepCounter`, `HoldTimer`, rep scoring (pure) |
| `src/core/coach.js` | Landmarks → reps, holds, cues (pure) |
| `src/core/skeleton.js` | Kinematics (with 2-bone IK) for the demo figure, plus demo → synthetic landmarks |
| `src/core/pose.js` | MediaPipe loader, camera, skeleton overlay |
| `src/data/exercises.js` | Exercise library |
| `src/data/catalog.js` | Areas → conditions → programmes |
| `src/ui/figure.js` | Canvas renderer for the animated guide |
| `src/app.js` | Router and views |

## Tests

```bash
npm test
```

Every exercise's demo animation is converted into synthetic landmarks and fed through the real
coach. A perfect demo must be counted exactly, mirrored or not, with no form warnings. This keeps
the thresholds, the side selection and the animations consistent with each other.

## Disclaimer

Kine is for education and guided practice. It doesn't diagnose and isn't a substitute for a physiotherapist.
