import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PaymentStatus } from "@prisma/client";
import { mergeParentAccountPaymentBlockers, parentActivePaymentSummary, parentPaymentStatus, parentPaymentStatusMessage, parentPaymentStatusTitle } from "../src/lib/parent-payment-status";
import { provisionalAchCreditCents } from "../src/lib/ach-payment-lifecycle";
import { stripePaymentClaimConflict } from "../src/lib/stripe-payment-claims";
import { stripePaymentClaimConflict as pureConflict } from "../src/lib/stripe-payment-claim-conflict";

const draft = (status: string, fields: Record<string, unknown> = {}, provider = "stripe") => ({
  id: "fake-payment", amountCents: 5000, status: PaymentStatus.DRAFT, provider,
  customFields: { status, invoiceId: "fake-invoice", paymentMethodCategory: "ach", ...fields },
});

for (const status of ["checkout_submission_unknown", "autopay_submission_unknown", "stored_method_submission_unknown", "director_saved_method_submission_unknown", "terminal_submission_unknown", "terminal_reader_submission_unknown"]) {
  test(`${status} is visible without credit or a paid label`, () => {
    const payment = draft(status, status.startsWith("director") ? { paymentScope: "family_balance" } : {}, status.startsWith("terminal") ? "stripe_terminal" : "stripe");
    const summary = parentPaymentStatus([payment]);
    assert.equal(summary.accountPaymentBlocker?.phase, "confirmation_unknown");
    assert.equal(summary.accountPaymentBlocker?.count, 1); assert.equal(provisionalAchCreditCents([payment]), 0);
    assert.equal(parentPaymentStatusTitle(summary.accountPaymentBlocker!), "Payment confirmation pending");
    assert.doesNotMatch(parentPaymentStatusMessage(summary.accountPaymentBlocker!), /paid|provisionally credited/i);
  });
}

test("unknown takes deterministic precedence without exposing metadata, credentials, URLs or provider IDs", () => {
  const a = draft("paid_processing", { stripePaymentIntentStatus: "processing" }); a.id = "fake-ach";
  const b = draft("checkout_submission_unknown", { token: "fake-token", url: "https://example.test/private", stripePaymentIntentId: "pi_private" }); b.id = "fake-unknown";
  const first = parentPaymentStatus([a, b]), second = parentPaymentStatus([b, a]);
  assert.deepEqual(first, second); assert.deepEqual(first.accountPaymentBlocker, { phase: "confirmation_unknown", method: "ach", count: 2, blocksInvoicePayments: false });
  assert.deepEqual(first.byInvoiceId.get("fake-invoice"), { phase: "confirmation_unknown", method: "ach" });
  assert.doesNotMatch(JSON.stringify([first.accountPaymentBlocker, [...first.byInvoiceId.values()]]), /private|token|https|fake-unknown|customFields|stripe/i);
});

test("confirmed ACH alone receives provisional credit and processing label", () => {
  for (const status of ["paid_processing", "checkout_pending", "autopay_processing", "stored_method_processing"]) {
    const row = draft(status, { stripePaymentIntentStatus: "processing" });
    const summary = parentPaymentStatus([row]); assert.equal(summary.accountPaymentBlocker?.phase, "ach_processing");
    assert.equal(provisionalAchCreditCents([row]), 5000); assert.equal(parentPaymentStatusTitle(summary.accountPaymentBlocker!), "Paid — processing");
    assert.equal(parentPaymentStatusTitle(summary.accountPaymentBlocker!, "account"), "ACH payment processing");
  }
  const pending = draft("checkout_pending"); assert.equal(parentPaymentStatus([pending]).accountPaymentBlocker?.phase, "payment_pending");
  assert.equal(provisionalAchCreditCents([pending]), 0);
});

test("Terminal attempts block balance and exact invoice without claiming bank settlement", () => {
  const row = draft("terminal_processing", {}, "stripe_terminal"), status = parentPaymentStatus([row]);
  assert.deepEqual(status.accountPaymentBlocker, { phase: "payment_pending", method: "card_present", count: 1, blocksInvoicePayments: false });
  assert.deepEqual([...status.byInvoiceId.keys()], ["fake-invoice"]); assert.equal(provisionalAchCreditCents([row]), 0);
});

test("complete account scope sees old/nonvisible invoice and family-only attempts", () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ ...draft("checkout_failed"), id: `fake-${i}` }));
  rows.push({ ...draft("checkout_created", { invoiceId: "fake-hidden", stripeCheckoutSessionExpiresAt: "2000-01-01" }), id: "fake-hidden-payment" });
  const result = parentPaymentStatus(rows); assert.equal(result.accountPaymentBlocker?.count, 1);
  assert.equal(result.byInvoiceId.has("fake-hidden"), true); assert.equal(result.byInvoiceId.has("fake-unrelated"), false);
  const family = parentPaymentStatus([draft("checkout_created", { invoiceId: null, paymentScope: "family_balance" })]);
  assert.equal(family.accountPaymentBlocker?.blocksInvoicePayments, true); assert.equal(family.byInvoiceId.size, 0);
});

test("family attempts pause invoice requests separately without labeling unrelated invoices paid", () => {
  const family = parentPaymentStatus([draft("paid_processing", { paymentScope: "family_balance", stripePaymentIntentStatus: "processing" })]);
  assert.equal(family.accountPaymentBlocker?.blocksInvoicePayments, true); assert.equal(family.byInvoiceId.size, 0);
});

test("settled, failed, void, stale terminal and manual drafts never block based only on raw DRAFT count", () => {
  const rows: Array<Omit<ReturnType<typeof draft>, "status"> & { status: PaymentStatus }> = [PaymentStatus.PAID, PaymentStatus.FAILED, PaymentStatus.VOID].map(status => ({ ...draft("checkout_created"), status }));
  rows.push(draft("terminal_failed", {}, "stripe_terminal"), draft("checkout_created", {}, "manual"), draft("checkout_failed"));
  assert.equal(parentPaymentStatus(rows).accountPaymentBlocker, null); assert.equal(parentPaymentStatus(rows).byInvoiceId.size, 0);
});

test("unknown payment methods are not echoed and all payment flows share the same conflict function", () => {
  const result = parentPaymentStatus([draft("checkout_created", { paymentMethodCategory: "private value" })]);
  assert.equal(result.accountPaymentBlocker?.method, null); assert.equal(stripePaymentClaimConflict, pureConflict);
});

test("unattributed active provider claims fail closed for every collection scope without labeling an invoice", () => {
  for (const [provider, status] of [["stripe", "checkout_created"], ["stripe", "checkout_submission_unknown"], ["stripe", "autopay_processing"], ["stripe", "stored_method_submission_unknown"], ["stripe", "director_saved_method_processing"], ["stripe_terminal", "terminal_processing"]]) {
    for (const invoiceId of [undefined, null, "", "   ", {}, ["fake-invoice"]]) {
      const payment = draft(status, { invoiceId }, provider);
      const expected = status.startsWith("director_saved_method_") ? "active_family_balance" : "active_unattributed_payment";
      assert.equal(pureConflict({ scope: "family_balance", payment }), expected);
      assert.equal(pureConflict({ scope: "invoice_collection", invoiceId: "new-fake-invoice", payment }), expected);
      const summary = parentPaymentStatus([payment]); assert.equal(summary.accountPaymentBlocker?.blocksInvoicePayments, true);
      assert.equal(summary.byInvoiceId.size, 0);
    }
  }
  for (const provider of ["manual", "stripe"]) assert.equal(parentPaymentStatus([draft("checkout_failed", { invoiceId: null }, provider)]).accountPaymentBlocker, null);
});

test("visible processing rows use the same safe phase as account notices", () => {
  for (const status of ["autopay_processing", "stored_method_processing", "director_saved_method_processing"]) {
    const payment = draft(status, { paymentScope: status.startsWith("director") ? "family_balance" : "invoice", paymentMethodCategory: "card" });
    const active = parentActivePaymentSummary(payment); assert.equal(active?.phase, "payment_pending");
    assert.equal(parentPaymentStatusTitle(active!), "Payment in progress");
  }
});

test("explicit family scope wins over stale invoice metadata for every active provider lifecycle", () => {
  for (const status of ["checkout_created", "autopay_processing", "stored_method_submission_unknown", "director_saved_method_processing"]) {
    const family = draft(status, { paymentScope: "family_balance", invoiceId: "fake-invoice" });
    for (const scope of ["family_balance", "invoice_collection"] as const) assert.equal(pureConflict({ scope, invoiceId: "unrelated-invoice", payment: family }), "active_family_balance");
    const summary = parentPaymentStatus([family]); assert.equal(summary.accountPaymentBlocker?.blocksInvoicePayments, true); assert.equal(summary.byInvoiceId.size, 0);
  }
  for (const status of ["director_saved_method_pending", "director_saved_method_processing", "director_saved_method_succeeded_pending_webhook", "director_saved_method_submission_unknown"]) {
    const legacyFamily = draft(status);
    for (const invoiceId of ["fake-invoice", "unrelated"]) assert.equal(pureConflict({ scope: "invoice_collection", invoiceId, payment: legacyFamily }), "active_family_balance");
    assert.equal(parentPaymentStatus([legacyFamily]).byInvoiceId.size, 0);
  }
  for (const status of ["checkout_created", "autopay_processing", "stored_method_submission_unknown"]) {
    const invoice = draft(status);
    assert.equal(pureConflict({ scope: "invoice_collection", invoiceId: "fake-invoice", payment: invoice }), "active_invoice_payment");
    assert.equal(pureConflict({ scope: "invoice_collection", invoiceId: "unrelated", payment: invoice }), null);
  }
});

test("concurrent status observations union scope and retain conservative phase and maximum count", () => {
  const invoice = { phase: "confirmation_unknown" as const, method: "card" as const, count: 2, blocksInvoicePayments: false };
  const family = { phase: "ach_processing" as const, method: "ach" as const, count: 1, blocksInvoicePayments: true };
  for (const inputs of [[invoice, family], [family, invoice]]) assert.deepEqual(mergeParentAccountPaymentBlockers(inputs), { ...invoice, blocksInvoicePayments: true });
  assert.match(parentPaymentStatusMessage({ ...invoice, blocksInvoicePayments: true }, "account"), /balance and invoice payments are paused/);
  assert.match(parentPaymentStatusMessage(invoice, "account"), /New balance payments are paused/);
});

test("parent query uses complete already-linked Stripe/Terminal drafts with no JSON-status or recent-row cap", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const start = page.indexOf("const [billingAccount, activeParentPaymentRows,");
  const query = page.slice(page.indexOf("prisma.payment.findMany({", start), page.indexOf("prisma.ledgerEntry.findFirst({", start));
  assert.match(query, /billingAccount: \{ familyId \}/); assert.match(query, /provider: \{ in: \["stripe", "stripe_terminal"\] \}/);
  assert.match(query, /status: PaymentStatus.DRAFT/); assert.doesNotMatch(query, /\b(?:take|skip|OR):|path: \["status"\]/);
  assert.match(page, /parentPaymentStatus\(activeParentPaymentRows\)/); assert.match(page, /provisionalAchCreditCents\(activeParentPaymentRows\)/);
  assert.match(page, /pendingCount: billingAccount\?\._count.payments/);
});

test("balance action and product action enforce the correct scopes, status refresh cannot submit", () => {
  const ui = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const family = ui.slice(ui.indexOf("function payFamilyBalance"), ui.indexOf("function payBalance"));
  const product = ui.slice(ui.indexOf("function payProductInvoice"), ui.indexOf("function selectUniformColor"));
  assert.ok(family.indexOf("if (accountPaymentBlocker)") < family.indexOf("parentPortalRequest"));
  const productGuard = product.indexOf("if (invoicePaymentBlocked(invoiceId))");
  assert.ok(productGuard >= 0 && productGuard < product.indexOf("parentPortalRequest"));
  assert.match(ui, /accountPaymentDisabled =\s*Boolean\(accountPaymentBlocker\)/);
  assert.match(ui, /onClick=\{\(\) => void paymentRecovery.refresh\(\)\}/);
  assert.match(ui, /paymentRecovery.isRefreshing \? "Refreshing status…" : "Refresh payment status"/);
  assert.doesNotMatch(ui, /!nextOpenInvoice && firstPendingOpenInvoice|Complete or expire it/);
});
