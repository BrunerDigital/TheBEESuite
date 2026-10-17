import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { offlinePaymentPaidAt, offlinePaymentRequestId, offlinePaymentRequestIdentity } from "../src/lib/offline-payment-request";

const input = {
  billingAccountId: "synthetic-account",
  requestId: "00000000-0000-4000-8000-000000000001",
  method: "cash" as const,
  amountCents: 10_000,
  paidAt: new Date("2026-10-13T12:00:00Z"),
  reference: "receipt-1",
  description: "Cash payment",
  notes: "",
};

test("offline payment request IDs are bounded and normalized", () => {
  assert.equal(offlinePaymentRequestId(input.requestId), input.requestId);
  assert.equal(offlinePaymentRequestId("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  for (const value of [null, 1, "", "receipt-1", "a".repeat(10000)]) assert.equal(offlinePaymentRequestId(value), null);
});

test("offline receipt dates never silently default to a different retry time", () => {
  for (const value of [null, undefined, "", "not-a-date", 123]) assert.equal(offlinePaymentPaidAt(value), null);
  assert.equal(offlinePaymentPaidAt("2026-10-13T12:00:00Z")?.toISOString(), "2026-10-13T12:00:00.000Z");
});

test("request receipt keys separate legitimate identical payments, and families", () => {
  const original = offlinePaymentRequestIdentity(input);
  assert.deepEqual(offlinePaymentRequestIdentity(input), original);
  for (const changes of [
    { requestId: "00000000-0000-4000-8000-000000000002" },
    { billingAccountId: "other-account" },
  ]) assert.notEqual(offlinePaymentRequestIdentity({ ...input, ...changes }).externalId, original.externalId);
});

test("reusing a request with changed receipt details keeps key but changes fingerprint", () => {
  const original = offlinePaymentRequestIdentity(input);
  for (const changes of [
    { method: "check" as const }, { amountCents: 5_000 }, { paidAt: new Date("2026-10-14T12:00:00Z") },
    { reference: "different" }, { description: "different" }, { notes: "different" },
  ]) {
    const changed = offlinePaymentRequestIdentity({ ...input, ...changes });
    assert.equal(changed.externalId, original.externalId);
    assert.notEqual(changed.fingerprint, original.fingerprint);
  }
});

test("client preserves pending request identity and rotates only after a successful receipt", () => {
  const ui = readFileSync("src/components/billing-workbench.tsx", "utf8");
  assert.match(ui, /getOrCreateOfflinePaymentOperation\(window\.sessionStorage, offlineOperationScope\(selectedFamilyId\)\)/);
  assert.equal((ui.match(/if \(!completeOfflineOperation\(payload, json\)\) return/g) ?? []).length, 2);
  assert.equal((ui.match(/const requestId = offlinePaymentRequestIdFor\(selectedFamily\.id\)/g) ?? []).length, 2);
  assert.match(readFileSync("src/app/[slug]/page.tsx", "utf8"), /currentUserId: user\.id/);
  assert.match(ui, /No duplicate payment was posted/);
});

test("each handler locks the account before cross-method replay lookup and writes", () => {
  const route = readFileSync("src/app/api/billing/invoices/route.ts", "utf8");
  for (const [start, end] of [["async function createManualCheckPayment", "async function createManualCashPayment"], ["async function createManualCashPayment", "class PayrollReferenceConflictError"]]) {
    const handler = route.slice(route.indexOf(start), route.indexOf(end));
    const lock = handler.indexOf("FOR UPDATE");
    const replay = handler.indexOf("await offlinePaymentReplay");
    const write = handler.indexOf("await tx.payment.create");
    assert.ok(lock > 0 && lock < replay && replay < write);
    assert.match(handler.slice(replay, write), /if \(replay\) return replay/);
  }
  assert.match(route, /sourceSystem: \{ in: \["bee_suite_manual_cash", "bee_suite_manual_check"\] \}/);
});

test("receipt recovery preserves authorization and has no mutation or provider action", () => {
  const route = readFileSync("src/app/api/billing/invoices/route.ts", "utf8");
  const recovery = route.slice(route.indexOf("async function recoverOfflinePaymentReceipt"), route.indexOf("async function createManualCheckPayment"));
  assert.ok(recovery.indexOf("assertFamilyAccess") < recovery.indexOf("prisma.billingAccount.findUnique"));
  assert.doesNotMatch(recovery, /\.(?:create|upsert|update|delete|charge)\(/);
  const post = route.slice(route.indexOf("async function POSTHandler"), route.indexOf("async function PATCHHandler"));
  assert.ok(post.indexOf("canManageBilling(user)") < post.indexOf('mode === "offlinePaymentReceipt"'));
  assert.match(post, /mode === "offlinePaymentReceipt"\) return recoverOfflinePaymentReceipt/);
});
