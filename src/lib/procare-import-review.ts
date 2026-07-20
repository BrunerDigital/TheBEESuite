import { createHash, createHmac } from "node:crypto";

export const PROCARE_DUPLICATE_REVIEW_ROW_LIMIT = 500;

export function procareSourceSha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export function procareImportReviewFingerprint(input: {
  text: string;
  requestedCenterId: string;
  duplicateMode: "review" | "strict" | "auto";
  secret: string;
}) {
  return createHmac("sha256", input.secret)
    .update(input.text)
    .update("\0")
    .update(input.requestedCenterId)
    .update("\0")
    .update(input.duplicateMode)
    .digest("hex");
}
