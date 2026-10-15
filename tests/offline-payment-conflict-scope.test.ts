import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../src/app/api/billing/invoices/route.ts", import.meta.url), "utf8");
function section(start: string, end: string) {
  const from = route.indexOf(start);
  const to = route.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return route.slice(from, to);
}

for (const [name, start, end] of [
  ["invoice void", "async function voidInvoice(", "async function separateInvoiceResponsibility("],
  ["responsibility separation", "async function separateInvoiceResponsibility(", "function moneyLabel("],
]) {
  test(name + " retains its baseline error-only conflict response", () => {
    const source = section(start, end);
    assert.match(source, /if \("error" in result\) return NextResponse.json\(\{ ok: false, error: result.error \}, \{ status: 409 \}\);/);
    assert.doesNotMatch(source, /result\.receipt|OfflinePaymentReceiptConflictError|OfflinePaymentRequestConflictError/);
  });
}

for (const [name, start, end] of [
  ["cash", "async function createManualCashPayment(", "class PayrollReferenceConflictError"],
  ["check", "async function createManualCheckPayment(", "async function createManualCashPayment("],
]) {
  test(name + " retains receipt-bearing offline-payment conflict recovery", () => {
    const source = section(start, end);
    assert.match(source, /error instanceof OfflinePaymentReceiptConflictError/);
    assert.match(source, /return \{ error: error.message, receipt: error.receipt \} as const/);
    assert.match(source, /return \{ error: error.message, receipt: null \} as const/);
    assert.match(source, /if \("error" in result\) return NextResponse.json\(\{ ok: false, error: result.error, receipt: result.receipt \}, \{ status: 409 \}\);/);
  });
}

