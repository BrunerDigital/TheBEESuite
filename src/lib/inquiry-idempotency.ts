import { createHash } from "node:crypto";

function clean(value: string) {
  return value.trim().toLowerCase();
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export const INQUIRY_DEDUPE_WINDOW_MS = 15 * 60 * 1000;

function inquiryFingerprint({
  centerId,
  parentName,
  email,
  phone,
  program,
}: {
  centerId: string;
  parentName: string;
  email: string;
  phone: string;
  program: string;
}) {
  return createHash("sha256")
    .update([centerId, clean(parentName), clean(email), phoneDigits(phone), clean(program)].join("|"))
    .digest("hex");
}

type InquiryFingerprintInput = Parameters<typeof inquiryFingerprint>[0];

export function inquirySubmissionIdempotencyKey(input: InquiryFingerprintInput) {
  const fingerprint = inquiryFingerprint(input).slice(0, 32);

  return `website-inquiry:${fingerprint}`;
}

export function inquiryTurnstileIdempotencyKey(input: InquiryFingerprintInput, token: string) {
  const hex = createHash("sha256")
    .update(`${inquiryFingerprint(input)}|${token.trim()}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
