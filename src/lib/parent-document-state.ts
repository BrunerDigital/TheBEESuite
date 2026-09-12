import { recordPagination } from "./record-pagination";

export const INTERNAL_SIGNATURE_PENDING_KEY = "internal_signature_pending";
export const LEGACY_SIGNATURE_PROVIDER_PENDING_KEY = "signature_provider_pending";
export const PARENT_DOCUMENT_ACTION_STATUSES = ["DRAFT", "REQUESTED", "REJECTED", "EXPIRED"] as const;

export function isInternalSignatureRequest(record: { storageKey?: string | null }) {
  const key = record.storageKey?.trim().replace(/\s+/g, " ").toLowerCase();
  return key === INTERNAL_SIGNATURE_PENDING_KEY || key === LEGACY_SIGNATURE_PROVIDER_PENDING_KEY;
}

/** Lifecycle status takes precedence over a legacy pending-signature marker. */
export function parentDocumentState(record: { status: string }) {
  const status = record.status.trim().toUpperCase();
  if (["APPROVED", "COMPLETE", "COMPLETED", "SIGNED"].includes(status)) return "complete";
  if (status === "SUBMITTED") return "awaiting_review";
  if ([...PARENT_DOCUMENT_ACTION_STATUSES, "PENDING"].some((candidate) => candidate === status)) return "action_required";
  return "unavailable";
}

export function parentDocumentStatusLabel(record: { status: string }) {
  switch (parentDocumentState(record)) {
    case "complete": return "Complete";
    case "awaiting_review": return "Awaiting school review";
    case "action_required": return record.status.trim().toUpperCase() === "REJECTED" ? "Changes requested" : "Action required";
    default: return "Ask your school";
  }
}

export function isParentDocumentSubmissionReceipt(value: unknown, documentId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as { ok?: unknown; document?: { id?: unknown; status?: unknown } };
  return receipt.ok === true && receipt.document?.id === documentId && receipt.document.status === "SUBMITTED";
}

/** Optimism belongs only to the source snapshot that produced the receipt.
 * Fresh server records (including a rejection) always take precedence. */
export function optimisticParentDocumentIds<T extends { id: string }>(records: readonly T[], confirmedSnapshots: ReadonlyMap<string, T>) {
  return new Set(records.filter((record) => confirmedSnapshots.get(record.id) === record).map((record) => record.id));
}

/** Partition one stable page across required requests, then review/history. */
export function parentDocumentPagePlan(requested: unknown, actionRequired: number, total: number) {
  const pagination = recordPagination(requested, total, 20);
  const actionSkip = Math.min(pagination.skip, actionRequired);
  const actionTake = Math.min(pagination.pageSize, Math.max(0, actionRequired - pagination.skip));
  return { pagination, actionSkip, actionTake, historySkip: Math.max(0, pagination.skip - actionRequired), historyTake: pagination.pageSize - actionTake };
}
