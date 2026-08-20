import assert from "node:assert/strict";
import test from "node:test";
import type {
  AutopayRunInvoiceResult,
  AutopayRunSummary,
  ProcessAutopayInput,
} from "../src/lib/autopay-processing";
import { processAutopayQueue } from "../src/lib/autopay-queue";

function result(invoiceId: string, status: AutopayRunInvoiceResult["status"], amountCents = 0): AutopayRunInvoiceResult {
  return {
    invoiceId,
    invoiceNumber: invoiceId,
    familyName: "Test Family",
    centerId: "center-1",
    centerName: "Test Center",
    amountCents,
    invoiceAmountCents: amountCents,
    accountCreditAppliedCents: 0,
    stripeChargePrincipalCents: amountCents,
    status,
    reason: status === "skipped" ? "Blocked by an existing billing safeguard." : null,
    paymentId: null,
    stripePaymentIntentId: null,
  };
}

function page({
  rows,
  hasMore,
  nextCursor,
}: {
  rows: AutopayRunInvoiceResult[];
  hasMore: boolean;
  nextCursor: string | null;
}): AutopayRunSummary {
  const wouldCharge = rows.filter((row) => row.status === "would_charge").length;
  const paid = rows.filter((row) => row.status === "paid").length;
  const processing = rows.filter((row) => row.status === "processing").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  return {
    ok: true,
    dryRun: false,
    asOf: "2026-08-20T15:30:00.000Z",
    scanned: rows.length,
    eligible: wouldCharge + paid + processing + failed,
    wouldCharge,
    paid,
    processing,
    failed,
    skipped: rows.filter((row) => row.status === "skipped").length,
    totalCents: rows
      .filter((row) => ["would_charge", "paid", "processing"].includes(row.status))
      .reduce((total, row) => total + row.amountCents, 0),
    hasMore,
    nextCursor,
    results: rows,
  };
}

test("scheduled autopay drains later pages after an entirely blocked first page", async () => {
  const pages = [
    page({ rows: [result("blocked-1", "skipped"), result("blocked-2", "skipped")], hasMore: true, nextCursor: "blocked-2" }),
    page({ rows: [result("paid-1", "paid", 12_500)], hasMore: true, nextCursor: "paid-1" }),
    page({ rows: [result("processing-1", "processing", 8_000)], hasMore: false, nextCursor: null }),
  ];
  const cursors: Array<string | null | undefined> = [];

  const summary = await processAutopayQueue({
    input: { dryRun: false, asOf: new Date("2026-08-20T15:30:00.000Z"), limit: 50 },
    processPage: async (input: ProcessAutopayInput) => {
      cursors.push(input.cursorInvoiceId);
      const next = pages.shift();
      assert.ok(next);
      return next;
    },
  });

  assert.deepEqual(cursors, [null, "blocked-2", "paid-1"]);
  assert.equal(summary.pagesProcessed, 3);
  assert.equal(summary.queueDrained, true);
  assert.equal(summary.hasMore, false);
  assert.equal(summary.scanned, 4);
  assert.equal(summary.eligible, 2);
  assert.equal(summary.paid, 1);
  assert.equal(summary.processing, 1);
  assert.equal(summary.skipped, 2);
  assert.equal(summary.totalCents, 20_500);
  assert.deepEqual(summary.results.map((row) => row.invoiceId), ["blocked-1", "blocked-2", "paid-1", "processing-1"]);
});

test("scheduled autopay fails loudly when a page cannot advance its cursor", async () => {
  await assert.rejects(
    processAutopayQueue({
      input: { dryRun: true, limit: 50 },
      processPage: async () => page({ rows: [result("blocked-1", "skipped")], hasMore: true, nextCursor: null }),
    }),
    /pagination stalled/,
  );
});

test("scheduled autopay reports an undrained queue when the safety page cap is reached", async () => {
  const summary = await processAutopayQueue({
    input: { dryRun: true, limit: 50 },
    maxPages: 1,
    processPage: async () => page({ rows: [result("blocked-1", "skipped")], hasMore: true, nextCursor: "blocked-1" }),
  });

  assert.equal(summary.pagesProcessed, 1);
  assert.equal(summary.queueDrained, false);
  assert.equal(summary.hasMore, true);
  assert.equal(summary.nextCursor, "blocked-1");
});
