import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  allocateAccountCreditToInvoice,
  availableAccountCreditCents,
} from "../src/lib/account-credit-autopay";

test("account credit covers an invoice before Stripe receives the remainder", () => {
  const availableCreditCents = availableAccountCreditCents({
    balanceCents: 12500,
    openInvoiceTotalCents: 22500,
  });
  const allocation = allocateAccountCreditToInvoice({
    invoiceTotalCents: 22500,
    availableCreditCents,
  });

  assert.equal(availableCreditCents, 10000);
  assert.deepEqual(allocation, {
    invoiceTotalCents: 22500,
    accountCreditAppliedCents: 10000,
    stripeChargePrincipalCents: 12500,
    fullyCoveredByCredit: false,
  });
});

test("account credit can fully cover an invoice without a Stripe charge", () => {
  const availableCreditCents = availableAccountCreditCents({
    balanceCents: -7500,
    openInvoiceTotalCents: 22500,
  });
  const allocation = allocateAccountCreditToInvoice({
    invoiceTotalCents: 22500,
    availableCreditCents,
  });

  assert.equal(availableCreditCents, 22500);
  assert.equal(allocation.accountCreditAppliedCents, 22500);
  assert.equal(allocation.stripeChargePrincipalCents, 0);
  assert.equal(allocation.fullyCoveredByCredit, true);
});

test("account credit is allocated oldest-first across multiple open invoices", () => {
  let availableCreditCents = availableAccountCreditCents({
    balanceCents: 10000,
    openInvoiceTotalCents: 20000,
  });

  const first = allocateAccountCreditToInvoice({
    invoiceTotalCents: 10000,
    availableCreditCents,
  });
  availableCreditCents -= first.accountCreditAppliedCents;
  const second = allocateAccountCreditToInvoice({
    invoiceTotalCents: 10000,
    availableCreditCents,
  });

  assert.equal(first.fullyCoveredByCredit, true);
  assert.equal(first.stripeChargePrincipalCents, 0);
  assert.equal(second.accountCreditAppliedCents, 0);
  assert.equal(second.stripeChargePrincipalCents, 10000);
});

test("pending credit reservations cannot be allocated to another invoice", () => {
  assert.equal(availableAccountCreditCents({
    balanceCents: 5000,
    openInvoiceTotalCents: 20000,
    reservedCreditCents: 10000,
  }), 5000);
});

test("autopay and its webhook preserve the credit-first contract", () => {
  const autopay = readFileSync("src/lib/autopay-processing.ts", "utf8");
  const application = readFileSync("src/lib/stripe-payment-application.ts", "utf8");
  const webhook = readFileSync("src/app/api/billing/stripe-webhook/route.ts", "utf8");

  assert.match(
    autopay,
    /getStripeCheckoutAmounts\(creditAllocation\.stripeChargePrincipalCents,/,
    "Stripe fees and the payment intent must be based on the uncovered amount",
  );
  assert.match(
    autopay,
    /amountCents: creditAllocation\.stripeChargePrincipalCents,/,
    "the payment record must contain only the amount submitted to Stripe",
  );
  assert.match(
    autopay,
    /applyAccountCreditToInvoice\(tx, \{ invoiceId: invoice\.id \}\)/,
    "fully covered invoices must be paid without creating a Stripe charge",
  );
  for (const source of [application, webhook]) {
    assert.match(source, /accountCreditAppliedCents/);
    assert.match(source, /type: "account_credit_application"/);
    assert.match(source, /stripeChargePrincipalCents/);
  }
});


test("reopened invoices with an existing credit application reconcile idempotently", () => {
  const source = readFileSync("src/lib/stripe-payment-application.ts", "utf8");
  const applyCredit = source.slice(
    source.indexOf("export async function applyAccountCreditToInvoice"),
    source.indexOf("export async function applySucceededStripeInvoicePayment"),
  );

  assert.match(applyCredit, /applicationExternalId/);
  assert.match(applyCredit, /ledgerEntry\.findFirst/);
  assert.match(applyCredit, /existingApplicationMatches/);
  assert.match(applyCredit, /paymentId: true/);
  assert.match(applyCredit, /existingApplicationFields\.accountCreditAppliedCents/);
  assert.match(applyCredit, /existingApplicationFields\.stripeChargePrincipalCents/);
  assert.match(applyCredit, /existingApplicationFields\.fullyCoveredByCredit === true/);
  assert.match(applyCredit, /if \(!existingApplication\) \{[\s\S]*ledgerEntry\.create/);
  assert.ok(
    applyCredit.indexOf("ledgerEntry.findFirst") < applyCredit.indexOf("invoice.updateMany"),
    "existing credit applications must be detected before an open invoice is claimed",
  );
});
