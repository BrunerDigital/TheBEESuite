"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleCard } from "@/components/workspace-preferences";

type Row = { id: string; childName: string; agencyName: string; applicableStart: string; applicableEnd: string; authorizedRateCents: number; unitType: string; familyCopayCents: number; weeklyEquivalentCents: number | null; reviewReason: string | null; status: string };
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function AgencyContractReport({ centerId, today }: { centerId: string; today: string }) {
  const [start, setStart] = useState(`${today.slice(0, 7)}-01`);
  const [end, setEnd] = useState(today);
  const [report, setReport] = useState<{ rows: Row[]; note: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);
  async function load(exportCsv = false) {
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    setPending(true); setError(""); setReport(null);
    try {
      const response = await fetch(`/api/billing/agency-contract-report?${new URLSearchParams({ centerId, start, end, ...(exportCsv ? { format: "csv" } : {}) })}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "Could not load contract history."); }
      if (exportCsv) {
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url; link.download = `agency-contracts-${start}-${end}.csv`; link.click(); URL.revokeObjectURL(url);
      } else { const body = await response.json(); if (!controller.signal.aborted) setReport(body); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load contract history."); }
    finally { if (!controller.signal.aborted) setPending(false); }
  }
  return <CollapsibleCard id="agency-contract-history" title="Contract history by date" description="Choose any historical period to review the agency contracts covering those dates. This report does not post bills or payments." collapsedSummary="Coverage dates, contracted rates, copays, and weekly reporting equivalents">
    <div className="flex flex-wrap items-end gap-3">
      <div><Label htmlFor="contract-history-start">Start date</Label><Input id="contract-history-start" type="date" value={start} disabled={pending} onChange={event => { setStart(event.target.value); setReport(null); }} /></div>
      <div><Label htmlFor="contract-history-end">End date</Label><Input id="contract-history-end" type="date" value={end} disabled={pending} onChange={event => { setEnd(event.target.value); setReport(null); }} /></div>
      <Button type="button" disabled={pending || !start || !end} onClick={() => void load()}>{pending ? "Loading…" : "View contracts"}</Button>
      <Button type="button" variant="outline" disabled={pending || !start || !end} onClick={() => void load(true)}>Export contract history</Button>
    </div>
    {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
    {report ? <div className="mt-4 space-y-3"><p className="text-sm text-muted-foreground">{report.note}</p>{!report.rows.length ? <p>No stored contracts cover this period. Historical source records are needed; this does not establish zero agency responsibility.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Agency contracts covering {start} through {end}</caption><thead><tr>{["Child / agency", "Applicable dates", "Contract rate", "Copay", "Weekly equivalent", "Review"].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead><tbody>{report.rows.map(row => <tr key={row.id} className="border-t"><td className="p-2">{row.childName}<div>{row.agencyName}</div></td><td className="p-2 whitespace-nowrap">{row.applicableStart} – {row.applicableEnd}</td><td className="p-2">{money(row.authorizedRateCents)} / {row.unitType}</td><td className="p-2">{money(row.familyCopayCents)}</td><td className="p-2">{row.weeklyEquivalentCents === null ? "Needs review" : money(row.weeklyEquivalentCents)}</td><td className="p-2">{row.reviewReason ?? row.status}</td></tr>)}</tbody></table></div>}</div> : null}
  </CollapsibleCard>;
}
