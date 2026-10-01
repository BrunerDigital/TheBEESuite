"use client";

import { useRef, useState, useEffect } from "react";
import type { BulkClaimRow } from "@/lib/agency-bulk-claims";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Result = { authorizationId: string; status: "created" | "exception"; number?: string; error?: string };
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function AgencyBulkClaims({ centerId, programs, disabled, onCreated }: {
  centerId: string; programs: Array<{ id: string; name: string; status: string }>; disabled: boolean; onCreated: () => Promise<void>;
}) {
  const [programId, setProgramId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [units, setUnits] = useState("1");
  const [rows, setRows] = useState<BulkClaimRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewCurrent, setPreviewCurrent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const mounted = useRef(true);
  const running = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function resetPreview() { setRows([]); setSelected(new Set()); setPreviewCurrent(false); setResults([]); setMessage(""); setError(""); }
  async function request(action: string, fields: Record<string, unknown>) {
    const response = await fetch("/api/billing/agency-claims", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, centerId, agencyProgramId: programId, ...fields }) });
    const body = await response.json();
    if (!response.ok || body.ok !== true) throw new Error(body.error || "Agency drafts could not be prepared.");
    return body;
  }
  async function preview() {
    if (running.current || disabled) return;
    running.current = true; setBusy(true); setError(""); setMessage(""); setResults([]); setPreviewCurrent(false);
    try {
      const body = await request("previewBulkClaims", { servicePeriodStart: start, servicePeriodEnd: end, dueDate, serviceUnits: units,
        entries: rows.map((row) => ({ authorizationId: row.authorizationId, serviceUnits: row.serviceUnits, attendanceDays: row.attendanceDays })) });
      if (!mounted.current) return;
      const nextRows = body.rows as BulkClaimRow[];
      setRows(nextRows); setSelected(new Set(nextRows.filter((row) => !row.error && (!rows.length || selected.has(row.authorizationId))).map((row) => row.authorizationId))); setPreviewCurrent(true);
      setMessage(nextRows.length ? "Review the units, attendance, and amount for each child, then select the drafts to create." : "No active authorizations found for this agency.");
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Preview could not be loaded."); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  async function create() {
    if (running.current || disabled || !previewCurrent || !selected.size) return;
    running.current = true; setBusy(true); setError(""); setMessage(""); setResults([]);
    const entries = rows.filter((row) => selected.has(row.authorizationId) && !row.error);
    const completed: Result[] = [];
    setPreviewCurrent(false);
    try {
      for (let offset = 0; offset < entries.length; offset += 20) {
        if (!mounted.current) break;
        setMessage(`Creating drafts: ${offset} of ${entries.length} processed…`);
        const body = await request("createBulkClaims", { entries: entries.slice(offset, offset + 20) });
        completed.push(...body.results as Result[]);
        if (mounted.current) setResults([...completed]);
      }
      if (!mounted.current) return;
      const count = completed.filter((result) => result.status === "created").length;
      setMessage(`${count} draft${count === 1 ? "" : "s"} created. ${completed.length - count} exception${completed.length - count === 1 ? "" : "s"}. Drafts are in the agency claim queue; required documents and submission still need review.`);
      setSelected(new Set());
    } catch {
      if (mounted.current) setError(`${completed.filter((result) => result.status === "created").length} drafts confirmed created. The last request's outcome is unknown. Refresh the preview to check existing claims before retrying; overlapping claims will be blocked.`);
    } finally {
      // Refresh even after an unknown outcome so committed drafts remain visible.
      if (mounted.current) {
        try { await onCreated(); } catch { setError("Refresh the agency claim queue before continuing."); }
        setBusy(false);
      }
      running.current = false;
    }
  }
  function editRow(id: string, field: "serviceUnits" | "attendanceDays", value: string) {
    setRows((current) => current.map((row) => row.authorizationId === id ? { ...row, [field]: value === "" && field === "attendanceDays" ? null : value === "" ? 0 : Number(value) } : row));
    setPreviewCurrent(false); setMessage("Units or attendance changed. Refresh the preview to recalculate and check the drafts."); setResults([]);
  }
  const eligible = rows.filter((row) => !row.error);
  const selectedRows = eligible.filter((row) => selected.has(row.authorizationId));
  const locked = busy || disabled;
  return <Card id="agency-bulk-claim-builder" className="scroll-mt-28">
    <CardHeader><CardTitle as="h3">Create agency drafts in bulk</CardTitle><CardDescription>Choose an agency and service period, review each child’s authorized rate and units, and create the selected drafts together.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div><Label htmlFor="bulk-claim-agency">Agency</Label><Select value={programId} disabled={locked} onValueChange={(value) => { setProgramId(value ?? ""); resetPreview(); }}><SelectTrigger id="bulk-claim-agency"><SelectValue placeholder="Choose agency" /></SelectTrigger><SelectContent>{programs.filter((program) => program.status === "active").map((program) => <SelectItem key={program.id} value={program.id}>{program.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="bulk-claim-start">Service start</Label><Input id="bulk-claim-start" type="date" value={start} disabled={locked} onChange={(event) => { setStart(event.target.value); resetPreview(); }} /></div>
        <div><Label htmlFor="bulk-claim-end">Service end</Label><Input id="bulk-claim-end" type="date" value={end} min={start} disabled={locked} onChange={(event) => { setEnd(event.target.value); resetPreview(); }} /></div>
        <div><Label htmlFor="bulk-claim-units">Default units per child</Label><Input id="bulk-claim-units" type="number" min="0.000001" step="0.000001" value={units} disabled={locked} onChange={(event) => { setUnits(event.target.value); resetPreview(); }} /></div>
        <div><Label htmlFor="bulk-claim-due">Claim due (optional)</Label><Input id="bulk-claim-due" type="date" value={dueDate} disabled={locked} onChange={(event) => { setDueDate(event.target.value); resetPreview(); }} /></div>
      </div>
      <p className="text-sm text-muted-foreground">Units use each child’s authorization: for example, 1 weekly unit is one week, while 1 daily unit is one day. Review mixed unit types and adjust individual units below. Attendance stays blank unless entered.</p>
      <Button type="button" variant="outline" disabled={locked || !programId || !start || !end || !Number.isFinite(Number(units)) || Number(units) <= 0} onClick={() => void preview()}>{rows.length ? "Refresh preview" : "Preview drafts"}</Button>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {message ? <p role="status" className="text-sm">{message}</p> : null}
      {rows.length ? <>
        <div className="flex flex-wrap items-center gap-3 text-sm"><Button type="button" variant="outline" disabled={locked || !previewCurrent} onClick={() => setSelected(selected.size === eligible.length ? new Set() : new Set(eligible.map((row) => row.authorizationId)))}>{selected.size === eligible.length ? "Deselect all" : "Select all eligible"}</Button><span>{eligible.length} eligible · {rows.length - eligible.length} exceptions · {selectedRows.length} selected · {money(selectedRows.reduce((total, row) => total + row.claimedCents, 0))}{!previewCurrent ? " (refresh required)" : ""}</span></div>
        <Button type="button" disabled={locked || !previewCurrent || !selectedRows.length} onClick={() => void create()}>Create {selectedRows.length} selected draft{selectedRows.length === 1 ? "" : "s"}</Button>
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Select</TableHead><TableHead>Child / authorization</TableHead><TableHead>Authorized rate</TableHead><TableHead>Units</TableHead><TableHead>Attendance days</TableHead><TableHead>Draft amount</TableHead><TableHead>Review</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => {
          const result = results.find((item) => item.authorizationId === row.authorizationId);
          return <TableRow key={row.authorizationId}>
            <TableCell><input type="checkbox" aria-label={`Select ${row.childName} authorization ${row.authorizationNumber}`} checked={selected.has(row.authorizationId)} disabled={locked || !previewCurrent || Boolean(row.error)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(row.authorizationId); else next.delete(row.authorizationId); return next; })} /></TableCell>
            <TableCell>{row.childName}<div className="text-xs text-muted-foreground">{row.authorizationNumber}</div></TableCell>
            <TableCell>{money(row.rateCents)} / {row.unitType}</TableCell>
            <TableCell><Input className="min-w-24" aria-label={`Units for ${row.childName} authorization ${row.authorizationNumber}`} type="number" min="0.000001" step="0.000001" value={row.serviceUnits} disabled={locked} onChange={(event) => editRow(row.authorizationId, "serviceUnits", event.target.value)} /></TableCell>
            <TableCell><Input className="min-w-24" aria-label={`Attendance days for ${row.childName} authorization ${row.authorizationNumber}`} type="number" min="0" step="1" value={row.attendanceDays ?? ""} disabled={locked} onChange={(event) => editRow(row.authorizationId, "attendanceDays", event.target.value)} /></TableCell>
            <TableCell>{previewCurrent ? money(row.claimedCents) : "Refresh preview"}</TableCell>
            <TableCell className="min-w-48 text-sm">{result?.status === "created" ? `Created ${result.number}` : result?.error || row.error || "Ready for review"}</TableCell>
          </TableRow>;
        })}</TableBody></Table></div>
      </> : null}
    </CardContent>
  </Card>;
}
