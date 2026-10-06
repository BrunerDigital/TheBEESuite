"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ReportPrintAction } from "@/components/printable-report";
import { filterAgencyBalances, type AgencyBalanceFilter, type AgencyBalanceSummary } from "@/lib/balance-follow-up";

const filters: Array<{ id: AgencyBalanceFilter; label: string }> = [
  { id: "outstanding", label: "Outstanding" }, { id: "overdue", label: "Overdue" },
  { id: "submission", label: "Needs submission" }, { id: "reconciliation", label: "Needs reconciliation" },
  { id: "all", label: "All agencies" },
];
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function AgencyBalancesPanel({ accounts, asOf }: { accounts: AgencyBalanceSummary[]; asOf: string }) {
  const [filter, setFilter] = useState<AgencyBalanceFilter>("outstanding");
  const [query, setQuery] = useState("");
  const visible = filterAgencyBalances(accounts, filter, query);
  const outstanding = accounts.reduce((sum, account) => sum + account.outstandingCents, 0);
  const received = accounts.reduce((sum, account) => sum + account.receivedCents, 0);
  const visibleOutstanding = visible.reduce((sum, account) => sum + account.outstandingCents, 0);
  return <div className="grid gap-4">
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Agency claims outstanding</div><div className="text-lg font-semibold">{money(outstanding)}</div></div>
      <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Recorded external receipts · all time</div><div className="text-lg font-semibold">{money(received)}</div></div>
    </div>
    <p className="text-xs text-muted-foreground">Track money paid directly to the school by ACH, check, or agency portal. Record the receipt date, amount, and reference in Agency Claim Queue. Submitted claims awaiting approval are included in outstanding; drafts are tracked under Needs submission.</p>
    <div className="flex flex-wrap gap-1" role="group" aria-label="Filter agency balances">{filters.map((item) => <Button key={item.id} size="sm" variant={filter === item.id ? "default" : "outline"} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</Button>)}</div>
    <label><span className="sr-only">Search agencies or schools</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search agencies or schools" /></label>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm" role="status">{visible.length} agencies · {money(visibleOutstanding)} outstanding in this view</p>
      <ReportPrintAction buttonLabel="Print agency balances" reportTitle="Agency balances" label="Printable filtered agency balances" disabled={!visible.length} meta={[`As of ${asOf.slice(0, 10)}`, filters.find((item) => item.id === filter)?.label ?? "All agencies", query ? `Search: ${query}` : "All matching schools"]}>
        <table><thead><tr><th>School</th><th>Agency</th><th>Outstanding claims</th><th>External receipts</th><th>Needs submission</th><th>Overdue claims</th><th>Posted ledger balance</th><th>Pending reviews</th><th>Unapplied deposits</th></tr></thead><tbody>{visible.map((account) => <tr key={account.id}><td>{account.centerName}</td><td>{account.agencyName}</td><td>{money(account.outstandingCents)}</td><td>{money(account.receivedCents)}</td><td>{account.needsSubmissionCount}</td><td>{account.overdueCount}</td><td>{account.ledgerBalanceCents === null ? "No posted ledger" : money(account.ledgerBalanceCents)}</td><td>{account.pendingReviewCount}</td><td>{money(account.unappliedCents)}</td></tr>)}</tbody></table>
        <p>Outstanding claims, posted agency ledger balances, and unapplied deposits are separate reconciliation measures. Do not add them together. Agency amounts are excluded from family balances.</p>
      </ReportPrintAction>
    </div>
    <div className="max-h-[32rem] divide-y overflow-y-auto rounded-xl border">{visible.map((account) => <div key={account.id} className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{account.agencyName}</span><span className="font-semibold">{money(account.outstandingCents)} outstanding</span></div>
      <p className="text-xs text-muted-foreground">{account.centerName} · {account.awaitingPaymentCount} claims awaiting payment · {money(account.receivedCents)} received</p>
      <div className="flex flex-wrap gap-2">{account.needsSubmissionCount > 0 ? <Badge variant="outline">{account.needsSubmissionCount} need submission</Badge> : null}{account.overdueCount > 0 ? <Badge variant="destructive">{account.overdueCount} overdue</Badge> : null}{account.pendingReviewCount > 0 ? <Badge variant="outline">{account.pendingReviewCount} pending reviews</Badge> : null}{account.unappliedCents > 0 ? <Badge variant="outline">{money(account.unappliedCents)} unapplied deposits</Badge> : null}</div>
      {account.ledgerBalanceCents !== null ? <p className="text-xs text-muted-foreground">Posted agency ledger balance: {money(account.ledgerBalanceCents)}. Claim totals and posted ledger totals may differ while approvals or adjustments are pending.</p> : null}
      <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/billing-invoices?centerId=${encodeURIComponent(account.centerId)}#agency-subsidy-billing`} />}>Reconcile agency payments</Button>
    </div>)}{!visible.length ? <p className="p-6 text-center text-sm text-muted-foreground">No agencies match this view.</p> : null}</div>
  </div>;
}
