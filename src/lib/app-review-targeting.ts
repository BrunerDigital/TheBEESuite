import { createHash } from "node:crypto";

export type AppReviewTargetKind = "parent" | "teacher";

export function buildAppReviewTargetFingerprint(
  kind: AppReviewTargetKind,
  fields: Record<string, string>,
) {
  const normalized = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error(`Cannot fingerprint an empty App Review target field: ${key}.`);
      }
      return [key, trimmed] as const;
    });

  if (normalized.length === 0) {
    throw new Error("Cannot fingerprint an empty App Review target.");
  }

  return createHash("sha256")
    .update(JSON.stringify({ kind, fields: normalized }))
    .digest("hex");
}

export function assertAppReviewTargetFingerprint(input: {
  expected: string;
  provided: string;
  environmentVariable: string;
}) {
  if (!input.provided.trim() || input.provided.trim().toLowerCase() !== input.expected) {
    throw new Error(
      `Set ${input.environmentVariable} to the exact fingerprint returned by a fresh --preflight run for this target.`,
    );
  }
}
