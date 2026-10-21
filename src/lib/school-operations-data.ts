import type { Prisma, PrismaClient } from "@prisma/client";
import { readCenterTimeZone } from "./attendance-state";
import {
  buildClassroomPresence,
  dailyAttendanceMatchesSnapshot,
  presenceWindow,
  schoolLocalDateTime,
} from "./classroom-presence";
import { buildMoveUpRows } from "./classroom-move-ups";
import { activeClassroomWhere, classroomIsArchived } from "./classroom-status";
import { currentlyEnrolledChildWhere } from "./enrollment-status";

type OperationsDb = Pick<
  PrismaClient,
  | "classroom"
  | "checkInOutLog"
  | "childLocationTransition"
  | "attendanceRecord"
  | "child"
>;
export type OperationsCenter = {
  id: string;
  name: string;
  timezone: string | null;
  city: string | null;
  state: string | null;
  customFields: unknown;
};

export async function readClassroomPresence(
  db: OperationsDb,
  centers: OperationsCenter[],
  input: {
    date: string;
    time: string;
    teacherClassroomId?: string | null;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const windows = centers
    .map((center) => ({ center, timeZone: readCenterTimeZone(center) }))
    .map((item) => {
      const window = presenceWindow(input.date, input.time, item.timeZone, now);
      const calendarStart = new Date(
        `${schoolLocalDateTime(window.at, item.timeZone).date}T00:00:00Z`,
      );
      return {
        ...item,
        window,
        calendarStart,
        calendarEnd: new Date(calendarStart.getTime() + 86_400_000),
      };
    });
  const importedDailyWhere: Prisma.AttendanceRecordWhereInput[] = [
    { sourceSystem: { in: ["procare", "bee_flat_file_v1"] } },
    { metadata: { path: ["source"], equals: "procare_import" } },
    { metadata: { path: ["source"], equals: "bee_flat_file_import" } },
  ];
  const scope = { in: centers.map((center) => center.id) };
  // Four queries per workspace, including an all-schools workspace. Never cap
  // event rows: a truncated event stream can produce a false headcount.
  const [allRooms, allLogs, allTransitions, allAttendance] = windows.length
    ? await Promise.all([
        db.classroom.findMany({
          where: {
            centerId: scope,
            ...(input.teacherClassroomId
              ? { id: input.teacherClassroomId }
              : {}),
          },
          orderBy: { name: "asc" },
          select: {
            id: true,
            centerId: true,
            name: true,
            capacity: true,
            customFields: true,
          },
        }),
        db.checkInOutLog.findMany({
          where: {
            OR: windows.map(({ center, window }) => ({
              centerId: center.id,
              occurredAt: { gte: window.start, lte: window.at },
            })),
          },
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            centerId: true,
            childId: true,
            classroomId: true,
            type: true,
            occurredAt: true,
            child: { select: { fullName: true } },
          },
        }),
        db.childLocationTransition.findMany({
          where: {
            OR: windows.map(({ center, window }) => ({
              centerId: center.id,
              movedAt: { gte: window.start, lte: window.at },
            })),
          },
          select: {
            id: true,
            centerId: true,
            childId: true,
            fromClassroomId: true,
            toClassroomId: true,
            toAreaName: true,
            movedAt: true,
          },
        }),
        db.attendanceRecord.findMany({
          where: {
            OR: windows.map(
              ({ center, window, calendarStart, calendarEnd }) => ({
                OR: [
                  { date: { gte: window.start, lte: window.at } },
                  {
                    date: { gte: calendarStart, lt: calendarEnd },
                    OR: importedDailyWhere,
                  },
                ],
                classroom: {
                  is: {
                    centerId: center.id,
                    ...(input.teacherClassroomId
                      ? { id: input.teacherClassroomId }
                      : {}),
                  },
                },
              }),
            ),
          },
          select: {
            childId: true,
            date: true,
            sourceSystem: true,
            metadata: true,
            classroom: { select: { centerId: true } },
          },
        }),
      ])
    : [[], [], [], []];
  const schools = windows.map(({ center, timeZone, window }) => {
    const rooms = allRooms.filter((room) => room.centerId === center.id);
    const logs = allLogs.filter((log) => log.centerId === center.id);
    const transitions = allTransitions.filter(
      (move) => move.centerId === center.id,
    );
    const attendance = allAttendance.filter(
      (record) =>
        record.classroom?.centerId === center.id &&
        dailyAttendanceMatchesSnapshot(record, {
          start: window.start,
          at: window.at,
          timeZone,
        }),
    );
    const teacherChildren = new Set([
      ...logs
        .filter((log) => log.classroomId === input.teacherClassroomId)
        .map((log) => log.childId),
      ...transitions
        .filter(
          (move) =>
            move.fromClassroomId === input.teacherClassroomId ||
            move.toClassroomId === input.teacherClassroomId,
        )
        .map((move) => move.childId),
    ]);
    const logged = new Set(logs.map((log) => log.childId));
    return {
      id: center.id,
      name: center.name,
      timeZone,
      at: window.at.toISOString(),
      date: schoolLocalDateTime(window.at, timeZone).date,
      dailyOnly: new Set(
        attendance
          .filter((row) => row.childId && !logged.has(row.childId))
          .map((row) => row.childId),
      ).size,
      recordedEvents: input.teacherClassroomId
        ? logs.filter((log) => teacherChildren.has(log.childId)).length
        : logs.length,
      ...buildClassroomPresence({
        rooms: rooms.map((room) => ({
          ...room,
          archived: classroomIsArchived(room.customFields),
        })),
        logs,
        transitions,
        start: window.start,
        at: window.at,
        teacherClassroomId: input.teacherClassroomId,
      }),
    };
  });
  return {
    live: !input.date && !input.time,
    refreshedAt: now.toISOString(),
    schools,
  };
}

export type ClassroomPresenceData = Awaited<
  ReturnType<typeof readClassroomPresence>
>;

export async function readClassroomMoveUps(
  db: OperationsDb,
  centers: OperationsCenter[],
  teacherClassroomId?: string | null,
  now = new Date(),
) {
  const children = await db.child.findMany({
    where: {
      AND: [
        currentlyEnrolledChildWhere(),
        {
          classroom: {
            is: activeClassroomWhere({
              centerId: { in: centers.map((center) => center.id) },
              ...(teacherClassroomId ? { id: teacherClassroomId } : {}),
            }),
          },
        },
      ],
    },
    select: {
      id: true,
      fullName: true,
      dateOfBirth: true,
      customFields: true,
      classroomId: true,
      classroom: { select: { name: true, ageGroup: true, centerId: true } },
    },
  });
  return {
    schools: centers.map((center) => ({ id: center.id, name: center.name })),
    rows: centers.flatMap((center) =>
      buildMoveUpRows(
        children.filter((child) => child.classroom?.centerId === center.id),
        schoolLocalDateTime(now, readCenterTimeZone(center)).date,
      ),
    ),
  };
}

export type ClassroomMoveUpsData = Awaited<
  ReturnType<typeof readClassroomMoveUps>
>;
