import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { currentlyEnrolledChildWhere, isCurrentlyEnrolledStatus } from "../src/lib/enrollment-status";
import { fteAgeBucket } from "../src/lib/fte-age-groups";
import { enrollmentStartsBeforeFteWeekEnd, calculateScheduledDaysFte } from "../src/lib/fte-report-guardrails";
import { fteScheduledDaysPerWeek } from "../src/lib/fte-scheduled-days";

const weekStart = new Date("2026-11-16T00:00:00.000Z");
const weekEndExclusive = new Date("2026-11-23T00:00:00.000Z");
type Prefill = {
  enrolledCount: number; infants: number; toddlers: number; twos: number; preschool: number; preK: number; schoolAge: number;
  fiveDayCount: number; fourDayCount: number; threeDayCount: number; twoDayCount: number;
  unknownScheduleCount: number; missingScheduleChildren: Array<{ id: string }>;
  preregisteredChildren: number; newStarts: number; withdrawals: number;
};

// Exercise the production prefill function with synthetic read delegates only.
// Extracting its declaration avoids importing the page's unrelated providers.
const page = ts.createSourceFile("page.tsx", readFileSync("src/app/[slug]/page.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = page.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "buildFtePrefills");
assert.ok(declaration);
const compiled = ts.transpileModule(`${declaration.getText(page)}\nexports.buildFtePrefills = buildFtePrefills;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function child(id: string, startDate: Date | null, schedule: unknown = {}, customFields: unknown = {}, ageGroup = "preschool") {
  return {
    id, fullName: `Fictional ${id}`, startDate, schedule, customFields, ageGroup, enrollmentStatus: "enrolled",
    updatedAt: new Date("2026-11-01T12:00:00.000Z"),
    family: { centerId: "school-a" }, classroom: { centerId: "school-a", name: "Fictional room", ageGroup },
  };
}

const children = () => [
  child("legacy-current", null, {}, {}, "infant"),
  child("midweek-start", new Date("2026-11-20T12:00:00.000Z"), { daysPerWeek: 3 }, {}, "twos"),
  child("explicit-review", new Date("2026-11-03T12:00:00.000Z"), { notes: "Full time per registration form." }, { scheduledDaysPerWeek: "not_set" }),
  ...["future-full-a", "future-full-b", "future-full-c"].map((id) => child(id, new Date("2026-11-23T12:00:00.000Z"), { notes: "Full time per registration form." }, { careScheduleType: "full_time" })),
  ...["future-break-a", "future-break-b"].map((id) => child(id, new Date("2026-11-23T12:00:00.000Z"), { notes: "Break care only; no recurring days specified." }, { careScheduleType: "break_care_only" }, "school age")),
  { ...child("withdrawn", null), enrollmentStatus: "withdrawn" },
  { ...child("wrong-school", null), classroom: { centerId: "school-b", name: "Other school", ageGroup: "preschool" } },
];

async function prefill(week: Date, rows = children()) {
  const db = {
    child: { findMany: async () => rows },
    invoice: { findMany: async () => [] },
    billingAccount: { findMany: async () => [] },
    staffProfile: { findMany: async () => [] },
  };
  const dependencies = {
    prisma: db, PaymentStatus: { OPEN: "OPEN" },
    startOfFteWeek: () => new Date(week), isoWeekBillingPeriod: () => "fixture-week",
    centerIdFilter: () => "school-a", currentlyEnrolledChildWhere,
    activeEnrollmentStatus: isCurrentlyEnrolledStatus, enrollmentStartsBeforeFteWeekEnd,
    fteAgeBucket, fteScheduledDaysPerWeek,
    buildOutstandingNonInvoiceChargesByAccount: () => new Map(),
  };
  const result: { buildFtePrefills?: (centers: Array<{ id: string; licensedCapacity: number }>) => Promise<Prefill[]> } = {};
  new Function("exports", ...Object.keys(dependencies), compiled)(result, ...Object.values(dependencies));
  assert.ok(result.buildFtePrefills);
  return (await result.buildFtePrefills([{ id: "school-a", licensedCapacity: 177 }]))[0];
}

test("FTE enrollment respects the existing exclusive UTC reporting-week boundary", () => {
  assert.equal(enrollmentStartsBeforeFteWeekEnd(null, weekEndExclusive), true);
  assert.equal(enrollmentStartsBeforeFteWeekEnd(new Date("2026-11-03T12:00:00.000Z"), weekEndExclusive), true);
  assert.equal(enrollmentStartsBeforeFteWeekEnd(new Date("2026-11-20T12:00:00.000Z"), weekEndExclusive), true);
  assert.equal(enrollmentStartsBeforeFteWeekEnd(new Date("2026-11-22T23:59:59.999Z"), weekEndExclusive), true);
  assert.equal(enrollmentStartsBeforeFteWeekEnd(new Date("2026-11-23T00:00:00.000Z"), weekEndExclusive), false);
  assert.equal(enrollmentStartsBeforeFteWeekEnd(new Date("2026-11-22T19:00:00-05:00"), weekEndExclusive), false);
  assert.equal(enrollmentStartsBeforeFteWeekEnd(new Date("2026-11-23T12:00:00.000Z"), weekEndExclusive), false);
});

test("future starters stay preregistered without inflating current enrolled, age or schedule counts", async () => {
  const row = await prefill(weekStart);
  assert.equal(row.enrolledCount, 3);
  assert.equal(row.infants, 1); assert.equal(row.twos, 1); assert.equal(row.preschool, 1); assert.equal(row.schoolAge, 0);
  assert.equal(row.fiveDayCount, 1); assert.equal(row.threeDayCount, 1);
  assert.equal(calculateScheduledDaysFte(row), 1.6);
  assert.equal(row.unknownScheduleCount, 1);
  assert.deepEqual(row.missingScheduleChildren.map((entry) => entry.id), ["explicit-review"]);
  assert.equal(row.preregisteredChildren, 5);
  assert.equal(row.newStarts, 1);
  assert.equal(row.withdrawals, 0);
});

test("the following week includes the starters while break-care and explicit review schedules stay unresolved", async () => {
  const row = await prefill(new Date("2026-11-23T00:00:00.000Z"));
  assert.equal(row.enrolledCount, 8);
  assert.equal(row.preschool, 4); assert.equal(row.schoolAge, 2);
  assert.equal(row.fiveDayCount, 4); assert.equal(row.threeDayCount, 1);
  assert.equal(row.unknownScheduleCount, 3);
  assert.deepEqual(row.missingScheduleChildren.map((entry) => entry.id), ["explicit-review", "future-break-a", "future-break-b"]);
  assert.equal(row.preregisteredChildren, 0);
  assert.equal(row.newStarts, 5);
});
