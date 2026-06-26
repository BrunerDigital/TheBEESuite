export const childLocationAreaOptions = [
  "Playground",
  "Cafeteria",
  "Gym",
  "Office",
  "Lobby",
  "Nap room",
  "Field trip / offsite",
] as const;

export type ChildLocationStatus = "in_classroom" | "in_area";

export type ChildLocationRecord = {
  currentClassroomId?: string | null;
  areaName?: string | null;
  status?: string | null;
};

export type ChildAssignedClassroomRecord = {
  classroomId?: string | null;
  classroom?: { id: string; name: string } | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeChildLocationArea(value: unknown) {
  return clean(value).replace(/\s+/g, " ").slice(0, 80);
}

export function childLocationStatusForTarget(input: {
  classroomId?: string | null;
  areaName?: string | null;
}): ChildLocationStatus {
  return input.classroomId ? "in_classroom" : "in_area";
}

export function resolveCurrentClassroomId(input: {
  assignedClassroomId?: string | null;
  liveLocation?: ChildLocationRecord | null;
}) {
  if (input.liveLocation?.status === "in_area" || input.liveLocation?.areaName) return null;
  return input.liveLocation?.currentClassroomId ?? input.assignedClassroomId ?? null;
}

export function childLocationLabel(input: {
  assignedClassroom?: { id: string; name: string } | null;
  liveLocation?: ChildLocationRecord | null;
  currentClassroom?: { id: string; name: string } | null;
}) {
  if (input.liveLocation?.areaName) return input.liveLocation.areaName;
  if (input.currentClassroom?.name) return input.currentClassroom.name;
  if (input.liveLocation?.currentClassroomId && input.assignedClassroom?.id === input.liveLocation.currentClassroomId) {
    return input.assignedClassroom.name;
  }
  return input.assignedClassroom?.name ?? "Unassigned";
}

export function childIsTransitioned(input: {
  assignedClassroomId?: string | null;
  liveLocation?: ChildLocationRecord | null;
}) {
  if (!input.liveLocation) return false;
  if (input.liveLocation.areaName) return true;
  return Boolean(input.liveLocation.currentClassroomId && input.liveLocation.currentClassroomId !== input.assignedClassroomId);
}

export function childLiveLocationCountsByClassroom(children: Array<{
  assignedClassroomId?: string | null;
  liveLocation?: ChildLocationRecord | null;
}>) {
  const counts = new Map<string, number>();
  for (const child of children) {
    const classroomId = resolveCurrentClassroomId({
      assignedClassroomId: child.assignedClassroomId,
      liveLocation: child.liveLocation,
    });
    if (!classroomId) continue;
    counts.set(classroomId, (counts.get(classroomId) ?? 0) + 1);
  }
  return counts;
}

export function validateChildLocationTarget(input: {
  classroomId?: unknown;
  areaName?: unknown;
}) {
  const classroomId = clean(input.classroomId);
  const areaName = normalizeChildLocationArea(input.areaName);
  if (!classroomId && !areaName) {
    return {
      ok: false as const,
      status: 400,
      error: "Choose a classroom or school area for this child.",
    };
  }
  return {
    ok: true as const,
    classroomId: classroomId || null,
    areaName: classroomId ? null : areaName,
  };
}
