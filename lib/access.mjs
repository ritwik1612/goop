import { scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, unseal } from "./google-auth.mjs";
export function verifyPin(pin, stored) {
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) return false;
  const [salt, hash] = String(stored || "").split(":");
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{64}$/.test(hash || ""))
    return false;
  return timingSafeEqual(scryptSync(pin, salt, 32), Buffer.from(hash, "hex"));
}
export function hasAccess(request, secret = process.env.SESSION_SECRET) {
  const session = unseal(cookies(request).goop_access || "", secret);
  return session?.kind === "personal-access";
}
