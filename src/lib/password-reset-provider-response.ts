import { createHash } from "node:crypto";

const DEFAULT_RETRY_AFTER_SECONDS = 60;
const MAX_RETRY_AFTER_SECONDS = 15 * 60;

export type PasswordResetProviderOutcome =
  | { kind: "accepted" }
  | { kind: "privacy_safe_non_success"; providerStatus: number }
  | { kind: "temporary_failure"; providerStatus: number; retryAfterSeconds: number };

function rateLimitFingerprint(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export function passwordResetEmailCooldownKey(email: string) {
  return `forgot-password:email:${rateLimitFingerprint(email)}`;
}

export function passwordResetIpVolumeKey(ip: string) {
  return `forgot-password:ip:${rateLimitFingerprint(ip)}`;
}

function boundedRetryAfterSeconds(value: number) {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_RETRY_AFTER_SECONDS;
  return Math.min(Math.ceil(value), MAX_RETRY_AFTER_SECONDS);
}

export function providerRetryAfterSeconds(value: string | null, now = Date.now()) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return DEFAULT_RETRY_AFTER_SECONDS;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return boundedRetryAfterSeconds(seconds);

  const retryAt = Date.parse(trimmed);
  if (!Number.isFinite(retryAt)) return DEFAULT_RETRY_AFTER_SECONDS;
  return boundedRetryAfterSeconds((retryAt - now) / 1000);
}

export function classifyPasswordResetProviderResponse(
  response: Pick<Response, "ok" | "status" | "headers">,
): PasswordResetProviderOutcome {
  if (response.ok) return { kind: "accepted" };

  if (response.status === 429 || response.status >= 500) {
    return {
      kind: "temporary_failure",
      providerStatus: response.status,
      retryAfterSeconds: providerRetryAfterSeconds(response.headers.get("retry-after")),
    };
  }

  return { kind: "privacy_safe_non_success", providerStatus: response.status };
}
