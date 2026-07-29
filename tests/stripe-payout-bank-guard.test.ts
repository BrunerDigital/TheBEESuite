import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("school payout UI clearly separates payout banks from software-fee methods", () => {
  const panel = fs.readFileSync(path.join(root, "src/components/stripe-connect-panel.tsx"), "utf8");

  assert.match(panel, /BEE Suite fee method \(not payouts\)/);
  assert.match(panel, /Connect payout bank/);
  assert.match(panel, /Available after payout bank/);
  assert.match(panel, /!hasConfirmedPayoutBank/);
});

test("software-fee ACH cannot start before the payout destination is confirmed", () => {
  const route = fs.readFileSync(
    path.join(root, "src/app/api/billing/software-payment-method/route.ts"),
    "utf8",
  );

  assert.match(route, /paymentMethodCategory === "ach" && !clean\(fields\.stripePayoutBankLast4\)/);
  assert.match(route, /Software-fee authorization is separate from the payout destination/);
  assert.match(route, /\{ status: 409 \}/);
});
