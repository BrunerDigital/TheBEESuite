import type { Prisma } from "@prisma/client";
import type { StripeBalanceTransactionSnapshot, StripePayoutSnapshot } from "./integrations";
import type { SchoolPaymentsReadAuthority } from "./school-payments-readonly-server";
import type { SchoolPaymentsReadInput, SchoolPaymentsSourceCoverage } from "./school-payments-readonly";

export const SCHOOL_PAYMENT_LOCAL_LIMIT = 500;
export const SCHOOL_PAYMENT_LEDGER_LIMIT = 100;
export type SchoolPaymentsWindow = { start: Date; end: Date };
export function schoolPaymentsWindow(start?: string, end?: string, now = new Date()): SchoolPaymentsWindow {
  const finish = end ? new Date(`${end}T23:59:59.999Z`) : now;
  const begin = start ? new Date(`${start}T00:00:00.000Z`) : new Date(finish.getTime() - 7 * 86_400_000);
  if ((start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) || (end && !/^\d{4}-\d{2}-\d{2}$/.test(end))
    || !Number.isFinite(begin.getTime()) || !Number.isFinite(finish.getTime()) || begin > finish
    || finish.getTime() - begin.getTime() > 31 * 86_400_000
    || (start && begin.toISOString().slice(0, 10) !== start) || (end && finish.toISOString().slice(0, 10) !== end)) throw Error("Invalid payment window");
  return { start: begin, end: finish };
}

// Family stores a globally unique centerId scalar, without a Prisma Center
// relation. Its tenant is verified by the authority loader's separate Center
// query before reads and again before returning the projected response.
export function schoolPaymentsLocalQuery(centerId: string, window: SchoolPaymentsWindow) {
  return {
    where: { provider: { in: ["stripe", "stripe_terminal"] }, billingAccount: { family: { centerId } },
      OR: [{ paidAt: { gte: window.start, lte: window.end } },
        { ledgerEntries: { some: { type: "refund", createdAt: { gte: window.start, lte: window.end } } } },
        // Payment has no createdAt. These drafts are deliberately labelled as
        // undated checkout state, not activity collected in the selected period.
        { status: "DRAFT" as const }] },
    select: { id: true, amountCents: true, status: true, provider: true, customFields: true, paidAt: true,
      billingAccount: { select: { family: { select: { centerId: true } } } },
      ledgerEntries: { where: { type: { in: ["payment", "refund"] } },
        select: { id: true, type: true, amountCents: true, createdAt: true },
        orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: SCHOOL_PAYMENT_LEDGER_LIMIT + 1 } },
    orderBy: [{ paidAt: "desc" as const }, { id: "asc" as const }], take: SCHOOL_PAYMENT_LOCAL_LIMIT + 1,
  } satisfies Prisma.PaymentFindManyArgs;
}
export type SchoolPaymentLocalRow = Prisma.PaymentGetPayload<{ select: ReturnType<typeof schoolPaymentsLocalQuery>["select"] }>;
type Page<T> = { ok: boolean; hasMore: boolean; pageComplete?: boolean; rows: T[] };
type ReadProviders = {
  local(query: ReturnType<typeof schoolPaymentsLocalQuery>): Promise<SchoolPaymentLocalRow[]>;
  balanceTransactions(scope: SchoolPaymentsReadAuthority["scope"], window: SchoolPaymentsWindow): Promise<Page<StripeBalanceTransactionSnapshot>>;
  payouts(scope: SchoolPaymentsReadAuthority["scope"], window: SchoolPaymentsWindow): Promise<Page<StripePayoutSnapshot>>;
};
const record = (x: unknown): Record<string, unknown> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
const cents = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);
const iso = (d: Date | string | null) => d && Number.isFinite(new Date(d).getTime()) ? new Date(d).toISOString() : null;
const within = (date: Date | string | null, w: SchoolPaymentsWindow) => { const s = iso(date); return s !== null && new Date(s) >= w.start && new Date(s) <= w.end; };
const missing = <T>(): Page<T> => ({ ok: false, hasMore: false, rows: [] });
function pageCoverage<T>(source: SchoolPaymentsSourceCoverage["source"], result: Page<T>, valid: number): SchoolPaymentsSourceCoverage {
  return { source, count: valid, availability: !result.ok ? "unavailable" : result.hasMore || result.pageComplete !== true || valid !== result.rows.length ? "partial" : "complete",
    reason: !result.ok ? "read_unavailable" : result.hasMore ? "provider_has_more" : result.pageComplete !== true ? "pagination_unknown" : valid !== result.rows.length ? "incomplete_evidence" : "exhausted" };
}

// Injected reads only: no database construction, credential lookup, live provider
// calls or mutation fallback. Current account is immutable server authority.
export async function readSchoolPaymentsSnapshot(authority: SchoolPaymentsReadAuthority, window: SchoolPaymentsWindow, providers: ReadProviders): Promise<Omit<SchoolPaymentsReadInput, "scope" | "historyBindings">> {
  const scope = authority.scope, bound = { tenantId: scope.tenantId, centerId: scope.centerId, accountId: scope.accountId };
  const reads = await Promise.allSettled([
    providers.local(schoolPaymentsLocalQuery(scope.centerId, window)),
    providers.balanceTransactions(structuredClone(scope), window), providers.payouts(structuredClone(scope), window),
  ]);
  const localOk = reads[0].status === "fulfilled";
  const allLocal = reads[0].status === "fulfilled" ? reads[0].value : [];
  const transactions = reads[1].status === "fulfilled" ? reads[1].value : missing<StripeBalanceTransactionSnapshot>();
  const payoutPage = reads[2].status === "fulfilled" ? reads[2].value : missing<StripePayoutSnapshot>();
  const payments: SchoolPaymentsReadInput["payments"] = [], refunds: NonNullable<SchoolPaymentsReadInput["evidence"]>["refunds"] = [];
  let omitted = 0, ledgerLimited = false, undated = false;
  for (const row of allLocal.slice(0, SCHOOL_PAYMENT_LOCAL_LIMIT)) {
    const family = row.billingAccount.family, fields = record(row.customFields);
    // An absent or explicit platform account is never rewritten to the current
    // account. Previous accounts require a separately authorized history reader.
    if (family.centerId !== scope.centerId
      || fields.stripeConnectedAccountId !== scope.accountId || fields.stripeChargeType !== "direct"
      || !cents(row.amountCents) || row.amountCents < 0) { omitted++; continue; }
    const ledgerTruncated = row.ledgerEntries.length > SCHOOL_PAYMENT_LEDGER_LIMIT;
    ledgerLimited ||= ledgerTruncated;
    const entries = row.ledgerEntries.slice(0, SCHOOL_PAYMENT_LEDGER_LIMIT);
    const captured = row.status === "PAID" || row.status === "REFUNDED";
    const allocated = entries.some(e => e.type === "payment" && e.amountCents === -row.amountCents);
    const paidAt = iso(row.paidAt);
    const sessionStatus = fields.stripeCheckoutSessionStatus;
    const checkout = sessionStatus === "expired" ? "expired" : sessionStatus === "complete" ? "completed" : sessionStatus === "open" ? "open" : "unavailable";
    const pendingCaptured = !captured && (fields.stripePaymentIntentStatus === "succeeded" || fields.stripeCheckoutPaymentStatus === "paid");
    undated ||= row.status === "DRAFT";
    const reference = `Payment .${row.id.slice(-6)}`;
    payments.push({ ...bound, id: row.id, reference, amountCents: row.amountCents, currency: "usd",
      collection: captured || pendingCaptured ? "captured" : checkout === "expired" ? "not_collected" : "pending",
      allocation: allocated && captured ? "allocated" : pendingCaptured || (captured && ledgerTruncated) ? "unavailable" : "not_allocated", checkout,
      display: pendingCaptured ? "refresh_pending" : "current", collectedAt: paidAt,
      collectionInWindow: within(row.paidAt, window) });
    for (const entry of entries.filter(e => e.type === "refund" && within(e.createdAt, window))) {
      if (!cents(entry.amountCents) || entry.amountCents < 0) { omitted++; continue; }
      refunds.push({ ...bound, reference, amountCents: entry.amountCents, currency: "usd", collectedAt: paidAt,
        ledgerRecordedAt: iso(entry.createdAt)!, providerEventAt: null });
    }
    // Never subtract stripeAmountRefundedCents from this period's collections:
    // that field is a lifetime high-water mark, not timestamped refund activity.
  }
  const validTransactions = transactions.ok ? transactions.rows.slice(0, 100).filter(t => t.readEvidenceComplete !== false && t.currency === "usd" && cents(t.amountCents) && cents(t.feeCents) && cents(t.netCents) && within(t.createdAt, window)) : [];
  const payouts: SchoolPaymentsReadInput["payouts"] = payoutPage.ok ? payoutPage.rows.slice(0, 100).filter(p => p.readEvidenceComplete !== false && /^po_[A-Za-z0-9_]+$/.test(p.id) && p.currency === "usd" && cents(p.amountCents) && p.amountCents >= 0
    && within(p.createdAt, window) && ["paid", "pending", "in_transit", "failed", "canceled"].includes(p.status)).map(p => ({ ...bound,
      id: p.id, amountCents: p.amountCents, currency: "usd", status: p.status as SchoolPaymentsReadInput["payouts"][number]["status"],
      arrivalDate: iso(p.arrivalDate)?.slice(0, 10) ?? "unavailable", ledger: null, depositEvidence: null })) : [];
  const local: SchoolPaymentsSourceCoverage = { source: "bee_payments", count: payments.length,
    availability: !localOk ? "unavailable" : allLocal.length > SCHOOL_PAYMENT_LOCAL_LIMIT || omitted || ledgerLimited || undated ? "partial" : "complete",
    reason: !localOk ? "read_unavailable" : allLocal.length > SCHOOL_PAYMENT_LOCAL_LIMIT ? "local_limit" : ledgerLimited ? "ledger_limit" : omitted ? "missing_account_provenance" : undated ? "undated_checkouts" : "exhausted" };
  const txCoverage = pageCoverage("stripe_balance_transactions", transactions, validTransactions.length);
  const poCoverage = pageCoverage("stripe_payouts", payoutPage, payouts.length);
  return { payments, payouts, balances: [], availability: { payments: local.availability, payouts: poCoverage.availability, balances: "unavailable", history: "unavailable" },
    evidence: { window: { start: window.start.toISOString(), end: window.end.toISOString(), timezone: "UTC" },
      sources: [local, { source: "bee_refund_ledger", count: refunds.length, availability: localOk ? "partial" : "unavailable", reason: localOk ? "refund_event_time_missing" : "read_unavailable" }, txCoverage, poCoverage,
        { source: "stripe_balance", count: 0, availability: "unavailable", reason: "adapter_pending" },
        { source: "account_history", count: 0, availability: "unavailable", reason: "history_not_authorized" }],
      comparison: "not_comparable", refunds } };
}
