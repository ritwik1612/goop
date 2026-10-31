const CACHE = "goop-v7";
const SHELL = [
  "/",
  "/goop.css",
  "/refinements.css",
  "/logging.css",
  "/widgets.css",
  "/motion.css",
  "/monogram.svg",
  "/app.js",
  "/access.js",
  "/live-hr.js",
  "/workout-data.js",
  "/model.js",
  "/enhancements.js",
  "/health-model.js",
  "/health-store.js",
  "/connected-views.js",
  "/charts.js",
  "/activities.js",
  "/sphere.js",
  "/native-bridge.js",
  "/widgets-preview.js",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
  "/fonts/NunitoSans-Variable.ttf",
  "/fonts/D-DIN-Bold.woff2",
  "/fonts/Lato-Regular.ttf",
  "/fonts/Lato-Bold.ttf",
  "/fonts/BarlowSemiCondensed-SemiBold.ttf",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches
        .match(event.request)
        .then(
          (cached) =>
            cached ||
            (event.request.mode === "navigate"
              ? caches.match("/")
              : new Response("Offline", { status: 503 })),
        ),
    ),
  );
});
