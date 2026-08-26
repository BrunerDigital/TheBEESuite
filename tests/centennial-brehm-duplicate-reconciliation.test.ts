import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../scripts/reconcile-centennial-brehm-duplicate.ts", import.meta.url), "utf8");

test("Centennial Brehm reconciliation is exact, guarded, and preserves payment and consent history", () => {
  assert.match(source, /DUPLICATE_FAMILY_ID = "cms7g6luu004cl704amixz8oa"/);
  assert.match(source, /CURRENT_FAMILY_ID = "cms3lo8ks02ia6avwq3o6zppl"/);
  assert.match(source, /INVOICE_ID = "cmsg8sn73000djm04axfkdxd7"/);
  assert.match(source, /INVOICE_CENTS = 45_200/);
  assert.match(source, /--confirm-centennial-brehm-duplicate/);
  assert.match(source, /confirmFingerprint === plan\.sourceFingerprint/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /duplicate\.billingAccount\.invoices\.length === 1/);
  assert.match(source, /entry\.invoiceId === INVOICE_ID && entry\.paymentId === null/);
  assert.match(source, /reduce\(\(sum, entry\) => sum \+ entry\.amountCents, 0\) === INVOICE_CENTS/);
  assert.match(source, /type: "invoice_void"/);
  assert.match(source, /amountCents: -INVOICE_CENTS/);
  assert.match(source, /balanceAfterCents: 0/);
  assert.match(source, /explicitAutopayConsentPreserved: true/);
  assert.match(source, /paymentsMutated: 0/);
  assert.doesNotMatch(source, /payment\.delete|ledgerEntry\.delete|family\.delete|guardian\.delete/);
});
