export const AGENCY_RETRY_STORAGE_ERROR = "This browser cannot safely retain financial retry protection. Enable site storage or use another browser before submitting.";

function retryStorages() {
  const storages: Storage[] = [];
  for (const getStorage of [() => globalThis.sessionStorage, () => globalThis.localStorage]) {
    try {
      const storage = getStorage();
      if (storage && !storages.includes(storage)) storages.push(storage);
    } catch {
      // Accessing browser storage can itself throw in restricted environments.
    }
  }
  return storages;
}

function storeRetryKey(storageKey: string, retryKey: string, storages: Storage[]) {
  let persisted = false;
  for (const storage of storages) {
    try {
      storage.setItem(storageKey, retryKey);
      if (storage.getItem(storageKey) === retryKey) persisted = true;
    } catch {
      // Try the next reload-safe storage provider.
    }
  }
  if (!persisted) throw new Error(AGENCY_RETRY_STORAGE_ERROR);
}

export function newAgencyRetryKey(prefix = "agency") {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `${prefix}:${randomUuid}`;
  if (!globalThis.crypto?.getRandomValues) throw new Error(AGENCY_RETRY_STORAGE_ERROR);
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}:${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function agencyRetryStorageKey(centerId: string, userId: string, operation: string) {
  return `bee:agency-reconciliation:retry:${centerId}:${userId}:${operation}`;
}

export function persistentAgencyRetryKey(storageKey: string) {
  const storages = retryStorages();
  for (const storage of storages) {
    try {
      const existing = storage.getItem(storageKey);
      if (existing) {
        storeRetryKey(storageKey, existing, storages);
        return existing;
      }
    } catch {
      // Try the next reload-safe storage provider.
    }
  }
  const generated = newAgencyRetryKey();
  storeRetryKey(storageKey, generated, storages);
  return generated;
}

export function rotateAgencyRetryKey(storageKey: string) {
  const replacement = newAgencyRetryKey();
  storeRetryKey(storageKey, replacement, retryStorages());
  return replacement;
}
