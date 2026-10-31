import {
  BASE_DATE,
  dayKey,
  sampleDay,
  escapeHTML as esc,
  minutesLabel,
} from "./model.js";
import { combineDay, baseline, normalizeGoogle } from "./health-model.js";
import { getSources, saveSources, removeSource } from "./health-store.js";
import { connectedView } from "./connected-views.js";
import { ACTIVITY_TYPES, activityLabel } from "./activities.js";
import { widgetsPreview } from "./widgets-preview.js";
import { publishWidgetSnapshot, sendNative } from "./native-bridge.js";
const meta = {
  hrv: ["HEART RATE VARIABILITY", "pulse", "ms"],
  rhr: ["RESTING HEART RATE", "heart", "bpm"],
  resp: ["RESPIRATORY RATE", "lungs", "rpm"],
  spo2: ["BLOOD OXYGEN", "drop", "%"],
  temp: ["SKIN TEMPERATURE", "temp", "°C"],
  vo2: ["VO₂ MAX", "lungs", "ml/kg/min"],
  steps: ["STEPS", "steps", ""],
  calories: ["CALORIES", "fire", "kcal"],
  efficiency: ["SLEEP EFFICIENCY", "sleep", "%"],
};
const habits = [
  [
    "hydration",
    "Hydrated well",
    "Did you meet your hydration goal?",
    "glasses",
  ],
  ["alcohol", "Alcohol", "Did you have any alcoholic drinks?", "drinks"],
  [
    "caffeine",
    "Late caffeine",
    "Did you have caffeine after 2 PM?",
    "servings",
  ],
  [
    "strength",
    "Strength training",
    "Did you complete a strength session?",
    "minutes",
  ],
  ["meditation", "Meditation", "Did you take time to pause?", "minutes"],
  [
    "screen",
    "Screen in bed",
    "Did you use a screen before sleeping?",
    "minutes",
  ],
  [
    "reading",
    "Read before bed",
    "Did you read before going to sleep?",
    "minutes",
  ],
  ["travel", "Travel", "Did you travel today?", null],
  ["supplements", "Supplements", "Did you take your usual supplements?", null],
  ["latefood", "Late meal", "Did you eat within two hours of bed?", null],
  [
    "stretching",
    "Stretching",
    "Did you stretch or do mobility work?",
    "minutes",
  ],
  ["outdoors", "Time outdoors", "Did you spend time outside?", "minutes"],
];
const sports = ACTIVITY_TYPES.map(activityLabel).sort((a, b) =>
  a.localeCompare(b),
);
export function createEnhancements(ctx) {
  const {
    $,
    icon,
    dial,
    modal,
    close,
    go,
    toast,
    read,
    write,
    render,
    route,
    getOffset,
    setOffset,
    getRange,
  } = ctx;
  let sources = [],
    mode = read("data-mode", "demo"),
    preferred = "google",
    status = { configured: false, connected: false },
    syncBusy = false,
    syncMessage = "",
    manualType = "Running",
    pickerIntent = "manual";
  let entries = read("journal", {}),
    selectedHabits = read(
      "journal-habits",
      habits.slice(0, 6).map((h) => h[0]),
    ),
    notesTimer;
  let weightLogs = read("weight-logs", []),
    foodLogs = read("food-logs", []),
    cycleLogs = read("cycle-logs", []),
    messages = read("coach-messages", []);
  const key = () => dayKey(getOffset()),
    day = () => combineDay(sources, key(), preferred);
  const value = (metric) => {
    if (mode === "demo") return undefined;
    const v = day()[metric];
    if (v === undefined || v === null) return "—";
    if (["steps", "calories"].includes(metric))
      return Math.round(v).toLocaleString("en-US");
    return Number(v).toFixed(["temp", "resp", "vo2"].includes(metric) ? 1 : 0);
  };
  function stepsPage() {
    const demo = mode === "demo",
      d = demo ? sampleDay(getOffset()) : day();
    const recorded = sources
      .flatMap((s) => s.workouts || [])
      .filter((w) => w.date === key());
    const distances = recorded.filter((w) => Number.isFinite(w.distanceKm));
    const distance = demo ? (d.steps * 0.00075).toFixed(2) : "—";
    const workoutDistance = distances.length
      ? distances.reduce((sum, w) => sum + w.distanceKm, 0).toFixed(2)
      : "—";
    const history = demo
      ? Array.from(
          { length: 7 },
          (_, i) => sampleDay(getOffset() - 6 + i).steps,
        )
      : Array.from(
          { length: 7 },
          (_, i) =>
            combineDay(sources, dayKey(getOffset() - 6 + i), preferred).steps,
        );
    const tile = (label, value, unit, note) =>
      `<div class="stat-tile"><span class="tile-title">${label}</span><div class="tile-value">${value}<span>${unit}</span></div><p class="data-note">${note}</p></div>`;
    return `<div class="feature-hero"><h1>Steps</h1><p>${esc(key())} · ${demo ? "Sample activity" : "Your recorded activity"}</p></div><div class="steps-total">${icon("steps")}<strong>${d.steps == null ? "—" : Math.round(d.steps).toLocaleString("en-US")}</strong><span>STEPS</span></div><div class="stat-grid">${tile("DISTANCE", distance, "km", demo ? "Sample estimate using a 0.75 m step length." : "Daily walking distance was not supplied by your data source.")}${tile("RECORDED WORKOUT DISTANCE", demo ? "3.84" : workoutDistance, "km", demo ? "Sample workout distance." : "Total distance from workouts with a distance record; separate from daily steps.")}${tile("TOTAL ENERGY", d.calories == null ? "—" : Math.round(d.calories).toLocaleString("en-US"), "kcal", "Whole-day energy expenditure, including rest.")}${tile("WORKOUTS", demo ? "1" : recorded.length, "", demo ? "Sample activity count." : "Recorded activities for this day.")}</div><h2 class="section-heading">Daily steps · past 7 days</h2>${measurementChart(history, "Daily steps")}${demo ? '<p class="data-note">Sample data. Distance is illustrative.</p>' : '<p class="data-note">Missing days remain empty. Distance and calories are never calculated from an assumed stride length in My Data.</p>'}<button class="block-button full" data-route="activities">VIEW ACTIVITIES ›</button>`;
  }
  function publishNow() {
    publishWidgetSnapshot({
      mode,
      day: mode === "demo" ? sampleDay(ctx.getOffset()) : day(),
      date: key(),
      session: ctx.getSession(),
    });
  }
  const widgetPage = () =>
    widgetsPreview({
      sample: mode === "demo",
      ...(mode === "demo" ? sampleDay(ctx.getOffset()) : {}),
      workout: ctx.getSession(),
    });
  function updateRibbon() {
    publishNow();
    if (document.querySelector(".sample-footer"))
      document.querySelector(".sample-footer").textContent =
        mode === "demo"
          ? "DEMO · SAMPLE METRICS · LOCAL LOGS SAVED"
          : "GOOP · RECORDED MEASUREMENTS · NO INVENTED SCORES";
    const el = $(".demo-ribbon");
    if (el)
      el.innerHTML =
        mode === "demo"
          ? "GOOP DESIGN PREVIEW <span>Demo metrics · Local logs saved</span>"
          : `GOOP <span>${sources.length ? "Google Health · Recorded measurements" : "My Data · Not connected"}</span>`;
  }
  function connectionGuide() {
    const callback =
      status.callback || `${location.origin}/api/google?action=callback`;
    return `<div class="feature-hero"><h1>Connect Google Health</h1><p>A one-time setup, then sign in and sync.</p></div><section class="card"><h3>1. Sync your Fitbit</h3><p class="note">Open Google Health on your phone, sign in to your Fitbit-linked Google account, and sync your device. Confirm your sleep and activity data are visible there.</p><h3>2. Connect your account</h3><p class="note">Return to GOOP → More → Connections → Connect account. Choose the same Google account. Google handles your password; GOOP never sees it.</p><h3>3. Allow read access</h3><p class="note">Activity & fitness brings steps and workouts. Sleep brings your sleep history. Health metrics brings HRV, resting heart rate, breathing, oxygen, temperature and weight when available. You can decline permissions; affected measurements stay empty.</p><h3>4. See your measurements</h3><p class="note">After sign-in, GOOP syncs automatically and opens My Data. Use Sync now after your Fitbit has synced to Google Health. Food requires separate optional nutrition access.</p><button class="primary full" data-action="google-login">${status.configured ? "CONNECT GOOGLE HEALTH" : "VIEW SETUP REQUIREMENTS"}</button></section><details class="card setup-details" ${status.configured ? "" : "open"}><summary>For the app owner · server setup</summary><p class="note">${status.configured ? "Server configuration is present. Google consent is still required." : "This installation needs Google OAuth credentials before sign-in can work."}</p><ol class="setup-steps"><li>Create a Google Cloud project and enable Google Health API.</li><li>Create a Web application OAuth client, configure consent and add your account under Test users.</li><li>Add the three read-only Google Health scopes: activity_and_fitness, sleep, and health_metrics_and_measurements.</li><li>Register this exact redirect URI:<code class="callback-value">${esc(callback)}</code><button class="block-button full" data-action="copy-callback">COPY CALLBACK URI</button></li><li>In Vercel → Settings → Environment Variables, set APP_ORIGIN to this app’s HTTPS origin, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your client values, and SESSION_SECRET to a random secret of at least 32 characters. Redeploy.</li></ol><p class="note">Keep secrets on the server. Never enter your Google password or OAuth secret into a GOOP form.</p><a class="block-button full" href="https://developers.google.com/health/setup" target="_blank" rel="noopener noreferrer">OFFICIAL GOOGLE SETUP GUIDE ↗</a></details><section class="card"><h3>Having trouble?</h3><p class="note"><b>redirect_uri_mismatch:</b> copy the exact callback above into your OAuth client.<br><b>Access blocked:</b> add your account as a test user and check enabled scopes.<br><b>No measurements:</b> sync Fitbit first and verify this is the same Google Health account.<br><b>Sign-in expired:</b> reconnect; Google testing-mode refresh tokens can expire after seven days.<br><b>Some metrics missing:</b> your device or granted permissions may not supply them. Reconnect to review access.</p></section>`;
  }
  function connectionPage() {
    const data = sources.find((s) => s.id === "google");
    return `<div class="feature-hero"><h1>Connections</h1><p>Your Fitbit data, presented in GOOP.</p></div><section class="connection-card"><div class="connection-title">${icon("heart")}Google Health<span class="source-state">${status.connected ? "CONNECTED" : status.configured ? "READY TO CONNECT" : "SETUP NEEDED"}</span></div><p>Read sleep, heart rate, HRV, activity, weight, and supported nutrition records from your Google Health account.</p><div class="dual-buttons"><button class="block-button" data-action="google-login">${status.connected ? "RECONNECT" : "CONNECT ACCOUNT"}</button><button class="block-button" data-action="google-sync" ${syncBusy || !status.connected ? "disabled" : ""}>${syncBusy ? "SYNCING…" : "SYNC NOW"}</button></div>${data ? `<p class="data-note">Last synced ${esc(new Date(data.syncedAt).toLocaleString())}<br>${Object.keys(data.days).length} days · ${data.workouts?.length || 0} workouts · ${data.nutrition?.length || 0} foods</p>` : ""}${status.nutritionEnabled ? `<button class="block-button full" style="margin-top:12px" data-action="google-food-access">${status.nutritionAccess ? "RECONNECT FOOD ACCESS" : "CONNECT FOOD ACCESS"}</button>` : ""}<div class="sync-status" id="sync-status" role="status">${esc(syncMessage)}</div>${status.connected ? '<button class="menu-row" data-action="google-disconnect">Disconnect Google Health<span>›</span></button>' : ""}</section><button class="block-button full" style="margin:16px 0" data-route="connection-guide">HOW TO CONNECT · STEP-BY-STEP ›</button><section class="card"><div class="card-label">WHAT YOU SEE</div><div class="dual-buttons"><button class="block-button ${mode === "demo" ? "mode-selected" : ""}" data-action="set-mode" data-mode="demo">DEMO</button><button class="block-button ${mode === "real" ? "mode-selected" : ""}" data-action="set-mode" data-mode="real">MY DATA</button></div><p class="data-note">Demo contains illustrative scores. My Data shows recorded measurements and leaves unsupported scores empty.</p></section><section class="card"><div class="card-label">YOUR PRIVACY</div><p class="note">Health snapshots stay in this browser. Google refresh credentials remain encrypted in an HTTP-only cookie. GOOP never asks for your Google password.</p><button class="block-button full" data-action="remove-health">REMOVE LOCAL HEALTH SNAPSHOT</button></section>`;
  }
  async function fetchStatus() {
    try {
      const res = await fetch("/api/google?action=status", {
        cache: "no-store",
      });
      if (res.ok) status = await res.json();
    } catch {
      /* Offline preview can still use local logs. */
    }
  }
  async function sync() {
    if (syncBusy) return;
    syncBusy = true;
    syncMessage = "Syncing your Google Health measurements…";
    render();
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await fetch(
        `/api/google?action=sync&timeZone=${encodeURIComponent(zone)}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Sync failed.");
      await saveSources([body.dataset]);
      sources = await getSources();
      mode = "real";
      write("data-mode", mode);
      syncMessage = body.warnings?.length
        ? `Synced with ${body.warnings.length} unavailable or partial collections. ${body.warnings.map((w) => w.type).join(", ")}`
        : "Sync complete. Your recorded measurements are ready.";
      toast("Google Health synced.");
    } catch (error) {
      syncMessage = error.message || "Sync failed. Please retry.";
      toast(syncMessage);
    } finally {
      syncBusy = false;
      render();
    }
  }
  function metricRow(metric) {
    if (mode === "demo") return null;
    const m = meta[metric] || [
        metric.replaceAll("-", " ").toUpperCase(),
        "pulse",
        "",
      ],
      d = day(),
      p = d.provenance[metric];
    return `<button class="metric-row" data-action="metric" data-key="${metric}">${icon(m[1])}<span class="metric-name">${m[0]}<span class="metric-origin">${p ? esc(p.label) + (metric === "hrv" && d.hrvMethod ? ` · ${d.hrvMethod}` : "") : "No recorded measurement"}</span></span><span class="metric-result">${value(metric)}<small>${m[2]}</small></span></button>`;
  }
  function measurementChart(values, label) {
    const valid = values.filter(Number.isFinite);
    if (!valid.length)
      return '<p class="note">No recorded measurements for this period.</p>';
    const low = Math.min(...valid) * 0.9,
      high = Math.max(...valid) * 1.1 || 1;
    let drawing = false;
    const points = values
      .map((v, i) => {
        if (!Number.isFinite(v)) {
          drawing = false;
          return "";
        }
        const command = drawing ? "L" : "M";
        drawing = true;
        return `${command}${25 + (i * 330) / Math.max(1, values.length - 1)},${154 - ((v - low) / (high - low || 1)) * 125}`;
      })
      .join(" ");
    const dots = values
      .map((v, i) =>
        Number.isFinite(v)
          ? `<circle cx="${25 + (i * 330) / Math.max(1, values.length - 1)}" cy="${154 - ((v - low) / (high - low || 1)) * 125}" r="3" fill="#a6cce9"/>`
          : "",
      )
      .join("");
    return `<svg class="chart" viewBox="0 0 380 180" role="img" aria-label="${esc(label)}"><line x1="25" y1="30" x2="355" y2="30"/><line x1="25" y1="154" x2="355" y2="154"/><path d="${points}" fill="none" stroke="#93bce4" stroke-width="2"/>${dots}<text x="1" y="24">${high.toFixed(1)}</text><text x="1" y="169">${low.toFixed(1)}</text><text x="290" y="176">LATEST</text></svg>`;
  }

  function journalPage() {
    const entry = entries[key()] ?? {},
      answered = selectedHabits.filter((k) => entry[k]).length;
    return `<div class="feature-hero"><h1>My Journal</h1><p>Your daily behaviours. A clearer picture.</p></div><div class="journal-days">${Array.from(
      { length: 7 },
      (_, i) => {
        const n = i - 6,
          d = new Date(BASE_DATE);
        d.setDate(d.getDate() + n);
        return `<button data-action="journal-day" data-offset="${n}" class="${getOffset() === n ? "selected" : ""}">${d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}<b>${d.getDate()}</b><i class="journal-day-dot ${entries[dayKey(n)]?.savedAt ? "complete" : ""}"></i></button>`;
      },
    ).join(
      "",
    )}</div><div class="card-label">${getOffset() === 0 ? "TODAY" : getOffset() === -1 ? "YESTERDAY" : key()}<button data-route="journal-insights">VIEW INSIGHTS ›</button></div><div class="journal-progress"><div><i style="width:${(answered / Math.max(1, selectedHabits.length)) * 100}%"></i></div><span id="journal-progress">${answered}/${selectedHabits.length} answered</span></div>${habits
      .filter((h) => selectedHabits.includes(h[0]))
      .map(
        ([k, n, desc, unit]) =>
          `<div class="journal-item"><div class="question"><span><b>${n}</b><small>${desc}</small></span><div class="yesno ${entry[k] ? "has-answer" : ""}" role="radiogroup" aria-label="${n}" data-selected="${entry[k] || ""}">${["Yes", "No"].map((v) => `<button type="button" role="radio" aria-checked="${entry[k] === v}" data-action="journal-answer" data-key="${k}" data-value="${v}" class="${entry[k] === v ? "chosen" : ""}"><span>${v === "Yes" ? "✓" : "−"}</span>${v}</button>`).join("")}</div></div>${unit ? `<div class="answer-detail ${entry[k] === "Yes" ? "expanded" : ""}" id="detail-${k}" ${entry[k] === "Yes" ? "" : "inert"}><div><label for="quantity-${k}">HOW MANY ${unit.toUpperCase()}?</label><input type="number" id="quantity-${k}" data-journal-quantity="${k}" min="0" max="1440" step="0.5" placeholder="Optional" value="${entry.quantities?.[k] ?? ""}"></div></div>` : ""}</div>`,
      )
      .join(
        "",
      )}<button class="block-button full" style="margin-top:20px" data-action="journal-customize">${icon("plus")}CUSTOMISE BEHAVIOURS</button><label for="journal-notes" class="settings-label">ANYTHING ELSE ABOUT YOUR DAY?</label><textarea id="journal-notes" maxlength="2000" placeholder="How did you feel?">${esc(entry.notes || "")}</textarea><div class="journal-save"><small id="journal-save-status" role="status">${entry.savedAt ? "✓ Saved on this device" : "Answers save automatically"}</small><button class="primary" data-action="save-journal">DONE</button></div>`;
  }
  function persistJournal() {
    const e = (entries[key()] ??= {});
    e.savedAt = new Date().toISOString();
    write("journal", entries);
    const state = $("#journal-save-status");
    if (state) {
      state.textContent = "✓ Saved just now";
      state.classList.add("saved");
    }
    const count = selectedHabits.filter((k) => e[k]).length;
    if ($("#journal-progress"))
      $("#journal-progress").textContent =
        `${count}/${selectedHabits.length} answered`;
    const bar = $(".journal-progress i");
    if (bar)
      bar.style.width = `${(count / Math.max(1, selectedHabits.length)) * 100}%`;
  }
  function manualForm() {
    modal(
      "Add activity",
      `<input type="hidden" id="manual-type" value="${esc(manualType)}"><label class="settings-label">ACTIVITY</label><button class="selected-activity" data-action="manual-picker">${icon(manualType === "Weightlifting" ? "strength" : manualType === "Cycling" ? "bike" : "run")}<b>${esc(manualType)}</b><span>CHANGE ›</span></button><label class="settings-label" for="manual-duration">DURATION · MINUTES</label><input class="text-field" id="manual-duration" type="number" min="1" max="1440" value="30"><p>Manual activity · Saved on this device.</p><button class="primary full" data-action="save-manual-refined">SAVE ACTIVITY</button>`,
    );
  }
  function prepareActivity(type) {
    if (ctx.getSession()) {
      close();
      go("live");
      return;
    }
    manualType = type;
    modal(
      type,
      `<div class="workout-ready">${icon(type === "Cycling" ? "bike" : type === "Weightlifting" ? "strength" : "run")}<h3>Ready when you are.</h3><p>A 3–2–1 countdown, then your session begins.</p><div class="ready-zones">${["Very light", "Light", "Moderate", "Hard", "Maximum"].map((z, i) => `<span style="--zone-color:${["#8296ab", "#6497de", "#89d9a1", "#d6be70", "#d48058"][i]}"><i></i>${z}</span>`).join("")}</div><p class="data-note">Timer works live. Heart rate is simulated until a supported live sensor connection is available. Zone preview uses a sample maximum heart rate of 190 bpm.</p><button class="primary full start-workout-button" data-action="start-countdown" data-type="${esc(type)}">START ${icon("run")}</button><button class="block-button full" data-action="start-activity">CHANGE ACTIVITY</button></div>`,
    );
  }
  function picker() {
    modal(
      pickerIntent === "live" ? "Start activity" : "Choose activity",
      `<div class="picker-search">${icon("pulse")}<input id="sport-search" placeholder="Search activities" aria-label="Search activities"></div><p class="activity-catalog-note">${sports.length} Google Health activity types. Fitbit Air auto-recognition varies by activity and your device history.</p><div class="activity-options" role="radiogroup" aria-label="Activity type">${sports.map((t) => `<button class="activity-option" role="radio" aria-checked="${t === manualType}" data-action="select-sport" data-type="${t}"><span class="sport-icon">${icon(t === "Weightlifting" ? "strength" : t === "Cycling" ? "bike" : "run")}</span><span>${t}</span><span class="option-check">${t === manualType ? "✓" : ""}</span></button>`).join("")}</div>`,
    );
  }
  const allFood = () => [
    ...sources.flatMap((s) => s.nutrition ?? []),
    ...foodLogs,
  ];
  function food() {
    const foods = allFood().filter((f) => f.date === key()),
      total = (field) =>
        foods.reduce(
          (n, f) => n + (Number.isFinite(f[field]) ? f[field] : 0),
          0,
        ),
      has = (field) => foods.some((f) => Number.isFinite(f[field]));
    return `<div class="feature-hero"><h1>Food</h1><p>Nutrition for ${key()}</p></div><div class="nutrition-summary"><div class="nutrition-calories"><strong>${has("calories") ? Math.round(total("calories")).toLocaleString() : "—"}</strong><span>CALORIES LOGGED</span></div><div class="macro-row">${[
      ["protein", "PROTEIN", "#8bc9df"],
      ["carbs", "CARBS", "#b1a5e5"],
      ["fat", "FAT", "#dbbb82"],
    ]
      .map(
        ([k, n, c]) =>
          `<div><i style="background:${c}"></i><b>${has(k) ? Math.round(total(k)) : "—"}<small>g</small></b><span>${n}</span></div>`,
      )
      .join("")}</div><div class="macro-track">${[
      ["protein", "#8bc9df", 4],
      ["carbs", "#b1a5e5", 4],
      ["fat", "#dbbb82", 9],
    ]
      .map(
        ([k, c, m]) =>
          `<i style="flex:${total(k) * m || 0.01};background:${c}"></i>`,
      )
      .join(
        "",
      )}</div></div><button class="block-button full" data-action="log-food">${icon("plus")}LOG FOOD</button><div class="food-sync"><span>Google Health food</span><button data-action="google-sync">${status.connected ? "SYNC NOW ↻" : "CONNECT ›"}</button></div>${[
      "BREAKFAST",
      "LUNCH",
      "DINNER",
      "SNACK",
    ]
      .map((meal) => {
        const list = foods.filter(
          (f) =>
            (["BREAKFAST", "LUNCH", "DINNER"].includes(f.meal)
              ? f.meal
              : "SNACK") === meal,
        );
        return `<h3 class="section-label">${meal} <span style="float:right;color:#94a6b4">${list.length} ${list.length === 1 ? "ITEM" : "ITEMS"}</span></h3>${list.length ? list.map((f) => `<div class="food-item"><span class="food-icon">${foodIllustration(meal)}</span><span><b>${esc(f.name)}</b><small>${esc(f.serving || "Logged serving")} · ${f.source === "manual" ? "GOOP manual log" : "Google Health"}</small></span><span class="food-item-calories">${f.calories === null || f.calories === undefined ? "—" : Math.round(f.calories)}<small>kcal</small></span>${f.source === "manual" ? `<button data-action="edit-food" data-id="${f.id}" aria-label="Edit ${esc(f.name)}">✎</button>` : ""}</div>`).join("") : '<p class="meal-empty">No foods logged yet.</p>'}`;
      })
      .join(
        "",
      )}<p class="data-note">Google Health foods appear after a successful nutrition sync. Missing nutrient values stay empty. GOOP manual entries are local and are not written back to Google.</p>`;
  }
  function foodIllustration(meal) {
    return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M5 16h22a11 11 0 0 1-22 0Z M8 27h16 M10 11c-4-4 4-4 0-8 M17 11c-4-4 4-4 0-8 M24 11c-4-4 4-4 0-8"/></svg>`;
  }
  function foodForm(existing = null) {
    modal(
      existing ? "Edit food" : "Log food",
      `<input type="hidden" id="food-id" value="${existing?.id || ""}"><label class="settings-label" for="food-name">FOOD NAME</label><input class="text-field" id="food-name" maxlength="100" placeholder="e.g. Greek yoghurt & berries" value="${esc(existing?.name || "")}"><label class="settings-label" for="food-meal">MEAL</label><div class="meal-selector">${["BREAKFAST", "LUNCH", "DINNER", "SNACK"].map((m) => `<button data-action="food-meal" data-meal="${m}" class="${(existing?.meal || "BREAKFAST") === m ? "selected" : ""}">${m}</button>`).join("")}</div><input type="hidden" id="food-meal" value="${existing?.meal || "BREAKFAST"}"><label class="settings-label" for="food-serving">SERVING</label><input class="text-field" id="food-serving" maxlength="80" placeholder="1 bowl, 200 g…" value="${esc(existing?.serving || "")}"><div class="form-grid">${[
        ["calories", "CALORIES · KCAL"],
        ["protein", "PROTEIN · G"],
        ["carbs", "CARBS · G"],
        ["fat", "FAT · G"],
      ]
        .map(
          ([k, n]) =>
            `<div><label class="settings-label" for="food-${k}">${n}</label><input class="text-field" id="food-${k}" type="number" min="0" max="${k === "calories" ? 100000 : 10000}" step="0.1" placeholder="Optional" value="${existing?.[k] ?? ""}"></div>`,
        )
        .join(
          "",
        )}</div><button class="primary full" data-action="save-food">SAVE FOOD</button>`,
    );
  }
  function weight() {
    const logs = [
        ...sources.flatMap((s) => s.weights ?? []),
        ...weightLogs,
      ].sort((a, b) => a.time.localeCompare(b.time)),
      latest = logs.at(-1),
      change = logs.length > 1 ? latest.kg - logs[0].kg : null;
    return `<div class="feature-hero"><h1>Weight</h1><p>Your body-weight history.</p></div><div class="weight-hero"><strong>${latest ? latest.kg.toFixed(1) : "—"}<small>kg</small></strong><span>${latest ? esc(latest.date) + " · " + (latest.source === "manual" ? "GOOP manual log" : "Google Health") : "NO MEASUREMENTS YET"}</span>${change !== null ? `<p>${change > 0 ? "+" : ""}${change.toFixed(1)} kg across recorded history</p>` : ""}</div><button class="block-button full" data-action="log-weight">${icon("plus")}LOG WEIGHT</button>${
      logs.length > 1
        ? measurementChart(
            logs.map((l) => l.kg),
            "Recorded body weight in kilograms",
          )
        : ""
    }<h3 class="section-label">RECENT ENTRIES</h3>${
      logs.length
        ? [...logs]
            .reverse()
            .map(
              (l) =>
                `<div class="weight-entry"><span><b>${esc(l.date)}</b><small>${l.source === "manual" ? "GOOP manual log" : "Google Health"}</small></span><strong>${l.kg.toFixed(1)}<small>kg</small></strong></div>`,
            )
            .join("")
        : '<div class="empty-card"><p>Add your first weight or sync your Google Health measurements.</p></div>'
    }<p class="data-note">Manual logs stay on this device. Synced measurements retain their original Google Health source.</p>`;
  }
  function coach() {
    return `<div class="coach-status"><span class="coach-avatar">G</span><span>GOOP COACH<small>LOCAL GUIDE · NOT AN AI SERVICE</small></span></div><div class="coach-message">How can GOOP help? Explore your metrics, training, or sleep.</div><div id="coach-messages">${messages.map((m) => `<div class="coach-message ${m.role === "user" ? "from-user" : ""}">${esc(m.text)}</div>`).join("")}</div><div class="coach-suggestions">${["What does HRV mean?", "How do sleep stages work?", "Where is my Fitbit data?"].map((q) => `<button data-action="coach-prompt" data-prompt="${q}">${q}</button>`).join("")}</div><form id="coach-form" class="coach-composer"><input aria-label="Ask GOOP Coach" id="coach-input" placeholder="Ask about your metrics…" maxlength="500"><button aria-label="Send question" type="submit">↑</button></form><p class="data-note">This local guide explains features. It does not diagnose conditions, provide personalised medical advice, or send your messages to an AI provider.</p>`;
  }
  function sendCoach(text) {
    const prompt = text.trim();
    if (!prompt) return;
    let reply = /hrv/i.test(prompt)
      ? "HRV describes variation between heartbeats. Compare readings against your own baseline using the same method and source. Fitbit’s RMSSD and Apple’s SDNN should not be treated as interchangeable."
      : /sleep/i.test(prompt)
        ? "Sleep stages separate light, deep and REM sleep, with awake intervals shown separately. GOOP shows the stages your device provides; it cannot reproduce WHOOP’s proprietary Sleep Performance from missing data."
        : /data|fitbit|google|connect/i.test(prompt)
          ? "Open More → Google Health connection. Connect your Google account, then Sync Now. Choose My Data to see recorded readings; Demo contains illustrative scores."
          : "You can explore Sleep, Recovery and Strain from Home, log behaviours in Journal, and find Food, Weight and Healthspan under Health. This local guide explains features; it does not generate personalised coaching.";
    messages.push(
      { role: "user", text: prompt },
      { role: "assistant", text: reply },
    );
    messages = messages.slice(-30);
    write("coach-messages", messages);
    render();
  }
  function cycle() {
    const date = new Date(BASE_DATE);
    const month = date
      .toLocaleDateString("en-US", { month: "long" })
      .toUpperCase();
    return `<div class="cycle-heading"><span>Menstrual cycle journal</span><h1>${mode === "demo" ? "Cycle Day 3" : "Your cycle log"}</h1><p>${mode === "demo" ? "Menstrual phase · Sample calendar" : "Record your period without inferred predictions."}</p></div><div class="cycle-calendar"><h3>${month}</h3><div class="cycle-weekdays">${["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((n) => `<span>${n}</span>`).join("")}</div><div class="cycle-dates">${Array.from(
      { length: 31 },
      (_, i) => {
        const n = i + 1,
          k = `2026-10-${String(n).padStart(2, "0")}`,
          logged = cycleLogs.includes(k);
        const phase =
          mode === "demo"
            ? n < 8
              ? "menstrual"
              : n < 15
                ? "follicular"
                : n < 19
                  ? "ovulatory"
                  : "luteal"
            : logged
              ? "menstrual"
              : "";
        return `<button class="${phase} ${n === 31 ? "today" : ""}" data-action="cycle-day" data-date="${k}" aria-label="October ${n}${logged ? ", period logged" : ""}">${n}</button>`;
      },
    ).join(
      "",
    )}</div><div class="legend"><span style="--color:#e98f7a">Menstrual</span>${mode === "demo" ? '<span style="--color:#aba1e4">Follicular</span><span style="--color:#72aac3">Ovulatory</span><span style="--color:#9665bd">Luteal</span>' : ""}</div></div><button class="block-button full" data-action="cycle-log">${icon("plus")}LOG PERIOD DATA</button><p class="data-note">${mode === "demo" ? "Phase colours illustrate the supplied reference. They are sample data, not predictions about you." : "Only manually recorded period days are displayed. GOOP does not infer fertile windows or offer contraception guidance."}</p>`;
  }
  const healthLinks = () =>
    `<h2 class="section-heading">Daily logging</h2><div class="logging-pair"><button data-route="food"><span class="logging-illustration">${foodIllustration("LUNCH")}</span><b>Food</b><small>Meals & nutrition</small><span class="chevron">›</span></button><button data-route="weight"><span class="logging-illustration"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="5" y="5" width="22" height="23" rx="4"/><path d="M10 10a8 8 0 0 1 12 0l-3 5h-6z M16 9v4"/></svg></span><b>Weight</b><small>Body-weight history</small><span class="chevron">›</span></button></div>`;
  const actions = {
    "copy-callback": async () => {
      try {
        await navigator.clipboard.writeText(
          status.callback || `${location.origin}/api/google?action=callback`,
        );
        toast("Callback URI copied.");
      } catch {
        toast("Copy the callback URI shown in the guide.");
      }
    },
    "google-food-access": () => {
      if (!status.nutritionEnabled)
        return toast("Optional Google nutrition access is not enabled.");
      location.href = "/api/google?action=login&nutrition=1";
    },
    pause: () => {
      ctx.baseActions.pause();
      publishNow();
    },
    "save-workout": () => {
      ctx.baseActions["save-workout"]();
      publishNow();
    },
    connect: () => go("connections"),
    "google-login": () => {
      if (sendNative("connectGoogle")) return;
      if (!status.configured)
        return modal(
          "Google Health setup needed",
          `<p>This installation needs Google OAuth credentials before sign-in can work. Follow the in-app guide to enable Google Health API, register the callback, and set server environment variables.</p><button class="primary full" data-route="connection-guide">OPEN CONNECTION GUIDE</button>`,
        );
      location.href = "/api/google?action=login";
    },
    "google-sync": () => {
      if (sendNative("syncGoogle")) return;
      if (!status.connected) {
        go("connections");
        return;
      }
      sync();
    },
    "google-disconnect": () =>
      modal(
        "Disconnect Google Health?",
        '<p>This revokes GOOP’s Google access and clears the login cookie. Previously downloaded measurements stay on this device until you remove the local snapshot.</p><button class="primary full" data-action="confirm-disconnect">DISCONNECT</button>',
      ),
    "confirm-disconnect": async () => {
      try {
        const res = await fetch("/api/google?action=disconnect", {
            method: "POST",
          }),
          data = await res.json();
        if (!res.ok) throw Error(data.error);
        status.connected = false;
        syncMessage = data.revoked
          ? "Disconnected."
          : "Local session cleared. Revoke remaining access in your Google account settings.";
        close();
        render();
      } catch {
        toast("Could not disconnect. Please retry.");
      }
    },
    "remove-health": () =>
      modal(
        "Remove local health snapshot?",
        '<p>This removes downloaded Google Health measurements from this browser. It does not delete records in Google Health. Local journal, food and weight logs remain.</p><button class="primary full" data-action="confirm-remove-health">REMOVE SNAPSHOT</button>',
      ),
    "confirm-remove-health": async () => {
      for (const s of sources) await removeSource(s.id);
      sources = [];
      close();
      render();
      toast("Local health snapshot removed.");
    },
    "set-mode": (el) => {
      mode = el.dataset.mode;
      write("data-mode", mode);
      render();
    },
    metric: (el) => {
      if (el.dataset.key === "steps") return go("steps");
      if (mode === "demo") return ctx.baseActions.metric(el);
      const metric = el.dataset.key,
        m = meta[metric] || [metric.toUpperCase(), "pulse", ""],
        d = day(),
        p = d.provenance[metric],
        b = baseline(sources, key(), metric, preferred),
        source = sources.find((s) => s.id === p?.id);
      const values = source
        ? Object.entries(source.days)
            .filter(
              ([date, v]) =>
                date <= key() &&
                Number.isFinite(v[metric]) &&
                (metric !== "hrv" || v.hrvMethod === d.hrvMethod),
            )
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-30)
            .map(([, v]) => v[metric])
        : [];
      modal(
        m[0],
        `<div style="font:700 50px var(--num)">${value(metric)} <small style="font-size:17px">${m[2]}</small></div><p>${p ? esc(p.label) + (metric === "hrv" ? " · " + esc(d.hrvMethod || "Method not supplied") : "") : "No recorded measurement for this day."}</p>${measurementChart(values, m[0])}${b ? `<p>${b.count}-day recorded average: ${b.value.toFixed(1)} ${m[2]}</p>` : ""}`,
      );
    },
    "start-activity": () => {
      if (ctx.getSession()) {
        close();
        go("live");
        return;
      }
      pickerIntent = "live";
      picker();
    },
    "add-activity": () => {
      pickerIntent = "manual";
      picker();
    },
    "manual-picker": () => {
      pickerIntent = "manual";
      picker();
    },
    "prepare-activity": (el) => prepareActivity(el.dataset.type),
    "select-sport": (el) => {
      manualType = el.dataset.type;
      if (pickerIntent === "live") {
        prepareActivity(manualType);
      } else manualForm();
    },
    "save-manual-refined": () => ctx.baseActions["save-manual"](),
    "journal-day": (el) => {
      clearTimeout(notesTimer);
      setOffset(Number(el.dataset.offset));
      render();
    },
    "journal-answer": (el) => {
      const k = el.dataset.key,
        v = el.dataset.value,
        e = (entries[key()] ??= {});
      e[k] = v;
      const group = el.closest(".yesno");
      group.dataset.selected = v;
      group.classList.add("has-answer");
      group.querySelectorAll("button").forEach((b) => {
        b.setAttribute("aria-checked", String(b === el));
        b.classList.toggle("chosen", b === el);
      });
      const detail = $(`#detail-${k}`);
      if (detail) detail.inert = v !== "Yes";
      detail?.classList.toggle("expanded", v === "Yes");
      el.classList.remove("button-pop");
      requestAnimationFrame(() => el.classList.add("button-pop"));
      persistJournal();
    },
    "save-journal": () => {
      const e = (entries[key()] ??= {});
      e.notes = $("#journal-notes")?.value || "";
      persistJournal();
      toast("Journal saved.");
    },
    "journal-customize": () =>
      modal(
        "Your behaviours",
        `${habits.map(([k, n]) => `<label class="dashboard-check"><input type="checkbox" name="habits" value="${k}" ${selectedHabits.includes(k) ? "checked" : ""}>${n}</label>`).join("")}<button class="primary full" data-action="save-habits">SAVE BEHAVIOURS</button>`,
      ),
    "save-habits": () => {
      const chosen = [
        ...document.querySelectorAll('input[name="habits"]:checked'),
      ].map((e) => e.value);
      if (!chosen.length) return toast("Choose at least one behaviour.");
      selectedHabits = chosen;
      write("journal-habits", chosen);
      close();
      render();
    },
    "log-food": () => foodForm(),
    "edit-food": (el) => foodForm(foodLogs.find((f) => f.id === el.dataset.id)),
    "food-meal": (el) => {
      $("#food-meal").value = el.dataset.meal;
      el.parentElement
        .querySelectorAll("button")
        .forEach((b) => b.classList.toggle("selected", b === el));
    },
    "save-food": () => {
      const name = $("#food-name").value.trim();
      if (!name) return toast("Enter a food name.");
      const numbers = {};
      for (const field of ["calories", "protein", "carbs", "fat"]) {
        const text = $(`#food-${field}`).value;
        const n = text === "" ? null : Number(text);
        if (
          n !== null &&
          (!Number.isFinite(n) ||
            n < 0 ||
            n > (field === "calories" ? 100000 : 10000))
        )
          return toast("Enter valid non-negative nutrient values.");
        numbers[field] = n;
      }
      const id = $("#food-id").value || `food-${Date.now()}`,
        food = {
          id,
          name,
          meal: $("#food-meal").value,
          serving: $("#food-serving").value.trim(),
          date: key(),
          source: "manual",
          ...numbers,
        };
      foodLogs = foodLogs.filter((f) => f.id !== id);
      foodLogs.push(food);
      write("food-logs", foodLogs);
      close();
      render();
      toast("Food logged.");
    },
    "log-weight": () =>
      modal(
        "Log weight",
        `<label class="settings-label" for="weight-date">DATE</label><input type="date" class="text-field" id="weight-date" value="${key()}" max="${dayKey()}"><div class="form-grid"><div><label class="settings-label" for="weight-value">WEIGHT</label><input class="text-field" type="number" min="1" max="700" step="0.1" id="weight-value" placeholder="e.g. 72.5"></div><div><label class="settings-label">UNIT</label><div class="weight-units"><button data-action="weight-unit" data-unit="kg" class="selected">kg</button><button data-action="weight-unit" data-unit="lb">lb</button></div><input id="weight-unit" type="hidden" value="kg"></div></div><button class="primary full" data-action="save-weight">SAVE WEIGHT</button>`,
      ),
    "weight-unit": (el) => {
      $("#weight-unit").value = el.dataset.unit;
      el.parentElement
        .querySelectorAll("button")
        .forEach((b) => b.classList.toggle("selected", b === el));
    },
    "save-weight": () => {
      const v = Number($("#weight-value").value),
        unit = $("#weight-unit").value,
        date = $("#weight-date").value,
        kg = unit === "lb" ? v * 0.45359237 : v;
      if (
        !Number.isFinite(kg) ||
        kg < 1 ||
        kg > 700 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date > dayKey()
      )
        return toast("Enter a valid weight and date.");
      weightLogs.push({
        id: `weight-${Date.now()}`,
        kg,
        date,
        time: new Date(`${date}T12:00:00`).toISOString(),
        source: "manual",
      });
      write("weight-logs", weightLogs);
      close();
      render();
      toast("Weight logged.");
    },
    "coach-prompt": (el) => sendCoach(el.dataset.prompt),
    "cycle-day": (el) => {
      const date = el.dataset.date;
      modal(
        "Period record",
        `<p>${esc(date)}</p><p>Record only the days you choose. No phase or fertility prediction is inferred.</p><button class="primary full" data-action="save-cycle-day" data-date="${date}">${cycleLogs.includes(date) ? "REMOVE PERIOD DAY" : "LOG PERIOD DAY"}</button>`,
      );
    },
    "cycle-log": () =>
      modal(
        "Log period day",
        `<label class="settings-label" for="period-date">DATE</label><input class="text-field" type="date" id="period-date" value="${key()}" max="${dayKey()}"><button class="primary full" data-action="save-cycle-date">LOG PERIOD DAY</button>`,
      ),
    "save-cycle-date": () => {
      const date = $("#period-date").value;
      if (!date || date > dayKey()) return toast("Choose a valid date.");
      if (!cycleLogs.includes(date)) cycleLogs.push(date);
      write("cycle-logs", cycleLogs);
      close();
      render();
      toast("Period day recorded.");
    },
    "save-cycle-day": (el) => {
      const date = el.dataset.date;
      cycleLogs = cycleLogs.includes(date)
        ? cycleLogs.filter((d) => d !== date)
        : [...cycleLogs, date];
      write("cycle-logs", cycleLogs);
      close();
      render();
    },
    report: () =>
      ctx.download("goop-health-report.json", {
        date: key(),
        source: mode === "demo" ? "demo" : "Google Health",
        measurements:
          mode === "real"
            ? day()
            : {
                notice:
                  "Demo mode. Connect Google Health for a recorded health report.",
              },
      }),
    export: () =>
      ctx.download("goop-local-data.json", {
        journal: entries,
        food: foodLogs,
        weight: weightLogs,
        cycle: cycleLogs,
        workouts: read("workouts", []),
      }),
  };
  document.addEventListener("input", (event) => {
    const el = event.target;
    if (el.id === "sport-search") {
      const q = el.value.toLowerCase();
      document
        .querySelectorAll(".activity-option")
        .forEach((b) => (b.hidden = !b.dataset.type.toLowerCase().includes(q)));
    }
    if (el.id === "journal-notes") {
      const e = (entries[key()] ??= {});
      e.notes = el.value;
      clearTimeout(notesTimer);
      notesTimer = setTimeout(persistJournal, 450);
    }
    if (el.dataset.journalQuantity) {
      const e = (entries[key()] ??= {});
      e.quantities ??= {};
      const n = Number(el.value);
      if (el.value === "") delete e.quantities[el.dataset.journalQuantity];
      else if (Number.isFinite(n) && n >= 0 && n <= 1440)
        e.quantities[el.dataset.journalQuantity] = n;
      persistJournal();
    }
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id === "coach-form") {
      event.preventDefault();
      sendCoach($("#coach-input").value);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.target.closest(".yesno") &&
      ["ArrowLeft", "ArrowRight"].includes(event.key)
    ) {
      event.preventDefault();
      const group = event.target.closest(".yesno"),
        buttons = [...group.querySelectorAll("button")],
        target = event.key === "ArrowRight" ? buttons[1] : buttons[0];
      target.focus();
      target.click();
    }
  });
  window.GOOPNative = {
    receive: async (records) => {
      if (!Array.isArray(records) || records.length > 150000)
        throw Error("Invalid native health snapshot");
      const dataset = normalizeGoogle(records, {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await saveSources([dataset]);
      sources = await getSources();
      mode = "real";
      status = { ...status, configured: true, connected: true };
      write("data-mode", mode);
      syncMessage = "Synced through the native Google connection.";
      render();
      publishNow();
      return true;
    },
  };
  return {
    actions,
    value,
    metricRow,
    updateRibbon,
    refreshNative: publishNow,
    connections: connectionPage,
    coach,
    cycle,
    widgets: widgetPage,
    view(r) {
      if (r === "connection-guide") return connectionGuide();
      if (r === "steps") return stepsPage();
      if (r === "journal") return journalPage();
      if (r === "food") return food();
      if (r === "weight") return weight();
      if (r === "health") {
        const base =
          mode === "real"
            ? connectedView(r, {
                sources,
                preferred,
                date: key(),
                icon,
                dial,
                metricRow,
                activityLaunch: ctx.activityLaunch(),
                dashboard: ctx.dashboard(),
                displayTitle: ctx.displayTitle(),
              })
            : null;
        return base === null ? null : base + healthLinks();
      }
      if (mode === "real" && r === "journal-insights")
        return '<div class="feature-hero"><h1>Journal Insights</h1><p>Your logged behaviours are saved locally.</p></div><div class="callout"><h3>No recovery impact estimate</h3><p>GOOP has no validated Recovery score to correlate with your journal. No impact percentages are invented from your entries.</p></div>';
      if (mode === "real" && r === "assessment")
        return '<div class="feature-hero"><h1>Performance assessment</h1><p>No proprietary Recovery or Strain series is available. Open your recorded metric trends from Home.</p></div>';
      if (mode === "real")
        return connectedView(r, {
          sources,
          preferred,
          date: key(),
          icon,
          dial,
          metricRow,
          activityLaunch: ctx.activityLaunch(),
          dashboard: ctx.dashboard(),
          displayTitle: ctx.displayTitle(),
        });
      return null;
    },
    healthLinks,
    async init() {
      try {
        sources = await getSources();
      } catch {
        sources = [];
      }
      await fetchStatus();
      if (route() === "connections" || mode === "real") render();
      if (new URLSearchParams(location.search).get("auth") === "cancelled") {
        history.replaceState(null, "", location.pathname + "#connections");
        syncMessage =
          "Sign-in was cancelled. No new connection was saved. Tap Connect account to try again.";
        go("connections");
        render();
      }
      if (new URLSearchParams(location.search).get("auth") === "connected") {
        history.replaceState(null, "", location.pathname + "#connections");
        go("connections");
        await sync();
      }
    },
  };
}
