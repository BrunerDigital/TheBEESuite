import assert from "node:assert/strict";
import { test } from "node:test";
import {
  estimatedHourlyGrossPayCents,
  formatStaffPayRate,
  hasStaffCompensationPayload,
  normalizeStaffCompensationPayload,
  readStaffCompensation,
  staffCompensationCustomFields,
} from "@/lib/staff-compensation";

test("staff compensation payload parses hourly and salary fields", () => {
  const hourly = normalizeStaffCompensationPayload({
    staffPayType: "hourly",
    hourlyRate: "18.50",
    payrollId: "KC-104",
    payrollStatus: "active",
    payCode: "LEAD",
    payDepartment: "Preschool",
    overtimeEligible: true,
    payEffectiveDate: "2026-06-24",
  });

  assert.equal(hourly.ok, true);
  if (hourly.ok) {
    assert.equal(hourly.compensation.payType, "hourly");
    assert.equal(hourly.compensation.hourlyRateCents, 1850);
    assert.equal(hourly.compensation.annualSalaryCents, null);
    assert.equal(hourly.compensation.payrollId, "KC-104");
    assert.equal(hourly.compensation.department, "Preschool");
    assert.equal(hourly.compensation.effectiveDate, "2026-06-24");
  }

  const salary = normalizeStaffCompensationPayload({
    payType: "salary",
    annualSalary: "$52,000",
    overtimeEligible: "false",
  });

  assert.equal(salary.ok, true);
  if (salary.ok) {
    assert.equal(salary.compensation.payType, "salary");
    assert.equal(salary.compensation.annualSalaryCents, 5200000);
    assert.equal(salary.compensation.overtimeEligible, false);
  }
});

test("staff compensation merge preserves existing staff custom fields", () => {
  const parsed = normalizeStaffCompensationPayload({
    staffPayType: "salary",
    yearlySalary: "64000",
    payrollStatus: "on_hold",
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const fields = staffCompensationCustomFields({
    customFields: {
      staffContactEmail: "teacher@example.com",
      timeClock: { status: "clocked_out" },
    },
    compensation: parsed.compensation,
    updatedAt: new Date("2026-06-24T12:00:00.000Z"),
    updatedById: "director_1",
  });
  const compensation = readStaffCompensation(fields);

  assert.equal(fields.staffContactEmail, "teacher@example.com");
  assert.deepEqual(fields.timeClock, { status: "clocked_out" });
  assert.equal(compensation.payType, "salary");
  assert.equal(compensation.annualSalaryCents, 6400000);
  assert.equal(compensation.payrollStatus, "on_hold");
});

test("staff compensation formats rates and estimates hourly gross pay", () => {
  const compensation = readStaffCompensation({
    staffCompensation: {
      payType: "hourly",
      hourlyRateCents: 2000,
      overtimeEligible: true,
    },
  });

  assert.equal(formatStaffPayRate(compensation), "$20.00/hr");
  assert.equal(estimatedHourlyGrossPayCents({
    compensation,
    regularMinutes: 40 * 60,
    overtimeMinutes: 2 * 60,
  }), 86000);
});

test("staff compensation detects sensitive payload fields", () => {
  assert.equal(hasStaffCompensationPayload({ hourlyRate: "19" }), true);
  assert.equal(hasStaffCompensationPayload({ name: "Avery Teacher" }), false);
  assert.deepEqual(normalizeStaffCompensationPayload({ hourlyRate: "bad" }), {
    ok: false,
    error: "Hourly rate must be a valid non-negative dollar amount.",
  });
});
