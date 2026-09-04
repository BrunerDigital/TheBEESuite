export function newAgencyRetryKey(prefix = "agency") {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function agencyRetryStorageKey(centerId: string, userId: string, operation: string) {
  return `bee:agency-reconciliation:retry:${centerId}:${userId}:${operation}`;
}

export function persistentAgencyRetryKey(storageKey: string) {
  const generated = newAgencyRetryKey();
  try {
    const existing = globalThis.sessionStorage?.getItem(storageKey);
    if (existing) return existing;
    globalThis.sessionStorage?.setItem(storageKey, generated);
  } catch {
    // Storage may be unavailable in a restricted browser.
  }
  return generated;
}

export function rotateAgencyRetryKey(storageKey: string) {
  const replacement = newAgencyRetryKey();
  try {
    globalThis.sessionStorage?.setItem(storageKey, replacement);
  } catch {
    // The caller can still retain the returned replacement for this component lifetime.
  }
  return replacement;
}
