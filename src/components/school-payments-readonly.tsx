"use client";

import { useState, type ReactNode } from "react";
import type { SchoolPaymentsReadView } from "@/lib/school-payments-readonly";

const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
const reconciliation = { matched: "Deposit matched", review: "Review difference", unconfirmed: "Deposit not confirmed" };
const sourceNames = { bee_payments: "BEE payment records", bee_refund_ledger: "BEE refund records", stripe_balance_transactions: "Processor activity", stripe_payouts: "Processor payouts", stripe_balance: "Current balance", account_history: "Previous account history" };

// Isolated presentation slice. Only authorized server-projected snapshots may be
// supplied. No provider SDK, Account Session, fetch, mutations or external links.
export function SchoolPaymentsReadonly({ schools, schoolNavigation }: { schools: SchoolPaymentsReadView[]; schoolNavigation?: ReactNode }) {
  const [selectedId, setSelectedId] = useState(schools[0]?.centerId ?? "");
  const school = schools.find(s => s.centerId === selectedId);
  return <section aria-label="School payments workspace" className="space-y-6 rounded-xl border bg-card p-4 sm:p-6">
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Payments</h1><p className="text-sm text-muted-foreground">Review your school&apos;s payments, balances and deposits in The BEE Suite.</p>
      {schoolNavigation ?? <><label className="block text-sm font-medium" htmlFor="payments-school">School</label>
      <select id="payments-school" className="w-full rounded-lg border bg-background p-2 sm:max-w-sm" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
        {schools.map(s => <option key={s.centerId} value={s.centerId}>{s.schoolName}</option>)}
      </select></>}
    </header>
    {!school ? <p role="status">No school payment data is available.</p> : <div className="space-y-6" key={school.centerId}>
      <h2 className="text-xl font-semibold">{school.schoolName}</h2>
      {school.evidence ? <section aria-label="Coverage and timing" className="space-y-2 rounded-lg border p-3">
        <h3 className="font-semibold">Coverage and timing</h3>
        <p className="text-sm">{school.evidence.window.start.slice(0, 10)} through {school.evidence.window.end.slice(0, 10)} (UTC). Checkouts without a date are shown separately from collected activity.</p>
        <p className="text-sm">{school.evidence.comparison}</p>
        <ul className="space-y-1 text-sm">{school.evidence.sources.map(s => <li key={s.source}>{sourceNames[s.source]}: {s.availability}. {s.reason}.</li>)}</ul>
      </section> : null}
      {school.availability.balances !== "complete" ? <p role="status">Balance information is {school.availability.balances === "partial" ? "partially available" : "unavailable"}.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">{school.balances.map(b => <div key={b.currency} className="rounded-lg border p-4">
        <h3 className="font-medium">{b.currency.toUpperCase()} balance</h3><p>Available: {money(b.availableCents, b.currency)}</p><p>Pending: {money(b.pendingCents, b.currency)}</p>
      </div>)}</div>
      <section aria-label="Payment status"><h3 className="mb-2 text-lg font-semibold">Payment status</h3>
        {school.availability.payments !== "complete" ? <p role="status">Payment information is {school.availability.payments === "partial" ? "partially available" : "unavailable"}.</p> : null}
        {school.payments.length ? <ul className="space-y-2">{school.payments.map(p => <li key={p.id} className="space-y-1 rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><span>{p.reference}</span><span>{money(p.amountCents, p.currency)}</span></div><p>{p.collection} · {p.allocation}</p><p className="text-sm">{p.checkout} · {p.display}</p><p className="text-xs text-muted-foreground">{p.originAccount}</p></li>)}</ul> : school.availability.payments === "complete" ? <p>No payments in this view.</p> : null}
      </section>
      {school.evidence?.refunds.length ? <section aria-label="Refund ledger activity" className="space-y-2">
        <h3 className="text-lg font-semibold">Refund ledger activity</h3>
        <p className="text-sm">These amounts were recorded in the BEE ledger during this window. The original collection may be earlier. Processor refund event time is unavailable.</p>
        {school.evidence.refunds.map((r, index) => <div className="rounded-lg border p-3 text-sm" key={index}><p>{r.reference}: {money(r.amountCents, r.currency)}</p><p>Original collection: {r.collectedAt?.slice(0, 10) ?? "Unavailable"}. Ledger recorded: {r.ledgerRecordedAt.slice(0, 10)}.</p><p>{r.originAccount}</p></div>)}
      </section> : null}
      <section aria-label="Payout history and deposit reconciliation"><h3 className="mb-2 text-lg font-semibold">Payout history</h3>
        <p className="mb-3 text-sm text-muted-foreground">A paid payout is not confirmation of a bank deposit. Matching requires both ledger totals and deposit evidence.</p>
        {school.availability.payouts !== "complete" || school.availability.history !== "complete" ? <p role="status">Payout history is {school.availability.payouts === "unavailable" ? "unavailable" : "partial"}. Missing evidence is not evidence of no payout.</p> : null}
        {school.payouts.length ? <ul className="space-y-2">{school.payouts.map(p => <li key={p.rowKey} className="space-y-1 rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><span>{money(p.amountCents, p.currency)} · Stripe payout: {p.status.replaceAll("_", " ")}</span><span>Expected {p.arrivalDate}</span></div><p className="text-xs text-muted-foreground">{p.maskedId} · {p.originAccount}</p><p>{p.bankPosting}</p><p className="text-sm">{reconciliation[p.reconciliation]}</p></li>)}</ul> : school.availability.payouts === "complete" && school.availability.history === "complete" ? <p>No payouts in this view.</p> : null}
      </section>
    </div>}
  </section>;
}
