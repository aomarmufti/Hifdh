import { AREAS, getArea, getCondition, planItems, doseLabel, minutes } from './data/catalog.js';
import { EXERCISES } from './data/exercises.js';
import { Coach, displayNumber } from './core/coach.js';
import { LM } from './core/geometry.js';
import { solve, sample, bounds, toLandmarks } from './core/skeleton.js';
import { loadPoseModel, openCamera, drawSkeleton } from './core/pose.js';
import { store, dayKey, streak } from './core/store.js';
import { FigurePlayer, drawStill } from './ui/figure.js';
import { icon, logo } from './ui/icons.js';

const root = document.getElementById('view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let cleanup = () => {};

// Representative movement for each body-area card.
const AREA_DEMO = { knee: 'mini-squat', shoulder: 'shoulder-abduction', hip: 'hip-abduction', ankle: 'calf-raise', back: 'bird-dog' };

// ── Router ──────────────────────────────────────────────────────────────────
function route() {
  cleanup();
  cleanup = () => {};
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(query);
  document.body.dataset.view = parts[0] ?? 'home';
  document.querySelectorAll('.topnav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === (parts[0] === 'progress' ? 'progress' : 'home')));
  window.scrollTo(0, 0);

  if (parts[0] === 'area' && getArea(parts[1])) return areaView(getArea(parts[1]));
  if (parts[0] === 'condition' && getCondition(parts[1])) return conditionView(getCondition(parts[1]), q);
  if (parts[0] === 'session' && getCondition(parts[1])) return sessionView(getCondition(parts[1]), Number(parts[2] ?? 0), q);
  if (parts[0] === 'progress') return progressView();
  return homeView();
}
window.addEventListener('hashchange', route);

function paintThumbs(scope = root) {
  scope.querySelectorAll('canvas[data-ex]').forEach((c) => {
    const ex = EXERCISES[c.dataset.ex];
    drawStill(c, ex.demo, Number(c.dataset.at ?? 0.45));
  });
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

// ── Home ────────────────────────────────────────────────────────────────────
function homeView() {
  const prog = store.program && getCondition(store.program);
  const sessions = store.sessions;
  const today = sessions.filter((s) => dayKey(s.date) === dayKey(new Date()));
  let programCard = '';
  if (prog) {
    const items = planItems(prog);
    const doneIds = new Set(today.filter((s) => s.conditionId === prog.id).map((s) => s.exerciseId));
    const done = items.filter((it) => doneIds.has(it.ex.id)).length;
    const next = Math.max(0, items.findIndex((it) => !doneIds.has(it.ex.id)));
    const pct = Math.round((done / items.length) * 100);
    programCard = `
      <section class="card program-card">
        <div class="program-main">
          <div class="eyebrow">Your programme · ${esc(prog.area.name)}</div>
          <h2>${esc(prog.name)}</h2>
          <p class="muted">${items.length} exercises · about ${minutes(items)} min · ${esc(prog.stage)}</p>
          <div class="row gap">
            <a class="btn primary" href="#/session/${prog.id}/${done === items.length ? 0 : next}">${icon('play')} ${done === 0 ? 'Start today’s session' : done === items.length ? 'Go again' : 'Continue session'}</a>
            <a class="btn ghost" href="#/condition/${prog.id}">View plan</a>
          </div>
        </div>
        <div class="ring-wrap" role="img" aria-label="${done} of ${items.length} exercises done today">
          ${ring(pct, 96, 8)}
          <div class="ring-label"><strong>${done}/${items.length}</strong><span>today</span></div>
        </div>
      </section>`;
  }

  root.innerHTML = `
    <div class="page">
      <section class="hero">
        <div>
          <div class="eyebrow">${greeting()}</div>
          <h1 class="display">Your physio, <span class="accent">in real time.</span></h1>
          <p class="lede">Pick what you’re recovering from. Kine shows you each exercise, watches your form through the camera, and counts every rep.</p>
          <div class="trust">
            <span>${icon('shield', 16)} Video stays on your device</span>
            <span>${icon('person', 16)} ${Object.keys(EXERCISES).length} guided exercises</span>
          </div>
        </div>
      </section>

      ${programCard}

      <section>
        <div class="section-head"><h2>Where are you recovering?</h2><span class="muted">${AREAS.reduce((n, a) => n + a.conditions.length, 0)} conditions</span></div>
        <div class="area-grid">
          ${AREAS.map((a) => `
            <a class="card area-card tint-${a.tint}" href="#/area/${a.id}">
              <div class="area-art"><canvas data-ex="${AREA_DEMO[a.id]}" data-at="0.45"></canvas></div>
              <div class="area-body">
                <h3>${esc(a.name)}</h3>
                <p class="muted">${esc(a.blurb)}</p>
                <div class="chips">${a.conditions.slice(0, 3).map((c) => `<span class="chip">${esc(c.name)}</span>`).join('')}</div>
              </div>
              <span class="go">${icon('chevron')}</span>
            </a>`).join('')}
        </div>
      </section>

      <section class="how">
        <div class="section-head"><h2>How it works</h2></div>
        <div class="how-grid">
          ${[
            ['1', 'Choose your condition', 'Programmes for common injuries and post-op recovery, built from standard physiotherapy protocols.'],
            ['2', 'Follow the guide', 'A split view puts the demonstration right beside your camera, so you can match it move for move.'],
            ['3', 'Get coached live', 'Live feedback on range and form, automatic rep and set counting, and progress over time.'],
          ].map(([n, t, d]) => `<div class="how-step"><span class="step-n">${n}</span><h3>${t}</h3><p class="muted">${d}</p></div>`).join('')}
        </div>
      </section>

      ${disclaimer()}
    </div>`;
  paintThumbs();
}

const disclaimer = () => `
  <aside class="disclaimer">${icon('info', 18)}<p>Kine is for education and guided practice. It doesn’t diagnose or replace a physiotherapist. Stop if you feel sharp pain, and follow your clinician’s advice.</p></aside>`;

function ring(pct, size = 96, stroke = 8, cls = '') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg class="ring ${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fill" stroke-width="${stroke}"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(100, pct) / 100)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

// ── Area ────────────────────────────────────────────────────────────────────
function areaView(area) {
  root.innerHTML = `
    <div class="page">
      <nav class="crumbs"><a href="#/">Programmes</a>${icon('chevron', 16)}<span>${esc(area.name)}</span></nav>
      <header class="page-head tint-${area.tint}">
        <div class="head-art"><canvas data-ex="${AREA_DEMO[area.id]}"></canvas></div>
        <div>
          <h1 class="display sm">${esc(area.name)}</h1>
          <p class="lede">${esc(area.blurb)} Choose the condition that matches yours.</p>
        </div>
      </header>
      <div class="list">
        ${area.conditions.map((c) => {
          const items = planItems({ plan: c.plan });
          return `
          <a class="card cond-row" href="#/condition/${c.id}">
            <div class="cond-main">
              <div class="row gap-s wrap"><h3>${esc(c.name)}</h3><span class="tag">${esc(c.stage)}</span></div>
              <p class="aka">${esc(c.aka)}</p>
              <p class="muted">${esc(c.summary)}</p>
              <div class="thumbs">${items.map((it) => `<canvas data-ex="${it.ex.id}" title="${esc(it.ex.name)}"></canvas>`).join('')}</div>
            </div>
            <div class="cond-meta">
              <span>${icon('person', 16)} ${items.length} exercises</span>
              <span>${icon('timer', 16)} ~${minutes(items)} min</span>
              <span class="go">${icon('chevron')}</span>
            </div>
          </a>`;
        }).join('')}
      </div>
      ${disclaimer()}
    </div>`;
  paintThumbs();
}

// ── Condition / programme ───────────────────────────────────────────────────
function conditionView(c, q) {
  const items = planItems(c);
  const mine = store.program === c.id;
  const doneToday = new Set(store.sessions.filter((s) => s.conditionId === c.id && dayKey(s.date) === dayKey(new Date())).map((s) => s.exerciseId));
  root.innerHTML = `
    <div class="page">
      <nav class="crumbs"><a href="#/">Programmes</a>${icon('chevron', 16)}<a href="#/area/${c.area.id}">${esc(c.area.name)}</a>${icon('chevron', 16)}<span>${esc(c.name)}</span></nav>
      ${q.has('done') ? `<div class="banner good">${icon('check')} Session complete. Nice work — your progress has been saved.</div>` : ''}
      <header class="cond-head">
        <div>
          <div class="row gap-s wrap"><span class="tag">${esc(c.stage)}</span><span class="tag subtle">${esc(c.aka)}</span></div>
          <h1 class="display sm">${esc(c.name)}</h1>
          <p class="lede">${esc(c.summary)}</p>
          <div class="goals">${c.goals.map((g) => `<span class="goal">${icon('check', 16)}${esc(g)}</span>`).join('')}</div>
        </div>
        <div class="cond-cta card">
          <div class="stat-row">
            <div><strong>${items.length}</strong><span>exercises</span></div>
            <div><strong>~${minutes(items)}</strong><span>minutes</span></div>
            <div><strong>${items.reduce((n, it) => n + it.sets, 0)}</strong><span>sets</span></div>
          </div>
          <a class="btn primary block" href="#/session/${c.id}/0">${icon('play')} Start session</a>
          <button class="btn ghost block" id="pin">${mine ? `${icon('check', 18)} This is your programme` : 'Make this my programme'}</button>
        </div>
      </header>

      <aside class="callout warn">${icon('warn', 18)}<p><strong>Before you start.</strong> ${esc(c.caution)}</p></aside>

      <section>
        <div class="section-head"><h2>Exercises</h2><span class="muted">Do them in order</span></div>
        <ol class="ex-list">
          ${items.map((it, i) => `
            <li>
              <a class="card ex-row" href="#/session/${c.id}/${i}">
                <span class="ex-n">${doneToday.has(it.ex.id) ? icon('check', 18) : i + 1}</span>
                <div class="ex-thumb"><canvas data-ex="${it.ex.id}"></canvas></div>
                <div class="ex-main">
                  <h3>${esc(it.ex.name)}</h3>
                  <p class="muted">${esc(it.ex.summary)}</p>
                  <div class="row gap-s wrap meta">
                    <span class="chip strong">${doseLabel(it)}</span>
                    <span class="chip">${icon('camera', 14)} ${it.ex.camera === 'side' ? 'Side-on' : 'Facing camera'}</span>
                    <span class="chip">${esc(it.ex.muscles)}</span>
                  </div>
                </div>
                <span class="go">${icon('play', 18)}</span>
              </a>
            </li>`).join('')}
        </ol>
      </section>
      ${disclaimer()}
    </div>`;
  root.querySelector('#pin').onclick = () => { store.setProgram(mine ? null : c.id); conditionView(c, q); };
  paintThumbs();
}

// ── Session: the split-view coach ───────────────────────────────────────────
const FOCUS_LM = {
  legN: [23, 25, 27, 29, 31], legF: [24, 26, 28, 30, 32], legL: [23, 25, 27, 29, 31], legR: [24, 26, 28, 30, 32],
  armN: [11, 13, 15], armF: [12, 14, 16], armL: [11, 13, 15], armR: [12, 14, 16], torso: [11, 12, 23, 24],
};

function sessionView(cond, idx, q) {
  const items = planItems(cond);
  const it = items[idx];
  if (!it) { location.hash = `#/condition/${cond.id}`; return; }
  const ex = it.ex;
  const isHold = ex.type === 'hold';
  const goal = isHold ? it.hold : it.reps;
  const focus = new Set((ex.demo.focus ?? []).flatMap((f) => FOCUS_LM[f] ?? []));
  // Both sides can be the working side, so highlight the mirror joints too.
  for (const i of [...focus]) if (i >= 11) focus.add(i % 2 ? i + 1 : i - 1);

  root.innerHTML = `
    <div class="coach">
      <header class="coach-bar">
        <a class="icon-btn" href="#/condition/${cond.id}" aria-label="Back to programme">${icon('back')}</a>
        <div class="coach-title">
          <div class="eyebrow">${esc(cond.name)} · Exercise ${idx + 1} of ${items.length}</div>
          <h1>${esc(ex.name)}</h1>
        </div>
        <div class="set-pills" id="sets" aria-label="Sets">${Array.from({ length: it.sets }, (_, i) => `<span data-i="${i}"></span>`).join('')}</div>
        <button class="icon-btn" id="voice" aria-label="Voice coaching"></button>
      </header>

      <div class="split">
        <section class="pane guide">
          <div class="pane-label"><span class="dot"></span>Guide</div>
          <div class="figure-wrap"><canvas class="figure" id="figure"></canvas></div>
          <div class="caption" id="caption" aria-live="polite"></div>
          <div class="guide-info">
            <details open>
              <summary>How to do it</summary>
              <ol class="steps">${ex.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
            </details>
            <ul class="cues">${ex.cues.map((s) => `<li>${icon('check', 16)}${esc(s)}</li>`).join('')}</ul>
            <p class="cam-tip">${icon('camera', 16)} ${esc(ex.cameraTip)}</p>
          </div>
        </section>

        <section class="pane cam" id="cam">
          <video id="video" playsinline muted></video>
          <canvas class="overlay" id="overlay"></canvas>
          <div class="pane-label light"><span class="dot live"></span>You</div>

          <div class="hud" id="hud" hidden>
            <div class="hud-top">
              <span class="status" id="status"><span class="dot"></span><span>Looking for you…</span></span>
              <span class="set-label" id="setLabel">Set 1 of ${it.sets}</span>
            </div>
            <div class="meter" aria-hidden="true"><div class="meter-fill" id="meter"></div><div class="meter-target"></div></div>
            <div class="hud-bottom">
              <div class="count" id="countBox">
                <div class="count-n" id="count">0</div>
                <div class="count-of">/ ${goal}${isHold ? 's hold' : ' reps'}</div>
              </div>
              <div class="readout"><span id="readLabel">${esc(ex.display?.label ?? 'Range')}</span><strong id="read">—</strong></div>
            </div>
            <div class="cue" id="cue" role="status" aria-live="assertive"></div>
            <button class="tap-zone" id="tap" hidden>${icon('tap', 28)}<span>${isHold ? 'Tap to start the hold' : 'Tap after each rep'}</span></button>
          </div>

          <div class="gate" id="gate">
            <div class="gate-card">
              <div class="gate-icon">${icon('camera', 28)}</div>
              <h2>Ready when you are</h2>
              <p>${esc(ex.cameraTip)}</p>
              <button class="btn primary block" id="useCam">${icon('camera', 18)} Start camera coach</button>
              <div class="row gap-s">
                <button class="btn tonal grow" id="useSim">${icon('person', 18)} Watch a demo</button>
                <button class="btn tonal grow" id="useTap">${icon('tap', 18)} No camera</button>
              </div>
              <p class="fine">${icon('shield', 14)} Processed on this device. Nothing is recorded or uploaded.</p>
            </div>
          </div>
          <div class="stage" id="stage" hidden></div>
        </section>
      </div>
    </div>`;

  const $ = (id) => root.querySelector('#' + id);
  const cam = $('cam'), video = $('video'), overlay = $('overlay');
  const octx = overlay.getContext('2d');
  const coach = new Coach(ex, { reps: it.reps, hold: it.hold });

  // Guide animation
  const player = new FigurePlayer($('figure'), ex.demo, { onLabel: (l) => { $('caption').textContent = l; } });
  player.start();

  // Voice
  const voiceBtn = $('voice');
  const paintVoice = () => { voiceBtn.innerHTML = icon(store.prefs.voice ? 'voice' : 'mute'); voiceBtn.classList.toggle('off', !store.prefs.voice); };
  paintVoice();
  voiceBtn.onclick = () => { store.setPref('voice', !store.prefs.voice); paintVoice(); if (!store.prefs.voice) speechSynthesis?.cancel(); };
  let lastSpoken = '', lastSpokenAt = 0;
  const speak = (text, force = false) => {
    if (!store.prefs.voice || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (!force && text === lastSpoken && now - lastSpokenAt < 6000) return;
    lastSpoken = text; lastSpokenAt = now;
    if (force) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    speechSynthesis.speak(u);
  };
  let audio;
  const blip = (freq = 880) => {
    try {
      audio ??= new AudioContext();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = freq; g.gain.setValueAtTime(0.08, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);
      o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.2);
    } catch { /* audio is optional */ }
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(30);
  };

  // Session state
  const S = { mode: 'gate', source: null, set: 0, sets: [], started: 0, stop: null, landmarker: null, raf: 0, timer: 0, holdStart: 0, manualReps: 0 };
  const setPills = () => root.querySelectorAll('#sets span').forEach((el, i) => {
    el.className = i < S.set ? 'done' : i === S.set && S.mode !== 'summary' ? 'now' : '';
  });
  setPills();

  const stage = $('stage');
  const showStage = (html) => { stage.innerHTML = html; stage.hidden = !html; };

  function fitVideo() {
    const w = cam.clientWidth, h = cam.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    overlay.width = w * dpr; overlay.height = h * dpr;
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vw = video.videoWidth || w, vh = video.videoHeight || h;
    const k = Math.max(w / vw, h / vh);
    return { w, h, fit: { sx: vw * k, sy: vh * k, dx: (w - vw * k) / 2, dy: (h - vh * k) / 2 }, aspect: vw / vh };
  }
  let geo = null;
  const ro = new ResizeObserver(() => { geo = fitVideo(); player.restyle(); });
  ro.observe(cam);

  // Simulated body: the guide's own movement, played a little slower.
  const simBox = bounds(ex.demo);
  const simLandmarks = (now) => {
    const pose = sample(ex.demo, ((now - S.started) / 1000) / 1.35).pose;
    const aspect = geo.w / geo.h;
    const span = Math.max((simBox.y1 - simBox.y0) * 1.3, ((simBox.x1 - simBox.x0) * 1.3) / aspect);
    const lm = toLandmarks(solve(pose, ex.demo.view), { aspect, span, cx: (simBox.x0 + simBox.x1) / 2, cy: (simBox.y0 + simBox.y1) / 2 });
    return lm.map((p) => ({ ...p, x: p.x + (Math.random() - 0.5) * 0.002, y: p.y + (Math.random() - 0.5) * 0.002 }));
  };

  async function begin(source) {
    S.source = source;
    $('gate').hidden = true;
    $('hud').hidden = false;
    cam.classList.add('on', source);
    geo = fitVideo();
    if (source === 'camera') {
      // Show the live picture as soon as the camera opens; the pose model loads behind it.
      showStage(`<div class="stage-card"><div class="spinner"></div><p>Opening the camera…</p></div>`);
      try {
        S.stop = await openCamera(video);
        geo = fitVideo();
      } catch (err) {
        const denied = err?.name === 'NotAllowedError';
        return cameraProblem(denied ? 'Camera access was blocked' : 'The camera couldn’t start',
          denied ? 'Allow camera access in your browser settings, or carry on by counting reps yourself.' : err?.message);
      }
      showStage('');
      S.mode = 'loading';
      setStatus('search', 'Loading the coach…');
      loadPoseModel().then((lmk) => {
        S.landmarker = lmk;
        if (S.mode === 'loading') S.mode = 'waiting';
      }).catch((err) => cameraProblem('The coach couldn’t load', `${err?.message ?? 'Check your connection and try again.'}`));
    } else if (source === 'sim') {
      S.mode = 'waiting';
    } else {
      $('tap').hidden = false;
      $('status').querySelector('span:last-child').textContent = 'Manual mode';
      $('status').className = 'status manual';
      startCountdown();
    }
    S.started = performance.now();
    loop();
  }
  function cameraProblem(title, detail) {
    S.mode = 'gate';
    showStage(`<div class="stage-card">
      <div class="gate-icon warn">${icon('warn', 26)}</div>
      <h2>${esc(title)}</h2>
      <p>${esc(detail ?? 'Please try again.')}</p>
      <button class="btn primary block" id="toTap">${icon('tap', 18)} Count reps myself</button>
    </div>`);
    stage.querySelector('#toTap').onclick = () => {
      cancelAnimationFrame(S.raf);
      S.stop?.(); S.stop = null;
      cam.classList.remove('camera');
      octx.clearRect(0, 0, geo.w, geo.h);
      showStage('');
      begin('manual');
    };
  }
  $('useCam').onclick = () => begin('camera');
  $('useSim').onclick = () => begin('sim');
  $('useTap').onclick = () => begin('manual');

  let seenSince = 0;
  let lastVideoTime = -1, lastLms = null;
  function loop() {
    S.raf = requestAnimationFrame(loop);
    const now = performance.now();
    let lms = null, aspect = geo.aspect;
    if (S.source === 'camera' && S.landmarker && video.readyState >= 2) {
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        try { lastLms = S.landmarker.detectForVideo(video, now).landmarks?.[0] ?? null; } catch { lastLms = null; }
      }
      lms = lastLms;
    } else if (S.source === 'sim') {
      lms = simLandmarks(now);
      aspect = geo.w / geo.h;
    }
    // What to paint on the person this frame: filled in by the mode handling below.
    const ov = { tone: 'move', side: null, label: null };

    if (S.mode === 'waiting') {
      const ok = coach.visible(lms, aspect);
      setStatus(ok ? 'ok' : 'search', ok ? 'In position' : 'Step into view');
      ov.tone = ok ? 'good' : 'idle';
      showCue(ok ? { text: 'Hold still — starting…', tone: 'info' } : { text: ex.cameraTip, tone: 'info' });
      seenSince = ok ? seenSince || now : 0;
      if (ok && now - seenSince > 1200) startCountdown();
    } else if (S.mode === 'active' && S.source !== 'manual') {
      const st = coach.update(lms, (now - S.started) / 1000, aspect);
      setStatus(st.tracking ? 'ok' : 'search', st.tracking ? 'Tracking' : 'Step into view');
      paintMeter(st.progress, st.tracking);
      if (st.value != null && st.tracking) $('read').textContent = st.display;
      showCue(st.cue);
      for (const ev of st.events) onEvent(ev);
      ov.side = st.side;
      ov.tone = !st.tracking ? 'idle' : st.cue?.tone === 'warn' ? 'warn' : st.progress >= 1 ? 'good' : 'move';
      ov.label = st.tracking ? st.display : null;
      if (isHold) paintHold(coach.counter.held, st.inZone);
    } else if (S.mode === 'active' && S.source === 'manual' && isHold && S.holdStart) {
      const held = (now - S.holdStart) / 1000;
      paintHold(held, true);
      paintMeter(Math.min(1, held / goal), true);
      if (held >= goal) { S.holdStart = 0; blip(1200); finishSet(); }
    }
    paintOverlay(lms, ov);
  }

  function paintOverlay(lms, ov) {
    if (S.source === 'manual') return;
    const sim = S.source === 'sim';
    drawSkeleton(octx, lms, geo.w, geo.h, {
      fit: sim ? { sx: geo.w, sy: geo.h, dx: 0, dy: 0 } : geo.fit,
      mirror: !sim,                        // selfie view, like a mirror
      focus, side: ex.sides === 'none' ? null : ov.side,
      arc: ex.arc, bend: ex.display?.fn?.(0) === 180, label: ov.label, tone: ov.tone,
    });
  }

  function setStatus(kind, text) {
    const el = $('status');
    el.className = 'status ' + kind;
    el.lastElementChild.textContent = text;
  }
  let cueText = '';
  function showCue(cue) {
    const el = $('cue');
    const text = cue?.text ?? '';
    if (text === cueText) return;
    cueText = text;
    el.className = 'cue ' + (cue?.tone ?? '') + (text ? ' show' : '');
    el.textContent = text;
    if (text && S.mode === 'active' && cue.tone !== 'info') speak(text);
  }
  function paintMeter(p, on) {
    const m = $('meter');
    m.style.height = `${Math.max(0, Math.min(1.15, p)) / 1.15 * 100}%`;
    m.classList.toggle('hit', p >= 1);
    m.classList.toggle('dim', !on);
  }
  function paintHold(held, inZone) {
    $('count').textContent = Math.floor(held);
    $('countBox').classList.toggle('paused', !inZone);
  }
  function bump() {
    const el = $('countBox');
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  function onEvent(ev) {
    if (ev.type === 'rep') {
      $('count').textContent = ev.count;
      bump(); blip(ev.score >= 95 ? 988 : 740);
      speak(String(ev.count), true);
      if (ev.count >= goal) finishSet();
    } else if (ev.type === 'hold-done') {
      blip(1200); finishSet();
    }
  }

  function startCountdown() {
    S.mode = 'countdown';
    let n = 3;
    const tick = () => {
      if (S.mode !== 'countdown') return;
      if (n === 0) {
        showStage('');
        S.mode = 'active';
        coach.nextSet();
        $('count').textContent = '0';
        $('setLabel').textContent = `Set ${S.set + 1} of ${it.sets}`;
        speak(isHold ? 'Go. Get into position and hold.' : 'Go', true);
        return;
      }
      showStage(`<div class="countdown"><span>${n}</span><p>Set ${S.set + 1} of ${it.sets}</p></div>`);
      speak(String(n), true);
      n--;
      S.timer = setTimeout(tick, 900);
    };
    tick();
  }

  function finishSet() {
    const reps = S.source === 'manual' ? (isHold ? 1 : S.manualReps) : isHold ? (coach.counter.done ? 1 : 0) : coach.counter.count;
    const held = isHold ? Math.round(S.source === 'manual' ? goal : coach.counter.held) : null;
    const scores = coach.reps.slice(S.sets.reduce((n, s) => n + (s.scored ?? 0), 0)).map((r) => r.score);
    S.sets.push({ reps, held, scored: scores.length, form: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null });
    S.manualReps = 0;
    S.set++;
    setPills();
    if (S.set >= it.sets) return askPain();
    S.mode = 'rest';
    speak(`Set ${S.set} done. Rest.`, true);
    let left = it.rest;
    const paint = () => {
      const pct = (1 - left / it.rest) * 100;
      showStage(`<div class="stage-card rest">
        <div class="eyebrow">Set ${S.set} of ${it.sets} complete</div>
        <div class="ring-wrap big">${ring(pct, 148, 10, 'light')}<div class="ring-label"><strong>${left}</strong><span>seconds rest</span></div></div>
        <p>Next: set ${S.set + 1} · ${isHold ? `${goal}s hold` : `${goal} reps`}</p>
        <button class="btn primary block" id="skip">${icon('skip', 18)} Skip rest</button>
      </div>`);
      stage.querySelector('#skip').onclick = endRest;
    };
    const endRest = () => {
      clearInterval(S.timer);
      if (S.mode !== 'rest') return;
      if (S.source === 'manual') return startCountdown();
      S.mode = 'waiting'; seenSince = 0; showStage('');
    };
    paint();
    S.timer = setInterval(() => { left--; if (left <= 0) endRest(); else paint(); }, 1000);
  }

  function askPain() {
    S.mode = 'pain';
    speak('Exercise complete. How did that feel?', true);
    showStage(`<div class="stage-card pain">
      <div class="eyebrow">All ${it.sets} sets done</div>
      <h2>How did that feel?</h2>
      <p>Rate any pain during the exercise. It helps track your recovery.</p>
      <div class="pain-scale" role="radiogroup" aria-label="Pain from 0 to 10">
        ${Array.from({ length: 11 }, (_, i) => `<button role="radio" aria-checked="false" data-v="${i}" class="p${i <= 3 ? 'lo' : i <= 6 ? 'mid' : 'hi'}">${i}</button>`).join('')}
      </div>
      <div class="pain-ends"><span>No pain</span><span>Worst imaginable</span></div>
      <button class="btn primary block" id="savePain" disabled>See summary</button>
    </div>`);
    let pain = null;
    stage.querySelectorAll('.pain-scale button').forEach((b) => b.onclick = () => {
      pain = Number(b.dataset.v);
      stage.querySelectorAll('.pain-scale button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      stage.querySelector('#savePain').disabled = false;
    });
    stage.querySelector('#savePain').onclick = () => summary(pain);
  }

  function summary(pain) {
    S.mode = 'summary';
    const sum = coach.summary();
    const totalReps = S.sets.reduce((n, s) => n + s.reps, 0);
    const seconds = Math.round((performance.now() - S.started) / 1000);
    const record = {
      conditionId: cond.id, exerciseId: ex.id, mode: S.source,
      sets: S.sets.map(({ reps, held, form }) => ({ reps, held, form })),
      reps: isHold ? null : totalReps,
      held: isHold ? S.sets.reduce((n, s) => n + (s.held ?? 0), 0) : null,
      form: S.source === 'manual' ? null : sum.form,
      best: S.source === 'manual' ? null : sum.bestNumber,
      pain, seconds,
    };
    const prev = store.sessions.filter((s) => s.exerciseId === ex.id && s.best != null).at(-1);
    if (S.source !== 'sim') store.addSession(record);
    const delta = prev && record.best != null ? record.best - prev.best : null;
    const next = items[idx + 1];
    speak(next ? `Nice work. Next up, ${next.ex.name}.` : 'Session complete. Great work today.', true);
    showStage(`<div class="stage-card summary">
      <div class="eyebrow">${S.source === 'sim' ? 'Demo run — not saved' : 'Saved to your progress'}</div>
      <h2>${esc(ex.name)} complete</h2>
      <div class="sum-grid">
        <div><strong>${isHold ? `${record.held}s` : totalReps}</strong><span>${isHold ? 'held' : 'reps'}</span></div>
        <div><strong>${record.form ?? '—'}</strong><span>form score</span></div>
        <div><strong>${sum.best && S.source !== 'manual' ? esc(sum.best) : '—'}</strong><span>best ${esc((ex.display?.label ?? 'range').toLowerCase())}${delta ? ` <em class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${delta}</em>` : ''}</span></div>
        <div><strong>${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}</strong><span>time</span></div>
      </div>
      <div class="set-bars">${S.sets.map((s, i) => `<span><em>Set ${i + 1}</em>${isHold ? `${s.held}s` : `${s.reps} reps`}${s.form != null ? ` · ${s.form}` : ''}</span>`).join('')}</div>
      ${next
        ? `<a class="btn primary block" href="#/session/${cond.id}/${idx + 1}">Next: ${esc(next.ex.name)} ${icon('chevron', 18)}</a>`
        : `<a class="btn primary block" href="#/condition/${cond.id}?done">${icon('check', 18)} Finish session</a>`}
      <div class="row gap-s">
        <button class="btn tonal grow" id="again">Repeat</button>
        <a class="btn tonal grow" href="#/progress">${icon('chart', 18)} Progress</a>
      </div>
    </div>`);
    stage.querySelector('#again').onclick = () => route();
  }

  // Manual taps
  $('tap').onclick = () => {
    if (S.mode !== 'active') return;
    if (isHold) { if (!S.holdStart) { S.holdStart = performance.now(); $('tap').querySelector('span').textContent = 'Holding…'; } return; }
    S.manualReps++;
    $('count').textContent = S.manualReps;
    bump(); blip();
    speak(String(S.manualReps), true);
    if (S.manualReps >= goal) finishSet();
  };

  if (q.has('simulate')) begin('sim');

  cleanup = () => {
    cancelAnimationFrame(S.raf);
    clearTimeout(S.timer); clearInterval(S.timer);
    S.stop?.();
    player.stop();
    ro.disconnect();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  };
}

// ── Progress ────────────────────────────────────────────────────────────────
function progressView() {
  const sessions = [...store.sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!sessions.length) {
    root.innerHTML = `<div class="page">
      <h1 class="display sm">Progress</h1>
      <div class="empty card">
        <div class="gate-icon">${icon('chart', 28)}</div>
        <h2>Nothing tracked yet</h2>
        <p class="muted">Finish an exercise with the camera coach and your reps, form score and range of motion will appear here.</p>
        <a class="btn primary" href="#/">Choose a programme</a>
      </div></div>`;
    return;
  }
  const week = sessions.filter((s) => Date.now() - new Date(s.date) < 7 * 864e5);
  const formed = week.filter((s) => s.form != null);
  const avgForm = formed.length ? Math.round(formed.reduce((a, s) => a + s.form, 0) / formed.length) : null;
  const totalReps = sessions.reduce((n, s) => n + (s.reps ?? 0), 0);
  const days = 28;
  const byDay = new Map();
  for (const s of sessions) { const k = dayKey(s.date); byDay.set(k, (byDay.get(k) ?? 0) + (s.reps ?? (s.held ? Math.round(s.held / 3) : 0)) ); }
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
    return { d, v: byDay.get(dayKey(d)) ?? 0 };
  });

  const byEx = new Map();
  for (const s of sessions) { if (!byEx.has(s.exerciseId)) byEx.set(s.exerciseId, []); byEx.get(s.exerciseId).push(s); }

  root.innerHTML = `
    <div class="page">
      <div class="section-head"><h1 class="display sm">Progress</h1><button class="btn ghost sm" id="reset">Reset data</button></div>
      <div class="kpis">
        ${kpi('flame', streak(sessions), 'day streak')}
        ${kpi('person', sessions.length, 'exercises completed')}
        ${kpi('check', totalReps.toLocaleString(), 'reps logged')}
        ${kpi('chart', avgForm ?? '—', 'avg form · 7 days')}
      </div>
      <section class="card chart-card">
        <div class="chart-head"><h2>Daily activity</h2><span class="muted">Reps per day · last 4 weeks</span></div>
        ${barChart(series)}
      </section>
      <section>
        <div class="section-head"><h2>By exercise</h2></div>
        <div class="ex-progress">
          ${[...byEx.entries()].map(([id, list]) => exerciseCard(EXERCISES[id], list)).join('')}
        </div>
      </section>
      <section class="card">
        <div class="chart-head"><h2>Recent</h2></div>
        <table class="table">
          <thead><tr><th>Date</th><th>Exercise</th><th>Volume</th><th>Form</th><th>Pain</th></tr></thead>
          <tbody>${sessions.slice(-12).reverse().map((s) => `<tr>
            <td>${new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
            <td>${esc(EXERCISES[s.exerciseId]?.name)}</td>
            <td class="num">${s.reps != null ? `${s.reps} reps` : `${s.held}s`}</td>
            <td class="num">${s.form ?? '—'}</td>
            <td class="num"><span class="pain-dot p${s.pain == null ? 'na' : s.pain <= 3 ? 'lo' : s.pain <= 6 ? 'mid' : 'hi'}"></span>${s.pain ?? '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </section>
    </div>`;
  root.querySelector('#reset').onclick = () => { if (confirm('Delete all progress on this device?')) { store.clear(); progressView(); } };
  wireTooltips(root);
}

const kpi = (ic, v, label) => `<div class="card kpi"><span class="kpi-ic">${icon(ic, 18)}</span><strong>${v}</strong><span>${label}</span></div>`;

function barChart(series) {
  const W = 720, H = 180, pad = { l: 28, r: 8, t: 12, b: 22 };
  const max = Math.max(10, ...series.map((s) => s.v));
  const nice = Math.ceil(max / 10) * 10;
  const bw = (W - pad.l - pad.r) / series.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
  const grid = [0, nice / 2, nice].map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pad.l - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${v}</text>`).join('');
  const bars = series.map((s, i) => {
    const x = pad.l + i * bw + 1, h = Math.max(0, y(0) - y(s.v)), w = bw - 2;
    const label = `${s.d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${s.v} reps`;
    const bar = s.v ? `<path class="bar" d="M${x},${y(0)} v${-Math.max(0, h - 4)} q0,-4 4,-4 h${w - 8} q4,0 4,4 v${Math.max(0, h - 4)} z"/>` : '';
    return `<g class="hit" data-tip="${label}"><rect x="${x - 1}" y="${pad.t}" width="${bw}" height="${H - pad.t - pad.b}" fill="transparent"/>${bar}</g>
      ${i % 7 === 6 || i === series.length - 1 ? `<text x="${x + w / 2}" y="${H - 6}" class="axis" text-anchor="middle">${s.d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>` : ''}`;
  }).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Reps per day over the last four weeks">${grid}${bars}</svg><div class="tip" hidden></div></div>`;
}

function sparkline(values, label) {
  const W = 220, H = 56, p = 6;
  if (values.length < 2) return `<div class="spark-empty muted">Do this again to see a trend</div>`;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => [p + (i * (W - 2 * p)) / (values.length - 1), H - p - ((v - lo) / span) * (H - 2 * p)]);
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    <path d="${d}" class="spark-line"/>
    ${pts.map((q, i) => `<circle cx="${q[0]}" cy="${q[1]}" r="9" class="hit-dot" data-tip="${esc(label)}: ${values[i]}"/>`).join('')}
    <circle cx="${last[0]}" cy="${last[1]}" r="4" class="spark-dot"/>
  </svg>`;
}

function exerciseCard(ex, list) {
  if (!ex) return '';
  const best = list.filter((s) => s.best != null).map((s) => s.best);
  const form = list.filter((s) => s.form != null).map((s) => s.form);
  const change = best.length > 1 ? best[best.length - 1] - best[0] : null;
  const unit = ex.display?.unit ?? '';
  return `<div class="card exp">
    <div class="exp-head">
      <div class="ex-thumb sm"><canvas data-ex="${ex.id}"></canvas></div>
      <div><h3>${esc(ex.name)}</h3><p class="muted">${list.length} session${list.length > 1 ? 's' : ''} · last ${new Date(list[list.length - 1].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p></div>
    </div>
    <div class="exp-stats">
      <div><span class="muted">Best ${esc((ex.display?.label ?? 'range').toLowerCase())}</span><strong>${best.length ? Math.max(...best) + unit : '—'}</strong>${change ? `<em class="${change > 0 ? 'up' : 'down'}">${change > 0 ? '+' : ''}${change}${unit} since first</em>` : ''}</div>
      <div><span class="muted">Form score</span><strong>${form.length ? form[form.length - 1] : '—'}</strong></div>
    </div>
    ${sparkline((best.length > 1 ? best : form).slice(-12), best.length > 1 ? `${ex.display?.label ?? 'Range'}` : 'Form score')}
  </div>`;
}

function wireTooltips(scope) {
  paintThumbs(scope);
  scope.querySelectorAll('.chart, .exp').forEach((box) => {
    let tip = box.querySelector('.tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; box.appendChild(tip); }
    box.addEventListener('pointermove', (e) => {
      const t = e.target.closest('[data-tip]');
      if (!t) { tip.hidden = true; return; }
      const r = box.getBoundingClientRect();
      tip.textContent = t.dataset.tip;
      tip.hidden = false;
      tip.style.left = `${Math.min(r.width - 140, Math.max(0, e.clientX - r.left - 60))}px`;
      tip.style.top = `${e.clientY - r.top - 42}px`;
    });
    box.addEventListener('pointerleave', () => { tip.hidden = true; });
  });
}

// ── Boot ────────────────────────────────────────────────────────────────────
document.getElementById('brand').innerHTML = `${logo(28)}<span>Kine</span>`;
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => route());
route();

// Expose for debugging in the console.
window.kine = { store, EXERCISES, displayNumber, LM };
