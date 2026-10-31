import {
  BASE_DATE,
  dayKey,
  sampleDay,
  personalTitle,
  formatDuration,
  minutesLabel,
  heartZone,
  escapeHTML as esc,
  newSession,
  elapsed,
  togglePause,
  summarizeSession,
} from "./model.js";
import { addLocation, workoutZoneTimes } from "./workout-data.js";
import { createLiveHeartRate } from "./live-hr.js";
import { createHealthspanSphere } from "./sphere.js";
import {
  performanceChart,
  sleepStackChart,
  heartRateChart,
  stressChart,
} from "./charts.js";
import { createEnhancements } from "./enhancements.js";
let enhancements = null,
  sphereStop = null;
const $ = (s) => document.querySelector(s);
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(`goop:${key}`)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(`goop:${key}`, JSON.stringify(value));
    return true;
  } catch {
    toast("Storage unavailable. This change will last only for this visit.");
    return false;
  }
};
let offset = 0,
  range = "W",
  activeMetric = null,
  session = read("session", null),
  workouts = read("workouts", []),
  journal = read("journal", {}),
  dashboard = read("dashboard", [
    "hrv",
    "rhr",
    "steps",
    "zones13",
    "zones45",
    "vo2",
    "calories",
  ]),
  profile = read("profile", { name: "Your profile", wake: "07:30" }),
  journalDraft = {},
  sphereFrame = 0,
  toastTimer,
  pendingActivity = null,
  countdownTimer = null,
  gpsWatch = null;
const liveSensor = createLiveHeartRate({
  onReading(reading) {
    if (!session || session.paused || session.source !== "bluetooth") return;
    const seconds = Math.floor(elapsed(session) / 1000);
    const point = { seconds, hr: reading.bpm };
    if (session.samples.at(-1)?.seconds === seconds)
      session.samples[session.samples.length - 1] = point;
    else session.samples.push(point);
    if (session.samples.length > 10800) session.samples.shift();
    session.lastSensorAt = reading.time;
    tickLive(false);
  },
  onState(state) {
    if (state.connected && session && session.source !== "bluetooth") {
      session.source = "bluetooth";
      session.samples = [];
      write("session", session);
    }
    document
      .querySelectorAll('[data-action="connect-sensor"]')
      .forEach((button) => {
        button.textContent = state.connected
          ? "SENSOR CONNECTED ✓"
          : state.connecting
            ? "CONNECTING…"
            : "CONNECT LIVE HEART RATE";
        button.disabled = state.connecting || state.connected;
      });
    if (route() === "live" && $("#live-banner"))
      $("#live-banner").textContent = sensorBanner();
  },
});
function sensorBanner() {
  const state = liveSensor.state();
  if (session?.source === "bluetooth")
    return state.connected
      ? `BLUETOOTH · ${state.name} · real sensor readings`
      : "SENSOR DISCONNECTED · Reconnect to resume live heart rate";
  return session?.source === "simulated"
    ? "DEMO · SIMULATED HEART RATE"
    : "TIMER ONLY · Connect your Fitbit Air for live heart rate";
}
function sensorControls() {
  const state = liveSensor.state();
  return `<div class="sensor-controls"><button class="block-button full" data-action="connect-sensor" ${state.connected || state.connecting ? "disabled" : ""}>${state.connected ? "SENSOR CONNECTED ✓" : state.connecting ? "CONNECTING…" : "CONNECT LIVE HEART RATE"}</button><button class="sensor-help" data-route="live-setup">iPhone / Fitbit Air setup ›</button>${state.connected ? '<button class="sensor-help" data-action="disconnect-sensor">Disconnect sensor</button>' : ""}</div>`;
}
function liveSetup() {
  return `<div class="feature-hero"><h1>Live Fitbit heart rate</h1><p>A direct Bluetooth connection.</p></div><section class="card"><h3>1. Enable sharing</h3><p class="note">Google Health → Connections → Fitbit Air → Share heart rate → Get started. Keep your band close and follow any pairing prompt.</p><h3>2. Open GOOP in a Bluetooth browser</h3><p class="note">On iPhone, open this website in Bluefy. Standard Safari and its Home Screen web app cannot use Web Bluetooth. No Mac or developer membership is required.</p><a class="block-button full" href="https://apps.apple.com/app/id1492822055" target="_blank" rel="noopener noreferrer">GET BLUEFY FOR IPHONE ↗</a><h3>3. Pair from GOOP</h3><p class="note">Tap Connect live heart rate and choose your Fitbit Air from the device list. Start a GOOP workout to record BPM, the live chart, zones and elapsed time.</p>${sensorControls()}</section><section class="card"><h3>What this connection supplies</h3><p class="note">Real-time heart rate from Fitbit. During a GOOP workout, optionally enable phone GPS for distance, speed and pace. Sleep, recovery inputs, steps and completed Google workouts still use Google Health sync. Live zones use a sample 190 bpm maximum; set your personal maximum before relying on them for training.</p><h3>Keep GOOP visible</h3><p class="note">iOS can suspend the browser when you lock the screen or switch apps. Continuous background recording is not guaranteed. The timer can resume; missing readings are not filled in.</p><h3>Google Health workout controls</h3><p class="note">Bluetooth heart-rate sharing does not expose the other app’s workout start/stop state. Start the GOOP timer separately. You may also record in Google Health, then sync its completed record later.</p><p class="note">If no sensor appears, enable sharing again, check Bluetooth permission, and disconnect other fitness equipment. Fitbit compatibility and firmware can affect pairing. This connection still needs testing with your physical Air.</p><a class="block-button full" href="https://support.google.com/googlehealth/answer/14236705?hl=en" target="_blank" rel="noopener noreferrer">FITBIT HEART-RATE SHARING GUIDE ↗</a></section>`;
}
function enableGPS() {
  if (!session) return toast("Start a workout before enabling GPS.");
  if (!navigator.geolocation)
    return toast("This browser does not provide GPS.");
  if (gpsWatch !== null) return;
  gpsWatch = navigator.geolocation.watchPosition(
    (position) => {
      if (session && addLocation(session, position)) {
        write("session", session);
        tickLive(false);
      }
    },
    (error) => {
      toast(
        error.code === 1
          ? "Location permission was declined. GPS stays off."
          : "GPS signal unavailable. Move outdoors and retry.",
      );
      disableGPS();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
  toast("Requesting phone GPS. Keep GOOP visible.");
}
function disableGPS() {
  if (gpsWatch !== null) navigator.geolocation.clearWatch(gpsWatch);
  gpsWatch = null;
  if (session) {
    session.gpsLast = null;
    session.gpsSpeed = null;
  }
}
function recordedZoneBars(samples, maxHR) {
  const times = workoutZoneTimes(samples, maxHR),
    total = times.reduce((a, b) => a + b, 0) || 1;
  return times
    .map(
      (seconds, i) =>
        `<div class="recorded-zone"><span>ZONE ${i}</span><i style="--zone-width:${(seconds / total) * 100}%;--zone-color:${zoneColors[i]}"></i><b>${formatDuration(seconds)}</b></div>`,
    )
    .join("");
}
const icons = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3z M7 11l3-2 3 2 4-3",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  pulse: "M2 12h5l3-8 4 16 3-8h5",
  sleep: "M20.9 13.2A9 9 0 0 1 10.8 3.1 9 9 0 1 0 20.9 13.2Z",
  run: "m13 8 3 4h5 M13 8l-3 5-5 3 M10 13l4 3-2 6 M13 8l-4-2-4 4 M15 3a1.5 1.5 0 1 0 0 .01",
  strength: "M7 6v12 M3 9v6 M17 6v12 M21 9v6 M7 12h10 M3 12h4 M17 12h4",
  bike: "M5 21a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M19 21a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M5 17l6-10 8 10 M8 7h5 M14 4h4l-7 13H5",
  steps: "m8 3 4 2v7l5 5 4 1v3H9L3 14l3-4 2 3V3Z",
  lungs:
    "M11 3v9c-1-3-2-5-4-5S2 14 3 18s5 2 8-1 M13 3v9c1-3 2-5 4-5s5 7 4 11-5 2-8-1",
  temp: "M10 14V4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0 M12 9v9",
  drop: "M12 2S4 11 4 16a8 8 0 0 0 16 0c0-5-8-14-8-14Z",
  fire: "M12 2c2 8 8 8 8 14a8 8 0 1 1-16 0c0-4 3-7 5-9 0 5 2 6 3 5 2-2 0-6 0-10Z",
  clock: "M12 8v5l3 2 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9 1h6",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2",
  journal: "M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5",
  people:
    "M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M16 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M2 22v-7a4 4 0 0 1 8 0v7 M14 22v-7a4 4 0 0 1 8 0v7 M12 11v10",
  menu: "M3 5h18 M3 12h18 M3 19h18",
  profile:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M8 19v-4a4 4 0 0 1 8 0v4 M12 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  back: "m15 3-9 9 9 9",
  info: "M12 11v7 M12 7v.01 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
  share: "M12 15V2 m-4 4 4-4 4 4 M7 9H4v13h16V9h-3",
  plus: "M12 4v16 M4 12h16",
  check: "m4 12 5 5L20 6",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 2h6l1 4 4 1 2 5-3 3 1 4-5 3-3-2-4 1-3-4 1-4-3-3 3-5 4-1z",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.pulse}"/></svg>`;
const colors = { sleep: "#8daabd", recovery: "#78e63a", strain: "#5896df" };
const route = () => location.hash.slice(1) || "home";
function go(to) {
  if (route() === to) render();
  else location.hash = to;
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3200);
}
function modal(title, body) {
  $("#dialog-content").innerHTML =
    `<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button data-action="close" aria-label="Close">×</button></div><div class="dialog-body">${body}</div>`;
  if (!$("#dialog").open) $("#dialog").showModal();
}
function close() {
  if ($("#dialog").open) $("#dialog").close();
  activeMetric = null;
}
function dateLabel() {
  if (offset === 0) return "TODAY";
  if (offset === -1) return "YESTERDAY";
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + offset);
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toUpperCase();
}
function dates() {
  return `<div class="date-picker"><button data-action="prev-day" aria-label="Previous day" ${offset <= -180 ? "disabled" : ""}>‹</button><button class="date-name" data-action="calendar" aria-label="Choose date">${dateLabel()}</button><button data-action="next-day" aria-label="Next day" ${offset === 0 ? "disabled" : ""}>›</button></div>`;
}
function header(title = "") {
  const home = ["home", "health", "activities", "more"].includes(route());
  $("#header").innerHTML = home
    ? `<button class="profile-button" data-action="profile" aria-label="Your profile">${icon("profile")}</button>${dates()}<button class="battery" data-action="device" aria-label="${enhancements?.isDemo() ? "Demo Fitbit Air battery 86 percent" : "Device connections; battery unavailable"}">${enhancements?.isDemo() ? "86%" : "—"} <svg viewBox="0 0 22 32" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="4" y="3" width="13" height="25" rx="6"/><path d="M8 0h5 M8 31h5 M7 8h7v13H7z"/><circle cx="18" cy="5" r="2.5" fill="#8ce1b5" stroke="none"/></svg></button>`
    : `<button class="back-button" data-action="back" aria-label="Back">${icon("back")}</button><div class="header-title">${title || route().replaceAll("-", " ")}</div><button class="info-button" data-action="metric-info" aria-label="About this screen">${icon("info")}</button>`;
}
function nav() {
  const current = route();
  const health = [
    "health",
    "healthspan",
    "health-monitor",
    "stress",
    "food",
    "weight",
    "cycle",
    "widgets",
  ].includes(current);
  $("#bottom-nav").innerHTML = [
    ["home", "home", "Home"],
    ["health", "heart", "Health"],
    ["activities", "run", "Activities"],
    ["more", "menu", "More"],
  ]
    .map(
      ([r, i, name]) =>
        `<a href="#${r}" ${(r === "health" && health) || r === current || (r === "activities" && (current === "live" || current === "countdown" || current.startsWith("workout/"))) || (r === "home" && !health && !["activities", "live", "countdown", "more"].includes(current) && !current.startsWith("workout/")) ? 'class="active" aria-current="page"' : ""}>${icon(i)}<span>${name}</span></a>`,
    )
    .join("");
  $("#quick-action").hidden = current === "live";
}
function dial(type, value, large = false) {
  const max = type === "strain" ? 21 : 100;
  const color =
    type === "recovery"
      ? value >= 67
        ? colors.recovery
        : value >= 34
          ? "#e1ca49"
          : "#ee4d59"
      : colors[type];
  return `<div class="dial" style="view-transition-name:score-${type}" role="img" aria-label="${type} ${value}${type === "strain" ? " out of 21" : " percent"}"><svg viewBox="0 0 112 112"><circle class="track" cx="56" cy="56" r="48"/><circle class="progress" cx="56" cy="56" r="48" stroke="${color}" style="--dash:${(Number.isFinite(value) ? Math.min(1, value / max) : 0) * 301.59}"/></svg><div class="dial-center">${large ? `<span class="dial-name">${type === "strain" ? "DAY STRAIN" : type === "sleep" ? "SLEEP PERFORMANCE" : "RECOVERY"}</span>` : ""}<span class="dial-value">${value === null ? "—" : type === "strain" ? Number(value).toFixed(1) : value}${type === "strain" || value === null ? "" : "<small>%</small>"}</span>${large ? '<span class="dial-sub">GOOP · DEMO</span>' : ""}</div></div>`;
}
const metrics = {
  hrv: [
    "HEART RATE VARIABILITY",
    "pulse",
    "ms",
    "59",
    "Your overnight HRV compared with your own baseline. Fitbit and WHOOP may use different sampling windows.",
  ],
  rhr: [
    "RESTING HEART RATE",
    "heart",
    "bpm",
    "56",
    "Resting heart rate from the device’s daily summary.",
  ],
  steps: ["STEPS", "steps", "", "7,936", "Steps recorded by your Fitbit."],
  zones13: [
    "HR ZONES 1–3 (WEEKLY)",
    "heart",
    "",
    "2:18",
    "Time spent in the lower three heart-rate zones. Zone boundaries depend on your heart-rate settings.",
  ],
  zones45: [
    "HR ZONES 4–5 (WEEKLY)",
    "heart",
    "",
    "0:26",
    "Time in the upper two heart-rate zones.",
  ],
  vo2: [
    "VO₂ MAX",
    "lungs",
    "ml/kg/min",
    "47.8",
    "A device-derived estimate of aerobic fitness when available.",
  ],
  calories: [
    "CALORIES",
    "fire",
    "kcal",
    "2,164",
    "Device-estimated energy expenditure.",
  ],
  resp: [
    "RESPIRATORY RATE",
    "lungs",
    "rpm",
    "16.1",
    "Overnight breathing rate from the device.",
  ],
  spo2: [
    "BLOOD OXYGEN (SpO₂)",
    "drop",
    "%",
    "97",
    "Overnight oxygen saturation. Available recordings depend on the device and account.",
  ],
  temp: [
    "SKIN TEMPERATURE",
    "temp",
    "°C",
    "0.0",
    "Skin-temperature deviation from a personal baseline, when provided by the data source.",
  ],
  sleep: [
    "SLEEP PERFORMANCE",
    "sleep",
    "%",
    "91",
    "A GOOP score would require our own documented model. This demo number is illustrative.",
  ],
  consistency: [
    "SLEEP CONSISTENCY",
    "sleep",
    "%",
    "83",
    "A future GOOP calculation based on bedtime and wake-time regularity.",
  ],
  efficiency: [
    "SLEEP EFFICIENCY",
    "sleep",
    "%",
    "95",
    "Time asleep as a share of time in bed.",
  ],
  stresssleep: [
    "HIGH SLEEP STRESS",
    "pulse",
    "%",
    "1",
    "Fitbit does not expose WHOOP’s Sleep Stress score. This is an interface preview.",
  ],
  strength: [
    "STRENGTH ACTIVITY TIME",
    "strength",
    "",
    "2:35",
    "Logged strength-training time. Muscular load is not available from Fitbit as WHOOP calculates it.",
  ],
  strain: [
    "DAY STRAIN",
    "pulse",
    "",
    "10.8",
    "WHOOP’s strain algorithm is proprietary. A GOOP equivalent would be a separate model.",
  ],
};
function metricValue(key) {
  const connected = enhancements?.value(key);
  if (connected !== undefined) return connected;
  const d = sampleDay(offset);
  return (
    {
      hrv: d.hrv,
      rhr: d.rhr,
      steps: d.steps.toLocaleString("en-US"),
      zones13: "2:46",
      zones45: "0:34",
      vo2: d.vo2.toFixed(1),
      calories: d.calories.toLocaleString("en-US"),
      resp: d.resp.toFixed(1),
      spo2: d.spo2,
      temp: (d.temp > 0 ? "+" : "") + d.temp.toFixed(1),
      sleep: d.sleep,
      consistency: 86,
      efficiency: 96,
      stresssleep: 0,
      strength: "3:12",
      strain: d.strain.toFixed(1),
    }[key] ?? "—"
  );
}
function metricRow(key) {
  const connected = enhancements?.metricRow(key);
  if (connected) return connected;
  const m = metrics[key];
  return `<button class="metric-row" data-action="metric" data-key="${key}">${icon(m[1])}<span class="metric-name">${m[0]}</span><span class="metric-result">${metricValue(key)}<span class="${["rhr", "calories"].includes(key) ? "down" : "up"}">${["rhr", "calories"].includes(key) ? "▾" : "▴"}</span><small>${m[3]}</small></span></button>`;
}
function monitors() {
  return `<div class="monitor-pair"><button class="monitor-card" data-route="health-monitor"><span class="card-label">HEALTH MONITOR <span class="chevron">›</span></span><span class="monitor-result"><span class="monitor-badge">✓</span><span><strong>WITHIN RANGE</strong><small>5/5 Metrics</small></span></span></button><button class="monitor-card" data-route="stress"><span class="card-label">STRESS MONITOR <span class="chevron">›</span></span><span class="monitor-result"><span class="monitor-badge blue">0.8</span><span><strong class="low">LOW</strong><small>16:59 · Sample</small></span></span></button></div>`;
}
function activityRow(
  type = "Running",
  id = "sample-run",
  strain = "7.0",
  time = "07:34 AM",
  end = "08:16 AM",
) {
  return `<button class="activity-row" data-route="workout/${id}"><span class="activity-number workout">${icon(type === "Cycling" ? "bike" : type === "Weightlifting" ? "strength" : "run")}${strain}</span><span class="activity-name">${esc(type.toUpperCase())}</span><span class="activity-times">${end}<br>${time}</span></button>`;
}
function home() {
  const d = sampleDay(offset);
  const saved = workouts.filter((w) => w.date === dayKey(offset));
  return `<div class="wordmark personal-wordmark"><em>${esc(personalTitle(profile.name))}</em></div><div class="home-scores">${["sleep", "recovery", "strain"].map((t) => `<button class="score-link" data-route="${t}" aria-label="Open ${t}">${dial(t, d[t])}<span class="dial-label">${t.toUpperCase()}<span>›</span></span></button>`).join("")}</div>${metricRow("steps")}<div class="insight"><h3>${d.recovery >= 67 ? "Elevated HRV" : d.recovery >= 34 ? "A balanced day ahead" : "Time to recharge"}</h3><p>${d.recovery >= 67 ? "Your sample HRV is higher than your usual range. Explore how recovery, sleep, and activity come together in your daily overview." : "Your sample Recovery is below the green zone. Tap your Recovery dial to explore the contributing metrics."}</p></div>${monitors()}<h2 class="section-heading">My Day</h2><div class="outlook-row"><button class="outlook-button" data-route="coach">${icon("sun")}Your Daily Outlook<span>›</span></button></div><section class="card"><div class="card-label">TODAY’S ACTIVITIES<button data-route="activities" aria-label="Expand activities">↗</button></div><button class="activity-row" data-route="sleep"><span class="activity-number">${icon("sleep")}${minutesLabel(d.sleepMinutes)}</span><span class="activity-name">SLEEP</span><span class="activity-times">11:12 PM<br>07:30 AM</span></button>${activityRow("Running", "sample-run", "7.0")}${saved.map((w) => activityRow(w.type, w.id, "—", "Saved", w.source === "manual" ? "Manual" : w.source === "bluetooth" ? "Bluetooth" : w.source === "timer" ? "Timer" : "Demo")).join("")}<div class="dual-buttons"><button class="block-button" data-action="add-activity">${icon("plus")}ADD ACTIVITY</button><button class="block-button" data-action="start-activity">${icon("clock")}${session ? "RESUME ACTIVITY" : "START ACTIVITY"}</button></div></section><section class="card"><button class="card-label" style="width:100%;padding:0" data-action="sleep-plan">TONIGHT’S SLEEP <span class="chevron">›</span></button><div class="bedtime-row"><div><div class="bedtime-value"><span>☼</span>23:15</div><small>RECOMMENDED BEDTIME</small></div><span class="bedtime-divider"></span><div><div class="bedtime-value"><span>☼</span>${esc(profile.wake)}</div><small>WAKE TIME<br>(ALARM OFF)</small></div></div></section><button class="journal-home-tile" data-route="journal">${icon("journal")}<span><b>My Journal</b><small>Daily check-in</small></span><span>›</span></button><h2 class="section-heading">My Plan</h2><section class="card"><button class="card-label" style="width:100%;padding:0" data-route="plan">CUSTOM PLAN <span class="chevron">⌄</span></button><div class="note" style="margin:6px 0">3 days left</div><div class="plan-completion">57<small>% ACCOMPLISHED</small></div><div class="plan-track"><i></i></div></section><h2 class="section-heading">My Dashboard<button data-action="customize">CUSTOMIZE ✎</button></h2>${dashboard
    .filter((k) => k !== "steps")
    .map(metricRow)
    .join(
      "",
    )}<section class="card" style="margin-top:20px"><button class="card-label" style="width:100%;padding:0" data-route="stress">STRESS MONITOR <span class="chevron">›</span></button><p class="note">Last updated 16:59 <span style="float:right;color:#9dbbdf">LOW &nbsp; 0.8</span></p>${lineChart("stress", 60)}</section>`;
}
function tabs(active) {
  return `<nav class="subtabs" aria-label="Performance views">${[
    ["home", "OVERVIEW"],
    ["sleep", "SLEEP"],
    ["recovery", "RECOVERY"],
    ["strain", "STRAIN"],
  ]
    .map(
      ([r, n]) =>
        `<a href="#${r}" ${r === active ? 'class="selected" aria-current="page"' : ""}>${n}</a>`,
    )
    .join("")}</nav>`;
}
function segment() {
  return `<div class="segment" aria-label="Trend time range">${[
    ["W", "WEEK"],
    ["M", "MONTH"],
    ["6M", "6 MONTHS"],
  ]
    .map(
      ([v, n]) =>
        `<button data-action="range" data-range="${v}" class="${v === range ? "selected" : ""}">${n}</button>`,
    )
    .join("")}</div>`;
}
function lineChart(kind = "hrv", count = 14, provided = null) {
  if (kind === "stress") return stressChart();
  if (kind === "heart") return heartRateChart(provided);
  if (kind === "sleep") return sleepStackChart(range, offset);
  const color =
    kind === "stress"
      ? "#94d7b5"
      : kind === "sleep"
        ? "#8daabd"
        : kind === "recovery"
          ? "#78e63a"
          : "#619be0";
  const data = provided?.length
    ? provided
    : Array.from({ length: count }, (_, i) =>
        kind === "stress"
          ? 0.3 + Math.abs(Math.sin(i * 1.8) * Math.cos(i * 0.7)) * 2.2
          : kind === "heart"
            ? 108 +
              Math.sin(i * 0.11) * 8 +
              (i < 5 ? i * 6 : 40) +
              Math.sin(i * 1.3) * 12
            : kind === "hrv"
              ? 50 + Math.sin(i * 0.9 + offset) * 12 + i * 0.3
              : kind === "sleep"
                ? 75 + Math.abs(Math.sin(i * 0.7)) * 23
                : kind === "recovery"
                  ? 35 + Math.abs(Math.sin(i * 0.8 + offset)) * 60
                  : 5 + Math.abs(Math.sin(i * 0.8 + offset)) * 12,
      );
  const max =
      kind === "stress"
        ? 3
        : kind === "heart"
          ? 200
          : kind === "strain"
            ? 21
            : 100,
    min = kind === "heart" ? 80 : 0;
  const points = data.map((v, i) => [
    30 + (i * 335) / Math.max(data.length - 1, 1),
    153 - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * 133,
  ]);
  const path = points
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  return `<svg class="chart" viewBox="0 0 380 185" role="img" aria-label="${kind} sample ${range === "W" ? "weekly" : range === "M" ? "monthly" : "six month"} trend"><defs><linearGradient id="fill-${kind}" x1="0" x2="0" y1="0" y2="1"><stop stop-color="${color}" stop-opacity=".16"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${[0, 1, 2, 3].map((i) => `<line x1="30" y1="${20 + i * 44.3}" x2="365" y2="${20 + i * 44.3}"/><text x="3" y="${24 + i * 44.3}">${Math.round(max - ((max - min) * i) / 3)}</text>`).join("")}<path d="${path} L365,153 L30,153Z" fill="url(#fill-${kind})"/><path class="line" d="${path}" stroke="${color}"/>${points
    .filter((_, i) => data.length <= 14 || i === data.length - 1)
    .map(
      ([x, y]) =>
        `<circle cx="${x}" cy="${y}" r="2.3" fill="#202a31" stroke="${color}" stroke-width="1.5"/>`,
    )
    .join(
      "",
    )}<text x="30" y="179">${kind === "heart" ? "START" : kind === "stress" ? "00:00" : range === "W" ? "SUN" : range === "M" ? "OCT 1" : "MAY"}</text><text x="181" y="179">${kind === "heart" ? "MIDPOINT" : kind === "stress" ? "08:00" : range === "W" ? "WED" : range === "M" ? "OCT 15" : "AUG"}</text><text x="338" y="179">${kind === "heart" ? "END" : kind === "stress" ? "16:59" : range === "W" ? "SAT" : range === "M" ? "OCT 31" : "OCT"}</text></svg>`;
}
function trend(kind) {
  if (["recovery", "strain"].includes(kind))
    return `<h3 class="chart-title">PERFORMANCE ASSESSMENT</h3>${segment()}${performanceChart(range, offset)}`;
  return `<h3 class="chart-title">${range === "W" ? "WEEKLY" : range === "M" ? "MONTHLY" : "6 MONTH"} TRENDS</h3>${segment()}${lineChart(kind, range === "W" ? 7 : range === "M" ? 30 : 26)}`;
}
function recovery() {
  const d = sampleDay(offset);
  return `${tabs("recovery")}<div class="detail-dial">${dial("recovery", d.recovery, true)}</div><div class="detail-insight"><h3>ⓖ &nbsp; ELEVATED HRV</h3><p>In this sample day, your HRV is elevated compared with your 30-day baseline. Recovery brings your overnight metrics into one view.</p></div><div class="stat-heading"><span>RECOVERY STATISTICS</span><span>VS. PREVIOUS 30 DAYS</span></div>${["hrv", "rhr", "resp", "sleep"].map(metricRow).join("")}${trend("recovery")}<p class="note">Demo Recovery is illustrative. Live GOOP Recovery will need a separately validated scoring model.</p>`;
}
function bar(label, value, width, color, extra = "") {
  return `<div class="bar-row"><div class="bar-top"><span>${label} ${extra}</span><b>${value}</b></div><div class="bar-track"><i style="--width:${width}%;--color:${color}"></i></div></div>`;
}
function sleep() {
  const d = sampleDay(offset);
  return `${tabs("sleep")}<div class="detail-dial">${dial("sleep", d.sleep, true)}</div>${["sleep", "consistency", "efficiency", "stresssleep"].map(metricRow).join("")}<div class="callout"><h3>A consistent night</h3><p>Your sample night includes ${minutesLabel(d.sleepMinutes)} hours of sleep. Tap any metric to explore its trend and what it represents.</p></div><h3 class="section-label">SLEEP STAGES</h3><div class="sleep-hypnogram">${Array.from(
    { length: 48 },
    (_, i) => {
      const s = (i * 7 + Math.floor(i / 6)) % 4;
      return `<i style="--color:${["#e2e4e5", "#a6a3e6", "#db9ce9", "#9a65d4"][s]};--height:${[10, 32, 48, 28][s]}px;--offset:${[-35, -8, 20, 1][s]}px"></i>`;
    },
  ).join(
    "",
  )}</div><div class="axis-times"><span>11:12 PM</span><span>7:30 AM</span></div>${[
    ["AWAKE", "0:26", 5, "#d9dce0"],
    ["LIGHT", "3:53", 47, "#a6a3e6"],
    ["SWS (DEEP)", "1:47", 21, "#db9ce9"],
    ["REM", "2:12", 27, "#9a65d4"],
  ]
    .map(
      ([n, v, w, c]) =>
        `<div class="sleep-stage">${bar(n, v, w, c, `<span style="color:${c}">${w}%</span>`)}</div>`,
    )
    .join(
      "",
    )}<div class="card"><div class="card-label">RESTORATIVE SLEEP <span>3:59</span></div><p class="note">Combined REM and deep sleep in this sample night.</p></div><div class="card"><div class="card-label">HOURS VS. NEEDED <span>98%</span></div>${bar("HOURS OF SLEEP", minutesLabel(d.sleepMinutes), 98, "#8daabd")}${bar("SLEEP NEEDED", "8:00", 100, "#6d91b7")}<div class="plan-item"><span>Healthy minimum</span><b>7:30</b></div><div class="plan-item"><span>Recent strain</span><b>+0:20</b></div><div class="plan-item"><span>Sleep debt</span><b>+0:10</b></div></div><button class="block-button full" data-action="sleep-plan">TONIGHT’S SLEEP PLANNER ›</button>${trend("sleep")}<p class="note">Sleep stage measurements can come from Fitbit. Sleep Need, Sleep Performance and Sleep Stress shown here are sample interface values.</p>`;
}
function strain() {
  const d = sampleDay(offset);
  return `${tabs("strain")}<div class="detail-dial">${dial("strain", d.strain, true)}</div>${["zones13", "zones45", "strength", "steps"].map(metricRow).join("")}<div class="callout"><h3>Room to build</h3><p>Sample target: 10.0–14.0 Day Strain. This range previews the Strain Coach experience; it is not a personalised training prescription.</p><button data-action="start-activity">START AN ACTIVITY →</button></div><h3 class="section-label">HEART RATE ZONES</h3>${zoneBars()}${trend("strain")}<h3 class="section-label">ACTIVITIES</h3>${activityRow()}${activityRow("Weightlifting", "sample-strength", "8.6", "06:15 PM", "07:02 PM")}`;
}
const zoneColors = [
  "#777e8b",
  "#6886b2",
  "#7f9bd1",
  "#91d4af",
  "#cfb36c",
  "#cb8055",
];
function zoneBars() {
  return [
    ["ZONE 5", "4:00", 9, 5],
    ["ZONE 4", "8:22", 19, 4],
    ["ZONE 3", "14:10", 33, 3],
    ["ZONE 2", "11:15", 26, 2],
    ["ZONE 1", "5:03", 12, 1],
  ]
    .map(([n, v, w, c]) => bar(n, v, w, zoneColors[c]))
    .join("");
}
function health() {
  return `<div class="feature-hero"><h1>Health</h1><p>Your long-term health, in perspective.</p></div><section class="card" style="margin-top:22px"><button class="card-label full" data-route="healthspan" style="padding:0">HEALTHSPAN <span class="chevron">›</span></button><button data-route="healthspan" class="full" style="padding:0"><div class="sphere-wrap" style="width:190px;height:190px"><canvas id="sphere" aria-label="Animated physiological age sphere"></canvas><div class="sphere-label"><strong>29.9</strong><span>GOOP AGE</span><small>4.7 years younger · Sample</small></div></div></button><div class="pace-top"><span>PACE OF AGING</span><b>0.8<small style="font-size:17px">x</small></b></div><p class="note">Illustrative physiological age, not a measured biological age.</p></section>${monitors()}<h2 class="section-heading">All metrics</h2>${Object.keys(metrics).map(metricRow).join("")}<h2 class="section-heading">Health insights</h2><button class="metric-row" data-action="unsupported" data-key="Heart Screener">${icon("pulse")}<span class="metric-name">HEART SCREENER</span><span class="availability" style="margin-left:auto">UNAVAILABLE</span></button><button class="metric-row" data-action="unsupported" data-key="Blood Pressure Insights">${icon("heart")}<span class="metric-name">BLOOD PRESSURE INSIGHTS</span><span class="availability" style="margin-left:auto">UNAVAILABLE</span></button><button class="metric-row" data-route="cycle">${icon("drop")}<span class="metric-name">MENSTRUAL CYCLE INSIGHTS</span><span class="chevron" style="margin-left:auto">›</span></button><button class="metric-row" data-route="journal-insights">${icon("journal")}<span class="metric-name">JOURNAL INSIGHTS</span><span class="chevron" style="margin-left:auto">›</span></button>`;
}
function healthspan() {
  const groups = [
    [
      "Sleep",
      [
        ["SLEEP CONSISTENCY", "86%", "−0.6", 75],
        ["HOURS OF SLEEP", "7:52", "−0.8", 82],
      ],
    ],
    [
      "Activity",
      [
        ["STEPS", "8,420", "−0.4", 68],
        ["HEART RATE ZONES 1–3", "2:46", "−0.5", 70],
        ["HEART RATE ZONES 4–5", "0:34", "−0.4", 63],
        ["STRENGTH ACTIVITY TIME", "3:12", "−0.5", 78],
      ],
    ],
    [
      "Fitness",
      [
        ["VO₂ MAX", "48.2", "−0.9", 84],
        ["RESTING HEART RATE", "54", "−0.4", 72],
        ["LEAN BODY MASS", "57.6 kg", "−0.2", 65],
      ],
    ],
  ];
  return `<div class="healthspan-title">HEALTHSPAN</div><div class="healthspan-subtitle">Sample weekly update · Oct 25 – Oct 31</div><div class="sphere-wrap"><canvas id="sphere" aria-label="Animated physiological age sphere"></canvas><div class="sphere-label"><strong>29.9</strong><span>GOOP AGE</span><small>4.7 years younger · Sample</small></div></div><div class="pace-title">PACE OF AGING</div><div class="pace-top"><span>◯ Slow</span><b>0.8x</b><span>Fast ◌</span></div><div class="pace-ticks"></div><div class="pace-axis"><span>−1.0x</span><span>1.0x</span><span>3.0x</span></div><div class="callout"><h3>Steady and healthy</h3><p>This sample preview shows how sleep, activity, and fitness could contribute to a physiological-age estimate. GOOP Age and Pace of Aging are demo values; no age model has been validated or connected.</p><button data-route="plan">VIEW YOUR PLAN →</button></div>${groups.map(([heading, rows]) => `<h2 class="section-heading">${heading}<span style="font-size:9px;color:#b0b9bf;font-weight:400">6 month avg. &nbsp; | &nbsp; Age impact</span></h2>${rows.map(([n, v, impact, pos]) => `<details class="contributor"><summary>${n}</summary><div class="contributor-values"><strong>${v}</strong><span>${impact} YEARS · SAMPLE</span></div><div class="contributor-track" style="--position:${pos}%"></div><p>Example contributor for interface review. A real age-impact calculation needs an established model, adequate history, and complete inputs. These values do not represent your age or health.</p></details>`).join("")}`).join("")}`;
}
function healthMonitor() {
  const d = sampleDay(offset);
  return `<h3 class="chart-title" style="margin-top:15px">HEART RATE</h3><div style="position:relative"><div style="position:absolute;top:26px;left:8px;z-index:1"><span style="color:#649ee0">♥</span><div style="font:600 39px var(--num)">78</div><span style="font-size:9px;color:#b7c3cb">BPM · SAMPLE</span></div>${lineChart(
    "heart",
    28,
    Array.from({ length: 28 }, (_, i) => 76 + Math.sin(i * 0.25) * 2),
  )}</div><div class="stat-grid">${[
    ["resp", "16.0–16.5"],
    ["spo2", "95%–100%"],
    ["rhr", "52–58"],
    ["hrv", "49–67"],
    ["temp", "−0.3 to +0.1"],
  ]
    .map(
      ([k, r]) =>
        `<button class="stat-tile" data-action="metric" data-key="${k}"><span class="tile-title">${icon(metrics[k][1])}${metrics[k][0]}</span><div class="tile-value">${metricValue(k)}<span>${metrics[k][2]}</span></div><span class="range-badge">✓ within ${r}</span></button>`,
    )
    .join(
      "",
    )}</div><button class="block-button full" data-action="report">${icon("share")}SHARE YOUR HEALTH REPORT</button><p class="note">Export your sample measurements. These ranges are illustrative personal baselines, not clinical assessments.</p>`;
}
function stress() {
  return `<div style="display:flex;justify-content:center;margin:7px 0">${dates()}</div><div class="stress-gauge"><svg viewBox="0 0 290 250" role="img" aria-label="Sample stress level 0.8 out of 3"><defs><linearGradient id="gauge"><stop stop-color="#89add6"/><stop offset=".5" stop-color="#a6ddb3"/><stop offset="1" stop-color="#d0a05a"/></linearGradient></defs><path d="M28 219 A126 126 0 1 1 262 219" fill="none" stroke="#3d484f" stroke-width="11" stroke-linecap="round"/><path d="M28 219 A126 126 0 1 1 262 219" fill="none" stroke="url(#gauge)" stroke-width="3" stroke-linecap="round"/><path d="m49 70 28 25" stroke="#e3e9ed" stroke-width="7" stroke-linecap="round"/><text x="19" y="247" fill="#b2c0c9" font-size="11">0.0</text><text x="251" y="247" fill="#b2c0c9" font-size="11">3.0</text></svg><div class="stress-reading"><b>0.8</b><strong>LOW</strong><small>16:59 · SAMPLE</small></div></div>${lineChart("stress", 100)}<div class="callout"><p>Most of this sample day was spent in the low stress zone. Live WHOOP Stress is not available from Fitbit; this chart previews the interface.</p><button data-action="breathing">START A BREATHING SESSION →</button></div><section class="card"><div class="card-label">TOTAL DAY</div><div class="stress-stack"><i style="width:51%;background:#8dadd6"></i><i style="width:46%;background:#9bddb3"></i><i style="width:3%;background:#d2b15f"></i></div><div class="stress-times"><div><b>8:24</b><small>■ LOW</small></div><div><b>7:39</b><small>■ MEDIUM</small></div><div><b>0:29</b><small>■ HIGH</small></div></div></section>`;
}
function getWorkout(id) {
  if (id === "sample-run")
    return {
      id,
      type: "Running",
      seconds: 2520,
      avgHR: 154,
      maxHR: 183,
      calories: 438,
      strain: 7.0,
      source: "sample",
      samples: [],
      sets: [],
    };
  if (id === "sample-strength")
    return {
      id,
      type: "Weightlifting",
      seconds: 2820,
      avgHR: 118,
      maxHR: 151,
      calories: 291,
      strain: 8.6,
      source: "sample",
      samples: [],
      sets: [
        { exercise: "Bench press", weight: 40, reps: 10 },
        { exercise: "Squat", weight: 60, reps: 8 },
      ],
    };
  return workouts.find((w) => w.id === id);
}
function workoutPage(id) {
  const w = getWorkout(id);
  if (!w)
    return `<div class="empty-card"><h3>Workout not found</h3><p>This activity may be stored in a different browser.</p><button class="primary" data-route="activities">ACTIVITY HISTORY</button></div>`;
  return `<div class="workout-heading"><b>${w.strain ?? "—"}</b>${icon(w.type === "Weightlifting" ? "strength" : "run")}<span>${esc(w.type.toUpperCase())}<small>${w.source === "sample" ? "Today · Sample activity" : w.source === "manual" ? "Manual activity · Stored on this device" : w.source === "bluetooth" ? "Bluetooth workout · Stored on this device" : w.source === "timer" ? "Local timer · Stored on this device" : "Simulated workout · Stored on this device"}</small></span></div><div class="detail-insight"><p>${w.source === "sample" ? "An example workout summary with your heart-rate curve, training zones, and activity statistics." : "This workout records your timer and " + (w.source === "manual" ? "manual inputs. No sensor readings were collected." : w.source === "bluetooth" ? "real Bluetooth heart-rate samples." : w.source === "timer" ? "elapsed time only. No sensor readings were collected." : "simulated heart-rate samples. No Fitbit sensor readings were collected.")}</p></div><h3 class="chart-title">HEART RATE</h3><div class="chart-subtitle">${w.source === "sample" ? "07:34 AM – 08:16 AM" : "Session overview"}</div>${w.source === "sample" || w.samples?.length ? lineChart("heart", 90, w.samples?.length ? w.samples.map((s) => s.hr) : null) : '<p class="note">No heart-rate samples were recorded.</p>'}<section class="workout-detail-panel"><h3>ACTIVITY STATISTICS</h3><div class="workout-metrics">${[
    ["fire", "CALORIES", w.calories ?? "—"],
    ["heart", "AVG HR", w.avgHR ?? "—"],
    ["pulse", "MAX HR", w.maxHR ?? "—"],
    ["clock", "DURATION", formatDuration(w.seconds)],
  ]
    .map(([i, n, v]) => `<div>${icon(i)}<small>${n}</small><b>${v}</b></div>`)
    .join(
      "",
    )}</div></section>${w.source === "sample" ? `<h3 class="section-label">HEART RATE ZONES</h3>${zoneBars()}<div class="card"><div class="plan-item"><span>Distance</span><b>5.21 km</b></div><div class="plan-item"><span>Average pace</span><b>8:04 /km</b></div><div class="plan-item"><span>Activity strain</span><b>7.0</b></div></div>` : `<h3 class="section-label">RECORDED ZONES</h3>${recordedZoneBars(w.samples || [], w.maxHeartRate || 190)}${w.distanceKm != null ? `<div class="card"><div class="plan-item"><span>Phone GPS distance</span><b>${w.distanceKm.toFixed(2)} km</b></div></div>` : ""}`}${w.sets?.length ? `<h3 class="section-label">STRENGTH TRAINER</h3>${w.sets.map((s) => `<div class="plan-item"><span>${esc(s.exercise)}</span><b>${esc(s.weight)} kg × ${esc(s.reps)}</b></div>`).join("")}` : ""}<button class="block-button full" data-action="export-workout" data-id="${esc(id)}">${icon("share")}EXPORT WORKOUT</button>`;
}
function activityLaunch() {
  return `${sensorControls()}<section class="activity-launch"><span class="section-label">YOUR NEXT SESSION</span><h1>Let’s move.</h1><p>Choose your activity. Find your rhythm.</p><button class="primary full start-workout-button" data-action="start-activity">${icon(session ? "clock" : "run")}${session ? "RESUME WORKOUT" : "START A WORKOUT"}<span>›</span></button><div class="quick-sports">${["Running", "Walking", "Cycling", "Weightlifting"].map((type) => `<button data-action="prepare-activity" data-type="${type}">${icon(type === "Cycling" ? "bike" : type === "Weightlifting" ? "strength" : "run")}<span>${type}</span></button>`).join("")}</div><button class="block-button full" data-action="add-activity">${icon("plus")}LOG A PAST ACTIVITY</button></section>`;
}
function countdownPage() {
  if (!pendingActivity)
    return `<div class="empty-card"><h3>Choose a workout</h3><button class="primary" data-route="activities">ACTIVITIES</button></div>`;
  return `<div class="workout-countdown"><span class="section-label">${esc(pendingActivity.type.toUpperCase())}</span><h1>Get ready</h1><div class="countdown-ring"><strong id="countdown-number" aria-live="assertive" aria-atomic="true">3</strong></div><p>Your workout starts after the countdown.</p><button class="block-button" data-action="cancel-countdown">CANCEL</button></div>`;
}
function activities() {
  return `${activityLaunch()}<h2 class="section-heading">Activity history</h2><h3 class="section-label">TODAY · SAMPLE ACTIVITIES</h3>${activityRow()}${activityRow("Weightlifting", "sample-strength", "8.6", "06:15 PM", "07:02 PM")}${workouts.length ? '<h3 class="section-label">YOUR DEMO & MANUAL SESSIONS</h3>' + workouts.map((w) => activityRow(w.type, w.id, "—", formatDuration(w.seconds), w.source === "manual" ? "Manual" : w.source === "bluetooth" ? "Bluetooth" : w.source === "timer" ? "Timer" : "Demo")).join("") : ""}<div class="dual-buttons"><button class="block-button" data-action="add-activity">ADD ACTIVITY</button><button class="block-button" data-action="start-activity">${session ? "RESUME" : "START"} ACTIVITY</button></div>`;
}
function live() {
  if (!session)
    return `<div class="empty-card"><h3>Ready when you are</h3><p>Connect a heart-rate sensor and choose an activity to begin.</p><button class="primary" data-action="start-activity">CHOOSE AN ACTIVITY</button></div>`;
  return `<div class="live-type">${esc(session.type.toUpperCase())}</div><div class="live-time" id="live-time">${formatDuration(elapsed(session) / 1000)}</div><div class="live-time-label" id="live-status">${session.paused ? "PAUSED" : "DURATION"}</div><div class="live-banner" id="live-banner">${esc(sensorBanner())}</div>${sensorControls()}<section class="live-panel"><div class="live-row"><span class="live-panel-label">HEART RATE</span><div class="live-heart">${icon("heart")}<span id="live-hr">—</span><small>bpm</small></div></div><div class="live-zone-track" id="live-zones" style="--position:50%">${zoneColors
    .slice(1)
    .map((c) => `<i style="--color:${c}"></i>`)
    .join(
      "",
    )}</div><div class="live-zone-labels">${[1, 2, 3, 4, 5].map((z) => `<span data-zone="${z}">Zone ${z}</span>`).join("")}</div><p id="live-level" class="live-level">Activity level</p><div class="live-stats"><div><b id="live-distance">—<small>km</small></b><small>DISTANCE</small></div><div><b id="live-strain">—</b><small>STRAIN</small></div></div></section><h3 class="chart-title">HEART RATE ${session.source === "simulated" ? "· SIMULATED" : ""}</h3><div id="live-chart">${
    session.samples.length
      ? lineChart(
          "heart",
          2,
          session.samples.slice(-90).map((s) => s.hr),
        )
      : '<p class="note">Waiting for heart-rate readings.</p>'
  }</div><div class="live-extra-stats"><div><small>AVG BPM</small><b id="live-average">—</b></div><div><small>MAX BPM</small><b id="live-maximum">—</b></div><div><small>SPEED · KM/H</small><b id="live-speed">—</b></div><div><small>AVG PACE</small><b id="live-pace">—</b></div></div><button class="block-button full" data-action="enable-gps">ENABLE PHONE GPS</button><p class="data-note">GPS stays on this device. Keep the page visible. Heart-rate zones use max ${profile.maxHR || 190} bpm; change it in your profile.</p><h3 class="section-label">TIME IN ZONES</h3><div id="live-zone-times"></div><div class="live-controls"><button data-action="pause" id="pause-button">${session.paused ? "RESUME" : "PAUSE"}</button><button class="finish" data-action="finish">FINISH</button></div>${session.type === "Weightlifting" ? strengthEditor() : ""}<p class="note">The timer works across screen changes and reloads. Distance and strain are not supplied by the Bluetooth heart-rate service. Keep this page visible to receive readings.</p>`;
}
function strengthEditor() {
  return `<h3 class="section-label">STRENGTH TRAINER</h3><div class="card"><label class="settings-label" for="exercise">EXERCISE</label><select id="exercise"><option>Bench press</option><option>Squat</option><option>Deadlift</option><option>Overhead press</option><option>Row</option></select><table class="sets-table"><thead><tr><th>SET</th><th>KG</th><th>REPS</th><th>LOG</th></tr></thead><tbody><tr><td>${session.sets.length + 1}</td><td><input aria-label="Set weight in kilograms" id="set-weight" type="number" value="40" min="0" max="500"></td><td><input aria-label="Set repetitions" id="set-reps" type="number" value="10" min="1" max="100"></td><td><button data-action="log-set" class="primary">✓</button></td></tr></tbody></table><div id="logged-sets">${session.sets.map((s, i) => `<div class="plan-item"><span>${i + 1}. ${esc(s.exercise)}</span><b>${s.weight} kg × ${s.reps}</b></div>`).join("")}</div></div>`;
}
const questions = [
  ["hydration", "Hydrated well", "Did you meet your hydration goal?"],
  ["alcohol", "Alcohol", "Did you have any alcoholic drinks?"],
  ["caffeine", "Late caffeine", "Did you have caffeine after 2 PM?"],
  ["strength", "Strength training", "Did you complete a strength session?"],
  ["meditation", "Meditation", "Did you take time to pause?"],
  ["screen", "Screen in bed", "Did you use a screen before sleeping?"],
];
function journalPage() {
  journalDraft = structuredClone(journal[dayKey(offset)] ?? {});
  return `<div class="feature-hero"><h1>My Journal</h1><p>See how your daily behaviours connect with recovery.</p></div><div class="journal-days">${Array.from(
    { length: 7 },
    (_, i) => {
      const n = i - 6;
      const d = new Date(BASE_DATE);
      d.setDate(d.getDate() + n);
      return `<button data-action="journal-day" data-offset="${n}" class="${offset === n ? "selected" : ""}">${d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}<b>${d.getDate()}</b></button>`;
    },
  ).join(
    "",
  )}</div><div class="card-label">${dateLabel()} <button data-route="journal-insights">VIEW INSIGHTS ›</button></div>${questions.map(([k, n, desc]) => `<div class="question"><span><b>${n}</b><small>${desc}</small></span><span class="yesno">${["Yes", "No"].map((v) => `<button data-action="journal-answer" data-key="${k}" data-value="${v}" class="${journalDraft[k] === v ? "chosen" : ""}" aria-pressed="${journalDraft[k] === v}">${v}</button>`).join("")}</span></div>`).join("")}<label for="journal-notes" class="settings-label">ANYTHING ELSE ABOUT YOUR DAY?</label><textarea id="journal-notes" maxlength="2000" placeholder="How did you feel?">${esc(journalDraft.notes || "")}</textarea><div class="journal-save"><small>Saved locally on this device.</small><button class="primary" data-action="save-journal">SAVE JOURNAL</button></div>`;
}
function journalInsights() {
  return `<div class="feature-hero"><span class="availability">ILLUSTRATIVE ANALYSIS</span><h1 style="margin-top:18px">Recovery Impact Analysis</h1><p>This is a preview of how behaviour associations could be shown after enough journal history is collected.</p></div><div class="stat-heading"><span>HURTS</span><span>% IMPACT</span><span>HELPS</span></div>${[
    ["HYDRATION", "+24%", 42],
    ["CONSISTENT SLEEP", "+21%", 37],
    ["READ IN BED", "+13%", 23],
    ["MEDITATION", "+8%", 15],
    ["STRENGTH TRAINING", "+5%", 9],
  ]
    .map(
      ([n, v, p]) =>
        `<div class="impact-row"><div class="bar-top"><span>${n}</span><b>${v}</b></div><div class="impact-track" style="--width:${p}%"></div></div>`,
    )
    .join(
      "",
    )}<p class="note">Sample associations, not findings about you. Your ${Object.keys(journal).length} saved journal ${Object.keys(journal).length === 1 ? "entry" : "entries"} stay on this device. No causal claims are made from these example values.</p><button class="block-button full" data-route="journal">OPEN MY JOURNAL</button>`;
}
function plan() {
  return `<div class="feature-hero"><h1>My Plan</h1><p>A focused week of sleep, movement, and strength.</p></div><div class="card" style="margin-top:22px"><div class="card-label">CUSTOM PLAN <span>3 DAYS LEFT</span></div><div class="plan-completion">57<small>% ACCOMPLISHED · SAMPLE</small></div><div class="plan-track"><i></i></div>${[
    ["8,000+ steps", "4/7"],
    ["7:30+ hours of sleep", "5/7"],
    ["2:30+ HR zones 1–3", "2:46"],
    ["0:30+ HR zones 4–5", "0:34"],
    ["3 strength sessions", "2/3"],
  ]
    .map(
      ([n, v]) => `<div class="plan-item"><span>${n}</span><b>${v}</b></div>`,
    )
    .join(
      "",
    )}</div><button class="block-button full" data-action="edit-plan">EDIT YOUR PLAN</button><p class="note">These sample goals demonstrate the weekly-plan layout. They are not personalised recommendations.</p>`;
}
function more() {
  return `<div class="feature-hero"><h1>More</h1><p>GOOP · Your Fitbit, your daily view.</p></div>${[
    ["profile", "profile", "My profile"],
    ["connections", "heart", "Google Health connection"],
    ["device", "settings", "My Fitbit Air"],
    ["activities", "run", "Activity history"],
    ["journal", "journal", "My journal"],
    ["widgets", "pulse", "iOS widgets"],
    ["food", "fire", "Food log"],
    ["weight", "pulse", "Weight log"],
    ["coach", "pulse", "GOOP Coach"],
    ["assessment", "pulse", "Performance assessments"],
    ["plan", "check", "My plan"],
    ["customize", "pulse", "Customise dashboard"],
    ["install", "plus", "Add to Home Screen"],
    ["methodology", "info", "Metrics & data sources"],
    ["export", "share", "Export local data"],
  ]
    .map(
      ([a, i, n]) =>
        `<button class="menu-row" ${["activities", "journal", "plan", "connections", "coach", "assessment", "food", "weight", "widgets"].includes(a) ? `data-route="${a}"` : `data-action="${a}"`}>${icon(i)}<span>${n}</span><span>›</span></button>`,
    )
    .join(
      "",
    )}<p class="note" style="margin-top:30px">GOOP is an independent personal app, not affiliated with WHOOP or Google. Connect your own Google Health account in Connections.</p>`;
}
function render() {
  sphereStop?.();
  const r = route();
  let title = r;
  const pages = {
    "live-setup": liveSetup,
    countdown: countdownPage,
    widgets: () => enhancements.widgets(),
    steps: () => "",
    food: () => "",
    weight: () => "",
    "connection-guide": () => "",
    connections: () => enhancements.connections(),
    coach: () => enhancements.coach(),
    cycle: () => enhancements.cycle(),
    assessment: () =>
      `<div class="feature-hero"><h1>Performance assessment</h1></div>${segment()}${performanceChart(range, offset)}`,
    home,
    health,
    recovery,
    strain,
    sleep,
    healthspan,
    "health-monitor": healthMonitor,
    stress,
    activities,
    live,
    journal: journalPage,
    "journal-insights": journalInsights,
    plan,
    more,
  };
  let content;
  if (r.startsWith("workout/")) {
    title = "ACTIVITY";
    content = workoutPage(r.split("/")[1]);
  } else {
    if (!pages[r]) {
      location.hash = "home";
      return;
    }
    title =
      {
        home: "",
        health: "",
        sleep: "TODAY",
        recovery: "TODAY",
        strain: "TODAY",
        live: "ACTIVITY IN PROGRESS",
        "health-monitor": "HEALTH MONITOR",
        "journal-insights": "JOURNAL INSIGHTS",
      }[r] ?? r;
    content = pages[r]();
    if (r === "health") content += enhancements.healthLinks();
  }
  const enhancedContent = enhancements?.view(r);
  if (enhancedContent !== null && enhancedContent !== undefined)
    content = enhancedContent;
  header(title);
  nav();
  enhancements?.updateRibbon();
  $("#main").innerHTML = `<div class="screen">${content}</div>`;
  document.title = `GOOP · ${r === "home" ? "My Day" : (title || r).toUpperCase()}`;
  if ($("#sphere")) startSphere();
  if (r === "live") tickLive(false);
}
function startSphere() {
  sphereStop = createHealthspanSphere($("#sphere"));
}
function download(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function tickLive(collect = true) {
  if (!session) return;
  const seconds = elapsed(session) / 1000;
  const gpsButton = document.querySelector('[data-action="enable-gps"]');
  if (gpsButton)
    gpsButton.textContent =
      gpsWatch === null ? "ENABLE PHONE GPS" : "STOP PHONE GPS";
  if (collect && !session.paused && session.source === "simulated") {
    const hr = Math.round(
      126 + Math.sin(seconds / 15) * 18 + Math.sin(seconds / 4) * 5,
    );
    session.samples.push({ seconds: Math.floor(seconds), hr });
    if (session.samples.length > 10800) session.samples.shift();
    if (Math.floor(seconds) % 5 === 0) {
      write("session", session);
      enhancements?.refreshNative();
    }
  }
  if (route() !== "live" || !$("#live-time")) return;
  if (collect && Math.floor(seconds) % 5 === 0) write("session", session);
  const sensor = liveSensor.state();
  const hr =
    session.source === "simulated"
      ? (session.samples.at(-1)?.hr ?? 126)
      : sensor.connected &&
          sensor.latest &&
          Date.now() - sensor.latest.time < 15000
        ? sensor.latest.bpm
        : null;
  $("#live-time").textContent = formatDuration(seconds);
  $("#live-status").textContent = session.paused ? "PAUSED" : "DURATION";
  $("#live-hr").textContent = hr ?? "—";
  $("#live-zones").classList.toggle("no-reading", hr === null);
  const zone = hr === null ? null : heartZone(hr, profile.maxHR || 190),
    levels = ["Resting", "Very light", "Light", "Moderate", "Hard", "Maximum"];
  if ($("#live-level"))
    $("#live-level").textContent =
      zone === null
        ? "Waiting for live sensor"
        : `${levels[zone]} · Zone ${zone}`;
  $("#live-zones").style.setProperty(
    "--position",
    `${Math.min(98, Math.max(2, (hr / (profile.maxHR || 190) - 0.5) * 200))}%`,
  );
  document
    .querySelectorAll("[data-zone]")
    .forEach((e) =>
      e.classList.toggle(
        "current",
        hr !== null &&
          Number(e.dataset.zone) === heartZone(hr, profile.maxHR || 190),
      ),
    );
  if ($("#live-distance"))
    $("#live-distance").innerHTML =
      `${session.gpsEnabled ? ((session.distanceM || 0) / 1000).toFixed(2) : "—"}<small>km</small>`;
  const values = session.samples.map((p) => p.hr);
  if ($("#live-average"))
    $("#live-average").textContent = values.length
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : "—";
  if ($("#live-maximum"))
    $("#live-maximum").textContent = values.length ? Math.max(...values) : "—";
  if ($("#live-speed"))
    $("#live-speed").textContent =
      session.gpsSpeed == null ? "—" : session.gpsSpeed.toFixed(1);
  if ($("#live-pace"))
    $("#live-pace").textContent =
      session.distanceM > 0
        ? `${formatDuration(seconds / (session.distanceM / 1000))} /km`
        : "—";
  if ($("#live-zone-times"))
    $("#live-zone-times").innerHTML = recordedZoneBars(
      session.samples,
      profile.maxHR || 190,
    );
  if (session.samples.length > 1)
    $("#live-chart").innerHTML = lineChart(
      "heart",
      2,
      session.samples.slice(-90).map((s) => s.hr),
    );
}
const actions = {
  close,
  "enable-gps": () => {
    if (gpsWatch !== null) {
      disableGPS();
      render();
    } else enableGPS();
  },
  "connect-sensor": async () => {
    if (!liveSensor.state().supported) {
      close();
      go("live-setup");
      toast("Use Bluefy on iPhone for live Bluetooth.");
      return;
    }
    try {
      await liveSensor.connect();
      toast("Live heart-rate sensor connected.");
      if (route() === "live") render();
    } catch (error) {
      toast(
        error.message ||
          "Bluetooth connection failed. Try sharing heart rate again.",
      );
    }
  },
  "disconnect-sensor": () => {
    liveSensor.disconnect();
    render();
  },
  "prev-day": () => {
    offset = Math.max(-180, offset - 1);
    render();
  },
  "next-day": () => {
    offset = Math.min(0, offset + 1);
    render();
  },
  calendar: () =>
    modal(
      "Choose a day",
      `<label class="settings-label" for="pick-date">DEMO HISTORY</label><input class="text-field" id="pick-date" type="date" min="${dayKey(-180)}" max="${dayKey()}" value="${dayKey(offset)}"><button class="primary full" data-action="set-date">VIEW DAY</button>`,
    ),
  "set-date": () => {
    const value = $("#pick-date").value;
    const n = Math.round(
      (new Date(value + "T12:00:00") - BASE_DATE) / 86400000,
    );
    if (!Number.isFinite(n) || n > 0 || n < -180)
      return toast("Choose a date within the demo history.");
    offset = n;
    close();
    render();
  },
  back: () =>
    go(
      ["healthspan", "health-monitor", "stress"].includes(route())
        ? "health"
        : route().startsWith("workout/")
          ? "activities"
          : "home",
    ),
  range: (el) => {
    range = el.dataset.range;
    const top = scrollY;
    render();
    scrollTo(0, top);
  },
  metric: (el) => {
    const k = el.dataset.key,
      m = metrics[k];
    modal(
      m[0],
      `<div style="font:600 54px var(--num)">${metricValue(k)} <small style="font-size:18px">${m[2]}</small></div><p>${m[4]}</p><span class="availability">SAMPLE DATA · NOT YOUR MEASUREMENT</span>${segment()}${lineChart(k, range === "W" ? 7 : range === "M" ? 30 : 26)}<p>Previous 30-day sample baseline: ${m[3]} ${m[2]}</p>`,
    );
  },
  "metric-info": () => actions.methodology(),
  methodology: () =>
    modal(
      "Metrics & data sources",
      "<p><b>This is a design demo. All health measurements, scores, targets, and age impacts are sample values.</b></p><p>Fitbit can provide sleep, heart rate, HRV, resting heart rate, breathing rate, SpO₂, temperature and activity records when available through Google Health.</p><p>Recovery, Day Strain, Sleep Performance, Sleep Need, Stress, GOOP Age and Pace of Aging would require separate GOOP models. WHOOP’s proprietary results are not available from Fitbit.</p><p>ECG and Blood Pressure Insights cannot be recreated from missing hardware or data. No result is inferred for those features.</p><p>Typography: Proxima Nova / DINPro when installed locally; bundled Nunito Sans / D-DIN fallbacks otherwise. GOOP is not affiliated with WHOOP.</p>",
    ),
  actions: () =>
    modal(
      "What would you like to do?",
      `<button class="activity-choice" data-action="start-activity">${icon("run")}<span>${session ? "Resume activity" : "Start activity"}</span><span>›</span></button><button class="activity-choice" data-action="add-activity">${icon("plus")}<span>Add activity</span><span>›</span></button><button class="activity-choice" data-route="journal">${icon("journal")}<span>Fill out journal</span><span>›</span></button><button class="activity-choice" data-route="activities">${icon("clock")}<span>View activity history</span><span>›</span></button>`,
    ),
  "start-activity": () => {
    if (session) {
      close();
      go("live");
      return;
    }
    modal(
      "Start activity",
      `<p>Preview the workout experience with simulated heart rate and a working timer.</p>${["Running", "Walking", "Cycling", "Weightlifting", "HIIT", "Yoga", "Swimming", "Other"].map((t) => `<button class="activity-choice" data-action="begin" data-type="${t}">${icon(t === "Weightlifting" ? "strength" : t === "Cycling" ? "bike" : "run")}<span>${t}</span><span>›</span></button>`).join("")}`,
    );
  },
  "start-countdown": (el) => {
    if (session) {
      close();
      go("live");
      return;
    }
    clearInterval(countdownTimer);
    pendingActivity = { type: el.dataset.type, until: Date.now() + 3000 };
    close();
    go("countdown");
    countdownTimer = setInterval(() => {
      if (!pendingActivity || route() !== "countdown") {
        clearInterval(countdownTimer);
        pendingActivity = null;
        return;
      }
      const remaining = Math.ceil((pendingActivity.until - Date.now()) / 1000);
      const number = $("#countdown-number");
      if (remaining > 0 && number && number.textContent !== String(remaining)) {
        number.textContent = String(remaining);
        number.classList.remove("countdown-beat");
        void number.offsetWidth;
        number.classList.add("countdown-beat");
      }
      if (remaining <= 0) {
        const type = pendingActivity.type;
        clearInterval(countdownTimer);
        pendingActivity = null;
        actions.begin({ dataset: { type } });
        enhancements?.refreshNative();
      }
    }, 50);
  },
  "cancel-countdown": () => {
    clearInterval(countdownTimer);
    pendingActivity = null;
    go("activities");
  },
  begin: (el) => {
    if (session) {
      close();
      go("live");
      return;
    }
    session = newSession(
      el.dataset.type,
      Date.now(),
      liveSensor.state().connected
        ? "bluetooth"
        : enhancements.isDemo()
          ? "simulated"
          : "timer",
    );
    session.maxHeartRate = profile.maxHR || 190;
    write("session", session);
    close();
    go("live");
  },
  pause: () => {
    if (!session) return;
    togglePause(session);
    session.gpsLast = null;
    session.gpsSpeed = null;
    write("session", session);
    $("#pause-button").textContent = session.paused ? "RESUME" : "PAUSE";
    tickLive(false);
  },
  finish: () =>
    modal(
      "Finish your activity?",
      '<p>Your elapsed time and available heart-rate samples will be saved to this device. Distance, calories and strain are not estimated without actual data.</p><button class="primary full" data-action="save-workout">FINISH & SAVE</button><button class="block-button full" style="margin-top:12px" data-action="close">KEEP GOING</button>',
    ),
  "save-workout": () => {
    if (!session) return;
    const summary = summarizeSession(session);
    workouts.unshift(summary);
    write("workouts", workouts);
    disableGPS();
    session = null;
    write("session", null);
    close();
    go(`workout/${summary.id}`);
    toast("Workout saved on this device.");
  },
  "log-set": () => {
    if (!session) return;
    const weight = Number($("#set-weight").value),
      reps = Number($("#set-reps").value);
    if (
      !Number.isFinite(weight) ||
      weight < 0 ||
      weight > 500 ||
      !Number.isInteger(reps) ||
      reps < 1 ||
      reps > 100
    )
      return toast("Enter a valid weight and 1–100 reps.");
    session.sets.push({ exercise: $("#exercise").value, weight, reps });
    write("session", session);
    const top = scrollY;
    render();
    scrollTo(0, top);
    toast("Set logged.");
  },
  "add-activity": () =>
    modal(
      "Add activity",
      `<label class="settings-label" for="manual-type">ACTIVITY</label><select id="manual-type">${["Running", "Walking", "Cycling", "Weightlifting", "HIIT", "Yoga", "Swimming", "Other"].map((t) => `<option>${t}</option>`).join("")}</select><label class="settings-label" for="manual-duration">DURATION IN MINUTES</label><input class="text-field" id="manual-duration" type="number" min="1" max="1440" value="30"><p>Saved as a manual log. Heart rate, calories and strain will remain unavailable.</p><button class="primary full" data-action="save-manual">SAVE ACTIVITY</button>`,
    ),
  "save-manual": () => {
    const mins = Number($("#manual-duration").value);
    if (!Number.isFinite(mins) || mins < 1 || mins > 1440)
      return toast("Duration must be 1–1440 minutes.");
    const w = {
      id: `manual-${Date.now()}`,
      type: $("#manual-type").value,
      seconds: Math.round(mins * 60),
      date: dayKey(offset),
      source: "manual",
      avgHR: null,
      maxHR: null,
      calories: null,
      strain: null,
      sets: [],
    };
    workouts.unshift(w);
    write("workouts", workouts);
    close();
    go(`workout/${w.id}`);
  },
  "export-workout": (el) =>
    download("goop-workout.json", getWorkout(el.dataset.id)),
  export: () =>
    download("goop-local-data.json", {
      app: "GOOP",
      mode: "demo",
      journal,
      workouts,
      profile,
      dashboard,
    }),
  report: () =>
    download("goop-demo-health-report.json", {
      app: "GOOP",
      source: "SAMPLE DATA",
      date: dayKey(offset),
      measurements: sampleDay(offset),
    }),
  "journal-day": (el) => {
    offset = Number(el.dataset.offset);
    render();
  },
  "journal-answer": (el) => {
    journalDraft[el.dataset.key] = el.dataset.value;
    el.parentElement.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("chosen", b === el);
      b.setAttribute("aria-pressed", String(b === el));
    });
  },
  "save-journal": () => {
    journalDraft.notes = $("#journal-notes").value;
    journal[dayKey(offset)] = {
      ...journalDraft,
      savedAt: new Date().toISOString(),
    };
    write("journal", journal);
    toast("Journal saved on this device.");
  },
  customize: () =>
    modal(
      "Customise My Dashboard",
      `${Object.entries(metrics)
        .map(
          ([k, m]) =>
            `<label class="dashboard-check"><input type="checkbox" name="dashboard" value="${k}" ${dashboard.includes(k) ? "checked" : ""}>${m[0]}</label>`,
        )
        .join(
          "",
        )}<button class="primary full" data-action="save-dashboard">SAVE DASHBOARD</button>`,
    ),
  "save-dashboard": () => {
    dashboard = Array.from(
      document.querySelectorAll('input[name="dashboard"]:checked'),
    ).map((e) => e.value);
    write("dashboard", dashboard);
    close();
    render();
    toast("Dashboard updated.");
  },
  profile: () =>
    modal(
      "Your profile",
      `<label class="settings-label" for="profile-name">DISPLAY NAME</label><input id="profile-name" class="text-field" maxlength="40" value="${esc(profile.name)}"><label class="settings-label" for="profile-max-hr">MAXIMUM HEART RATE · BPM</label><input class="text-field" id="profile-max-hr" type="number" min="100" max="240" value="${profile.maxHR || 190}"><p>Your display name stays on this device. Manage Google Health access in Connections.</p><button class="primary full" data-action="save-profile">SAVE PROFILE</button>`,
    ),
  "save-profile": () => {
    const maximum = Number($("#profile-max-hr").value);
    if (!Number.isFinite(maximum) || maximum < 100 || maximum > 240)
      return toast("Enter a maximum heart rate from 100 to 240 bpm.");
    profile.maxHR = maximum;
    if (session) session.maxHeartRate = maximum;
    profile.name = $("#profile-name").value.trim() || "Your profile";
    write("profile", profile);
    close();
    render();
    toast("Profile saved.");
  },
  device: () =>
    !enhancements.isDemo() ? go("live-setup") : modal(
      "Fitbit Air",
      '<p><b>Demo device · Sample battery 86%</b></p><p>No device is paired with this demo. In the connected version, Fitbit Air syncs through Google Health and GOOP reads the authorised cloud data.</p><button class="primary full" data-action="connect">CONNECT GOOGLE HEALTH</button>',
    ),
  connect: () =>
    modal(
      "Connect Google Health",
      '<p><b>Google sign-in is not configured in this demo.</b></p><p>After deployment, we need to enable the Google Health API, configure a Google OAuth client and add its credentials to the server. You will sign in on Google’s page, never enter your Google password into GOOP.</p><p>No account data has been requested or downloaded.</p><a href="https://developers.google.com/health/setup" target="_blank" rel="noopener noreferrer">Google Health setup guide ↗</a>',
    ),
  install: () =>
    modal(
      "Add GOOP to your iPhone",
      "<ol><li>Open the deployed GOOP link in Safari.</li><li>Tap Share, then Add to Home Screen.</li><li>Keep Open as Web App enabled, then tap Add.</li></ol><p>For live Bluetooth workouts, open GOOP in Bluefy instead. Safari Home Screen mode is suitable for viewing synced health data and local logs.</p>",
    ),
  "sleep-plan": () =>
    modal(
      "Tonight’s sleep",
      `<label class="settings-label" for="wake-time">WAKE TIME</label><input id="wake-time" class="text-field" type="time" value="${esc(profile.wake)}"><p>The bedtime shown in the demo is illustrative. This web app does not set your Fitbit’s vibration alarm.</p><button class="primary full" data-action="save-sleep-plan">SAVE WAKE TIME</button>`,
    ),
  "save-sleep-plan": () => {
    const value = $("#wake-time").value;
    if (!value) return toast("Choose a wake time.");
    profile.wake = value;
    write("profile", profile);
    close();
    render();
    toast("Wake-time preference saved.");
  },
  outlook: () =>
    modal(
      "Your Daily Outlook",
      '<p><b>Your sample Recovery is in the green.</b></p><p>This demo combines an overnight overview with your activities, sleep plan and weekly goals. Connected advice will require your real data and separately validated GOOP scoring.</p><button class="primary full" data-route="plan">VIEW MY PLAN</button>',
    ),
  unsupported: (el) =>
    modal(
      esc(el.dataset.key),
      "<p>This feature is shown for navigation completeness, but Fitbit Air does not provide the required WHOOP-specific measurement. GOOP will not invent a result.</p>",
    ),
  cycle: () =>
    modal(
      "Menstrual Cycle Insights",
      "<p>This optional module is not configured. No cycle information is recorded or inferred in this demo. A future version can support private manual logging.</p>",
    ),
  "edit-plan": () =>
    modal(
      "Your weekly plan",
      "<p>This demo plan illustrates the layout. Goal editing and progress calculations will be connected after the data integration is configured.</p>",
    ),
  breathing: () =>
    modal(
      "Take a moment",
      '<p>Follow the circle: breathe in as it expands, and out as it contracts.</p><div class="breathing" id="breathing">Breathe</div><button class="primary full" data-action="pause-breathing">PAUSE</button>',
    ),
  "pause-breathing": (el) => {
    const p = $("#breathing").classList.toggle("paused");
    el.textContent = p ? "RESUME" : "PAUSE";
  },
};
enhancements = createEnhancements({
  $,
  icon,
  dial,
  metricRow,
  modal,
  close,
  go,
  toast,
  read,
  write,
  render,
  route,
  getOffset: () => offset,
  setOffset: (n) => {
    offset = n;
  },
  getRange: () => range,
  download,
  baseActions: { ...actions },
  getSession: () => session,
  dashboard: () => dashboard,
  displayTitle: () => personalTitle(profile.name),
  activityLaunch,
  localWorkouts: () => workouts,
});
Object.assign(actions, enhancements.actions);
document.addEventListener("click", (event) => {
  if (event.target.closest(".skip")) {
    event.preventDefault();
    document.querySelector("#main").focus();
    document.querySelector("#main").scrollIntoView();
    return;
  }
  const routeEl = event.target.closest("[data-route]");
  if (routeEl) {
    close();
    go(routeEl.dataset.route);
    return;
  }
  const el = event.target.closest("[data-action]");
  if (el && !el.disabled) {
    if (el.dataset.action === "metric") activeMetric = el.dataset.key;
    if (el.dataset.action === "range" && $("#dialog").open) {
      range = el.dataset.range;
      if (activeMetric) actions.metric({ dataset: { key: activeMetric } });
      return;
    }
    actions[el.dataset.action]?.(el);
  }
});
$("#dialog").addEventListener("click", (e) => {
  if (e.target === $("#dialog")) {
    const rect = $("#dialog").getBoundingClientRect();
    if (e.clientY < rect.top || e.clientX < rect.left || e.clientX > rect.right)
      close();
  }
});
let previousRoute = route();
window.addEventListener("hashchange", () => {
  close();
  const next = route();
  if (next === "community") {
    location.replace("#journal");
    return;
  }
  const tabs = ["home", "health", "activities", "more"];
  if (next !== "countdown") {
    clearInterval(countdownTimer);
    pendingActivity = null;
  }
  document.documentElement.dataset.direction = tabs.includes(next)
    ? "tab"
    : next === previousRoute
      ? "tab"
      : next === "activities" && previousRoute.startsWith("workout/")
        ? "back"
        : next === "health"
          ? "back"
          : "forward";
  previousRoute = next;
  const update = () => {
    render();
    scrollTo({ top: 0, behavior: "instant" });
  };
  update();
});
window.addEventListener("pagehide", () => {
  if (session) write("session", session);
});
setInterval(() => tickLive(), 1000);
render();
enhancements.init();
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
