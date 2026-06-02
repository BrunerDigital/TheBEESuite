import { createHmac, timingSafeEqual } from "node:crypto";

export function normalizePin(value: unknown) {
  const pin = typeof value === "string" ? value.trim() : "";
  return /^\d{4}$/.test(pin) ? pin : "";
}

function pinSecret() {
  const secret = process.env.PIN_HASH_SECRET || (process.env.NODE_ENV !== "production" ? process.env.AUTH_SECRET : "");
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "dev-only-bee-suite-pin-secret";
  throw new Error("PIN_HASH_SECRET is required in production.");
}

export function hashGuardianPin(guardianId: string, pin: string) {
  return createHmac("sha256", pinSecret()).update(`${guardianId}:${pin}`).digest("hex");
}

export function verifyGuardianPin(guardianId: string, pin: string, expectedHash: string | null | undefined) {
  if (!expectedHash) return false;
  const normalized = normalizePin(pin);
  if (!normalized) return false;
  const actual = Buffer.from(hashGuardianPin(guardianId, normalized), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
