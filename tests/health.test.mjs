import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  normalizeGoogle,
  combineDay,
  baseline,
  emptyDay,
  civilKey,
} from "../health-model.js";
import {
  config,
  seal,
  unseal,
  equal,
  oauthStart,
  SCOPES,
  cookie,
} from "../lib/google-auth.mjs";
import { GET, POST } from "../api/google.mjs";
const date = { year: 2026, month: 10, day: 31 };
test("Google measurements preserve missing values and original HRV method", () => {
  const result = normalizeGoogle([
    {
      dailyHeartRateVariability: {
        date,
        averageHeartRateVariabilityMilliseconds: 62,
      },
    },
    { dailyRestingHeartRate: { date, beatsPerMinute: "54" } },
  ]);
  const d = result.days["2026-10-31"];
  assert.equal(d.hrv, 62);
  assert.equal(d.hrvMethod, "RMSSD");
  assert.equal(d.rhr, 54);
  assert.equal(d.spo2, null);
  assert.equal(d.sleepMinutes, null);
  assert.equal(d.recovery, undefined);
});
test("civil dates use the user timezone rather than UTC boundaries", () => {
  assert.equal(civilKey("2026-10-30T21:00:00Z", "Asia/Kolkata"), "2026-10-31");
});
test("Google nutrition includes meal, original serving and nullable nutrients", () => {
  const result = normalizeGoogle([
    {
      name: "food-1",
      nutritionLog: {
        interval: { startTime: "2026-10-31T08:00:00Z" },
        foodDisplayName: "Breakfast oats",
        mealType: "BREAKFAST",
        energy: { kcal: 350 },
        totalCarbohydrate: { grams: 42 },
        nutrients: [{ nutrient: "PROTEIN", quantity: { grams: 15 } }],
        serving: { amount: 1, foodMeasurementUnitDisplayName: "bowl" },
      },
    },
  ]);
  assert.equal(result.nutrition[0].name, "Breakfast oats");
  assert.equal(result.nutrition[0].protein, 15);
  assert.equal(result.nutrition[0].calories, 350);
  assert.equal(result.nutrition[0].fat, null);
  assert.equal(result.nutrition[0].serving, "1 bowl");
  assert.equal(result.nutrition[0].source, "google");
});
test("Google weight is converted from grams to kilograms", () => {
  const r = normalizeGoogle([
    {
      weight: {
        weightGrams: 72500,
        sampleTime: { physicalTime: "2026-10-31T08:00:00Z" },
      },
    },
  ]);
  assert.equal(r.weights[0].kg, 72.5);
});
test("sleep summaries do not count awake time as time asleep", () => {
  const r = normalizeGoogle([
    {
      sleep: {
        interval: {
          startTime: "2026-10-30T23:00:00Z",
          endTime: "2026-10-31T07:00:00Z",
        },
        summary: {
          minutesAsleep: "450",
          minutesInSleepPeriod: "480",
          stagesSummary: [
            { type: "AWAKE", minutes: "30" },
            { type: "DEEP", minutes: "90" },
            { type: "LIGHT", minutes: "240" },
            { type: "REM", minutes: "120" },
          ],
        },
      },
    },
  ]);
  const d = r.days["2026-10-31"];
  assert.equal(d.sleepMinutes, 450);
  assert.equal(d.efficiency, 93.75);
  assert.equal(d.sleepStages.awake, 30);
});
test("missing skin-temperature baseline does not become a fake zero deviation", () => {
  const r = normalizeGoogle([
    {
      dailySleepTemperatureDerivations: {
        date,
        nightlyTemperatureCelsius: 34.2,
      },
    },
  ]);
  assert.equal(r.days["2026-10-31"], undefined);
});
test("total calories require both basal and active energy", () => {
  const r = normalizeGoogle([
    {
      activeEnergyBurned: {
        interval: { startTime: "2026-10-31T10:00:00Z" },
        kcal: 200,
      },
    },
  ]);
  assert.equal(r.days["2026-10-31"].activeCalories, 200);
  assert.equal(r.days["2026-10-31"].calories, null);
});
test("source priority never adds duplicate step totals", () => {
  const a = {
      id: "google",
      label: "Google",
      days: { "2026-10-31": { ...emptyDay(), steps: 8000 } },
    },
    b = {
      id: "secondary",
      label: "Secondary",
      days: { "2026-10-31": { ...emptyDay(), steps: 7900 } },
    };
  assert.equal(combineDay([a, b], "2026-10-31", "google").steps, 8000);
});
test("sleep duration and stages cannot be combined from different sources", () => {
  const a = {
      id: "a",
      label: "A",
      days: { "2026-10-31": { ...emptyDay(), sleepMinutes: 400 } },
    },
    b = {
      id: "b",
      label: "B",
      days: {
        "2026-10-31": {
          ...emptyDay(),
          sleepMinutes: 410,
          sleepStages: { deep: 100 },
        },
      },
    };
  const d = combineDay([a, b], "2026-10-31", "a");
  assert.equal(d.sleepMinutes, 400);
  assert.equal(d.sleepStages, null);
});
test("baseline excludes other HRV methods and dates after the selected day", () => {
  const s = {
    id: "google",
    label: "Google",
    days: {
      "2026-10-31": { hrv: 60, hrvMethod: "RMSSD" },
      "2026-10-30": { hrv: 50, hrvMethod: "RMSSD" },
      "2026-10-29": { hrv: 10, hrvMethod: "SDNN" },
      "2026-11-01": { hrv: 90, hrvMethod: "RMSSD" },
    },
  };
  assert.deepEqual(baseline([s], "2026-10-31", "hrv", "google"), {
    value: 50,
    count: 1,
    source: "google",
  });
});
const secret = "synthetic-test-key-that-is-longer-than-32-characters";
test("session encryption resists tampering and expiry", () => {
  const encoded = seal(
    { refreshToken: "test-only-not-a-real-token", exp: 2000 },
    secret,
  );
  assert.equal(
    unseal(encoded, secret, 1000).refreshToken,
    "test-only-not-a-real-token",
  );
  assert.equal(unseal(encoded, secret, 2001), null);
  const tampered = Buffer.from(encoded, "base64url");
  tampered[20] ^= 1;
  assert.equal(unseal(tampered.toString("base64url"), secret, 1000), null);
  assert.ok(!encoded.includes("test-only"));
});
test("OAuth uses fresh state and S256 PKCE, with no write scopes", () => {
  const c = { origin: "https://example.invalid", clientId: "test-client" },
    a = oauthStart(c),
    b = oauthStart(c),
    url = new URL(a.url);
  assert.notEqual(a.state, b.state);
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(a.verifier).digest("base64url"),
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(SCOPES.every((s) => s.endsWith(".readonly")));
  assert.ok(!url.searchParams.get("scope").includes("nutrition"));
  assert.ok(
    new URL(oauthStart(c, true).url).searchParams
      .get("scope")
      .includes("nutrition.readonly"),
  );
});
test("missing production configuration cannot enable OAuth", () => {
  assert.equal(config({ VERCEL: "1" }).ready, false);
  assert.equal(config({ VERCEL: "1" }).origin, "");
});
test("session cookies are HTTP-only and secure on HTTPS", () => {
  const c = cookie("session", "synthetic", "https://example.invalid");
  assert.ok(c.includes("HttpOnly"));
  assert.ok(c.includes("Secure"));
  assert.ok(c.includes("SameSite=Lax"));
});
test("disconnect rejects cross-origin requests", async () => {
  const response = await POST(
    new Request("http://127.0.0.1:4173/api/google?action=disconnect", {
      method: "POST",
      headers: { origin: "https://example.invalid" },
    }),
  );
  assert.equal(response.status, 403);
});
test("status exposes configuration flags rather than secrets", async () => {
  const r = await GET(
    new Request("http://127.0.0.1:4173/api/google?action=status"),
  );
  const text = await r.text();
  assert.equal(r.status, 200);
  assert.ok(r.headers.get("Cache-Control").includes("no-store"));
  assert.ok(!text.includes("clientSecret"));
  assert.ok(!text.includes("refreshToken"));
});
test("constant-time state comparison handles mismatched lengths safely", () => {
  assert.equal(equal("a", "b"), false);
  assert.equal(equal("a", "longer"), false);
  assert.equal(equal("same", "same"), true);
});
