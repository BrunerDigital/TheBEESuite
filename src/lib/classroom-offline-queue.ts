export type ClassroomOfflineAction = {
  id: string;
  endpoint: string;
  method: "POST";
  body: unknown;
  label: string;
  createdAt: string;
};

export const CLASSROOM_OFFLINE_QUEUE_KEY = "bee_suite_classroom_offline_queue_v1";

export function createClassroomOfflineAction(input: {
  endpoint: string;
  body: unknown;
  label: string;
  now?: Date;
  randomId?: string;
}): ClassroomOfflineAction {
  const createdAt = (input.now ?? new Date()).toISOString();
  return {
    id: input.randomId ?? `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    endpoint: input.endpoint,
    method: "POST",
    body: input.body,
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
