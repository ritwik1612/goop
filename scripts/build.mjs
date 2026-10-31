import fs from "node:fs/promises";
const root = new URL("../", import.meta.url),
  out = new URL("public/", root);
await fs.mkdir(out, { recursive: true });
const assets = [
  "index.html",
  "goop.css",
  "refinements.css",
  "logging.css",
  "widgets.css",
  "motion.css",
  "monogram.svg",
  "app.js",
  "live-hr.js",
  "workout-data.js",
  "model.js",
  "enhancements.js",
  "health-model.js",
  "health-store.js",
  "connected-views.js",
  "charts.js",
  "activities.js",
  "sphere.js",
  "native-bridge.js",
  "widgets-preview.js",
  "sw.js",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
];
for (const asset of assets)
  await fs.copyFile(new URL(asset, root), new URL(asset, out));
await fs.cp(new URL("fonts/", root), new URL("fonts/", out), {
  recursive: true,
});
console.log(
  `Built ${assets.length} public app assets. Server code, tests, credentials and native source are excluded.`,
);
