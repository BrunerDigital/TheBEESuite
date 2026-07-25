import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("parent payment surfaces present debit and credit cards before bank options", () => {
  const portal = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const requestForm = readFileSync("src/components/payment-method-request-form.tsx", "utf8");
  const invitation = readFileSync("src/lib/parent-portal-invitations.ts", "utf8");
  const requestCopy = readFileSync("src/lib/payment-method-request-forms.ts", "utf8");

  assert.ok(
    portal.indexOf('managePaymentMethod("setup", "card")')
      < portal.indexOf('managePaymentMethod("setup", "link_bank")'),
  );
  assert.ok(
    portal.indexOf('payBalance("card")')
      < portal.indexOf('payBalance("link_bank")'),
  );
  assert.ok(
    portal.indexOf('buyUniform("card")')
      < portal.indexOf('buyUniform("link_bank")'),
  );
  assert.ok(
    requestForm.indexOf('startPayment(nextOpenInvoice.id, "card")')
      < requestForm.indexOf('startPayment(nextOpenInvoice.id, "link_bank")'),
  );
  assert.match(invitation, /pay by debit\/credit card or bank account/i);
  assert.match(requestCopy, /pay an open invoice by debit\/credit card/i);
});

test("payment-request setup defaults to card when no method was supplied", () => {
  const route = readFileSync(
    "src/app/api/billing/payment-method-request/session/route.ts",
    "utf8",
  );

  assert.match(
    route,
    /function paymentMethodCategoryFrom[\s\S]*return "card";/,
  );
});
