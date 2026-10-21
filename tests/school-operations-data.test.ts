import assert from "node:assert/strict";
import test from "node:test";
import {
  readClassroomMoveUps,
  readClassroomPresence,
  type OperationsCenter,
} from "../src/lib/school-operations-data";
import { operationsRowsToCsv } from "../src/lib/operations-csv";
import { canAccessResolvedModuleRoute } from "../src/lib/rbac";

const centers: OperationsCenter[] = [
  {
    id: "school-a",
    name: "School A",
    timezone: "America/New_York",
    city: null,
    state: "NY",
    customFields: { privateImportDetail: "do-not-serialize" },
  },
  {
    id: "school-b",
    name: "School B",
    timezone: "America/Denver",
    city: null,
    state: "CO",
    customFields: null,
  },
];
const now = new Date("2026-10-21T19:00:00Z");
type OperationsDb = Parameters<typeof readClassroomPresence>[0];

function mockDb(data: Record<string, unknown[]> = {}) {
  const calls: { model: string; args: Record<string, unknown> }[] = [];
  const db = Object.fromEntries(
    [
      "classroom",
      "checkInOutLog",
      "childLocationTransition",
      "attendanceRecord",
      "child",
    ].map((model) => [
      model,
      {
        findMany: async (args: Record<string, unknown>) => {
          calls.push({ model, args });
          return data[model] ?? [];
        },
      },
    ]),
  ) as unknown as OperationsDb;
  return { db, calls };
}

test("presence queries only authorized schools with per-school day bounds and no row cap", async () => {
  const { db, calls } = mockDb();
  const result = await readClassroomPresence(db, centers, {
    date: "2026-09-15",
    time: "10:00",
    now,
  });
  assert.equal(calls.length, 4);
  assert.equal(result.schools.length, 2);
  assert.deepEqual(
    calls.find((call) => call.model === "classroom")?.args.where,
    { centerId: { in: ["school-a", "school-b"] } },
  );
  const where = calls.find((call) => call.model === "checkInOutLog")?.args
    .where as {
    OR: { centerId: string; occurredAt: { gte: Date; lte: Date } }[];
  };
  assert.deepEqual(
    where.OR.map((row) => row.centerId),
    ["school-a", "school-b"],
  );
  assert.equal(
    where.OR[0].occurredAt.lte.toISOString(),
    "2026-09-15T14:00:00.000Z",
  );
  assert.equal(
    where.OR[1].occurredAt.lte.toISOString(),
    "2026-09-15T16:00:00.000Z",
  );
  assert.equal(
    where.OR[1].occurredAt.gte.toISOString(),
    "2026-09-15T06:00:00.000Z",
  );
  const attendanceWhere = calls.find(
    (call) => call.model === "attendanceRecord",
  )?.args.where as {
    OR: {
      AND: {
        OR: {
          date?: { gte: Date; lte?: Date; lt?: Date };
          OR?: unknown[];
          classroomId?: null;
          child?: unknown;
        }[];
      }[];
    }[];
  };
  assert.equal(
    attendanceWhere.OR[0].AND[0].OR[0].date!.lte!.toISOString(),
    "2026-09-15T14:00:00.000Z",
  );
  assert.equal(
    attendanceWhere.OR[1].AND[0].OR[0].date!.lte!.toISOString(),
    "2026-09-15T16:00:00.000Z",
  );
  assert.equal(
    attendanceWhere.OR[0].AND[0].OR[1].date!.gte.toISOString(),
    "2026-09-15T00:00:00.000Z",
  );
  assert.equal(
    attendanceWhere.OR[0].AND[0].OR[1].date!.lt!.toISOString(),
    "2026-09-16T00:00:00.000Z",
  );
  assert.match(
    JSON.stringify(attendanceWhere.OR[0].AND[0].OR[1].OR),
    /procare_import/,
  );
  assert.deepEqual(attendanceWhere.OR[0].AND[1].OR[1], {
    classroomId: null,
    child: { is: { family: { is: { centerId: "school-a" } } } },
  });
  for (const call of calls) assert.equal("take" in call.args, false);
});

test("no authorized schools causes no presence database reads", async () => {
  const { db, calls } = mockDb();
  const result = await readClassroomPresence(db, [], {
    date: "",
    time: "",
    now,
  });
  assert.equal(calls.length, 0);
  assert.deepEqual(result.schools, []);
});

test("unmapped daily attendance is scoped through its family only for schoolwide viewers", async () => {
  const data = {
    attendanceRecord: [
      {
        childId: "unmapped",
        date: new Date("2026-09-15T00:00:00Z"),
        sourceSystem: "procare",
        classroom: null,
        child: { family: { centerId: "school-a" } },
      },
      {
        childId: "foreign",
        date: new Date("2026-09-15T00:00:00Z"),
        sourceSystem: "procare",
        classroom: null,
        child: { family: { centerId: "other-school" } },
      },
    ],
  };
  const result = await readClassroomPresence(
    mockDb(data).db,
    centers.slice(0, 1),
    { date: "2026-09-15", time: "10:00", now },
  );
  assert.equal(result.schools[0].dailyOnly, 1);
  assert.equal(result.schools[0].checkedIn, 0);
  const teacherDb = mockDb(data);
  const teacher = await readClassroomPresence(
    teacherDb.db,
    centers.slice(0, 1),
    {
      date: "2026-09-15",
      time: "10:00",
      now,
      teacherClassroomId: "teacher-room",
    },
  );
  assert.equal(teacher.schools[0].dailyOnly, 0);
  const where = teacherDb.calls.find(
    (call) => call.model === "attendanceRecord",
  )?.args.where as { OR: { AND: { OR: unknown[] }[] }[] };
  assert.equal(where.OR[0].AND[1].OR.length, 1);
});

test("school payloads do not combine check-ins and distinguish daily-only records", async () => {
  const { db } = mockDb({
    classroom: [
      {
        id: "a",
        centerId: "school-a",
        name: "A room",
        capacity: 12,
        customFields: null,
      },
      {
        id: "b",
        centerId: "school-b",
        name: "B room",
        capacity: 12,
        customFields: null,
      },
    ],
    checkInOutLog: [
      {
        id: "event-a",
        centerId: "school-a",
        childId: "student-a",
        classroomId: "a",
        type: "check_in",
        occurredAt: new Date("2026-09-15T12:00:00Z"),
        child: { fullName: "Student A" },
      },
      {
        id: "event-b",
        centerId: "school-b",
        childId: "student-b",
        classroomId: "b",
        type: "check_in",
        occurredAt: new Date("2026-09-15T12:00:00Z"),
        child: { fullName: "Student B" },
      },
    ],
    attendanceRecord: [
      {
        childId: "daily-only",
        date: new Date("2026-09-15T00:00:00Z"),
        sourceSystem: "procare",
        classroom: { centerId: "school-a" },
      },
      {
        childId: "student-a",
        date: new Date("2026-09-15T12:00:00Z"),
        classroom: { centerId: "school-a" },
      },
      {
        childId: "future-status",
        date: new Date("2026-09-15T17:00:00Z"),
        classroom: { centerId: "school-a" },
      },
    ],
  });
  const result = await readClassroomPresence(db, centers, {
    date: "2026-09-15",
    time: "10:00",
    now,
  });
  assert.equal(result.schools[0].checkedIn, 1);
  assert.equal(JSON.stringify(result).includes("do-not-serialize"), false);
  assert.equal(result.schools[0].dailyOnly, 1);
  assert.equal(result.schools[1].dailyOnly, 0);
  assert.deepEqual(
    result.schools[0].groups.flatMap((group) =>
      group.children.map((child) => child.name),
    ),
    ["Student A"],
  );
  assert.deepEqual(
    result.schools[1].groups.flatMap((group) =>
      group.children.map((child) => child.name),
    ),
    ["Student B"],
  );
});

test("teacher presence applies the classroom scope to output and checks all transfers", async () => {
  const { db, calls } = mockDb({
    classroom: [
      {
        id: "a",
        centerId: "school-a",
        name: "A room",
        capacity: 12,
        customFields: null,
      },
    ],
    checkInOutLog: [
      {
        id: "event",
        centerId: "school-a",
        childId: "child",
        classroomId: "a",
        type: "check_in",
        occurredAt: new Date("2026-09-15T12:00:00Z"),
        child: { fullName: "Moved student" },
      },
    ],
    childLocationTransition: [
      {
        id: "move-1",
        centerId: "school-a",
        childId: "child",
        fromClassroomId: "a",
        toClassroomId: "b",
        toAreaName: null,
        movedAt: new Date("2026-09-15T12:30:00Z"),
      },
      {
        id: "move-2",
        centerId: "school-a",
        childId: "child",
        fromClassroomId: "b",
        toClassroomId: "c",
        toAreaName: null,
        movedAt: new Date("2026-09-15T13:30:00Z"),
      },
    ],
  });
  const result = await readClassroomPresence(db, centers.slice(0, 1), {
    date: "2026-09-15",
    time: "10:00",
    now,
    teacherClassroomId: "a",
  });
  assert.equal(result.schools[0].checkedIn, 0);
  assert.deepEqual(
    calls.find((call) => call.model === "classroom")?.args.where,
    { centerId: { in: ["school-a"] }, id: "a" },
  );
  assert.equal(JSON.stringify(result).includes("Moved student"), false);
});

test("move-up roster is scoped to current enrolled students, active rooms and teacher assignment", async () => {
  const { db, calls } = mockDb();
  await readClassroomMoveUps(db, centers, "teacher-room", now);
  const where = calls[0].args.where as { AND: unknown[] };
  assert.match(JSON.stringify(where), /enrollmentStatus/);
  assert.match(JSON.stringify(where), /teacher-room/);
  assert.match(JSON.stringify(where), /school-a/);
  assert.match(JSON.stringify(where), /school-b/);
  assert.match(JSON.stringify(where), /archived/);
  assert.equal("take" in calls[0].args, false);
});

test("new subviews retain existing module permissions", () => {
  for (const role of [
    "PARENT_GUARDIAN",
    "AUTHORIZED_PICKUP",
    "BILLING_ADMIN",
  ]) {
    assert.equal(
      canAccessResolvedModuleRoute(
        { role },
        "classroom-dashboard",
        "attendance",
      ),
      false,
    );
    assert.equal(
      canAccessResolvedModuleRoute(
        { role },
        "classroom-dashboard",
        "classroom-dashboard",
      ),
      false,
    );
  }
  assert.equal(
    canAccessResolvedModuleRoute(
      { role: "CENTER_DIRECTOR" },
      "classroom-dashboard",
      "attendance",
    ),
    true,
  );
  assert.equal(
    canAccessResolvedModuleRoute(
      { role: "TEACHER" },
      "classroom-dashboard",
      "attendance",
    ),
    true,
  );
  assert.equal(
    canAccessResolvedModuleRoute(
      { role: "CENTER_DIRECTOR", applicationAccess: "fte_only" },
      "classroom-dashboard",
      "attendance",
    ),
    false,
  );
});

test("CSV handles commas, quotes and spreadsheet formulas safely", () => {
  assert.equal(
    operationsRowsToCsv([
      ["A, B", 'The "Room"', "=SUM(A1)", " +cmd", "normal", 2],
    ]),
    '"A, B","The ""Room""","\'=SUM(A1)","\' +cmd","normal","2"',
  );
});
