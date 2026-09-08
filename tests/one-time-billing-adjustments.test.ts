import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ONE_TIME_BILLING_ADJUSTMENT_OPTIONS,
  normalizeOneTimeBillingAdjustmentEffectiveDate,
  oneTimeBillingAdjustmentDescription,
  oneTimeBillingAdjustmentEffectiveAt,
  oneTimeBillingAdjustmentNeedsNote,
  oneTimeBillingAdjustmentOption,
} from "../src/lib/one-time-billing-adjustments";

test("named one-time billing actions control the ledger direction", () => {
  assert.deepEqual(
    ONE_TIME_BILLING_ADJUSTMENT_OPTIONS.map(({ id, adjustmentType }) => ({ id, adjustmentType })),
    [
      { id: "vacation_credit", adjustmentType: "credit" },
      { id: "late_fee", adjustmentType: "debit" },
      { id: "other_credit", adjustmentType: "credit" },
      { id: "other_debit", adjustmentType: "debit" },
    ],
  );
  assert.equal(oneTimeBillingAdjustmentOption("late_fee")?.defaultDescription, "One-time late fee");
  assert.equal(oneTimeBillingAdjustmentOption("unknown"), null);
});

test("one-time adjustment descriptions retain the named action and service note", () => {
  assert.equal(oneTimeBillingAdjustmentDescription("vacation_credit"), "One-time vacation credit");
  assert.equal(
    oneTimeBillingAdjustmentDescription("vacation_credit", "  Week of September 14  "),
    "One-time vacation credit - Week of September 14",
  );
  assert.equal(oneTimeBillingAdjustmentNeedsNote("late_fee"), false);
  assert.equal(oneTimeBillingAdjustmentNeedsNote("other_credit"), true);
  assert.equal(oneTimeBillingAdjustmentNeedsNote("other_debit"), true);
  assert.equal(normalizeOneTimeBillingAdjustmentEffectiveDate("2026-09-08"), "2026-09-08");
  assert.equal(normalizeOneTimeBillingAdjustmentEffectiveDate("2026-02-30"), null);
  assert.equal(normalizeOneTimeBillingAdjustmentEffectiveDate("09/08/2026"), null);
  assert.equal(oneTimeBillingAdjustmentEffectiveAt("2026-09-08").toISOString(), "2026-09-08T12:00:00.000Z");
});

test("director workflow makes one-time fees and credits a common guarded task", () => {
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  const route = readFileSync("src/app/api/billing/invoices/route.ts", "utf8");

  assert.match(workbench, /One-time fee \/ credit/);
  assert.match(workbench, /saved recurring tuition and future weekly invoices unchanged/);
  assert.match(workbench, /Current balance/);
  assert.match(workbench, /Projected balance/);
  assert.match(workbench, /adjustmentReason,[\s\S]*adjustmentType: selectedAdjustmentOption\.adjustmentType/);
  assert.match(route, /oneTimeBillingAdjustmentOption\(requestedAdjustmentReason\)/);
  assert.match(route, /adjustmentReason,/);
  assert.match(route, /effectiveAt,/);
  assert.match(route, /balanceAfterCents: entry\.balanceAfterCents/);
});

test("director guidance separates registration packets from parent app invitations", () => {
  const resources = readFileSync("src/app/resources/page.tsx", "utf8");
  const registrationCard = readFileSync("src/components/registration-share-card.tsx", "utf8");
  const inviteCard = readFileSync("src/components/parent-portal-invite-button.tsx", "utf8");
  const directorSop = readFileSync("docs/sops/DIRECTOR_SOP.md", "utf8");

  assert.match(resources, /Registration and parent app access are separate/);
  assert.match(registrationCard, /Registration form, not parent app access/);
  assert.match(inviteCard, /separate from the registration form/);
  assert.match(directorSop, /Enrollment CRM` -> `Leads`/);
  assert.match(directorSop, /Dashboard` -> `Explore dashboard details` -> `Registration and enrollment forms`/);
});
