import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHeartRate, createLiveHeartRate } from "../live-hr.js";
import {
  distanceMeters,
  addLocation,
  workoutZoneTimes,
} from "../workout-data.js";
import { newSession, summarizeSession } from "../model.js";
const bytes = (...data) => new DataView(Uint8Array.from(data).buffer);
test("BLE heart-rate parser handles 8/16-bit readings, contact loss and truncated packets", () => {
  assert.equal(parseHeartRate(bytes(0, 137)).bpm, 137);
  assert.equal(parseHeartRate(bytes(1, 4, 1)).bpm, 260);
  assert.equal(parseHeartRate(bytes(4, 120)), null);
  assert.equal(parseHeartRate(bytes(6, 120)).contact, true);
  assert.equal(parseHeartRate(bytes(1, 120)), null);
  assert.equal(parseHeartRate(bytes(0, 0)), null);
  assert.equal(parseHeartRate(bytes(1, 255, 255)), null);
});
test("BLE subscribes to actual GATT notifications and clears stale readings on disconnect", async () => {
  class Characteristic extends EventTarget {
    async startNotifications() {
      return this;
    }
  }
  const characteristic = new Characteristic(),
    device = new EventTarget();
  device.name = "Test sensor";
  device.gatt = {
    connected: false,
    async connect() {
      this.connected = true;
      return {
        async getPrimaryService(service) {
          assert.equal(service, "heart_rate");
          return {
            async getCharacteristic(name) {
              assert.equal(name, "heart_rate_measurement");
              return characteristic;
            },
          };
        },
      };
    },
    disconnect() {
      this.connected = false;
    },
  };
  let received = [];
  const sensor = createLiveHeartRate({
    bluetooth: {
      async requestDevice(options) {
        assert.deepEqual(options.filters, [{ services: ["heart_rate"] }]);
        return device;
      },
    },
    onReading: (r) => received.push(r),
    now: () => 1234,
  });
  await sensor.connect();
  assert.equal(sensor.state().connected, true);
  assert.equal(sensor.state().latest, null);
  characteristic.value = bytes(0, 142);
  characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
  assert.deepEqual(received, [{ bpm: 142, time: 1234 }]);
  sensor.disconnect();
  assert.equal(sensor.state().latest, null);
  assert.equal(sensor.state().connected, false);
  characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
  assert.equal(received.length, 1);
});
test("phone GPS rejects inaccurate fixes, stationary jitter and impossible jumps", () => {
  const s = newSession("Walking", 0, "bluetooth");
  const pos = (lat, lon, time, accuracy = 5) => ({
    timestamp: time,
    coords: { latitude: lat, longitude: lon, accuracy, speed: 1.5 },
  });
  assert.equal(addLocation(s, pos(0, 0, 1000)), true);
  assert.equal(addLocation(s, pos(0, 0.0001, 11000)), true);
  assert.ok(s.distanceM > 11 && s.distanceM < 12);
  assert.equal(addLocation(s, pos(0, 0.000101, 12000)), false);
  assert.equal(addLocation(s, pos(0, 30, 13000)), false);
  assert.equal(addLocation(s, pos(0, 0.0002, 21000, 100)), false);
  s.paused = true;
  assert.equal(addLocation(s, pos(0, 0.0002, 21000)), false);
  assert.ok(
    Math.abs(distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111195) <
      5,
  );
});
test("workout zones exclude gaps and summaries preserve real sensor provenance", () => {
  assert.deepEqual(
    workoutZoneTimes(
      [
        { seconds: 0, hr: 140 },
        { seconds: 2, hr: 140 },
        { seconds: 60, hr: 180 },
      ],
      190,
    ),
    [0, 0, 0, 2, 0, 0],
  );
  const s = newSession("Running", 0, "bluetooth");
  s.samples = [{ seconds: 0, hr: 142 }];
  s.gpsEnabled = true;
  s.distanceM = 1500;
  const result = summarizeSession(s, 60000);
  assert.equal(result.source, "bluetooth");
  assert.equal(result.distanceKm, 1.5);
  assert.equal(result.avgHR, 142);
  assert.equal(result.calories, null);
});
