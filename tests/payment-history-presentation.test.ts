import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parentPaymentHistoryWhere, paymentRefundDetails } from "../src/lib/parent-payment-history";
import { directorPaymentProgress, directorPaymentProgressTitle } from "../src/lib/director-payment-progress";

function matches(where: Record<string, unknown>, payment: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Record<string, unknown>[]).some((part) => matches(part, payment));
    if (key === "NOT") return !matches(value as Record<string, unknown>, payment);
    if (key === "customFields") {
      const filter = value as { path: string[]; equals: unknown };
      const fields = payment.customFields as Record<string, unknown>;
      return filter.path.length === 1 && fields?.[filter.path[0]] === filter.equals;
    }
    if (value && typeof value === "object" && "in" in value) return (value.in as unknown[]).includes(payment[key]);
    return payment[key] === value;
  });
}

test("parent history retains completed, refunded, processing and returned payments without admitting agency rows", () => {
  for (const status of ["PAID", "REFUNDED"]) {
    assert.equal(matches(parentPaymentHistoryWhere, { provider: "stripe", status }), true);
    assert.equal(matches(parentPaymentHistoryWhere, { provider: "subsidy_agency", status }), false);
  }
  assert.equal(matches(parentPaymentHistoryWhere, { provider: "stripe", status: "DRAFT", customFields: { status: "paid_processing" } }), true);
  assert.equal(matches(parentPaymentHistoryWhere, { provider: "stripe", status: "FAILED", customFields: { status: "payment_returned" } }), true);
  assert.equal(matches(parentPaymentHistoryWhere, { provider: "stripe", status: "FAILED", customFields: { status: "checkout_failed" } }), false);
});

test("a partial refund keeps original payment and refunded amount separate", () => {
  const payment = { status: "PAID", amountCents: 10_000, customFields: { status: "partially_refunded", stripeAmountRefundedCents: 3_000 } };
  assert.deepEqual(paymentRefundDetails(payment), { label: "Partially refunded", refundedCents: 3_000 });
  assert.equal(payment.amountCents, 10_000);
});

test("full refunds and legacy refunds are labeled without inventing missing amounts", () => {
  assert.deepEqual(paymentRefundDetails({ status: "REFUNDED", customFields: { stripeAmountRefundedCents: 10_000 } }), { label: "Refunded", refundedCents: 10_000 });
  assert.deepEqual(paymentRefundDetails({ status: "REFUNDED" }), { label: "Refunded", refundedCents: null });
  for (const amount of [-100, Infinity, NaN, 1.5, "3000"]) {
    assert.deepEqual(paymentRefundDetails({ status: "REFUNDED", customFields: { stripeAmountRefundedCents: amount } }), { label: "Refunded", refundedCents: null });
  }
});

test("ordinary paid, failed, returned and pending rows are not mislabeled as refunds", () => {
  assert.equal(paymentRefundDetails({ status: "PAID" }), null);
  for (const status of ["FAILED", "DRAFT", "VOID"]) {
    assert.equal(paymentRefundDetails({ status, customFields: { stripeAmountRefundedCents: 500, status: "payment_returned" } }), null);
  }
});

const draft = (status: string, extra: Record<string, unknown> = {}, provider = "stripe") => ({
  id: `synthetic-${status}`, amountCents: 10_000, status: "DRAFT" as const, provider,
  customFields: { status, paymentScope: "family_balance", paymentMethodCategory: "ach", ...extra },
});

test("director distinguishes confirmed ACH processing from unsubmitted and unknown attempts", () => {
  for (const status of ["paid_processing", "director_saved_method_processing", "autopay_processing", "stored_method_processing"]) {
    const progress = directorPaymentProgress([draft(status, { stripePaymentIntentStatus: "processing" })]);
    assert.deepEqual(progress, { phase: "ach_processing", count: 1, provisionalAchCreditCents: 10_000 });
    assert.equal(directorPaymentProgressTitle(progress!), "ACH payment processing");
  }
  const pending = directorPaymentProgress([draft("checkout_created")]);
  assert.deepEqual(pending, { phase: "payment_pending", count: 1, provisionalAchCreditCents: 0 });
  assert.equal(directorPaymentProgressTitle(pending!), "Payment in progress");
  const unknown = directorPaymentProgress([draft("checkout_submission_unknown")]);
  assert.deepEqual(unknown, { phase: "confirmation_unknown", count: 1, provisionalAchCreditCents: 0 });
  assert.equal(directorPaymentProgressTitle(unknown!), "Payment confirmation pending");
});

test("mixed unknown and processing attempts credit only confirmed ACH, independent of recent history limits", () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ ...draft("checkout_failed"), id: `failed-${index}` }));
  rows.push(draft("paid_processing", { stripePaymentIntentStatus: "processing" }));
  rows.push(draft("director_saved_method_submission_unknown"));
  assert.deepEqual(directorPaymentProgress(rows), { phase: "confirmation_unknown", count: 2, provisionalAchCreditCents: 10_000 });
});

test("terminal and card processing have no provisional ACH credit; terminal unknown remains unconfirmed", () => {
  assert.deepEqual(directorPaymentProgress([draft("director_saved_method_processing", { paymentMethodCategory: "card", stripePaymentIntentStatus: "processing" })]), { phase: "payment_pending", count: 1, provisionalAchCreditCents: 0 });
  assert.deepEqual(directorPaymentProgress([draft("terminal_processing", {}, "stripe_terminal")]), { phase: "payment_pending", count: 1, provisionalAchCreditCents: 0 });
  assert.deepEqual(directorPaymentProgress([draft("terminal_submission_unknown", {}, "stripe_terminal")]), { phase: "confirmation_unknown", count: 1, provisionalAchCreditCents: 0 });
});

test("settled, refunded, failed, returned and void attempts do not remain pending or provisionally credited", () => {
  for (const status of ["PAID", "REFUNDED", "FAILED", "VOID"] as const) {
    assert.equal(directorPaymentProgress([{ ...draft("paid_processing", { stripePaymentIntentStatus: "processing" }), status }]), null);
  }
  assert.equal(directorPaymentProgress([draft("payment_returned")]), null);
});

test("presentation uses complete authorized drafts and leaves payment amounts and collection guards unchanged", () => {
  const page = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  const query = page.slice(page.indexOf("const workbenchDraftPayments ="), page.indexOf("const workbenchDraftPaymentsByAccount"));
  assert.match(query, /billingAccountId: \{ in: billingFamilies\.flatMap/);
  assert.match(query, /provider: \{ in: \["stripe", "stripe_terminal"\] \}/);
  assert.match(query, /status: PaymentStatus\.DRAFT/);
  assert.doesNotMatch(query, /\b(?:take|skip|OR):|customFields: \{ path/);
  assert.match(page, /paymentProgress: directorPaymentProgress\(workbenchDraftPaymentsByAccount\.get\(family\.billingAccount\.id\)/);
  assert.match(page, /where: parentPaymentHistoryWhere/);
  const portal = readFileSync(new URL("../src/components/parent-portal-workspace.tsx", import.meta.url), "utf8");
  assert.equal((portal.match(/const credited = \(completed && !refund\) \|\| provisionallyCredited/g) ?? []).length, 2);
  assert.equal((portal.match(/Original payment<\/span>/g) ?? []).length, 2);
  assert.equal((portal.match(/View \/ print original receipt/g) ?? []).length, 2);
  assert.match(portal, /if \(isReturnedStripePayment\(payment\)\)[\s\S]*const refund = paymentRefundDetails/);
  const workbench = readFileSync(new URL("../src/components/billing-workbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /Selected ledger balance/);
  assert.match(workbench, /Checkout verifies the collectible family amount/);
  assert.match(workbench, /selectedPaymentProgress\.provisionalAchCreditCents/);
  assert.match(workbench, /const familyBalanceCents = selectedFamily\?\.billingAccount\?\.balanceCents \?\? 0/);
});
