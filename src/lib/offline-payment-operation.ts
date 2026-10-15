export type OfflinePaymentOperationScope = {
  userId: string;
  centerId: string;
  familyId: string;
  // An account may be created by the first submission. It must not rotate the key.
  billingAccountId?: string | null;
};

export type OfflinePaymentOperationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type OfflinePaymentOperation = Readonly<{
  version: 1;
  userId: string;
  centerId: string;
  familyId: string;
  requestId: string;
}>;

export class OfflinePaymentOperationError extends Error {
  readonly code: "invalid_scope" | "storage_unavailable" | "corrupt_operation" | "request_unavailable" | "unconfirmed_receipt";

  constructor(code: OfflinePaymentOperationError["code"]) {
    super(code === "invalid_scope"
      ? "Choose a verified family and school before recording a payment."
      : code === "unconfirmed_receipt"
        ? "Confirm the existing payment receipt before starting another payment."
        : "Payment recovery is unavailable. Review the existing payment before recording another payment.");
    this.name = "OfflinePaymentOperationError";
    this.code = code;
  }
}

const scopeId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,191}$/.test(value);
const requestId = (value: unknown) => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
  ? value.toLowerCase() : null;
const storedFields = ["version", "userId", "centerId", "familyId", "requestId"];

function storageKey(scope: OfflinePaymentOperationScope) {
  if (!scope || !scopeId(scope.userId) || !scopeId(scope.centerId) || !scopeId(scope.familyId)
    || scope.billingAccountId != null && !scopeId(scope.billingAccountId)) {
    throw new OfflinePaymentOperationError("invalid_scope");
  }
  // One operation per family, shared by cash and check. No payment details in storage.
  return `bee-suite:offline-payment-operation:v1:${scope.userId}:${scope.centerId}:${scope.familyId}`;
}

function readStored(storage: OfflinePaymentOperationStorage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    throw new OfflinePaymentOperationError("storage_unavailable");
  }
}

function decodeOperation(raw: string, scope: OfflinePaymentOperationScope): OfflinePaymentOperation {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new OfflinePaymentOperationError("corrupt_operation"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OfflinePaymentOperationError("corrupt_operation");
  const fields = value as Record<string, unknown>;
  const normalizedRequestId = requestId(fields.requestId);
  if (Object.keys(fields).length !== storedFields.length || Object.keys(fields).some((key) => !storedFields.includes(key))
    || fields.version !== 1 || fields.userId !== scope.userId || fields.centerId !== scope.centerId
    || fields.familyId !== scope.familyId || !normalizedRequestId) {
    throw new OfflinePaymentOperationError("corrupt_operation");
  }
  return { version: 1, userId: scope.userId, centerId: scope.centerId, familyId: scope.familyId, requestId: normalizedRequestId };
}

/** Read only. Never creates a token, submits a payment, or clears recovery state. */
export function readOfflinePaymentOperation(storage: OfflinePaymentOperationStorage, scope: OfflinePaymentOperationScope): OfflinePaymentOperation | null {
  const raw = readStored(storage, storageKey(scope));
  if (raw === null) return null;
  if (typeof raw !== "string") throw new OfflinePaymentOperationError("corrupt_operation");
  return decodeOperation(raw, scope);
}

/** Persist and verify identity before submission; errors never silently rotate a token. */
export function getOrCreateOfflinePaymentOperation(
  storage: OfflinePaymentOperationStorage,
  scope: OfflinePaymentOperationScope,
  createRequestId: () => string = () => globalThis.crypto.randomUUID(),
): OfflinePaymentOperation {
  const existing = readOfflinePaymentOperation(storage, scope);
  if (existing) return existing;
  let generated: string | null;
  try { generated = requestId(createRequestId()); } catch { throw new OfflinePaymentOperationError("request_unavailable"); }
  if (!generated) throw new OfflinePaymentOperationError("request_unavailable");
  const operation: OfflinePaymentOperation = {
    version: 1, userId: scope.userId, centerId: scope.centerId, familyId: scope.familyId, requestId: generated,
  };
  try { storage.setItem(storageKey(scope), JSON.stringify(operation)); }
  catch { throw new OfflinePaymentOperationError("storage_unavailable"); }
  const persisted = readOfflinePaymentOperation(storage, scope);
  if (!persisted || persisted.requestId !== generated) throw new OfflinePaymentOperationError("storage_unavailable");
  return persisted;
}

/** Caller must first validate the server receipt. Stale receipts cannot clear a newer operation. */
export function clearConfirmedOfflinePaymentOperation(
  storage: OfflinePaymentOperationStorage,
  scope: OfflinePaymentOperationScope,
  receipt: { requestId: string; receiptConfirmed: true },
) {
  const confirmedRequestId = receipt?.receiptConfirmed === true ? requestId(receipt.requestId) : null;
  if (!confirmedRequestId) throw new OfflinePaymentOperationError("unconfirmed_receipt");
  const existing = readOfflinePaymentOperation(storage, scope);
  if (!existing || existing.requestId !== confirmedRequestId) return false;
  try { storage.removeItem(storageKey(scope)); }
  catch { throw new OfflinePaymentOperationError("storage_unavailable"); }
  if (readOfflinePaymentOperation(storage, scope) !== null) throw new OfflinePaymentOperationError("storage_unavailable");
  return true;
}
