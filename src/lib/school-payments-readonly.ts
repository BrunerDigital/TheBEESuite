export const SCHOOL_PAYMENTS_READ_FEATURES = ["payment_status", "balances", "payout_history", "deposit_reconciliation"] as const;
type Bound = { tenantId: string; centerId: string; accountId: string };
export type SchoolPaymentsSourceCoverage = {
  source: "bee_payments" | "bee_refund_ledger" | "stripe_balance_transactions" | "stripe_payouts" | "stripe_balance" | "account_history";
  availability: "complete" | "partial" | "unavailable"; count: number;
  reason: "exhausted" | "local_limit" | "ledger_limit" | "missing_account_provenance" | "undated_checkouts" | "provider_has_more" | "pagination_unknown" | "incomplete_evidence" | "read_unavailable" | "refund_event_time_missing" | "adapter_pending" | "history_not_authorized";
};
export type SchoolPaymentHistoryBinding = Bound & { bindingId: string; verified: boolean; source: "authoritative_center_account_history" };
export type SchoolPaymentReadScope = Bound & { schoolName: string; accountVerified: boolean;
  dashboard: "full" | "express" | "none" | "unknown"; chargeTopology: "connected_direct" | "platform_destination" | "unknown";
  readCapabilities: { paymentStatus: boolean; balances: boolean; payouts: boolean } };
export type SchoolPaymentsReadInput = {
  scope: SchoolPaymentReadScope;
  historyBindings: SchoolPaymentHistoryBinding[];
  availability: { payments: "complete" | "partial" | "unavailable"; balances: "complete" | "partial" | "unavailable"; payouts: "complete" | "partial" | "unavailable"; history: "complete" | "partial" | "unavailable" };
  // These are projected, existing BEE ledger records, never a second ledger.
  payments: Array<Bound & { id: string; reference: string; amountCents: number; currency: string;
    collection: "captured" | "not_collected" | "pending" | "unavailable"; allocation: "allocated" | "not_allocated" | "unavailable";
    checkout: "completed" | "expired" | "open" | "unavailable"; display: "current" | "refresh_pending";
    collectedAt?: string | null; collectionInWindow?: boolean }>;
  evidence?: { window: { start: string; end: string; timezone: "UTC" }; sources: SchoolPaymentsSourceCoverage[];
    comparison: "not_comparable";
    refunds: Array<Bound & { reference: string; amountCents: number; currency: string; collectedAt: string | null; ledgerRecordedAt: string; providerEventAt: null }> };
  balances: Array<Bound & { currency: string; availableCents: number; pendingCents: number }>;
  payouts: Array<Bound & { id: string; amountCents: number; currency: string; status: "paid" | "pending" | "in_transit" | "failed" | "canceled"; arrivalDate: string;
    ledger: (Bound & { payoutId: string; netCents: number; currency: string }) | null;
    depositEvidence: (Bound & { payoutId: string; amountCents: number; currency: string; reference: string;
      source: "bank_posting" | "processor_trace"; postingStatus: "posted" | "pending" | "reversed" | "unavailable"; verified: boolean }) | null }>;
};
export type SchoolPaymentsReadView = ReturnType<typeof buildSchoolPaymentsReadView>;
function amount(value: number) { if (!Number.isSafeInteger(value)) throw Error("Invalid monetary amount"); return value; }
// First slice follows the existing USD tuition ledger. Other currencies require
// an approved minor-unit and reconciliation contract; no currency conversion.
function currency(value: string) { if (value !== "usd") throw Error("Unsupported currency for this Payments preview"); return value; }
export function buildSchoolPaymentsReadView(input: SchoolPaymentsReadInput) {
  const { scope } = input;
  if (!scope.tenantId || !scope.centerId || !/^acct_[A-Za-z0-9_]+$/.test(scope.accountId)) throw Error("School payment binding is unavailable");
  if (scope.accountVerified !== true || !["full", "express", "none"].includes(scope.dashboard) || scope.chargeTopology !== "connected_direct"
    || scope.readCapabilities.paymentStatus !== true || scope.readCapabilities.balances !== true || scope.readCapabilities.payouts !== true) throw Error("Account read capabilities require review");
  if (["payments", "balances", "payouts", "history"].some(k => !["complete", "partial", "unavailable"].includes(input.availability[k as keyof typeof input.availability]))) throw Error("Payment evidence availability is missing");
  const allowed = new Set([scope.accountId]);
  for (const binding of input.historyBindings) {
    if (binding.verified !== true || !binding.bindingId || binding.source !== "authoritative_center_account_history"
      || binding.tenantId !== scope.tenantId || binding.centerId !== scope.centerId || !/^acct_[A-Za-z0-9_]+$/.test(binding.accountId)) throw Error("Historical account binding requires review");
    allowed.add(binding.accountId);
  }
  for (const row of [...input.payments, ...input.balances, ...input.payouts, ...(input.evidence?.refunds ?? []), ...input.payouts.flatMap(p => [p.ledger, p.depositEvidence].filter((x): x is NonNullable<typeof x> => Boolean(x)))]) {
    if (row.tenantId !== scope.tenantId || row.centerId !== scope.centerId || !allowed.has(row.accountId)) throw Error("Payment data does not match the selected school account");
  }
  if (input.balances.some(b => b.accountId !== scope.accountId)) throw Error("Historical balances are outside the current account view");
  if (new Set(input.balances.map(x => x.currency)).size !== input.balances.length) throw Error("Duplicate currency balance");
  const origin = (id: string) => `${id === scope.accountId ? "Current" : "Prior"} account …${id.slice(-4)}`;
  return {
    centerId: scope.centerId, schoolName: scope.schoolName,
    // Explicit field projection; never forward secret/provider/recipient payloads.
    features: SCHOOL_PAYMENTS_READ_FEATURES,
    availability: { ...input.availability },
    evidence: input.evidence ? projectEvidence(input.evidence, origin) : null,
    payments: input.payments.map(p => {
      if (!["captured", "not_collected", "pending", "unavailable"].includes(p.collection) || !["allocated", "not_allocated", "unavailable"].includes(p.allocation)
        || !["completed", "expired", "open", "unavailable"].includes(p.checkout) || !["current", "refresh_pending"].includes(p.display)) throw Error("Payment lifecycle evidence is invalid");
      if (p.collection !== "captured" && p.allocation === "allocated") throw Error("Allocation evidence conflicts with collection status");
      return { id: p.id, reference: p.reference, amountCents: amount(p.amountCents), currency: currency(p.currency), originAccount: origin(p.accountId),
        collection: { captured: "Payment captured", not_collected: "No completed payment", pending: "Collection pending", unavailable: "Collection information unavailable" }[p.collection],
        allocation: { allocated: "Allocated to ledger", not_allocated: "Not allocated", unavailable: "Allocation information unavailable" }[p.allocation],
        checkout: p.checkout === "expired" ? "Checkout expired" : p.checkout === "completed" ? "Checkout completed" : p.checkout === "open" ? "Checkout open" : "Checkout information unavailable",
        display: p.display === "refresh_pending" ? "Display refresh pending" : "Display current",
        collectedAt: date(p.collectedAt ?? null), collectionInWindow: p.collectionInWindow ?? null };
    }),
    balances: input.balances.map(b => ({ currency: currency(b.currency), availableCents: amount(b.availableCents), pendingCents: amount(b.pendingCents) })),
    payouts: input.payouts.map((p, index) => {
      if ((p.ledger && p.ledger.payoutId !== p.id) || (p.depositEvidence && p.depositEvidence.payoutId !== p.id)) throw Error("Reconciliation evidence belongs to another payout");
      if ((p.ledger && p.ledger.accountId !== p.accountId) || (p.depositEvidence && p.depositEvidence.accountId !== p.accountId)) throw Error("Reconciliation evidence belongs to another account");
      const net = p.ledger ? amount(p.ledger.netCents) : null;
      const evidence = p.depositEvidence;
      const ccy = currency(p.currency), total = amount(p.amountCents);
      const ledgerMatches = net === total && p.ledger && currency(p.ledger.currency) === ccy;
      const posted = evidence?.source === "bank_posting" && evidence.verified === true && evidence.postingStatus === "posted";
      const depositMatches = Boolean(posted && currency(evidence.currency) === ccy && amount(evidence.amountCents) === total);
      return { rowKey: String(index), maskedId: `Payout …${p.id.slice(-4)}`, originAccount: origin(p.accountId), amountCents: total, currency: ccy, status: p.status, arrivalDate: p.arrivalDate,
        reconciliation: p.status === "paid" && ledgerMatches && depositMatches ? "matched" as const
          : posted && (!ledgerMatches || !depositMatches) ? "review" as const : "unconfirmed" as const,
        bankPosting: posted ? "Bank posting: Posted" : evidence?.source === "processor_trace" ? "Bank posting: Unconfirmed (processor trace only)"
          : evidence?.source === "bank_posting" && evidence.verified && evidence.postingStatus === "pending" ? "Bank posting: Pending"
            : evidence?.source === "bank_posting" && evidence.verified && evidence.postingStatus === "reversed" ? "Bank posting: Reversed" : "Bank posting: Unconfirmed" };
    }),
  };
}

function date(value: string | null) {
  if (value === null) return null;
  if (!Number.isFinite(Date.parse(value))) throw Error("Invalid payment evidence date");
  return new Date(value).toISOString();
}
function projectEvidence(e: NonNullable<SchoolPaymentsReadInput["evidence"]>, origin: (id: string) => string) {
  const reasons: Record<SchoolPaymentsSourceCoverage["reason"], string> = {
    exhausted: "All available records for this source and period were read", local_limit: "Additional payment records are outside this view",
    ledger_limit: "Additional ledger activity is outside this view", missing_account_provenance: "Records for other or unverified payment accounts are excluded",
    undated_checkouts: "Checkout states include undated drafts", provider_has_more: "More processor pages are available",
    pagination_unknown: "Processor pagination completeness is unknown", incomplete_evidence: "Some processor records have incomplete or unsupported evidence",
    read_unavailable: "Source read is unavailable", refund_event_time_missing: "Ledger recording time is available; processor refund event time is unavailable",
    adapter_pending: "Balance information is unavailable", history_not_authorized: "Previous-account information is unavailable",
  };
  const sources = ["bee_payments", "bee_refund_ledger", "stripe_balance_transactions", "stripe_payouts", "stripe_balance", "account_history"];
  if (e.comparison !== "not_comparable" || e.window.timezone !== "UTC" || !date(e.window.start) || !date(e.window.end)
    || Date.parse(e.window.start) > Date.parse(e.window.end) || new Set(e.sources.map(s => s.source)).size !== e.sources.length) throw Error("Invalid payment evidence window");
  return { window: { start: date(e.window.start)!, end: date(e.window.end)!, timezone: "UTC" }, comparison: "Not comparable: collection dates, ledger refund recording dates and processor event dates use different evidence. No difference or complete total is calculated.",
    sources: e.sources.map(s => {
      if (!sources.includes(s.source) || !["complete", "partial", "unavailable"].includes(s.availability) || !reasons[s.reason] || !Number.isSafeInteger(s.count) || s.count < 0
        || (s.availability === "complete" && s.reason !== "exhausted")) throw Error("Invalid source coverage");
      return { source: s.source, availability: s.availability, count: s.count, reason: reasons[s.reason] };
    }),
    refunds: e.refunds.map(r => {
      if (r.providerEventAt !== null) throw Error("Unverified processor refund time");
      return { reference: r.reference, amountCents: amount(r.amountCents), currency: currency(r.currency), originAccount: origin(r.accountId),
        collectedAt: date(r.collectedAt), ledgerRecordedAt: date(r.ledgerRecordedAt)!, providerEventAt: null };
    }) };
}
