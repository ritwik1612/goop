export function sendNative(type, payload = {}) {
  const bridge = window.webkit?.messageHandlers?.goop;
  if (!bridge) return false;
  bridge.postMessage({ type, ...payload });
  return true;
}
export function publishWidgetSnapshot({ mode, day, date, session }) {
  const current = session
    ? {
        type: session.type,
        startedAt: session.startedAt / 1000,
        activeSince: session.activeSince / 1000,
        elapsed: session.elapsedMs / 1000,
        paused: session.paused,
        heartRate: session.samples.at(-1)?.hr ?? null,
        simulated: session.source === "simulated",
      }
    : null;
  return sendNative("snapshot", {
    snapshot: {
      updatedAt: Date.now() / 1000,
      date,
      sample: mode === "demo",
      sleep: day.sleep ?? null,
      recovery: day.recovery ?? null,
      strain: day.strain ?? null,
      sleepMinutes: day.sleepMinutes ?? null,
      workout: current,
    },
  });
}
