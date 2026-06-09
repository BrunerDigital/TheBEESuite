import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeRegistrationPaymentPlan,
  registrationInvoiceExternalId,
  registrationInvoiceNumber,
  registrationPaymentFromData,
} from "../src/lib/registration-billing";

test("registration payment plan reads school fee and deposit cents", () => {
  const plan = normalizeRegistrationPaymentPlan({
    customFields: {
      registrationFeeCents: 10_000,
      registrationDepositCents: "25000",
    },
  });

  assert.equal(plan.registrationFeeCents, 10_000);
  assert.equal(plan.depositCents, 25_000);
  assert.equal(plan.totalCents, 35_000);
  assert.equal(plan.required, true);
  assert.equal(plan.label, "$100.00 registration fee + $250.00 deposit");
});

test("registration payment plan supports dollar-style configuration fallbacks", () => {
  const plan = normalizeRegistrationPaymentPlan({
    customFields: {
      registrationPaymentPlan: {
        registrationFee: "$75",
        deposit: "150.50",
      },
    },
  });

  assert.equal(plan.registrationFeeCents, 7_500);
  assert.equal(plan.depositCents, 15_050);
  assert.equal(plan.totalCents, 22_550);
});

test("registration payment helpers create stable ids and read status from submission data", () => {
  assert.equal(registrationInvoiceExternalId("sub_123"), "registration-fee-deposit:sub_123");
  assert.equal(registrationInvoiceNumber("cmabcdef1234567890"), "REG-1234567890");

  const payment = registrationPaymentFromData({
    registrationPayment: {
      invoiceId: "inv_1",
      invoiceNumber: "REG-123",
      totalCents: 35_000,
      registrationFeeCents: 10_000,
      depositCents: 25_000,
    },
  });

  assert.equal(payment.required, true);
  assert.equal(payment.status, "invoice_open");
  assert.equal(payment.invoiceNumber, "REG-123");
});
