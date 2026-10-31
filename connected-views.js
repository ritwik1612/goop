import { combineDay, baseline } from "./health-model.js";
import { escapeHTML as esc, formatDuration, minutesLabel } from "./model.js";
import { heartRateChart } from "./charts.js";
export function connectedView(route, ctx) {
  const { sources, preferred, date, icon, dial, metricRow } = ctx;
  const d = combineDay(sources, date, preferred),
    allWorkouts = [
      ...sources.flatMap((s) => s.workouts ?? []),
      ...(ctx.localWorkouts || []),
    ],
    current = allWorkouts.filter((w) => w.date === date);
  const missing = '<span class="no-reading">No reading</span>';
  const sourceNote = (key) =>
    d.provenance[key]
      ? `<p class="data-note">${esc(d.provenance[key].label)}${key === "hrv" && d.hrvMethod ? ` · ${d.hrvMethod}` : ""}</p>`
      : "";
  const unavailable = (title, body) =>
    `<div class="callout"><h3>${title}</h3><p>${body}</p></div>`;
  const tile = (key, label, unit) =>
    `<button class="stat-tile" data-action="metric" data-key="${key}"><span class="tile-title">${icon(key === "resp" ? "lungs" : key === "spo2" ? "drop" : key === "temp" ? "temp" : key === "hrv" ? "pulse" : "heart")}${label}</span><div class="tile-value">${d[key] === null ? "—" : Number(d[key]).toFixed(["resp", "temp", "vo2"].includes(key) ? 1 : 0)}<span>${unit}</span></div>${sourceNote(key)}</button>`;
  const activity = (w) =>
    `<button class="activity-row" data-route="workout/${esc(w.id)}"><span class="activity-number workout">${icon("run")}${Math.round(w.seconds / 60)}<small style="font:9px var(--font)">MIN</small></span><span class="activity-name">${esc(w.type.toUpperCase())}</span><span class="activity-times">${w.source === "google" ? "GOOGLE HEALTH" : w.source === "bluetooth" ? "BLUETOOTH" : "LOCAL"}</span></button>`;
  if (route === "home")
    return `<div class="wordmark personal-wordmark"><em>${esc(ctx.displayTitle || "Your Fitbit")}</em></div><div class="home-scores">${["sleep", "recovery", "strain"].map((t) => `<button class="score-link" data-route="${t}">${dial(t, null)}<span class="dial-label">${t.toUpperCase()} ›</span></button>`).join("")}</div>${metricRow("steps")}<div class="insight"><h3>Your measurements, together</h3><p>${sources.length ? "Your authorised Google Health records are shown below. Proprietary scores stay empty until a GOOP scoring model is implemented." : "Connect Google Health to bring your Fitbit measurements into GOOP."}</p></div><button class="block-button full" data-route="connections">${icon("heart")}${sources.length ? "MANAGE CONNECTION & SYNC" : "CONNECT GOOGLE HEALTH"}</button><h2 class="section-heading">My Day</h2><section class="card"><div class="card-label">ACTIVITIES · ${esc(date)}</div>${d.sleepMinutes !== null ? `<button class="activity-row" data-route="sleep"><span class="activity-number">${icon("sleep")}${minutesLabel(Math.round(d.sleepMinutes))}</span><span class="activity-name">SLEEP</span></button>` : '<p class="data-note">No sleep record for this day.</p>'}${current.map(activity).join("")}<div class="dual-buttons"><button class="block-button" data-action="add-activity">ADD ACTIVITY</button><button class="block-button" data-action="start-activity">START TIMER</button></div></section><button class="journal-home-tile" data-route="journal">${icon("journal")}<span><b>My Journal</b><small>Daily check-in</small></span><span>›</span></button><h2 class="section-heading">My Dashboard<button data-action="customize">CUSTOMIZE ✎</button></h2>${ctx.dashboard
      .filter((k) => k !== "steps")
      .map(metricRow)
      .join(
        "",
      )}<p class="data-note">Missing metrics are shown as —. No sample measurements are mixed into My Data.</p>`;
  if (route === "health")
    return `<div class="feature-hero"><h1>Health</h1><p>Your measured health data.</p></div><div class="stat-grid">${tile("hrv", "HRV", "ms")}${tile("rhr", "RESTING HEART RATE", "bpm")}${tile("resp", "RESPIRATORY RATE", "rpm")}${tile("spo2", "BLOOD OXYGEN", "%")}</div><button class="block-button full" data-route="health-monitor">HEALTH MONITOR ›</button><h2 class="section-heading">All metrics</h2>${["hrv", "rhr", "resp", "spo2", "temp", "vo2", "steps", "calories", "efficiency"].map(metricRow).join("")}<h2 class="section-heading">Health insights</h2><button class="metric-row" data-route="healthspan">${icon("pulse")}<span class="metric-name">HEALTHSPAN</span><span class="availability" style="margin-left:auto">NO GOOP MODEL</span></button><button class="metric-row" data-route="cycle">${icon("drop")}<span class="metric-name">MENSTRUAL CYCLE JOURNAL</span><span class="chevron" style="margin-left:auto">›</span></button><button class="metric-row" data-route="connections">${icon("settings")}<span class="metric-name">DATA CONNECTIONS</span><span class="chevron" style="margin-left:auto">›</span></button>`;
  if (route === "health-monitor")
    return `<h3 class="chart-title">HEART RATE</h3>${
      d.heart.length
        ? heartRateChart(
            d.heart.map((p) => p.bpm),
            "Recorded heart-rate trend",
          )
        : unavailable(
            "No heart-rate samples",
            "No recorded heart-rate samples were returned for this day.",
          )
    }<div class="stat-grid">${tile("resp", "RESPIRATORY RATE", "rpm")}${tile("spo2", "BLOOD OXYGEN", "%")}${tile("rhr", "RESTING HEART RATE", "bpm")}${tile("hrv", "HRV", "ms")}${tile("temp", "SKIN TEMPERATURE DEVIATION", "°C")}</div><button class="block-button full" data-action="report">EXPORT HEALTH REPORT</button><p class="data-note">No “within range” assessment is shown without an adequate personal baseline.</p>`;
  if (route === "sleep")
    return `<div class="feature-hero"><h1>Sleep</h1><p>${esc(date)}</p></div><div class="stat-grid"><div class="stat-tile"><span class="tile-title">HOURS OF SLEEP</span><div class="tile-value">${d.sleepMinutes === null ? "—" : minutesLabel(Math.round(d.sleepMinutes))}</div>${sourceNote("sleepMinutes")}</div><div class="stat-tile"><span class="tile-title">SLEEP EFFICIENCY</span><div class="tile-value">${d.efficiency === null ? "—" : Math.round(d.efficiency) + "%"}</div></div></div><h3 class="section-label">SLEEP STAGES</h3>${[
      "awake",
      "light",
      "deep",
      "rem",
    ]
      .map((k, i) => {
        const n = d.sleepStages?.[k];
        const total = d.sleepMinutes + (d.sleepStages?.awake || 0);
        return `<div class="sleep-stage"><div class="bar-top"><span>${k === "deep" ? "SWS (DEEP)" : k.toUpperCase()}</span><b>${n === null || n === undefined ? "—" : minutesLabel(Math.round(n))}</b></div><div class="bar-track"><i style="--width:${n != null && total > 0 ? (100 * n) / total : 0}%;--color:${["#d4d8dc", "#aaa5e2", "#d99de5", "#9f68d4"][i]}"></i></div></div>`;
      })
      .join("")}${
      d.heart.length
        ? `<h3 class="section-label">RECORDED HEART RATE</h3>${heartRateChart(
            d.heart.map((p) => p.bpm),
            "Recorded heart-rate series",
          )}`
        : ""
    }${unavailable("Sleep measurements, without an invented score", "Sleep Performance, Sleep Need, Sleep Stress and sleep coaching are not supplied by this data connection. Your recorded sleep duration, stages and calculated efficiency are shown when available.")}`;
  if (route === "recovery")
    return `<div class="detail-dial">${dial("recovery", null, true)}</div>${unavailable("Recovery score unavailable", "Google Health supplies the contributing measurements, but not WHOOP Recovery. GOOP does not invent an equivalent score.")}${["hrv", "rhr", "resp"].map(metricRow).join("")}`;
  if (route === "strain")
    return `<div class="detail-dial">${dial("strain", null, true)}</div>${unavailable("Day Strain unavailable", "WHOOP’s strain model is not part of Google Health. Recorded activity and heart-rate measurements are available below.")}${metricRow("steps")}${metricRow("calories")}${current.map(activity).join("")}`;
  if (route === "healthspan")
    return `<div class="feature-hero"><h1>Healthspan</h1><p>GOOP Age & Pace of Aging</p></div>${unavailable("No physiological-age result", "There is no validated GOOP age model connected to these measurements. More history alone does not establish one. No physiological age or pace of aging is inferred.")}${["vo2", "rhr", "steps"].map(metricRow).join("")}`;
  if (route === "stress")
    return (
      unavailable(
        "Stress score unavailable",
        "Google Health does not expose WHOOP Stress. GOOP will not turn an ordinary heart-rate reading into a stress diagnosis. You can still use the breathing session below.",
      ) +
      '<button class="block-button full" data-action="breathing">START BREATHING SESSION</button>'
    );
  if (route === "activities")
    return `${ctx.activityLaunch || ""}<div class="feature-hero"><h1>Activity history</h1><p>Google Health workouts</p></div><h3 class="section-label">SYNCED WORKOUTS</h3>${
      allWorkouts.length
        ? allWorkouts
            .sort((a, b) => b.startedAt - a.startedAt)
            .map(activity)
            .join("")
        : '<p class="note">No workouts synced yet.</p>'
    }<button class="block-button full" data-action="add-activity">ADD MANUAL ACTIVITY</button>`;
  if (route.startsWith("workout/")) {
    const id = route.slice(8),
      w = allWorkouts.find((w) => w.id === id);
    if (!w || w.source !== "google") return null;
    return `<div class="workout-heading">${icon("run")}<span>${esc(w.type.toUpperCase())}<small>Google Health · ${esc(w.date)}</small></span></div><h3 class="chart-title">HEART RATE</h3>${
      w.samples?.length
        ? heartRateChart(
            w.samples.map((p) => p.hr),
            "Recorded workout heart rate",
          )
        : '<p class="note">No heart-rate samples available for this workout.</p>'
    }<section class="workout-detail-panel"><h3>ACTIVITY STATISTICS</h3><div class="workout-metrics">${[
      ["CALORIES", w.calories === null ? "—" : Math.round(w.calories)],
      ["AVG HR", w.avgHR ?? "—"],
      ["MAX HR", w.maxHR ?? "—"],
      ["DURATION", formatDuration(w.seconds)],
    ]
      .map(([n, v]) => `<div><small>${n}</small><b>${v}</b></div>`)
      .join(
        "",
      )}</div></section><div class="card"><div class="plan-item"><span>Distance</span><b>${w.distanceKm === null ? "—" : w.distanceKm.toFixed(2) + " km"}</b></div><div class="plan-item"><span>Activity strain</span><b>—</b></div></div>`;
  }
  return null;
}
