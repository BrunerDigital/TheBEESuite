import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFteImportCsv } from "../src/lib/fte-report-import";

test("FTE import parser preserves legacy report billing, payroll, and movement columns", () => {
  const parsed = parseFteImportCsv([
    "School Name,Location Data,Week Start,Accounts Receivable,Amount of Self-Payer Bill,Amount of Subsidy Bill,Total Amount Billed,Total FTE's (FTE),Total currently enrolled,License Capacity,Occupancy Percent,Payroll Amount,Payroll %,# New Starts,# Withdrawn,# Children preregistered",
    "Beach Blvd,ABee Schools (Formally),2026-07-13,240.55,3859.40,4377.47,8236.87,30,30,65,46.1,6187.07,75.1,0,0,0",
  ].join("\n"));

  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.rows[0], {
    rowNumber: 2,
    centerKey: "Beach Blvd",
    locationData: "ABee Schools (Formally)",
    weekStart: "2026-07-13",
    weekEnd: "",
    accountReceivableAmount: 240.55,
    selfPayerBillAmount: 3859.4,
    subsidyBillAmount: 4377.47,
    totalBilledAmount: 8236.87,
    enrolledCount: 30,
    fullTimeCount: 0,
    partTimeCount: 0,
    fteCount: 30,
    licenseCapacity: 65,
    occupancyPercent: 46.1,
    payrollAmount: 6187.07,
    payrollPercent: 75.1,
    newStarts: 0,
    withdrawals: 0,
    preregisteredChildren: 0,
    infants: 0,
    toddlers: 0,
    twos: 0,
    preschool: 0,
    preK: 0,
    schoolAge: 0,
    status: "",
    notes: "",
  });
});
