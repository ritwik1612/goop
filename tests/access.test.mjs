import { test } from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { GET, POST } from "../api/access.mjs";
import { GET as googleGET } from "../api/google.mjs";
import { verifyPin, hasAccess } from "../lib/access.mjs";
test("personal PIN gate issues a protected cookie, denies guests and rejects cross-origin requests", async (t) => {
  const before = { ...process.env };
  const salt = "0123456789abcdef0123456789abcdef";
  Object.assign(process.env, {
    APP_ORIGIN: "https://example.test",
    SESSION_SECRET: "x".repeat(48),
    GOOP_PIN_HASH: salt + ":" + scryptSync("123456", salt, 32).toString("hex"),
    GOOP_OWNER_NAME: "Owner",
  });
  t.after(() => {
    for (const k of [
      "APP_ORIGIN",
      "SESSION_SECRET",
      "GOOP_PIN_HASH",
      "GOOP_OWNER_NAME",
    ]) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  });
  assert.equal(verifyPin("123456", process.env.GOOP_PIN_HASH), true);
  assert.equal(verifyPin("012345", process.env.GOOP_PIN_HASH), false);
  const request = (pin) =>
    new Request("https://example.test/api/access?action=unlock", {
      method: "POST",
      headers: {
        origin: "https://example.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ pin }),
    });
  assert.equal((await POST(request("000000"))).status, 401);
  const unlocked = await POST(request("123456"));
  assert.equal(unlocked.status, 200);
  const gateCookie = unlocked.headers
    .getSetCookie()
    .find((c) => c.startsWith("goop_access="))
    .split(";")[0];
  assert.equal(
    hasAccess(
      new Request("https://example.test", { headers: { cookie: gateCookie } }),
    ),
    true,
  );
  assert.match(unlocked.headers.getSetCookie()[0], /HttpOnly/);
  assert.match(unlocked.headers.getSetCookie()[0], /Secure/);
  const status = await (
    await GET(
      new Request("https://example.test/api/access", {
        headers: { cookie: gateCookie },
      }),
    )
  ).json();
  assert.equal(status.unlocked, true);
  assert.equal(status.name, "Owner");
  const cross = await POST(
    new Request("https://example.test/api/access?action=unlock", {
      method: "POST",
      headers: { origin: "https://evil.test" },
      body: "{}",
    }),
  );
  assert.equal(cross.status, 403);
  const guest = await googleGET(
    new Request("https://example.test/api/google?action=sync"),
  );
  assert.equal(guest.status, 401);
  const locked = await POST(
    new Request("https://example.test/api/access?action=lock", {
      method: "POST",
      headers: { origin: "https://example.test", cookie: gateCookie },
    }),
  );
  assert.match(locked.headers.get("set-cookie"), /Max-Age=0/);
});
