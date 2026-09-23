import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PURPOSE = "bee-password-recovery-retry-v1";
const TTL_MS = 10 * 60_000;
type RecoveryRetry = { accessToken: string; tokenHash: string; email: string; expiresAt: number };

function key() {
  const secret = process.env.AUTH_SECRET || process.env.INTEGRATION_CREDENTIALS_SECRET;
  if (!secret) throw new Error("Password recovery retry signing is unavailable.");
  return createHash("sha256").update(`${PURPOSE}:${secret}`).digest();
}

// Short-lived, encrypted credentials stay only in the form's memory. Never log
// this ticket, put it in a URL, or persist it in browser storage.
export function sealPasswordRecoveryRetry(value: Omit<RecoveryRetry, "expiresAt">, now = Date.now()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(PURPOSE));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ ...value, expiresAt: now + TTL_MS }), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function readPasswordRecoveryRetry(ticket: string, now = Date.now()): RecoveryRetry | null {
  try {
    if (!ticket || ticket.length > 12000) return null;
    const bytes = Buffer.from(ticket, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(PURPOSE));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")) as RecoveryRetry;
    return typeof value.accessToken === "string" && value.accessToken.length > 0
      && typeof value.tokenHash === "string" && value.tokenHash.length > 0
      && typeof value.email === "string" && value.email.length > 0
      && Number.isFinite(value.expiresAt) && value.expiresAt > now && value.expiresAt <= now + TTL_MS ? value : null;
  } catch { return null; }
}

export function passwordUpdateFailure(status: number, payload: unknown) {
  const code = payload && typeof payload === "object" && "code" in payload ? String(payload.code) : "";
  if (code === "weak_password") return { status: 422, category: code, retryable: true,
    message: "Choose a stronger password that is not common or easy to guess, then try again." };
  if (code === "same_password") return { status: 422, category: code, retryable: true,
    message: "Choose a new password that is different from your current password, then try again." };
  if (status === 429 || status >= 500) return { status: status === 429 ? 429 : 503, category: "provider_unavailable", retryable: true,
    message: "Password reset service is temporarily unavailable. Please wait a moment and try again." };
  if (status === 422) return { status: 422, category: "password_rejected", retryable: true,
    message: "That password could not be accepted. Choose a different, stronger password and try again." };
  return { status: 400, category: "recovery_expired", retryable: false,
    message: "Password reset link is invalid or expired. Request a fresh reset link." };
}
