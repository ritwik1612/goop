export function parseHeartRate(value) {
  if (!(value instanceof DataView) || value.byteLength < 2) return null;
  const flags = value.getUint8(0),
    wide = Boolean(flags & 1);
  if (wide && value.byteLength < 3) return null;
  const bpm = wide ? value.getUint16(1, true) : value.getUint8(1);
  const contactSupported = Boolean(flags & 4),
    contact = Boolean(flags & 2);
  if (!bpm || bpm > 300 || (contactSupported && !contact)) return null;
  return { bpm, contact: contactSupported ? contact : null };
}
export function createLiveHeartRate({
  bluetooth = globalThis.navigator?.bluetooth,
  onReading = () => {},
  onState = () => {},
  now = Date.now,
} = {}) {
  let device = null,
    characteristic = null,
    connecting = false,
    latest = null,
    connected = false;
  const state = () => ({
    supported: Boolean(bluetooth?.requestDevice),
    connected,
    connecting,
    name: device?.name || "Heart-rate sensor",
    latest,
  });
  const notify = () => onState(state());
  function reading(event) {
    const measurement = parseHeartRate(event.target.value);
    if (!measurement) return;
    latest = { bpm: measurement.bpm, time: now() };
    onReading({ ...latest });
  }
  function lost() {
    connected = false;
    latest = null;
    characteristic?.removeEventListener("characteristicvaluechanged", reading);
    characteristic = null;
    notify();
  }
  async function connect() {
    if (connecting || connected) return;
    if (!bluetooth?.requestDevice)
      throw Error(
        "Open GOOP in Bluefy on iPhone, or Chrome/Edge on a supported computer or Android phone. Safari cannot access the live Bluetooth sensor.",
      );
    connecting = true;
    notify();
    try {
      // The chooser is opened only by the user's Connect button.
      device = await bluetooth.requestDevice({
        filters: [{ services: ["heart_rate"] }],
      });
      device.addEventListener("gattserverdisconnected", lost);
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService("heart_rate");
      characteristic = await service.getCharacteristic(
        "heart_rate_measurement",
      );
      characteristic.addEventListener("characteristicvaluechanged", reading);
      await characteristic.startNotifications();
      connected = true;
      latest = null;
    } catch (error) {
      disconnect();
      if (error.name === "NotFoundError")
        throw Error(
          "No sensor selected. Enable Share heart rate in Google Health and try again.",
        );
      throw error;
    } finally {
      connecting = false;
      notify();
    }
  }
  function disconnect() {
    characteristic?.removeEventListener("characteristicvaluechanged", reading);
    device?.removeEventListener("gattserverdisconnected", lost);
    if (device?.gatt?.connected) device.gatt.disconnect();
    characteristic = null;
    connected = false;
    latest = null;
    notify();
  }
  return { state, connect, disconnect };
}
