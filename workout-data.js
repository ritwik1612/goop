export function distanceMeters(a, b) {
  const rad = Math.PI / 180,
    lat = (b.lat - a.lat) * rad,
    lon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function addLocation(session, position) {
  const c = position.coords,
    point = {
      lat: c.latitude,
      lon: c.longitude,
      accuracy: c.accuracy,
      time: position.timestamp,
    };
  if (
    ![point.lat, point.lon, point.accuracy, point.time].every(
      Number.isFinite,
    ) ||
    Math.abs(point.lat) > 90 ||
    Math.abs(point.lon) > 180 ||
    point.accuracy > 50 ||
    point.accuracy < 0 ||
    session.paused
  )
    return false;
  const previous = session.gpsLast;
  if (previous && point.time <= previous.time) return false;
  if (previous && point.time - previous.time < 60000) {
    const distance = distanceMeters(previous, point),
      seconds = (point.time - previous.time) / 1000;
    if (distance / seconds > 60) return false;
    if (distance < Math.max(3, (point.accuracy + previous.accuracy) / 4))
      return false;
    session.distanceM = (session.distanceM || 0) + distance;
  }
  session.gpsLast = point;
  session.gpsEnabled = true;
  session.gpsSpeed =
    Number.isFinite(c.speed) && c.speed >= 0 && c.speed < 60
      ? c.speed * 3.6
      : null;
  return true;
}
export function workoutZoneTimes(samples, maxHR = 190) {
  const zones = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < samples.length - 1; i++) {
    const p = samples[i],
      delta = samples[i + 1].seconds - p.seconds;
    if (delta <= 0 || delta > 10) continue;
    const zone =
      p.hr / maxHR < 0.5
        ? 0
        : Math.min(5, Math.floor((p.hr / maxHR - 0.5) * 10) + 1);
    zones[zone] += delta;
  }
  return zones;
}
