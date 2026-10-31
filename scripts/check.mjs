import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() &&
      !["node_modules", ".git", "preview", "ios", "public"].includes(e.name)
        ? walk(path.join(dir, e.name))
        : e.isFile() && /\.(js|mjs)$/.test(e.name)
          ? [path.join(dir, e.name)]
          : [],
    );
}
for (const file of walk(fileURLToPath(root))) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });
  if (result.status) process.exit(result.status);
}
const tests = fs
  .readdirSync(new URL("tests/", root))
  .filter((f) => f.endsWith(".test.mjs"))
  .map((f) =>
    new URL("tests/" + f, root).pathname.replace(/^\/([A-Z]:)/, "$1"),
  );
const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
