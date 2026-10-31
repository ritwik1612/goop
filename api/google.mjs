import {
  config,
  seal,
  unseal,
  cookies,
  cookie,
  equal,
  oauthStart,
  tokenRequest,
} from "../lib/google-auth.mjs";
import { hasAccess } from "../lib/access.mjs";
import { normalizeGoogle } from "../health-model.js";
const json = (value, status = 200, headers = {}) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
const types = [
  "daily-heart-rate-variability",
  "daily-resting-heart-rate",
  "daily-respiratory-rate",
  "daily-oxygen-saturation",
  "daily-sleep-temperature-derivations",
  "daily-vo2-max",
  "steps",
  "active-energy-burned",
  "basal-energy-burned",
  "sleep",
  "heart-rate",
  "exercise",
  "weight",
];
export async function GET(request) {
  const cfg = config(),
    url = new URL(request.url),
    action = url.searchParams.get("action") || "status",
    jar = cookies(request),
    decoded = cfg.ready ? unseal(jar.goop_session || "", cfg.secret) : null,
    session = decoded?.email === cfg.ownerEmail ? decoded : null;
  if (action === "status")
    return json({
      configured: cfg.ready,
      connected:
        hasAccess(request, cfg.secret) && Boolean(session?.refreshToken),
      nutritionEnabled: cfg.nutritionEnabled,
      nutritionAccess: Boolean(session?.nutrition),
      callback: cfg.origin ? `${cfg.origin}/api/google?action=callback` : null,
    });
  if (!hasAccess(request, cfg.secret))
    return json({ error: "Unlock personal access with your PIN first." }, 401);
  if (!cfg.ready)
    return json(
      {
        error:
          "Google Health is not configured. Add server-side Google OAuth credentials and a session-encryption secret.",
      },
      503,
    );
  if (action === "login") {
    const nutrition = url.searchParams.get("nutrition") === "1";
    if (nutrition && !cfg.nutritionEnabled)
      return json(
        {
          error:
            "Optional nutrition access has not been enabled by this app owner.",
        },
        503,
      );
    const start = oauthStart(cfg, nutrition);
    return new Response(null, {
      status: 302,
      headers: {
        Location: start.url,
        "Set-Cookie": cookie(
          "goop_oauth",
          seal(
            {
              state: start.state,
              verifier: start.verifier,
              nutrition,
              exp: Date.now() + 600000,
            },
            cfg.secret,
          ),
          cfg.origin,
          600,
        ),
        "Cache-Control": "no-store",
      },
    });
  }
  if (action === "callback") {
    const flow = unseal(jar.goop_oauth || "", cfg.secret);
    if (!flow || !equal(flow.state, url.searchParams.get("state")))
      return json(
        {
          error: "Sign-in state did not match or expired. Start sign-in again.",
        },
        400,
      );
    if (url.searchParams.has("error"))
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${cfg.origin}/?auth=cancelled#connections`,
          "Set-Cookie": cookie("goop_oauth", "", cfg.origin, 0),
        },
      });
    try {
      const code = url.searchParams.get("code");
      if (!code) return json({ error: "No authorisation code returned." }, 400);
      const token = await tokenRequest(cfg, {
        grant_type: "authorization_code",
        code,
        code_verifier: flow.verifier,
        redirect_uri: `${cfg.origin}/api/google?action=callback`,
      });
      if (!token.refresh_token)
        return json(
          {
            error:
              "Google did not issue offline access. Reconnect with consent.",
          },
          400,
        );
      const accountResponse = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: { Authorization: `Bearer ${token.access_token}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!accountResponse.ok)
        return json(
          {
            error:
              "Google account verification failed. Reconnect and allow email identity access.",
          },
          401,
        );
      const account = await accountResponse.json();
      if (
        account.email_verified !== true ||
        String(account.email || "").toLowerCase() !== cfg.ownerEmail
      )
        return json(
          {
            error: "This private GOOP installation is restricted to its owner.",
          },
          403,
        );
      const identity = await fetch(
        "https://health.googleapis.com/v4/users/me/identity",
        {
          headers: { Authorization: `Bearer ${token.access_token}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!identity.ok)
        return json(
          {
            error:
              "Link this Google account in the Google Health mobile app before connecting GOOP.",
          },
          400,
        );
      const headers = new Headers({
        Location: `${cfg.origin}/?auth=connected#connections`,
        "Cache-Control": "no-store",
      });
      headers.append(
        "Set-Cookie",
        cookie(
          "goop_session",
          seal(
            {
              email: cfg.ownerEmail,
              refreshToken: token.refresh_token,
              nutrition: Boolean(
                flow.nutrition &&
                  token.scope?.includes("googlehealth.nutrition.readonly"),
              ),
              exp: Date.now() + 2592000000,
            },
            cfg.secret,
          ),
          cfg.origin,
        ),
      );
      headers.append("Set-Cookie", cookie("goop_oauth", "", cfg.origin, 0));
      return new Response(null, { status: 302, headers });
    } catch {
      console.error("Google OAuth callback failed");
      return json(
        {
          error:
            "Google sign-in failed. Check the OAuth configuration and retry.",
        },
        502,
      );
    }
  }
  if (action !== "sync") return json({ error: "Unknown action" }, 404);
  if (!session?.refreshToken)
    return json({ error: "Connect your Google Health account first." }, 401);
  try {
    const token = await tokenRequest(cfg, {
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    });
    let timeZone = url.searchParams.get("timeZone") || "UTC";
    try {
      new Intl.DateTimeFormat("en", { timeZone }).format();
    } catch {
      timeZone = "UTC";
    }
    const end = new Date(),
      start = new Date(end.getTime() - 35 * 86400000),
      dateStart = start.toISOString().slice(0, 10);
    const records = [],
      warnings = [];
    // Independent collections are fetched concurrently; token refresh happens once.
    const syncTypes = session.nutrition ? [...types, "nutrition-log"] : types;
    if (!session.nutrition)
      warnings.push({
        type: "nutrition-log",
        message: "Optional Google nutrition access is not connected.",
      });
    await Promise.all(
      syncTypes.map(async (type) => {
        const field = type.replaceAll("-", "_");
        const filter = type.startsWith("daily-")
          ? `${field}.date >= "${dateStart}"`
          : type === "sleep"
            ? `sleep.interval.end_time >= "${start.toISOString()}"`
            : ["heart-rate", "weight"].includes(type)
              ? `${field}.sample_time.physical_time >= "${start.toISOString()}"`
              : ["exercise", "nutrition-log"].includes(type)
                ? `${field}.interval.civil_start_time >= "${dateStart}"`
                : `${field}.interval.start_time >= "${start.toISOString()}"`;
        let pageToken = "";
        for (let page = 0; page < 10; page++) {
          const query = new URLSearchParams({
            filter,
            pageSize: ["sleep", "exercise", "nutrition-log"].includes(type)
              ? "25"
              : "10000",
          });
          if (pageToken) query.set("pageToken", pageToken);
          const endpoint = `https://health.googleapis.com/v4/users/me/dataTypes/${type}/dataPoints${["exercise", "nutrition-log"].includes(type) ? "" : ":reconcile"}?${query}`;
          const res = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${token.access_token}` },
            signal: AbortSignal.timeout(20000),
          });
          if (!res.ok) {
            warnings.push({
              type,
              status: res.status,
              message:
                "This collection was unavailable or permission was not granted.",
            });
            return;
          }
          const data = await res.json();
          records.push(...(data.reconciledDataPoints || data.dataPoints || []));
          pageToken = data.nextPageToken || "";
          if (!pageToken) return;
        }
        warnings.push({
          type,
          message:
            "More records exist than this sync window can return. Results are partial.",
        });
      }),
    );
    const dataset = normalizeGoogle(records, { timeZone });
    if (
      Object.keys(dataset.days).length === 0 &&
      dataset.workouts.length === 0 &&
      dataset.weights.length === 0 &&
      dataset.nutrition.length === 0 &&
      warnings.length
    )
      return json(
        {
          error:
            "No collections could be read. Check your Google Health permissions.",
          warnings,
        },
        502,
      );
    return json({ dataset, warnings });
  } catch (error) {
    console.error("Google Health sync failed");
    return json(
      {
        error:
          error.status === 401
            ? error.message
            : "Sync could not complete. Please retry.",
      },
      error.status === 401 ? 401 : 502,
    );
  }
}
export async function POST(request) {
  const cfg = config();
  if (request.headers.get("origin") !== cfg.origin)
    return json({ error: "Origin not allowed" }, 403);
  if (!hasAccess(request, cfg.secret))
    return json({ error: "Unlock personal access first." }, 401);
  const url = new URL(request.url);
  if (url.searchParams.get("action") !== "disconnect")
    return json({ error: "Unknown action" }, 404);
  const session = cfg.ready
    ? unseal(cookies(request).goop_session || "", cfg.secret)
    : null;
  let revoked = true;
  if (session?.refreshToken) {
    try {
      const response = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: session.refreshToken }),
        signal: AbortSignal.timeout(10000),
      });
      revoked = response.ok;
    } catch {
      revoked = false;
    }
  }
  return json({ disconnected: true, revoked }, 200, {
    "Set-Cookie": cookie("goop_session", "", cfg.origin, 0),
  });
}
