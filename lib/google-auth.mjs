import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export const SCOPES = [
  "openid",
  "email",
  ...["activity_and_fitness", "sleep", "health_metrics_and_measurements"].map(
    (s) => `https://www.googleapis.com/auth/googlehealth.${s}.readonly`,
  ),
];
export function config(env = process.env) {
  const origin = env.APP_ORIGIN || (!env.VERCEL ? "http://127.0.0.1:4173" : "");
  const ownerEmail = String(env.GOOP_OWNER_EMAIL || "")
    .trim()
    .toLowerCase();
  return {
    ownerEmail,
    origin,
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    secret: env.SESSION_SECRET,
    nutritionEnabled: env.GOOGLE_NUTRITION_ENABLED === "true",
    ready: Boolean(
      ownerEmail &&
        origin &&
        env.GOOGLE_CLIENT_ID &&
        env.GOOGLE_CLIENT_SECRET &&
        env.SESSION_SECRET?.length >= 32,
    ),
  };
}
export function seal(payload, secret) {
  if (!secret || secret.length < 32)
    throw Error("Session encryption is not configured");
  const iv = randomBytes(12),
    key = createHash("sha256").update(secret).digest(),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}
export function unseal(value, secret, now = Date.now()) {
  try {
    const raw = Buffer.from(value, "base64url");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      createHash("sha256").update(secret).digest(),
      raw.subarray(0, 12),
    );
    cipher.setAuthTag(raw.subarray(12, 28));
    const data = JSON.parse(
      Buffer.concat([
        cipher.update(raw.subarray(28)),
        cipher.final(),
      ]).toString(),
    );
    return data.exp > now ? data : null;
  } catch {
    return null;
  }
}
export function cookies(request) {
  return Object.fromEntries(
    (request.headers.get("cookie") || "")
      .split(";")
      .map((v) => {
        const i = v.indexOf("=");
        return i < 0 ? [] : [v.slice(0, i).trim(), v.slice(i + 1)];
      })
      .filter((v) => v.length === 2),
  );
}
export function cookie(name, value, origin, maxAge = 2592000) {
  return `${name}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith("https:") ? "; Secure" : ""}`;
}
export function equal(a, b) {
  const x = Buffer.from(a ?? ""),
    y = Buffer.from(b ?? "");
  return x.length === y.length && timingSafeEqual(x, y);
}
export function oauthStart(cfg, nutrition = false) {
  const state = randomBytes(24).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  const redirect = `${cfg.origin}/api/google?action=callback`;
  const scopes = nutrition
    ? [
        ...SCOPES,
        "https://www.googleapis.com/auth/googlehealth.nutrition.readonly",
      ]
    : SCOPES;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirect,
    response_type: "code",
    access_type: "offline",
    scope: scopes.join(" "),
    prompt: "consent",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    state,
    verifier,
    redirect,
    nutrition,
  };
}
export async function tokenRequest(cfg, params, fetcher = fetch) {
  const res = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      ...params,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok)
    throw Object.assign(
      Error(
        "Google authorisation expired or was rejected. Reconnect your account.",
      ),
      { status: 401 },
    );
  return res.json();
}
