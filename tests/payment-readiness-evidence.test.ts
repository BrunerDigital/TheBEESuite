import assert from "node:assert/strict";
import test from "node:test";
import { fullyVoidedTuitionChargeIds } from "../src/lib/payment-readiness-evidence";
import { tuitionInvoiceItems } from "../src/lib/tuition-credits";

function invoice() {
  return { id: "invoice", status: "VOID", ledgerEntries: [
    { id: "charge", billingAccountId: "account", invoiceId: "invoice", paymentId: null as string | null, type: "tuition_charge", amountCents: 27800, sourceSystem: "bee_suite" },
    { id: "void", billingAccountId: "account", invoiceId: "invoice", paymentId: null as string | null, type: "invoice_void", amountCents: -27800, sourceSystem: "bee_suite_manual" },
  ] };
}

test("fully voided tuition has no remaining positive contribution to an opening balance", () => {
  assert.deepEqual([...fullyVoidedTuitionChargeIds("account", [invoice()])], ["charge"]);
});

test("partial, over-reversed and unvoided invoices require evidence review", () => {
  for (const reversal of [-20000, -30000, 27800]) {
    const candidate = invoice(); candidate.ledgerEntries[1].amountCents = reversal;
    assert.equal(fullyVoidedTuitionChargeIds("account", [candidate]).size, 0);
  }
  const candidate = invoice(); candidate.status = "OPEN";
  assert.equal(fullyVoidedTuitionChargeIds("account", [candidate]).size, 0);
});

test("unrelated accounts, invoices and payments cannot cancel audit evidence", () => {
  for (const field of ["billingAccountId", "invoiceId", "paymentId"] as const) {
    const candidate = invoice(); candidate.ledgerEntries[1][field] = "unrelated";
    assert.equal(fullyVoidedTuitionChargeIds("account", [candidate]).size, 0);
  }
});

test("manual debits and generic credits remain reviewable even when amounts cancel", () => {
  const manual = invoice(); manual.ledgerEntries[0].type = "debit"; manual.ledgerEntries[0].sourceSystem = "bee_suite_manual";
  assert.equal(fullyVoidedTuitionChargeIds("account", [manual]).size, 0);
  const credit = invoice(); credit.ledgerEntries[1].type = "credit";
  assert.equal(fullyVoidedTuitionChargeIds("account", [credit]).size, 0);
});

test("extra linked history, duplicate IDs and incomplete reversals fail closed", () => {
  const extra = invoice(); extra.ledgerEntries.push({ ...extra.ledgerEntries[0], id: "other", type: "adjustment", amountCents: 0 });
  assert.equal(fullyVoidedTuitionChargeIds("account", [extra]).size, 0);
  const duplicate = invoice(); duplicate.ledgerEntries[1].id = "charge";
  assert.equal(fullyVoidedTuitionChargeIds("account", [duplicate]).size, 0);
  const incomplete = invoice(); incomplete.ledgerEntries.pop();
  assert.equal(fullyVoidedTuitionChargeIds("account", [incomplete]).size, 0);
});

test("multiple tuition lines require one exact whole-invoice reversal", () => {
  const candidate = invoice(); candidate.ledgerEntries.push({ ...candidate.ledgerEntries[0], id: "second", amountCents: 100 });
  candidate.ledgerEntries[1].amountCents = -27900;
  assert.deepEqual([...fullyVoidedTuitionChargeIds("account", [candidate])], ["charge", "second"]);
});

test("discounted tuition uses recognized credit lines in the exact reversal proof", () => {
  const candidate = invoice();
  const items = tuitionInvoiceItems({ description: "Tuition", grossAmountCents: 27800, credits: [{ category: "family_discount", amountCents: 2800 }] });
  candidate.ledgerEntries = items.map((item, index) => ({ ...candidate.ledgerEntries[0], id: `line-${index}`, type: item.ledgerType, amountCents: item.amountCents }));
  candidate.ledgerEntries.push({ ...invoice().ledgerEntries[1], amountCents: -25000 });
  assert.deepEqual([...fullyVoidedTuitionChargeIds("account", [candidate])], ["line-0"]);
  candidate.ledgerEntries[1].sourceSystem = "bee_suite_manual";
  assert.equal(fullyVoidedTuitionChargeIds("account", [candidate]).size, 0);
  candidate.ledgerEntries[1].sourceSystem = "bee_suite";
  candidate.ledgerEntries[1].amountCents = 2800;
  candidate.ledgerEntries[2].amountCents = -30600;
  assert.equal(fullyVoidedTuitionChargeIds("account", [candidate]).size, 0);
});
