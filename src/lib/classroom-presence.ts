import { serviceDayWindowInTimeZone } from "./attendance-state";

export function schoolLocalDateTime(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (key: string) =>
    parts.find((part) => part.type === key)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** Resolve a school wall clock without using the server or browser time zone. */
export function presenceWindow(
  date: string,
  time: string,
  timeZone: string,
  now: Date,
) {
  if (!date && !time)
    return { ...serviceDayWindowInTimeZone(now, timeZone), at: now };
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new Error("Choose a valid date and time.");
  const wall = new Date(`${date}T${time}:00.000Z`);
  if (
    !Number.isFinite(wall.getTime()) ||
    wall.toISOString().slice(0, 10) !== date
  )
    throw new Error("Choose a valid calendar date.");
  const offsets = new Set<number>();
  for (const hours of [-24, 0, 24]) {
    const probe = new Date(wall.getTime() + hours * 3_600_000);
    const local = schoolLocalDateTime(probe, timeZone);
    offsets.add(
      new Date(`${local.date}T${local.time}:00Z`).getTime() - probe.getTime(),
    );
  }
  const matches = [...offsets]
    .map((offset) => new Date(wall.getTime() - offset))
    .filter((candidate) => {
      const local = schoolLocalDateTime(candidate, timeZone);
      return local.date === date && local.time === time;
    });
  if (matches.length !== 1)
    throw new Error(
      "This time is skipped or repeated by daylight saving time. Choose another time.",
    );
  const at = matches[0];
  if (at > now) throw new Error("Choose a time that has already occurred.");
  return { ...serviceDayWindowInTimeZone(at, timeZone), at };
}

export type PresenceRoom = {
  id: string;
  name: string;
  capacity: number;
  archived: boolean;
};

/** Imported daily status is a calendar date, never proof of presence at a time. */
export function dailyAttendanceMatchesSnapshot(
  record: { date: Date; sourceSystem?: string | null; metadata?: unknown },
  input: { start: Date; at: Date; timeZone: string },
) {
  const metadata =
    record.metadata &&
    typeof record.metadata === "object" &&
    !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, unknown>)
      : {};
  const imported =
    ["procare", "bee_flat_file_v1"].includes(record.sourceSystem ?? "") ||
    ["procare_import", "bee_flat_file_import"].includes(
      String(metadata.source ?? ""),
    );
  if (imported)
    return (
      record.date.toISOString().slice(0, 10) ===
      schoolLocalDateTime(input.at, input.timeZone).date
    );
  return record.date >= input.start && record.date <= input.at;
}
export type PresenceLog = {
  id: string;
  childId: string;
  classroomId: string | null;
  type: string;
  occurredAt: Date;
  child: { fullName: string };
};
export type PresenceTransition = {
  id: string;
  childId: string;
  toClassroomId: string | null;
  toAreaName: string | null;
  movedAt: Date;
};
export type PresenceStudent = {
  id: string;
  name: string;
  checkedInAt: string;
  locationRecordedAt: string;
};
export type PresenceGroup = {
  id: string;
  name: string;
  capacity: number | null;
  archived: boolean;
  children: PresenceStudent[];
};

/** Only recorded events establish presence. Current enrollment never rewrites history. */
export function buildClassroomPresence(input: {
  rooms: PresenceRoom[];
  logs: PresenceLog[];
  transitions: PresenceTransition[];
  start: Date;
  at: Date;
  teacherClassroomId?: string | null;
}) {
  const rooms = new Map(input.rooms.map((room) => [room.id, room]));
  const groups = new Map<string, PresenceGroup>(
    input.rooms.map((room) => [
      room.id,
      {
        id: room.id,
        name: room.name,
        capacity: room.capacity,
        archived: room.archived,
        children: [],
      },
    ]),
  );
  const latest = new Map<string, PresenceLog>();
  for (const log of [...input.logs].sort(
    (a, b) =>
      a.occurredAt.getTime() - b.occurredAt.getTime() ||
      Number(a.type === "check_out") - Number(b.type === "check_out") ||
      a.id.localeCompare(b.id),
  )) {
    if (
      log.occurredAt >= input.start &&
      log.occurredAt <= input.at &&
      ["check_in", "check_out"].includes(log.type)
    )
      latest.set(log.childId, log);
  }
  const moves = new Map<string, PresenceTransition>();
  for (const move of [...input.transitions].sort(
    (a, b) =>
      a.movedAt.getTime() - b.movedAt.getTime() || a.id.localeCompare(b.id),
  )) {
    const check = latest.get(move.childId);
    if (
      check?.type === "check_in" &&
      move.movedAt >= check.occurredAt &&
      move.movedAt <= input.at
    )
      moves.set(move.childId, move);
  }
  let checkedIn = 0;
  let unknown = 0;
  for (const check of latest.values()) {
    if (check.type !== "check_in") continue;
    const move = moves.get(check.childId);
    const roomId = move ? move.toClassroomId : check.classroomId;
    if (input.teacherClassroomId && roomId !== input.teacherClassroomId)
      continue;
    const room = roomId ? rooms.get(roomId) : null;
    const area = move?.toAreaName;
    const id = room?.id ?? (area ? `area:${area}` : "unknown");
    if (!groups.has(id))
      groups.set(id, {
        id,
        name: area || "Classroom not recorded",
        capacity: null,
        archived: false,
        children: [],
      });
    groups.get(id)!.children.push({
      id: check.childId,
      name: check.child.fullName,
      checkedInAt: check.occurredAt.toISOString(),
      locationRecordedAt: (move?.movedAt ?? check.occurredAt).toISOString(),
    });
    checkedIn++;
    if (id === "unknown") unknown++;
  }
  return {
    checkedIn,
    unknown,
    groups: [...groups.values()]
      .filter((group) => !group.archived || group.children.length)
      .map((group) => ({
        ...group,
        children: group.children.sort((a, b) => a.name.localeCompare(b.name)),
      })),
  };
}
