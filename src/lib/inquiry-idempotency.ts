import { createHash } from "node:crypto";

function clean(value: string) {
  return value.trim().toLowerCase();
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export const INQUIRY_DEDUPE_WINDOW_MS = 15 * 60 * 1000;

export function inquirySubmissionIdempotencyKey({
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
  const fingerprint = createHash("sha256")
    .update([centerId, clean(parentName), clean(email), phoneDigits(phone), clean(program)].join("|"))
    .digest("hex")
    .slice(0, 32);

  return `website-inquiry:${fingerprint}`;
}
