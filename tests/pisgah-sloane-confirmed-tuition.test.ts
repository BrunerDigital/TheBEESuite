import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/apply-pisgah-sloane-confirmed-tuition.ts", "utf8");

test("Sloane billing uses the director-confirmed exact amounts and effective dates", () => {
  assert.match(source, /const MONTHLY_AMOUNT_CENTS = 120_000/);
  assert.match(source, /const AUGUST_PRORATION_CENTS = 27_700/);
  assert.match(source, /const START_DATE = "2026-08-24"/);
  assert.match(source, /const BILLING_START_PERIOD = "2026-09"/);
  assert.match(source, /const EVIDENCE_MESSAGE_ID = "1a03f1b8985f5d08"/);
});

test("Sloane billing creates one guarded open invoice and preserves payment consent", () => {
  assert.match(source, /createBillingInvoiceForFamily/);
  assert.match(source, /dedupeKey: PRORATION_DEDUPE_KEY/);
  assert.match(source, /autopaySuppressed: true/);
  assert.match(source, /noPaymentSubmitted: true/);
  assert.match(source, /create: \{ familyId: FAMILY_ID, balanceCents: 0, autopayPlaceholder: false \}/);
  assert.doesNotMatch(source, /data:\s*\{[^}]*autopayPlaceholder:\s*true/);
  assert.doesNotMatch(source, /stripe\.(paymentIntents|charges|refunds)\.create/);
});

test("Sloane billing uses a reviewed-state fingerprint and a serializable transaction", () => {
  assert.match(source, /--confirm-fingerprint/);
  assert.match(source, /fingerprint\(reviewedState\(current\)\) === planFingerprint/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(source, /matchingLedgerEntries\.length === 1/);
  assert.match(source, /before\.account\?\.invoices\.length \?\? 0\) \+ 1/);
  assert.match(source, /mode: wasAlreadyApplied \? "already_applied" : "applied"/);
  assert.doesNotMatch(source, /state\.account\.autopayPlaceholder === false\s*&& childFields/);
});

test("Sloane recurring billing requires a current classroom assignment", () => {
  assert.match(source, /classroomId: true/);
  assert.match(source, /child\.classroomId !== null/);
  assert.match(source, /required for recurring tuition billing/);
});
