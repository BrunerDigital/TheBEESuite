import type { CurrentUser } from "../../src/lib/auth";
import type { SchoolPaymentLocalRow } from "../../src/lib/school-payments-readonly-adapter";
import type { SchoolPaymentsReadAuthority } from "../../src/lib/school-payments-readonly-server";
import { schoolPaymentsFixture } from "./school-payments-fixtures";

export const paymentsDirector = { id: "fixture_director", tenantId: "tenant_a", identityTenantId: "tenant_identity", role: "CENTER_DIRECTOR", accessScope: "center",
  centerIds: ["school_a", "school_b"], deviceSessionId: "fixture_session", sessionVersion: 2, mustResetPassword: false } as CurrentUser;
export function paymentsAuthority(centerId = "school_a"): SchoolPaymentsReadAuthority {
  return { scope: schoolPaymentsFixture(centerId).scope, historyBindings: [], revision: "fixture_binding_v1" };
}
export function paymentsLocalRow(id = "fixture_payment_1001", centerId = "school_a"): SchoolPaymentLocalRow {
  return { id, amountCents: 10000, status: "PAID", provider: "stripe", paidAt: new Date("2026-11-20T12:00:00Z"),
    customFields: { stripeConnectedAccountId: `acct_${centerId}`, stripeChargeType: "direct", stripeCheckoutSessionStatus: "complete" },
    billingAccount: { family: { centerId } },
    ledgerEntries: [{ id: "fixture_ledger_payment", type: "payment", amountCents: -10000, createdAt: new Date("2026-11-20T12:01:00Z") }] };
}
export function paymentsProviderFixture(centerId = "school_a") {
  const calls: string[] = [];
  return { calls, providers: {
    local: async () => { calls.push("local"); return [paymentsLocalRow("fixture_payment_1001", centerId)]; },
    balanceTransactions: async () => { calls.push("transactions"); return { ok: true, hasMore: false, pageComplete: true,
      rows: [{ id: "txn_fixture_1", type: "charge", currency: "usd", amountCents: 10000, netCents: 9700, feeCents: 300, sourceId: "ch_fixture_1", createdAt: "2026-11-20T12:00:00Z", availableOn: "2026-11-23T12:00:00Z" }] }; },
    payouts: async () => { calls.push("payouts"); return { ok: true, hasMore: false, pageComplete: true,
      rows: [{ id: "po_fixture_1234", currency: "usd", amountCents: 9700, status: "paid", createdAt: "2026-11-21T12:00:00Z", arrivalDate: "2026-11-23T12:00:00Z", failureCode: null }] }; },
  } };
}
