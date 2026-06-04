import { createHmac, timingSafeEqual } from "node:crypto";

const guardianQrTokenPrefix = "BEEQR1";

type GuardianQrPayload = {
  v: 1;
  c: string;
  g: string;
  t: number;
};

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

function safeCompare(value: string, expectedValue: string) {
  const actual = Buffer.from(value);
  const expected = Buffer.from(expectedValue);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function verifyGuardianPin(guardianId: string, pin: string, expectedHash: string | null | undefined) {
  if (!expectedHash) return false;
  const normalized = normalizePin(pin);
  if (!normalized) return false;
  const actual = Buffer.from(hashGuardianPin(guardianId, normalized), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function pinSetAtMs(value: Date | string | null | undefined) {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function signGuardianQrPayload(payloadPart: string, checkInPinHash: string) {
  return createHmac("sha256", pinSecret())
    .update(`${guardianQrTokenPrefix}.${payloadPart}.${checkInPinHash}`)
    .digest("base64url");
}

export function normalizeGuardianQrToken(value: unknown) {
  let token = typeof value === "string" ? value.trim() : "";
  if (!token) return "";

  try {
    const url = new URL(token);
    token = url.searchParams.get("qrToken")?.trim()
      || url.searchParams.get("token")?.trim()
      || url.searchParams.get("kioskToken")?.trim()
      || token;
  } catch {
    // Plain scan payloads are expected; URL parsing is only for printed links.
  }

  const parts = token.split(".");
  return parts.length === 3 && parts[0] === guardianQrTokenPrefix ? token : "";
}

export function createGuardianQrToken({
  centerId,
  guardianId,
  checkInPinSetAt,
  checkInPinHash,
}: {
  centerId: string | null | undefined;
  guardianId: string;
  checkInPinSetAt: Date | string | null | undefined;
  checkInPinHash: string | null | undefined;
}) {
  const setAtMs = pinSetAtMs(checkInPinSetAt);
  if (!centerId || !guardianId || !checkInPinHash || setAtMs === null) return null;

  const payload: GuardianQrPayload = { v: 1, c: centerId, g: guardianId, t: setAtMs };
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${guardianQrTokenPrefix}.${payloadPart}.${signGuardianQrPayload(payloadPart, checkInPinHash)}`;
}

export function parseGuardianQrToken(token: string) {
  const normalized = normalizeGuardianQrToken(token);
  if (!normalized) return null;

  const [, payloadPart, signature] = normalized.split(".");
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Partial<GuardianQrPayload>;
    if (payload.v !== 1 || typeof payload.c !== "string" || typeof payload.g !== "string" || typeof payload.t !== "number") {
      return null;
    }
    if (!payload.c || !payload.g || !Number.isFinite(payload.t)) return null;
    return {
      centerId: payload.c,
      guardianId: payload.g,
      pinSetAtMs: payload.t,
      payloadPart,
      signature,
    };
  } catch {
    return null;
  }
}

export function verifyGuardianQrToken({
  token,
  centerId,
  guardianId,
  checkInPinSetAt,
  checkInPinHash,
}: {
  token: string;
  centerId: string;
  guardianId: string;
  checkInPinSetAt: Date | string | null | undefined;
  checkInPinHash: string | null | undefined;
}) {
  if (!checkInPinHash) return false;
  const parsed = parseGuardianQrToken(token);
  const setAtMs = pinSetAtMs(checkInPinSetAt);
  if (!parsed || setAtMs === null) return false;
  if (parsed.centerId !== centerId || parsed.guardianId !== guardianId || parsed.pinSetAtMs !== setAtMs) return false;
  return safeCompare(parsed.signature, signGuardianQrPayload(parsed.payloadPart, checkInPinHash));
}
