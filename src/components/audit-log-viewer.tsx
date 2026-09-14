"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { PrintableReport, ReportPrintStyles, usePrintableReport } from "@/components/printable-report";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RecordPaginationNav } from "@/components/record-pagination";
import { auditActorLabel, auditCenterLabel, auditHistoryHref, parseAuditHistoryFilters, type AuditHistoryData } from "@/lib/audit-history";
import { formatZonedTimestamp } from "@/lib/zoned-date-time";
import { cn } from "@/lib/utils";

export type { AuditHistoryRow as AuditLogViewerRow } from "@/lib/audit-history";

export function AuditLogViewer({ data }: { data: AuditHistoryData }) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false), [status, setStatus] = useState("");
  const filterKey = auditHistoryHref(data.filters);
  const [draft, setDraft] = useState(() => ({ key: filterKey, values: { action: data.filters.action, resource: data.filters.resource, centerId: data.filters.centerId } }));
  const selection = draft.key === filterKey ? draft.values : data.filters;
  const activeExport = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null), previousKey = useRef(filterKey);
  const navigation = useRef<{ key: string; owner: Element | null; moved: boolean } | null>(null);
  const { active: printActive, generatedAt, print: printReport } = usePrintableReport();
  useEffect(() => () => { activeExport.current?.abort(); activeExport.current = null; }, []);
  const { logs, filters, pagination, timeZone } = data;
  const format = (value: string | Date | null) => formatZonedTimestamp(value, timeZone);
  const resultMessage = `Showing ${pagination.from}–${pagination.to} of ${pagination.total} matching events.`;
  useEffect(() => {
    const moved = (event: FocusEvent) => { if (navigation.current && event.target !== navigation.current.owner && event.target !== document.body && event.target !== resultsRef.current) navigation.current.moved = true; };
    document.addEventListener("focusin", moved); return () => document.removeEventListener("focusin", moved);
  }, []);
  useEffect(() => {
    if (previousKey.current === filterKey) return;
    previousKey.current = filterKey;
    setDraft({ key: filterKey, values: { action: filters.action, resource: filters.resource, centerId: filters.centerId } });
    activeExport.current?.abort(); activeExport.current = null; setExporting(false);
    setStatus(resultMessage);
    const requested = navigation.current; navigation.current = null;
    if (requested?.key === filterKey && !requested.moved && (!requested.owner?.isConnected || document.activeElement === requested.owner || document.activeElement === document.body)) resultsRef.current?.focus();
  }, [filterKey, filters.action, filters.centerId, filters.resource, resultMessage]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || exporting) return;
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    try {
      const snapshotClock = new Date(Math.max(Date.now(), Date.parse(filters.asOf)));
      const next = parseAuditHistoryFilters({ ...values, asOf: filters.asOf, page: "1" }, snapshotClock);
      const nextKey = auditHistoryHref(next), owner = document.activeElement;
      if (nextKey === filterKey) { setStatus(resultMessage); if (event.currentTarget.contains(owner)) resultsRef.current?.focus(); return; }
      setDraft({ key: nextKey, values: { action: next.action, resource: next.resource, centerId: next.centerId } });
      navigation.current = { key: nextKey, owner, moved: !event.currentTarget.contains(owner) };
      setStatus(""); startTransition(() => router.push(nextKey + "#audit-results", { scroll: false }));
    } catch (error) { setStatus(error instanceof Error ? error.message : "Review the filters and try again."); }
  }
  async function exportCsv() {
    if (activeExport.current || pending) return;
    const controller = new AbortController(); activeExport.current = controller; setExporting(true); setStatus("");
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(auditHistoryHref(filters, 1, true), { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        if (response.status === 429) throw new Error("Please wait one minute before exporting again. Your filters are preserved.");
        if (response.status === 413) throw new Error("This export is too large. Narrow the school or date filters and try again. No partial file was created.");
        if (response.status === 401 || response.status === 403) throw new Error("Your session or access changed. Refresh the page and sign in if needed.");
        throw new Error("The export could not be completed. Keep your filters and try again.");
      }
      if (!response.headers.get("content-type")?.startsWith("text/csv")) throw new Error("The export response was incomplete. Try again.");
      const rowCount = response.headers.get("x-audit-row-count");
      if (!rowCount || !/^\d+$/.test(rowCount) || Number(rowCount) > 10_000) throw new Error("The export response was incomplete. Try again.");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      if (blob.size > 3_000_000 || !blob.size) throw new Error("The export response was incomplete. Try again.");
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = "bee-suite-audit-history-" + filters.asOf.slice(0, 10) + ".csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Downloaded " + Number(rowCount).toLocaleString() + " matching events. CSV timestamps are UTC.");
    } catch (error) {
      if (activeExport.current === controller) setStatus(controller.signal.aborted ? "The export timed out. Narrow the filters or try again." : error instanceof Error ? error.message : "The export could not be completed. Try again.");
    } finally { clearTimeout(timeout); if (activeExport.current === controller) { activeExport.current = null; setExporting(false); } }
  }
  const select = (name: "action" | "resource" | "centerId", label: string, options: { value: string; label: string }[]) => (
    <div className="flex min-w-0 flex-col gap-1 text-sm font-medium"><label htmlFor={"audit-" + name}>{label}</label>
      <input type="hidden" name={name} value={selection[name]} />
      <Select value={selection[name]} disabled={pending || exporting} onValueChange={value => setDraft({ key: filterKey, values: { action: selection.action, resource: selection.resource, centerId: selection.centerId, [name]: value ?? "" } })}>
        <SelectTrigger id={"audit-" + name} aria-label={label} className="min-h-11 min-w-0 whitespace-normal data-[size=default]:h-auto *:data-[slot=select-value]:line-clamp-none"><SelectValue className="min-w-0 break-words" /></SelectTrigger>
        <SelectContent><SelectItem value="">All {label.toLowerCase()}s</SelectItem>
          {selection[name] && !options.some(option => option.value === selection[name]) ? <SelectItem value={selection[name]}>{selection[name]}</SelectItem> : null}
          {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
  return <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-4" aria-label="Audit history">
    <ReportPrintStyles />
    <PrintableReport active={printActive} label="Printable audit history page">
      <header><h1>Audit history — page {pagination.page} of {pagination.totalPages}</h1>
        <p>{pagination.from}–{pagination.to} of {pagination.total} matching events. This report prints the current page only.</p>
        <p>Snapshot: {format(filters.asOf)}. Generated: {format(generatedAt)}.</p>
        <p>Search: {filters.q || "All"} | Action: {filters.action || "All"} | Resource: {filters.resource || "All"} | School: {data.centers.find(center => center.id === filters.centerId)?.label || (filters.centerId === "global" ? "Tenant-wide" : "All authorized")}</p>
        <p>Dates: {filters.start || "Any"} through {filters.end || "Snapshot"} ({timeZone})</p></header>
      <table className="table-fixed [&_td]:[overflow-wrap:anywhere] [&_th]:[overflow-wrap:anywhere]"><thead><tr>{["When", "Actor", "Email", "Action", "School", "Resource", "Resource ID"].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{logs.map(log => <tr key={log.id}><td>{format(log.createdAt)}</td><td>{auditActorLabel(log)}</td><td>{log.user?.email || ""}</td><td>{log.action}</td><td>{auditCenterLabel(log)}</td><td>{log.resource}</td><td>{log.resourceId || ""}</td></tr>)}</tbody></table>
    </PrintableReport>
    <form key={auditHistoryHref(filters)} action="/audit-logs" method="get" onSubmit={applyFilters} aria-label="Filter audit history">
      <input type="hidden" name="asOf" value={filters.asOf} />
      <fieldset disabled={pending || exporting} className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <label htmlFor="audit-q" className="flex min-w-0 flex-[1_1_14rem] flex-col gap-1 text-sm font-medium">Search all history
            <Input id="audit-q" name="q" defaultValue={filters.q} maxLength={120} autoComplete="off" placeholder="Actor, action, record or school…" className="min-h-11" />
          </label>
          <Button type="submit" className="min-h-11" aria-busy={pending}>{pending ? "Searching…" : "Search"}</Button>
          <Link className={cn(buttonVariants({ variant: "outline" }), "min-h-11")} href="/audit-logs" prefetch={false}>Reset</Link>
        </div>
        <details open={Boolean(filters.action || filters.resource || filters.centerId || filters.start || filters.end)} className="min-w-0">
          <summary className="min-h-11 cursor-pointer rounded-md py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary">More filters{filters.action || filters.resource || filters.centerId || filters.start || filters.end ? " · active" : ""}</summary>
          <div className="grid min-w-0 gap-3 py-2 sm:grid-cols-2 lg:grid-cols-3">
            {select("action", "Action", data.actions.map(value => ({ value, label: value })))}
            {select("resource", "Resource", data.resources.map(value => ({ value, label: value })))}
            {select("centerId", "School", [...data.centers.map(center => ({ value: center.id, label: center.label })), ...(data.globalAvailable ? [{ value: "global", label: "Tenant-wide events" }] : [])])}
            <label htmlFor="audit-start" className="flex min-w-0 flex-col gap-1 text-sm font-medium">From date<Input id="audit-start" name="start" type="date" defaultValue={filters.start} className="min-h-11 w-full min-w-0" /></label>
            <label htmlFor="audit-end" className="flex min-w-0 flex-col gap-1 text-sm font-medium">Through date<Input id="audit-end" name="end" type="date" defaultValue={filters.end} className="min-h-11 w-full min-w-0" /></label>
            <p className="self-end pb-2 text-xs text-muted-foreground">Dates use {timeZone}. Select Search to apply.</p>
          </div>
        </details>
      </fieldset>
    </form>
    <div className="my-2 flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal" disabled={exporting || pending || !pagination.total} onClick={exportCsv} aria-busy={exporting}><Download aria-hidden="true" data-icon="inline-start" /><span className="min-w-0 break-words">{exporting ? "Exporting…" : "Export all matches"}</span></Button>
      <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal" onClick={printReport} disabled={pending || !logs.length}><Printer aria-hidden="true" data-icon="inline-start" /><span className="min-w-0 break-words">Print this page</span></Button>
      <Link href={auditHistoryHref({ ...filters, asOf: "" }, 1)} prefetch={false} className={cn(buttonVariants({ variant: "ghost" }), "h-auto min-h-11 max-w-full whitespace-normal")}>Refresh results</Link>
    </div>
    <p id="audit-search-status" role="status" aria-live="polite" className="text-sm text-muted-foreground">{status || (pending ? "Loading matching events…" : "")}</p>
    <div ref={resultsRef} id="audit-results" tabIndex={-1} aria-label={resultMessage} className="scroll-mt-24 rounded-md focus-visible:outline-2 focus-visible:outline-primary [&_nav_a]:min-h-11" aria-busy={pending}>
      <RecordPaginationNav pagination={pagination} label="Events" disabled={pending || exporting} />
      <p className="mb-3 text-xs text-muted-foreground">As of {format(filters.asOf)}. Filters search the complete authorized history.</p>
      {!logs.length ? <p className="rounded-lg border border-dashed p-4 text-sm">No events match these filters. Try a different search or reset the filters.</p> : <>
        <ol className="divide-y md:hidden" aria-label="Audit events">{logs.map(log => <li key={log.id} className="min-w-0 py-3" data-audit-row={log.id}>
          <p className="break-words text-xs text-muted-foreground">{format(log.createdAt)}</p>
          <p className="mt-1 break-all text-sm font-medium">{log.action}</p>
          <p className="break-words text-sm">{auditActorLabel(log)} · {auditCenterLabel(log)}</p>
          <details className="min-w-0"><summary className="min-h-11 cursor-pointer rounded-md py-3 text-sm focus-visible:outline-2 focus-visible:outline-primary">Record details<span className="sr-only"> for {log.action}</span></summary>
            <dl className="grid gap-1 break-all text-sm"><dt className="text-muted-foreground">Resource</dt><dd>{log.resource}</dd><dt className="text-muted-foreground">Record ID</dt><dd>{log.resourceId || "Not recorded"}</dd>
              {log.user?.email ? <><dt className="text-muted-foreground">Actor email</dt><dd>{log.user.email}</dd></> : null}</dl>
          </details>
        </li>)}</ol>
        <div className="hidden min-w-0 md:block"><Table><caption className="sr-only">Matching audit events on this page</caption>
          <TableHeader><TableRow>{["When", "Actor", "Action", "School", "Resource"].map(label => <TableHead key={label} scope="col">{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{logs.map(log => <TableRow key={log.id}><TableCell>{format(log.createdAt)}</TableCell><TableCell><p className="break-words font-medium">{auditActorLabel(log)}</p><p className="break-all text-xs text-muted-foreground">{log.user?.email || ""}</p></TableCell>
            <TableCell className="break-all">{log.action}</TableCell><TableCell>{auditCenterLabel(log)}</TableCell><TableCell><p>{log.resource}</p><p className="break-all text-xs text-muted-foreground">{log.resourceId}</p></TableCell></TableRow>)}</TableBody>
        </Table></div>
      </>}
      {pagination.totalPages > 1 ? <RecordPaginationNav pagination={pagination} label="Events" disabled={pending || exporting} /> : null}
    </div>
  </section>;
}
