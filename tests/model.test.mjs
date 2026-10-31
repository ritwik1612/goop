import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayKey,
  personalTitle,
  sampleDay,
  formatDuration,
  heartZone,
  escapeHTML,
  newSession,
  elapsed,
  togglePause,
  summarizeSession,
} from "../model.js";
test("workout time excludes pause and includes resumed time", () => {
  const s = newSession("Running", 1000);
  assert.equal(elapsed(s, 61000), 60000);
  togglePause(s, 61000);
  assert.equal(elapsed(s, 121000), 60000);
  togglePause(s, 121000);
  assert.equal(elapsed(s, 151000), 90000);
});
test("serialized workout can be restored without resetting time", () => {
  const s = JSON.parse(JSON.stringify(newSession("Walking", 1000)));
  assert.equal(elapsed(s, 91000), 90000);
});
test("summary keeps simulated source and leaves missing measurements null", () => {
  const s = newSession("Running", 1000);
  s.samples = [{ hr: 120 }, { hr: 140 }];
  const w = summarizeSession(s, 61000);
  assert.equal(w.seconds, 60);
  assert.equal(w.avgHR, 130);
  assert.equal(w.maxHR, 140);
  assert.equal(w.calories, null);
  assert.equal(w.strain, null);
  assert.equal(w.source, "simulated");
});
test("empty sensor series never invents heart-rate readings", () => {
  const w = summarizeSession(newSession("Walking", 1000), 2000);
  assert.equal(w.avgHR, null);
  assert.equal(w.maxHR, null);
});
test("date keys cross month boundaries in local civil time", () => {
  const base = new Date(2026, 9, 31, 12);
  assert.equal(dayKey(0, base), "2026-10-31");
  assert.equal(dayKey(-31, base), "2026-09-30");
});
test("journal notes are escaped before insertion into HTML", () => {
  assert.equal(
    escapeHTML('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});
test("duration and sample values have usable bounds", () => {
  assert.equal(formatDuration(3661), "1:01:01");
  assert.equal(formatDuration(-1), "00:00");
  for (let i = 0; i >= -180; i--) {
    const d = sampleDay(i);
    assert.ok(d.recovery >= 0 && d.recovery <= 100);
    assert.ok(d.sleep <= 100);
    assert.ok(d.strain <= 21);
  }
});
test("zone calculations respect configured maximum heart rate", () => {
  assert.equal(heartZone(70, 200), 0);
  assert.equal(heartZone(130, 200), 2);
  assert.equal(heartZone(195, 200), 5);
});

test("personal heading uses the saved name and a neutral empty default", () => {
  assert.equal(personalTitle(" Ritwik "), "Ritwik’s Fitbit");
  assert.equal(personalTitle("Your profile"), "Your Fitbit");
  assert.equal(personalTitle(""), "Your Fitbit");
  assert.equal(personalTitle("Alex   Smith"), "Alex Smith’s Fitbit");
  assert.equal(escapeHTML(personalTitle("<b>")), "&lt;b&gt;’s Fitbit");
});
