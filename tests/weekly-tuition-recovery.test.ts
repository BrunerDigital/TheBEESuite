import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("directors can preview and run scoped weekly tuition recovery invoices only", () => {
  const route = readFileSync("src/app/api/billing/tuition-recovery/route.ts", "utf8");
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");

  assert.match(route, /getCurrentUser\(\)/);
  assert.match(route, /canManageBilling\(user\)/);
  assert.match(route, /canAccessCenter\(user, centerId\)/);
  assert.match(route, /family: \{ is: \{ centerId: center\.id \} \}/);
  assert.match(route, /cadence !== "weekly"/);
  assert.match(route, /previewCenterId !== center\.id/);
  assert.match(route, /previewDueChildren !== dueChildren\.length/);
  assert.match(route, /normalizeTuitionAdditionalCharges\(entry\.fields\.tuitionAdditionalCharges\)/);
  assert.match(route, /totalTuitionAdditionalChargesCents\(tuitionAdditionalCharges\)/);
  assert.match(route, /additionalCharges: tuitionAdditionalCharges/);
  assert.match(route, /tuitionAdditionalChargesTotalCents: tuitionAdditionalChargesTotalCents \* invoiceWeekCount/);
  assert.match(route, /netTuitionCents: grossTuitionCents - \(tuitionCreditsTotalCents \* invoiceWeekCount\)/);
  assert.match(route, /autopaySuppressed: true/);
  assert.match(route, /noPaymentSubmitted: true/);
  assert.match(route, /billing\.weekly_tuition_recovery\.completed/);
  assert.match(workbench, /Weekly billing recovery/);
  assert.match(workbench, /Preview Weekly Run/);
  assert.match(workbench, /Create Weekly Invoices/);
  assert.match(workbench, /setWeeklyRecoveryPreview\(null\)/);
  assert.match(workbench, /recoveryPreview\.centerId !== centerId/);
  assert.match(workbench, /previewCenterId: previewForCreate\?\.centerId/);
  assert.match(workbench, /previewDueChildren/);
  assert.match(workbench, /Recovery invoices do not submit autopay/);
});
