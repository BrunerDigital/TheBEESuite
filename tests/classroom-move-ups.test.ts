import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMoveUpRows,
  moveUpProgram,
  type MoveUpChild,
} from "../src/lib/classroom-move-ups";

const child = (dateOfBirth: string, ageGroup = "Toddler"): MoveUpChild => ({
  id: "child",
  fullName: "Test Student",
  dateOfBirth: new Date(dateOfBirth),
  classroomId: "a",
  classroom: { name: "Room A", ageGroup, centerId: "school" },
});

test("toddlers and twos use six-month reviews while threes and pre-K remain year-long", () => {
  for (const group of [
    "Toddler",
    "Toddlers",
    "2 Y/O",
    "2’s",
    "Twos",
    "Two year olds",
  ])
    assert.equal(moveUpProgram(group), "six_month", group);
  for (const group of [
    "3’s",
    "3 Y/O",
    "Threes",
    "Preschool",
    "Pre-K",
    "Pre K",
    "PreK",
  ])
    assert.equal(moveUpProgram(group), "year_long", group);
  assert.equal(moveUpProgram("Infant"), "other");
  assert.equal(moveUpProgram("School-Aged"), "other");
});

test("next 18, 24, 30 and 36 month review dates come from birth dates", () => {
  for (const [dob, group, milestone, due] of [
    ["2025-05-01", "Toddler", 18, "2026-11-01"],
    ["2024-12-01", "Toddler", 24, "2026-12-01"],
    ["2024-05-01", "2 Y/O", 30, "2026-11-01"],
    ["2023-12-01", "2 Y/O", 36, "2026-12-01"],
  ] as const) {
    const [row] = buildMoveUpRows([child(dob, group)], "2026-10-21");
    assert.equal(row.milestone, milestone);
    assert.equal(row.dueDate, due);
  }
});

test("the exact milestone is due today, older children in twos retain overdue review", () => {
  assert.equal(
    buildMoveUpRows([child("2024-04-21", "2 Y/O")], "2026-10-21")[0].status,
    "Review today",
  );
  const [overdue] = buildMoveUpRows(
    [child("2023-09-01", "2 Y/O")],
    "2026-10-21",
  );
  assert.equal(overdue.dueDate, "2026-09-01");
  assert.equal(overdue.status, "Overdue review");
});

test("classroom program protects year-long students regardless of their birthdays", () => {
  const rows = buildMoveUpRows(
    [child("2024-03-01", "3’s"), child("2022-03-01", "Pre-K")],
    "2026-10-21",
  );
  for (const row of rows) {
    assert.equal(row.dueDate, null);
    assert.equal(row.status, "Year-long program");
  }
});

test("month-end and leap-day birthdays clamp to valid review dates", () => {
  assert.equal(
    buildMoveUpRows([child("2024-08-31")], "2026-02-01")[0].dueDate,
    "2026-02-28",
  );
  assert.equal(
    buildMoveUpRows([child("2024-02-29", "2 Y/O")], "2027-01-01")[0].dueDate,
    "2027-02-28",
  );
});

test("invalid and future birth dates are flagged for review", () => {
  for (const dob of ["invalid", "2027-01-01"]) {
    const [row] = buildMoveUpRows([child(dob)], "2026-10-21");
    assert.equal(row.dueDate, null);
    assert.equal(row.status, "Check birth date");
  }
});

test("the previous milestone remains visible after its date passes", () => {
  const [row] = buildMoveUpRows([child("2024-04-01", "2 Y/O")], "2026-10-21");
  assert.equal(row.previousMilestoneDate, "2026-10-01");
  assert.equal(row.dueDate, "2027-04-01");
});

test("toddlers past the two-year transition retain an overdue review", () => {
  const [row] = buildMoveUpRows([child("2024-09-01", "Toddler")], "2026-10-21");
  assert.equal(row.dueDate, "2026-09-01");
  assert.equal(row.status, "Overdue review");
});

test("ProCare placeholder and missing-DOB marker produce birth-date review instead of overdue move-ups", () => {
  for (const record of [
    child("1900-01-01T12:00:00Z"),
    {
      ...child("2024-04-01"),
      customFields: {
        dateOfBirthMissing: true,
        privateImportDetail: "do-not-serialize",
      },
    },
  ]) {
    const [row] = buildMoveUpRows([record], "2026-10-21");
    assert.equal(row.ageMonths, null);
    assert.equal(row.dueDate, null);
    assert.equal(row.previousMilestoneDate, null);
    assert.equal(row.status, "Check birth date");
    assert.equal(JSON.stringify(row).includes("do-not-serialize"), false);
  }
});

test("themed imported rooms need explicit age-group setup and use the configured mapping", () => {
  for (const name of [
    "Fireflies",
    "Ladybugs",
    "Dragonflies",
    "Fireflies 2",
    "Three Bears",
  ]) {
    const [unmapped] = buildMoveUpRows(
      [
        {
          ...child("2025-05-01", name),
          classroom: { name, ageGroup: name, centerId: "school" },
        },
      ],
      "2026-10-21",
    );
    assert.equal(unmapped.program, "unmapped");
    assert.equal(unmapped.dueDate, null);
    assert.equal(unmapped.status, "Set classroom age group");
    const [toddler] = buildMoveUpRows(
      [
        {
          ...child("2025-05-01"),
          classroom: { name, ageGroup: "Toddler", centerId: "school" },
        },
      ],
      "2026-10-21",
    );
    assert.equal(toddler.program, "six_month");
    assert.equal(toddler.dueDate, "2026-11-01");
    const [yearLong] = buildMoveUpRows(
      [
        {
          ...child("2024-05-01"),
          classroom: { name, ageGroup: "Preschool", centerId: "school" },
        },
      ],
      "2026-10-21",
    );
    assert.equal(yearLong.program, "year_long");
    assert.equal(yearLong.dueDate, null);
  }
});
