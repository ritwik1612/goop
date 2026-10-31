export const BASE_DATE = new Date();
BASE_DATE.setHours(12, 0, 0, 0);
export function personalTitle(name) {
  const cleaned = String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned || cleaned.toLowerCase() === "your profile")
    return "Your Fitbit";
  return `${cleaned}’s Fitbit`;
}
export function dayKey(offset = 0, base = BASE_DATE) {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function sampleDay(offset = 0) {
  const n = Math.abs(offset);
  return {
    sleep: offset === 0 ? 98 : 76 + ((n * 7) % 23),
    recovery: offset === 0 ? 81 : 35 + ((n * 17) % 62),
    strain: offset === 0 ? 7.0 : Math.round((5 + ((n * 2.3) % 14)) * 10) / 10,
    hrv: offset === 0 ? 64 : 45 + ((n * 7) % 32),
    rhr: offset === 0 ? 54 : 52 + ((n * 3) % 8),
    resp: 16.2 + (n % 3) * 0.1,
    spo2: 97 + (n % 2),
    temp: offset === 0 ? -0.2 : ((n % 5) - 2) * 0.1,
    steps: offset === 0 ? 8420 : 4500 + ((n * 1037) % 8500),
    calories: offset === 0 ? 1842 : 1600 + ((n * 147) % 1000),
    sleepMinutes: offset === 0 ? 472 : 390 + ((n * 13) % 95),
    vo2: 48.2,
  };
}
export function formatDuration(totalSeconds) {
  const value = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(value / 3600),
    m = Math.floor((value % 3600) / 60),
    s = value % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
export function minutesLabel(minutes) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
export function heartZone(bpm, max = 190) {
  const ratio = bpm / max;
  return ratio < 0.5 ? 0 : Math.min(5, Math.floor((ratio - 0.5) * 10) + 1);
}
export function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}
export function newSession(type, now = Date.now()) {
  return {
    type,
    startedAt: now,
    activeSince: now,
    elapsedMs: 0,
    paused: false,
    samples: [],
    sets: [],
    source: "simulated",
  };
}
export function elapsed(session, now = Date.now()) {
  return Math.max(
    0,
    session.elapsedMs + (session.paused ? 0 : now - session.activeSince),
  );
}
export function togglePause(session, now = Date.now()) {
  if (session.paused) {
    session.activeSince = now;
    session.paused = false;
  } else {
    session.elapsedMs = elapsed(session, now);
    session.paused = true;
  }
  return session;
}
export function summarizeSession(session, now = Date.now()) {
  const seconds = Math.floor(elapsed(session, now) / 1000);
  const hrs = session.samples.map((s) => s.hr);
  return {
    id: `workout-${session.startedAt}`,
    type: session.type,
    startedAt: session.startedAt,
    seconds,
    avgHR: hrs.length
      ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length)
      : null,
    maxHR: hrs.length ? Math.max(...hrs) : null,
    samples: session.samples,
    sets: session.sets,
    source: "simulated",
    date: dayKey(),
    calories: null,
    strain: null,
  };
}
