function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function usableProcareImportResponse(value: unknown, dryRun: boolean) {
  if (!record(value) || value.ok !== true || !record(value.summary)) return false;
  const summary = value.summary;
  if (!Number.isSafeInteger(summary.rows) || Number(summary.rows) < 0) return false;
  if (dryRun) {
    return value.dryRun === true && typeof summary.sourceSha256 === "string" && summary.sourceSha256.length > 0
      && typeof summary.reviewFingerprint === "string" && summary.reviewFingerprint.length > 0
      && Array.isArray(summary.warningRowNumbers) && Array.isArray(summary.duplicateReviewRowNumbers)
      && ["newFamilies", "matchedFamilies", "newChildren", "matchedChildren", "newStaff", "matchedStaff", "warningRows", "readyRows", "duplicateMatches", "centersTouched", "balanceRows"].every(key => Number.isSafeInteger(summary[key]) && Number(summary[key]) >= 0);
  }
  return typeof value.batchId === "string" && value.batchId.length > 0
    && ["imported", "unresolved"].every(key => Number.isSafeInteger(summary[key]) && Number(summary[key]) >= 0)
    && (!value.partial || (Number.isSafeInteger(value.nextRow) && Number(value.nextRow) > 0 && Number.isSafeInteger(value.totalRows)));
}
