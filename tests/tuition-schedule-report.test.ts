import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTuitionScheduleRows, filterTuitionScheduleRows, tuitionScheduleCells, type TuitionScheduleChild } from "../src/lib/tuition-schedule-report";
import { reportRowsToCsv, reportRowsToPdf, rowsForReportKind, type AnalyticsReportData } from "../src/lib/reporting-analytics";

const now = new Date("2026-11-06T13:00:00Z");
const centers = new Map([["school-a", { label: "School A" }]]);
function child(id: string, fields: Record<string, unknown> = {}): TuitionScheduleChild {
  return {
    id, fullName: `Child ${id}`, enrollmentStatus: "enrolled", startDate: new Date("2026-08-01T12:00:00Z"),
    family: { id: `family-${id}`, name: `Family ${id}`, centerId: "school-a" }, classroom: { name: "Toddlers", centerId: "school-a" },
    customFields: { tuitionPlanId: "saved-plan", tuitionPlanAmountCents: 12000, tuitionBillingCadence: "weekly", tuitionBillingEnabled: true, ...fields },
  };
}

test("tuition report distinguishes the weekly rate, actual biweekly billing and four-week versus monthly cycles", () => {
  const rows = buildTuitionScheduleRows([
    child("weekly"),
    child("biweekly", { tuitionPlanCadence: "weekly", tuitionBillingCadence: "biweekly" }),
    child("four", { tuitionBillingCadence: "four_week" }),
    child("monthly", { tuitionBillingCadence: "monthly", tuitionPlanAmountCents: 90000 }),
  ], centers, now);
  const byId = new Map(rows.map(row => [row.childId, row]));
  assert.equal(byId.get("weekly")?.invoiceCents, 12000);
  assert.equal(byId.get("biweekly")?.invoiceCents, 24000);
  assert.equal(byId.get("biweekly")?.rateUnit, "week");
  assert.equal(byId.get("four")?.invoiceCents, 48000);
  assert.equal(byId.get("four")?.frequency, "Every 4 weeks");
  assert.equal(byId.get("monthly")?.invoiceCents, 90000);
  assert.equal(byId.get("monthly")?.rateUnit, "month");
});

test("saved recurring additions and credits are included before multiplying the billing cycle", () => {
  const [row] = buildTuitionScheduleRows([child("discount", {
    tuitionBillingCadence: "biweekly", tuitionPlanAmountCents: 25000,
    tuitionAdditionalCharges: [{ description: "Extended care", amountCents: 2000 }],
    tuitionCredits: [{ category: "family_discount", amountCents: 3000 }], tuitionNetAmountCents: 24000,
  })], centers, now);
  assert.equal(row.rateCents, 24000);
  assert.equal(row.invoiceCents, 48000);
  assert.equal(tuitionScheduleCells(row)[4], "$240.00/week");
});

test("zero-dollar, disabled and missing tuition stay visible even without a billing account or balance", () => {
  const missing = { ...child("missing"), customFields: {} };
  const rows = buildTuitionScheduleRows([missing, child("disabled", { tuitionBillingEnabled: false }), child("zero", { tuitionPlanAmountCents: 0 })], centers, now);
  assert.equal(rows.length, 3);
  const byId = new Map(rows.map(row => [row.childId, row]));
  assert.equal(byId.get("zero")?.status, "$0 family tuition");
  assert.equal(byId.get("zero")?.invoiceCents, 0);
  assert.equal(byId.get("disabled")?.status, "Disabled");
  assert.equal(byId.get("disabled")?.rateCents, 12000);
  assert.equal(byId.get("missing")?.status, "Not assigned");
  assert.equal(byId.get("missing")?.invoiceCents, null);
  assert.equal(tuitionScheduleCells(byId.get("missing")!)[6], "Not assigned");
});

test("full recurring discounts keep zero tuition visible in reports and exports for every cadence", () => {
  const rows = buildTuitionScheduleRows(["weekly", "biweekly", "four_week", "monthly"].map(cadence => child(cadence, {
    tuitionBillingCadence: cadence, tuitionNetAmountCents: 0,
    tuitionAdditionalCharges: [{ description: "Extended care", amountCents: 2000 }],
    tuitionCredits: [{ category: "employee_discount", amountCents: 14000 }],
  })), centers, now);
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(row.status, "$0 family tuition");
    assert.equal(row.rateCents, 0);
    assert.equal(row.invoiceCents, 0);
    assert.equal(tuitionScheduleCells(row)[6], "$0.00");
  }
  const report = rowsForReportKind({ generatedAt: now.toISOString(), range: { startDate: now.toISOString(), endDate: now.toISOString() }, scope: { centerIds: ["school-a"], centerLabels: ["School A"] }, tuitionSchedule: rows } as AnalyticsReportData, "tuition_schedule");
  assert.match(reportRowsToCsv(report), /\$0\.00/);
  assert.doesNotMatch(reportRowsToCsv(report), /Needs review/);
  assert.match(reportRowsToPdf(report).toString(), /\$0\.00/);
});

test("excess credits and a zero total without matching credits remain report exceptions", () => {
  const rows = buildTuitionScheduleRows([
    child("excess", { tuitionCredits: [{ category: "employee_discount", amountCents: 12001 }] }),
    child("inconsistent-zero", { tuitionNetAmountCents: 0 }),
  ], centers, now);
  for (const row of rows) {
    assert.equal(row.status, "Needs review");
    assert.equal(row.invoiceCents, null);
  }
});

test("roster snapshot excludes withdrawn, pending and future-start children independently of activity dates", () => {
  const rows = buildTuitionScheduleRows([
    child("current"), { ...child("withdrawn"), enrollmentStatus: "withdrawn" },
    { ...child("pending"), enrollmentStatus: "pending" },
    { ...child("future"), startDate: new Date("2026-12-01T12:00:00Z") },
  ], centers, now);
  assert.deepEqual(rows.map(row => row.childId), ["current"]);
});

test("scope fails closed for inaccessible schools and cross-school classroom relationships", () => {
  const otherSchool = { ...child("other"), family: { id: "other-family", name: "Other", centerId: "school-b" }, classroom: { name: "Infants", centerId: "school-b" } };
  const mismatch = { ...child("mismatch"), classroom: { name: "Other school's class", centerId: "school-b" } };
  assert.deepEqual(buildTuitionScheduleRows([otherSchool, mismatch, child("allowed")], centers, now).map(row => row.childId), ["allowed"]);
  assert.deepEqual(buildTuitionScheduleRows([child("allowed")], new Map(), now), []);
});

test("enrolled children missing classrooms remain visible as review exceptions", () => {
  const [row] = buildTuitionScheduleRows([{ ...child("classroom-missing"), classroom: null }], centers, now);
  assert.equal(row.classroomName, "Not assigned");
  assert.equal(row.status, "Needs review");
  assert.equal(row.invoiceCents, null);
});

test("malformed cadence and inconsistent saved totals are flagged instead of guessing monthly tuition", () => {
  const rows = buildTuitionScheduleRows([
    child("bad-cycle", { tuitionBillingCadence: "unknown" }),
    child("bad-net", { tuitionNetAmountCents: 9000 }),
    child("bad-amount", { tuitionPlanAmountCents: "12000" }),
  ], centers, now);
  const byId = new Map(rows.map(row => [row.childId, row]));
  assert.equal(byId.get("bad-cycle")?.frequency, "Not assigned");
  assert.equal(byId.get("bad-cycle")?.status, "Needs review");
  assert.equal(byId.get("bad-net")?.invoiceCents, null);
  assert.equal(byId.get("bad-amount")?.rateCents, null);
});

test("siblings have distinct rows and no roster cap silently drops children", () => {
  const children = Array.from({ length: 10001 }, (_, index) => child(String(index).padStart(5, "0")));
  children[1].family = children[0].family;
  const rows = buildTuitionScheduleRows(children, centers, now);
  assert.equal(rows.length, children.length);
  assert.equal(rows.filter(row => row.familyId === children[0].family.id).length, 2);
  assert.ok(rows.some(row => row.childId === "10000"));
});

test("screen, print and export cells share the same searchable child-level rows", () => {
  const rows = buildTuitionScheduleRows([child("weekly"), child("two", { tuitionBillingCadence: "biweekly" })], centers, now);
  assert.deepEqual(filterTuitionScheduleRows(rows, " Biweekly ").map(row => row.childId), ["two"]);
  assert.equal(filterTuitionScheduleRows(rows, "school a").length, 2);
  assert.equal(filterTuitionScheduleRows(rows, "Family weekly").length, 1);
  const data = {
    generatedAt: now.toISOString(), range: { startDate: "2020-01-01T00:00:00Z", endDate: "2020-01-02T00:00:00Z" },
    scope: { centerIds: ["school-a"], centerLabels: ["School A"] }, tuitionSchedule: filterTuitionScheduleRows(rows, "Biweekly"),
  } as AnalyticsReportData;
  const report = rowsForReportKind(data, "tuition_schedule");
  const csv = reportRowsToCsv(report);
  assert.equal(report.traceability.startDate, now.toISOString());
  assert.match(csv, /Tuition Schedule Report/);
  assert.match(csv, /\$120\.00\/week/);
  assert.match(csv, /\$240\.00/);
  assert.match(csv, /Child two/);
  assert.doesNotMatch(csv, /Child weekly/);
  assert.match(reportRowsToPdf(report).toString(), /Child two/);
});

test("tuition PDF repeats table headings and retains the last child across multiple pages", () => {
  const rows = buildTuitionScheduleRows(Array.from({ length: 130 }, (_, index) => child(String(index).padStart(3, "0"))), centers, now);
  const report = rowsForReportKind({ generatedAt: now.toISOString(), range: { startDate: now.toISOString(), endDate: now.toISOString() }, scope: { centerIds: ["school-a"], centerLabels: ["School A"] }, tuitionSchedule: rows } as AnalyticsReportData, "tuition_schedule");
  const pdf = reportRowsToPdf(report).toString();
  assert.match(pdf, /Child 129/);
  const pageCount = Number(/\/Count (\d+)/.exec(pdf)?.[1]);
  assert.ok(pageCount > 1);
  assert.equal((pdf.match(/\(Assignment status\)/g) ?? []).length, pageCount);
  assert.equal((pdf.match(/\(School\)/g) ?? []).length, pageCount);
  assert.match(pdf, new RegExp(`Page ${pageCount} of ${pageCount}`));
});
