import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("tuition cron isolates invoice transactions and reports per-child failures", () => {
  const route = readFileSync("src/app/api/cron/tuition-billing/route.ts", "utf8");

  assert.match(route, /TUITION_INVOICE_TRANSACTION_CONCURRENCY = 5/);
  assert.match(route, /\.\.\.currentlyEnrolledChildWhere\(\)/);
  assert.match(route, /Promise\.allSettled\(batch\.map\(async \(entry\) =>/);
  assert.match(route, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(route, /status: \{ not: PaymentStatus\.VOID \}/);
  assert.match(route, /path: \["billingPeriod"\], equals: entry\.billingPeriod/);
  assert.match(route, /path: \["coverageStartsPeriod"\], equals: entry\.billingPeriod/);
  assert.match(route, /path: \["mode"\], equals: "recurring"/);
  assert.match(route, /path: \["countsTowardRecurringCoverage"\], equals: true/);
  assert.match(route, /path: \["sourceId"\], equals: entry\.planId/);
  assert.match(route, /path: \["childId"\], equals: entry\.child\.id/);
  assert.match(route, /autopaySuppressed: true/);
  assert.match(route, /noPaymentSubmitted: true/);
  assert.match(route, /cadenceScope && cadence !== cadenceScope/);
  assert.match(route, /\{ maxWait: 10_000, timeout: 30_000 \}/);
  assert.match(route, /failed: failures\.length/);
  assert.match(route, /status: failures\.length \? 500 : 200/);
  assert.doesNotMatch(route, /prisma\.\$transaction\(async \(tx\) => \{\s*let transactionCreated/);
});

test("automatic collection skips recovery invoices without blocking explicit payments", () => {
  const autopay = readFileSync("src/lib/autopay-processing.ts", "utf8");

  assert.match(autopay, /collectionMode === "autopay" && invoiceFields\.autopaySuppressed === true/);
  assert.match(autopay, /Automatic collection is paused for this recovery invoice pending billing review/);
});
