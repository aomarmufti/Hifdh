// Progress, stored on this device only.

const KEY = 'kine.v1';
let memory = null;

function load() {
  if (memory) return memory;
  try { memory = JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { memory = {}; }
  memory.sessions ??= [];
  memory.prefs ??= { voice: true };
  return memory;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* private mode: keep in memory */ }
}

export const store = {
  get program() { return load().program ?? null; },
  setProgram(id) { load().program = id; save(); },
  get prefs() { return load().prefs; },
  setPref(k, v) { load().prefs[k] = v; save(); },
  get sessions() { return load().sessions; },
  addSession(s) {
    load().sessions.push({ id: crypto.randomUUID?.() ?? String(Date.now()), date: new Date().toISOString(), ...s });
    save();
  },
  clear() { memory = { sessions: [], prefs: load().prefs }; save(); },
};

export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/** Consecutive days with at least one session, ending today or yesterday. */
export function streak(sessions, today = new Date()) {
  const days = new Set(sessions.map((s) => dayKey(s.date)));
  const d = new Date(today);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
