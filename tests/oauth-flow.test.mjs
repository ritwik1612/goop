import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../api/google.mjs";
import { unseal, seal } from "../lib/google-auth.mjs";
test("OAuth route issues a PKCE cookie, verifies callback and syncs authorised records", async (t) => {
  const original = { ...process.env },
    oldFetch = globalThis.fetch;
  Object.assign(process.env, {
    APP_ORIGIN: "https://example.test",
    GOOP_OWNER_EMAIL: "owner@example.test",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    SESSION_SECRET: "x".repeat(48),
  });
  t.after(() => {
    globalThis.fetch = oldFetch;
    for (const k of [
      "APP_ORIGIN",
      "GOOP_OWNER_EMAIL",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "SESSION_SECRET",
    ]) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });
  const gateCookie =
    "goop_access=" +
    seal(
      { kind: "personal-access", exp: Date.now() + 60000 },
      process.env.SESSION_SECRET,
    );
  const login = await GET(
    new Request("https://example.test/api/google?action=login", {
      headers: { cookie: gateCookie },
    }),
  );
  assert.equal(login.status, 302);
  const auth = new URL(login.headers.get("location"));
  assert.equal(auth.hostname, "accounts.google.com");
  const flowCookie = login.headers.get("set-cookie").split(";")[0];
  const flow = unseal(flowCookie.split("=")[1], process.env.SESSION_SECRET);
  assert.equal(flow.state, auth.searchParams.get("state"));
  let requests = [];
  globalThis.fetch = async (url, opts) => {
    requests.push(String(url));
    if (String(url).includes("oauth2.googleapis.com/token"))
      return Response.json({
        access_token: "test-access",
        refresh_token: "test-refresh",
        scope: auth.searchParams.get("scope"),
      });
    if (String(url).includes("openidconnect.googleapis.com/v1/userinfo"))
      return Response.json({
        email: "owner@example.test",
        email_verified: true,
      });
    if (String(url).endsWith("/identity")) return Response.json({});
    if (String(url).includes("dataTypes/steps/"))
      return Response.json({
        reconciledDataPoints: [
          {
            steps: {
              interval: {
                startTime: "2026-10-31T07:00:00Z",
                endTime: "2026-10-31T08:00:00Z",
              },
              count: 1234,
            },
          },
        ],
      });
    return Response.json({ reconciledDataPoints: [] });
  };
  const callback = await GET(
    new Request(
      `https://example.test/api/google?action=callback&state=${flow.state}&code=test-code`,
      { headers: { cookie: flowCookie + "; " + gateCookie } },
    ),
  );
  assert.equal(callback.status, 302);
  assert.match(callback.headers.get("location"), /auth=connected/);
  const sessionCookie = callback.headers
    .getSetCookie()
    .find((x) => x.startsWith("goop_session="))
    .split(";")[0];
  assert.equal(
    unseal(sessionCookie.split("=")[1], process.env.SESSION_SECRET)
      .refreshToken,
    "test-refresh",
  );
  const synced = await GET(
    new Request("https://example.test/api/google?action=sync&timeZone=UTC", {
      headers: { cookie: sessionCookie + "; " + gateCookie },
    }),
  );
  assert.equal(synced.status, 200);
  const result = await synced.json();
  assert.equal(result.dataset.days["2026-10-31"].steps, 1234);
  assert.equal(requests.filter((x) => x.includes("/dataTypes/")).length, 13);
  assert.ok(result.warnings.some((x) => x.type === "nutrition-log"));
  const denied = await GET(
    new Request(
      "https://example.test/api/google?action=callback&state=wrong&code=test-code",
      { headers: { cookie: flowCookie + "; " + gateCookie } },
    ),
  );
  assert.equal(denied.status, 400);
  globalThis.fetch = async (url) =>
    String(url).includes("oauth2.googleapis.com/token")
      ? Response.json({ access_token: "test", refresh_token: "test" })
      : Response.json({
          email: "someone-else@example.test",
          email_verified: true,
        });
  const wrongOwner = await GET(
    new Request(
      `https://example.test/api/google?action=callback&state=${flow.state}&code=test-code`,
      { headers: { cookie: flowCookie + "; " + gateCookie } },
    ),
  );
  assert.equal(wrongOwner.status, 403);
  assert.ok(!wrongOwner.headers.get("set-cookie"));
});
