export const emptyDay = () => ({
  hrv: null,
  hrvMethod: null,
  rhr: null,
  resp: null,
  spo2: null,
  temp: null,
  vo2: null,
  steps: null,
  calories: null,
  activeCalories: null,
  basalCalories: null,
  sleepMinutes: null,
  efficiency: null,
  sleepStages: null,
  sleepStart: null,
  sleepEnd: null,
  heart: [],
});
export function civilKey(date, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
export function googleDate(value) {
  return value &&
    Number.isFinite(value.year) &&
    Number.isFinite(value.month) &&
    Number.isFinite(value.day)
    ? `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`
    : null;
}
const finite = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
export function durationSeconds(value) {
  if (typeof value === "number") return value;
  return typeof value === "string" && /^[\d.]+s$/.test(value)
    ? Number(value.slice(0, -1))
    : null;
}
export function normalizeGoogle(
  records,
  { timeZone = "UTC", now = new Date().toISOString() } = {},
) {
  const days = {},
    workouts = [],
    nutrition = [],
    weights = [];
  const day = (key) => (days[key] ??= emptyDay());
  const assign = (obj, metric, field) => {
    if (!obj) return;
    const key = googleDate(obj.date);
    const v = finite(obj[field]);
    if (key && v !== null) day(key)[metric] = v;
  };
  for (const point of records) {
    const weight = point.weight;
    if (
      weight?.sampleTime?.physicalTime &&
      finite(weight.weightGrams) !== null
    ) {
      const time = weight.sampleTime.physicalTime;
      weights.push({
        id: point.name || point.dataPointName || `google-weight-${time}`,
        time,
        date: civilKey(time, timeZone),
        kg: Number(weight.weightGrams) / 1000,
        source: "google",
      });
    }
    const food = point.nutritionLog;
    if (food?.interval?.startTime) {
      const time = food.interval.startTime;
      nutrition.push({
        id:
          point.name ||
          point.dataPointName ||
          `google-food-${time}-${nutrition.length}`,
        date: civilKey(time, timeZone),
        time,
        source: "google",
        name: food.foodDisplayName || "Logged food",
        meal: food.mealType || "SNACK",
        serving: [
          food.serving?.amount,
          food.serving?.foodMeasurementUnitDisplayName,
        ]
          .filter((v) => v != null)
          .join(" "),
        calories: finite(food.energy?.kcal),
        protein: finite(
          food.nutrients?.find((n) => n.nutrient === "PROTEIN")?.quantity
            ?.grams,
        ),
        carbs: finite(food.totalCarbohydrate?.grams),
        fat: finite(food.totalFat?.grams),
      });
    }
    assign(
      point.dailyHeartRateVariability,
      "hrv",
      "averageHeartRateVariabilityMilliseconds",
    );
    if (point.dailyHeartRateVariability) {
      const key = googleDate(point.dailyHeartRateVariability.date);
      if (key) day(key).hrvMethod = "RMSSD";
    }
    assign(point.dailyRestingHeartRate, "rhr", "beatsPerMinute");
    assign(point.dailyRespiratoryRate, "resp", "breathsPerMinute");
    assign(point.dailyOxygenSaturation, "spo2", "averagePercentage");
    assign(point.dailyVo2Max, "vo2", "vo2Max");
    const temp = point.dailySleepTemperatureDerivations;
    if (temp) {
      const key = googleDate(temp.date);
      if (
        key &&
        finite(temp.nightlyTemperatureCelsius) !== null &&
        finite(temp.baselineTemperatureCelsius) !== null
      )
        day(key).temp =
          temp.nightlyTemperatureCelsius - temp.baselineTemperatureCelsius;
    }
    for (const [prop, metric, field] of [
      ["steps", "steps", "count"],
      ["activeEnergyBurned", "activeCalories", "kcal"],
      ["basalEnergyBurned", "basalCalories", "kcal"],
    ]) {
      const v = point[prop];
      if (v?.interval?.startTime && finite(v[field]) !== null) {
        const d = day(civilKey(v.interval.startTime, timeZone));
        d[metric] = (d[metric] ?? 0) + Number(v[field]);
      }
    }
    const hr = point.heartRate;
    if (hr?.sampleTime?.physicalTime && finite(hr.beatsPerMinute) !== null) {
      const key = civilKey(hr.sampleTime.physicalTime, timeZone);
      day(key).heart.push({
        time: hr.sampleTime.physicalTime,
        bpm: Number(hr.beatsPerMinute),
      });
    }
    const sleep = point.sleep;
    if (sleep?.interval?.endTime) {
      const key = civilKey(sleep.interval.endTime, timeZone),
        d = day(key);
      const mins = finite(sleep.summary?.minutesAsleep);
      if (mins !== null && (d.sleepMinutes === null || mins > d.sleepMinutes)) {
        d.sleepMinutes = mins;
        d.sleepStart = sleep.interval.startTime;
        d.sleepEnd = sleep.interval.endTime;
        d.sleepStages = { awake: null, light: null, deep: null, rem: null };
        for (const st of sleep.summary?.stagesSummary ?? []) {
          const type = st.type.toLowerCase();
          if (type in d.sleepStages) d.sleepStages[type] = finite(st.minutes);
        }
        const inBed = finite(sleep.summary?.minutesInSleepPeriod);
        d.efficiency = inBed > 0 ? (100 * mins) / inBed : null;
      }
    }
    const ex = point.exercise;
    if (ex?.interval?.startTime) {
      const m = ex.metricsSummary ?? {};
      workouts.push({
        id: `google-${encodeURIComponent(point.name || point.dataPointName || ex.interval.startTime).replaceAll("%", "-")}`,
        source: "google",
        date: civilKey(ex.interval.startTime, timeZone),
        type:
          ex.displayName ||
          ex.exerciseType?.replaceAll("_", " ").toLowerCase() ||
          "Workout",
        startedAt: Date.parse(ex.interval.startTime),
        endedAt: Date.parse(ex.interval.endTime),
        seconds:
          durationSeconds(ex.activeDuration) ??
          Math.max(
            0,
            (Date.parse(ex.interval.endTime) -
              Date.parse(ex.interval.startTime)) /
              1000,
          ),
        avgHR: finite(m.averageHeartRateBeatsPerMinute),
        maxHR: null,
        calories: finite(m.caloriesKcal),
        distanceKm:
          finite(m.distanceMillimeters) === null
            ? null
            : Number(m.distanceMillimeters) / 1e6,
        strain: null,
        samples: [],
        sets: [],
      });
    }
  }
  for (const d of Object.values(days)) {
    if (d.activeCalories !== null && d.basalCalories !== null)
      d.calories = d.activeCalories + d.basalCalories;
    d.heart.sort((a, b) => a.time.localeCompare(b.time));
    const buckets = new Map();
    for (const p of d.heart) {
      const key = Math.floor(Date.parse(p.time) / 300000);
      const bucket = buckets.get(key) ?? { time: p.time, sum: 0, n: 0 };
      bucket.sum += p.bpm;
      bucket.n++;
      buckets.set(key, bucket);
    }
    d.heart = [...buckets.values()].map((p) => ({
      time: p.time,
      bpm: Math.round(p.sum / p.n),
    }));
  }
  for (const w of workouts) {
    w.samples = Object.values(days)
      .flatMap((d) => d.heart)
      .filter(
        (h) =>
          Date.parse(h.time) >= w.startedAt && Date.parse(h.time) <= w.endedAt,
      )
      .map((h) => ({
        seconds: Math.round((Date.parse(h.time) - w.startedAt) / 1000),
        hr: h.bpm,
      }));
    if (w.samples.length) w.maxHR = Math.max(...w.samples.map((s) => s.hr));
  }
  return {
    id: "google",
    label: "Google Health · Fitbit",
    provider: "google",
    syncedAt: now,
    days,
    workouts,
    nutrition,
    weights,
  };
}
export function combineDay(collections, key, preferred) {
  const result = emptyDay(),
    provenance = {};
  const ordered = [...collections].sort(
    (a, b) => (a.id === preferred ? -1 : 0) - (b.id === preferred ? -1 : 0),
  );
  for (const dataset of ordered) {
    const d = dataset.days?.[key];
    if (!d) continue;
    for (const metric of Object.keys(result)) {
      if (metric === "hrvMethod") continue;
      const value = d[metric];
      const empty =
        result[metric] === null ||
        (Array.isArray(result[metric]) && result[metric].length === 0);
      if (
        empty &&
        value !== null &&
        value !== undefined &&
        (!Array.isArray(value) || value.length)
      ) {
        result[metric] = value;
        provenance[metric] = {
          id: dataset.id,
          label: dataset.label,
          provider: dataset.provider,
        };
        if (metric === "hrv") result.hrvMethod = d.hrvMethod ?? null;
      }
    }
  }
  // Never combine sleep durations, stages or efficiency from different devices.
  const sleepSource = ordered.find((c) => c.id === provenance.sleepMinutes?.id);
  if (sleepSource) {
    const d = sleepSource.days[key];
    for (const metric of [
      "sleepStages",
      "sleepStart",
      "sleepEnd",
      "efficiency",
    ]) {
      result[metric] = d[metric] ?? null;
      if (d[metric] != null)
        provenance[metric] = {
          id: sleepSource.id,
          label: sleepSource.label,
          provider: sleepSource.provider,
        };
      else delete provenance[metric];
    }
  }
  return { ...result, provenance };
}
export function baseline(collections, key, metric, preferred, count = 30) {
  const selected = combineDay(collections, key, preferred);
  const source = selected.provenance[metric]?.id;
  if (!source) return null;
  const dataset = collections.find((c) => c.id === source);
  const values = Object.entries(dataset.days)
    .filter(
      ([date, d]) =>
        date < key &&
        d[metric] != null &&
        Number.isFinite(d[metric]) &&
        (metric !== "hrv" || d.hrvMethod === selected.hrvMethod),
    )
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, count)
    .map(([, d]) => d[metric]);
  return values.length
    ? {
        value: values.reduce((a, b) => a + b, 0) / values.length,
        count: values.length,
        source,
      }
    : null;
}
