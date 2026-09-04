const memoryRetryKeys = new Map<string, string>();

export function newAgencyRetryKey(prefix = "agency") {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function agencyRetryStorageKey(centerId: string, userId: string, operation: string) {
  return `bee:agency-reconciliation:retry:${centerId}:${userId}:${operation}`;
}

export function persistentAgencyRetryKey(storageKey: string) {
  const generated = newAgencyRetryKey();
  const memoryExisting = memoryRetryKeys.get(storageKey);
  try {
    const existing = globalThis.sessionStorage?.getItem(storageKey);
    if (existing) {
      memoryRetryKeys.set(storageKey, existing);
      return existing;
    }
    const next = memoryExisting ?? generated;
    globalThis.sessionStorage?.setItem(storageKey, next);
    if (globalThis.sessionStorage) {
      memoryRetryKeys.set(storageKey, next);
      return next;
    }
  } catch {
    // Storage may be unavailable in a restricted browser.
  }
  if (memoryExisting) return memoryExisting;
  memoryRetryKeys.set(storageKey, generated);
  return generated;
}

export function rotateAgencyRetryKey(storageKey: string) {
  const replacement = newAgencyRetryKey();
  memoryRetryKeys.set(storageKey, replacement);
  try {
    globalThis.sessionStorage?.setItem(storageKey, replacement);
  } catch {
    // The module-level fallback retains the replacement for this tab lifetime.
  }
  return replacement;
}
