export type ClassroomOfflineAction = {
  id: string;
  endpoint: string;
  method: "POST";
  body: unknown;
  label: string;
  createdAt: string;
};

export const CLASSROOM_OFFLINE_QUEUE_KEY = "bee_suite_classroom_offline_queue_v1";
export const CLASSROOM_OFFLINE_QUEUE_PREFIX = "bee_suite_classroom_offline_queue_v2:";

export type EncryptedClassroomOfflineQueue = { version: 2; scopeId: string; iv: string; ciphertext: string; count: number; updatedAt: string };

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importQueueKey(key: string) {
  return crypto.subtle.importKey("raw", base64UrlToBytes(key), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function classroomOfflineQueueStorageKey(scopeId: string) {
  return `${CLASSROOM_OFFLINE_QUEUE_PREFIX}${scopeId}`;
}

export async function encryptClassroomOfflineQueue(input: { actions: ClassroomOfflineAction[]; key: string; scopeId: string; now?: Date; iv?: Uint8Array }): Promise<EncryptedClassroomOfflineQueue> {
  const actions = input.actions.slice(0, 50);
  const iv = input.iv ?? crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importQueueKey(input.key), new TextEncoder().encode(JSON.stringify(actions)));
  return { version: 2, scopeId: input.scopeId, iv: bytesToBase64Url(iv), ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)), count: actions.length, updatedAt: (input.now ?? new Date()).toISOString() };
}

export async function decryptClassroomOfflineQueue(input: { envelope: EncryptedClassroomOfflineQueue; key: string; scopeId: string }) {
  if (input.envelope.scopeId !== input.scopeId) throw new Error("Offline queue belongs to another account or classroom.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(input.envelope.iv) }, await importQueueKey(input.key), base64UrlToBytes(input.envelope.ciphertext));
  return parseClassroomOfflineQueue(new TextDecoder().decode(plaintext));
}

export function parseEncryptedClassroomOfflineQueue(value: string | null): EncryptedClassroomOfflineQueue | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<EncryptedClassroomOfflineQueue>;
    return parsed.version === 2 && typeof parsed.scopeId === "string" && typeof parsed.iv === "string" && typeof parsed.ciphertext === "string" && typeof parsed.count === "number" && typeof parsed.updatedAt === "string" ? parsed as EncryptedClassroomOfflineQueue : null;
  } catch { return null; }
}

export function clearClassroomOfflineQueues(storage: Pick<Storage, "length" | "key" | "removeItem">) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key === CLASSROOM_OFFLINE_QUEUE_KEY || key?.startsWith(CLASSROOM_OFFLINE_QUEUE_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}

export function createClassroomOfflineAction(input: {
  endpoint: string;
  body: unknown;
  label: string;
  now?: Date;
  randomId?: string;
}): ClassroomOfflineAction {
  const createdAt = (input.now ?? new Date()).toISOString();
  const id = input.randomId ?? `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    endpoint: input.endpoint,
    method: "POST",
    body: typeof input.body === "object" && input.body ? { ...(input.body as Record<string, unknown>), clientActionId: id } : input.body,
    label: input.label,
    createdAt,
  };
}

export function parseClassroomOfflineQueue(value: string | null): ClassroomOfflineAction[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ClassroomOfflineAction =>
      item &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.endpoint === "string" &&
      item.method === "POST" &&
      "body" in item &&
      typeof item.label === "string" &&
      typeof item.createdAt === "string",
    );
  } catch {
    return [];
  }
}

export function serializeClassroomOfflineQueue(actions: ClassroomOfflineAction[]) {
  return JSON.stringify(actions.slice(0, 50));
}
