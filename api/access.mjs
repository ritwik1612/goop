import { randomBytes } from "node:crypto";
import { cookie, seal, cookies, unseal } from "../lib/google-auth.mjs";
import { verifyPin, hasAccess } from "../lib/access.mjs";
const attempts = new Map();
const json = (data, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private", ...headers },
  });
const origin = () =>
  process.env.APP_ORIGIN ||
  (!process.env.VERCEL ? "http://127.0.0.1:4173" : "");
export async function GET(request) {
  return json({
    configured: Boolean(
      process.env.GOOP_PIN_HASH && process.env.SESSION_SECRET?.length >= 32,
    ),
    unlocked: hasAccess(request),
    name: process.env.GOOP_OWNER_NAME || "there",
  });
}
export async function POST(request) {
  if (request.headers.get("origin") !== origin())
    return json({ error: "Origin not allowed" }, 403);
  if (!process.env.GOOP_PIN_HASH || process.env.SESSION_SECRET?.length < 32)
    return json({ error: "Personal access is not configured yet." }, 503);
  const action = new URL(request.url).searchParams.get("action");
  if (action === "lock")
    return json({ unlocked: false }, 200, {
      "Set-Cookie": cookie("goop_access", "", origin(), 0),
    });
  if (action !== "unlock") return json({ error: "Unknown action" }, 404);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const now = Date.now(),
    existing = attempts.get(ip);
  if (attempts.size > 1000)
    for (const [key, value] of attempts)
      if (value.until < now) attempts.delete(key);
  const count =
    existing?.until > now ? existing : { count: 0, until: now + 900000 };
  const remembered = unseal(
    cookies(request).goop_attempts || "",
    process.env.SESSION_SECRET,
  );
  if (count.count >= 8 || (remembered?.count >= 8 && remembered.exp > now))
    return json({ error: "Too many attempts. Try again in 15 minutes." }, 429, {
      "Retry-After": "900",
    });
  let pin;
  try {
    const body = await request.text();
    if (body.length > 128) return json({ error: "Invalid request" }, 400);
    pin = JSON.parse(body).pin;
  } catch {
    return json({ error: "Enter your six-digit PIN." }, 400);
  }
  if (!verifyPin(pin, process.env.GOOP_PIN_HASH)) {
    count.count++;
    attempts.set(ip, count);
    return json({ error: "That PIN is incorrect. Try again." }, 401, {
      "Set-Cookie": cookie(
        "goop_attempts",
        seal(
          {
            count: Math.max(count.count, remembered?.count || 0),
            exp: count.until,
          },
          process.env.SESSION_SECRET,
        ),
        origin(),
        900,
      ),
    });
  }
  attempts.delete(ip);
  const headers = new Headers({ "Cache-Control": "no-store, private" });
  headers.append(
    "Set-Cookie",
    cookie(
      "goop_access",
      seal(
        {
          kind: "personal-access",
          nonce: randomBytes(12).toString("hex"),
          exp: now + 43200000,
        },
        process.env.SESSION_SECRET,
      ),
      origin(),
      43200,
    ),
  );
  headers.append("Set-Cookie", cookie("goop_attempts", "", origin(), 0));
  return Response.json({ unlocked: true }, { headers });
}
