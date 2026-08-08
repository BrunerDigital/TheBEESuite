import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("weekly tuition recovery requires current school approval and suppresses payment submission", () => {
  const recovery = source("../scripts/recover-missing-weekly-tuition-invoices.ts");

  assert.match(recovery, /--confirm-missing-weekly-tuition-recovery/);
  assert.match(recovery, /--confirm-fingerprint/);
  assert.match(recovery, /stripeSchoolBillingApproval/);
  assert.match(recovery, /livePaymentsEnabled === true/);
  assert.match(recovery, /tuitionBillingEnabled === true/);
  assert.match(recovery, /currentlyEnrolledChildWhere/);
  assert.match(recovery, /autopaySuppressed: true/);
  assert.match(recovery, /noPaymentSubmitted: true/);
  assert.match(recovery, /prisma\.\$transaction/);
  assert.doesNotMatch(recovery, /\.payment\.(?:create|update|delete|upsert)/);
});

test("Longmont W33 planning remains read-only and holds uncertain tuition evidence", () => {
  const planning = source("../scripts/plan-longmont-w33-tuition-and-monthly-prepayment.ts");

  assert.match(planning, /CENTER_NAME = "Kid City USA - Longmont"/);
  assert.match(planning, /PERIOD = "2026-W33"/);
  assert.match(planning, /heldForEvidence/);
  assert.match(planning, /dry-run-only/);
  assert.doesNotMatch(planning, /--apply/);
  assert.doesNotMatch(planning, /prisma\.(?:child|invoice|payment|billingAccount|tuitionPlan)\.(?:create|update|delete|upsert)/);
});
