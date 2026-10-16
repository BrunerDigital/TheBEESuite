"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleCard } from "@/components/workspace-preferences";
import type { AgencyServiceRegister as Register } from "@/lib/agency-service-register";

const money = (cents: number | null) => cents === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export function AgencyServiceRegister({ centerId, today, canManage }: { centerId: string; today: string; canManage: boolean }) {
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [report, setReport] = useState<Register | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);
  function invalidate() {
    activeRequest.current?.abort(); activeRequest.current = null;
    setReport(null); setError(""); setPending(false);
  }
  async function load() {
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    setPending(true); setError(""); setReport(null);
    try {
      const response = await fetch(`/api/billing/agency-service-register?${new URLSearchParams({ centerId, start, end })}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load agency register.");
      if (!controller.signal.aborted && activeRequest.current === controller) setReport(body);
    } catch (failure) {
      if (!controller.signal.aborted && activeRequest.current === controller) setError(failure instanceof Error ? failure.message : "Could not load agency register.");
    } finally {
      if (!controller.signal.aborted && activeRequest.current === controller) setPending(false);
    }
  }
  return <CollapsibleCard id="agency-service-register" title="Agency claims by service period" description="Review prepared claims, agency decisions, and payments together. Choose a service week or another date range; no bills or payments are created." collapsedSummary="Prepared, submitted, approved, and paid amounts kept separate">
    <div className="flex flex-wrap items-end gap-3">
      <div><Label htmlFor="agency-register-start">Service start</Label><Input id="agency-register-start" type="date" value={start} onChange={event => { invalidate(); setStart(event.target.value); }} /></div>
      <div><Label htmlFor="agency-register-end">Service end</Label><Input id="agency-register-end" type="date" value={end} onChange={event => { invalidate(); setEnd(event.target.value); }} /></div>
      <Button type="button" disabled={pending || !start || !end || start > end} onClick={() => void load()}>{pending ? "Loading…" : "View agency register"}</Button>
      <a className="text-sm underline" href="#agency-claim-queue">Review claim queue</a>
      {canManage ? <a className="text-sm underline" href="#agency-bulk-claim-builder">Prepare agency drafts</a> : null}
    </div>
    {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
    {report ? <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">Service dates: {report.start} through {report.end}. {report.note}</p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
        ["Prepared (not submitted)", report.totals.preparedCents], ["Submitted (awaiting decision)", report.totals.submittedCents],
        ["Approved amount", report.totals.approvedCents], ["Payments applied", report.totals.paymentsAppliedCents], ["Approved less payments (before adjustments)", report.totals.approvedRemainingCents],
      ].map(([label, amount]) => <div key={String(label)} className="rounded border p-3"><dt className="text-sm">{label}</dt><dd className="mt-1 font-semibold">{money(Number(amount))}</dd></div>)}</dl>
      {report.rows.some(row => row.review.length > 0) ? <p role="status" className="text-sm text-amber-700">Some records need accounting review. Totals reflect recorded data only; inspect the warnings below before relying on totals.</p> : null}
      {report.rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="sr-only">Agency claims overlapping the selected service dates; full claim amounts shown once</caption>
        <thead><tr>{["Claim / child / agency", "Full service period", "Stage", "Claim amount", "Approved", "Payments applied", "Approved less payments (before adjustments)"].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
        <tbody>{report.rows.map(row => <tr key={row.id} className="border-t">
          <td className="p-2">{row.number}<div>{row.childName}</div><div>{row.agencyName}</div>{row.review.map(note => <p key={note} className="text-amber-700">{note}</p>)}</td>
          <td className="p-2">{row.serviceStart} – {row.serviceEnd}{row.crossesSelection ? <p>Crosses selection; full amount, not a weekly allocation.</p> : null}</td>
          <td className="p-2">{row.stage}</td><td className="p-2">{money(row.claimAmountCents)}</td><td className="p-2">{money(row.approvedAmountCents)}</td><td className="p-2">{money(row.paymentsAppliedCents)}</td><td className="p-2">{money(row.approvedRemainingCents)}</td>
        </tr>)}</tbody>
      </table></div> : <p>No claims are recorded for these service dates. This does not establish zero agency responsibility.</p>}
      <div className="rounded border p-3"><h4 className="font-medium">Stored authorization coverage without a non-void claim</h4>
        <p className="text-sm text-muted-foreground">These dates are a record-completeness check, not amounts owed or proof of attendance. Overlapping authorizations require review. Missing or outdated authorizations cannot identify every unrecorded period. Nothing is created automatically.</p>
        {!report.authorizationCount ? <p className="mt-2 text-sm">No active or expired authorization records overlap these dates; coverage cannot be assessed.</p> : report.gaps.length ? <ul className="mt-2 space-y-1 text-sm">{report.gaps.map(gap => <li key={`${gap.authorizationId}:${gap.start}`}>{gap.childName} · {gap.agencyName}: {gap.start} – {gap.end}</li>)}</ul> : <p className="mt-2 text-sm">No gaps found within the stored authorization coverage. This does not verify submission, approval, or payment.</p>}
      </div>
    </div> : null}
  </CollapsibleCard>;
}
