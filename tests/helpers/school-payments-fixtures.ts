import type { SchoolPaymentsReadInput } from "../../src/lib/school-payments-readonly";
export function schoolPaymentsFixture(id = "school_a"): SchoolPaymentsReadInput {
  const bound = { tenantId: "tenant_a", centerId: id, accountId: `acct_${id}` };
  return { scope: { ...bound, schoolName: id === "school_a" ? "Fixture School Alpha" : "Fixture School Beta", accountVerified: true,
      dashboard: "full", chargeTopology: "connected_direct", readCapabilities: { paymentStatus: true, balances: true, payouts: true } },
    historyBindings: [], availability: { payments: "complete", balances: "complete", payouts: "complete", history: "unavailable" },
    payments: [{ ...bound, id: "payment_1", reference: id === "school_a" ? "Invoice A-104" : "Invoice B-208", amountCents: 35000, currency: "usd", collection: "captured", allocation: "allocated", checkout: "completed", display: "current" }],
    balances: [{ ...bound, currency: "usd", availableCents: 120000, pendingCents: 35000 }],
    payouts: [{ ...bound, id: "payout_1", amountCents: 97000, currency: "usd", status: "paid", arrivalDate: "2026-11-23",
      ledger: { ...bound, payoutId: "payout_1", netCents: 97000, currency: "usd" }, depositEvidence: null }] };
}
