"use client";

import { useMemo, useState } from "react";
import { Download, Printer, Search } from "lucide-react";
import { formatPrintDateTime, PrintableReport, ReportPrintStyles, usePrintableReport } from "@/components/printable-report";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type AuditLogViewerRow = {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  createdAt: Date | string;
  user: { name: string; email: string } | null;
  center: { name: string; crmLocationId: string | null } | null;
};

type DateRange = "all" | "7" | "30" | "90";

const dateRangeLabels: Record<DateRange, string> = {
  all: "All dates",
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
};

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function centerLabel(log: AuditLogViewerRow) {
  return log.center?.crmLocationId ?? log.center?.name ?? "Global";
}

function rangeMatches(value: Date | string, range: DateRange) {
  if (range === "all") return true;
  const createdAt = new Date(value).getTime();
  if (Number.isNaN(createdAt)) return false;
  const cutoff = Date.now() - Number(range) * 24 * 60 * 60 * 1000;
  return createdAt >= cutoff;
}

function safeCsvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function makeCsvRows(logs: AuditLogViewerRow[]) {
  const headers = ["When", "Actor Name", "Actor Email", "Action", "Center", "Resource", "Resource ID"];
  const rows = logs.map((log) => [
    formatDateTime(log.createdAt),
    log.user?.name ?? "System",
    log.user?.email ?? "system",
    log.action,
    centerLabel(log),
    log.resource,
    log.resourceId ?? "",
  ]);
  return [headers, ...rows].map((row) => row.map(safeCsvCell).join(",")).join("\r\n");
}

export function AuditLogViewer({ logs }: { logs: AuditLogViewerRow[] }) {
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [centerFilter, setCenterFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [statusMessage, setStatusMessage] = useState("");
  const { active: printActive, generatedAt: printGeneratedAt, print: printReport } = usePrintableReport();

  const actionOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.action))).sort(), [logs]);
  const resourceOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.resource))).sort(), [logs]);
  const centerOptions = useMemo(() => Array.from(new Set(logs.map(centerLabel))).sort(), [logs]);

  const filteredLogs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return logs.filter((log) => {
      const center = centerLabel(log);
      const matchesQuery =
        !needle ||
        log.action.toLowerCase().includes(needle) ||
        log.resource.toLowerCase().includes(needle) ||
        log.resourceId?.toLowerCase().includes(needle) ||
        log.user?.name.toLowerCase().includes(needle) ||
        log.user?.email.toLowerCase().includes(needle) ||
        center.toLowerCase().includes(needle);
      const matchesAction = actionFilter === "all" || log.action === actionFilter;
      const matchesResource = resourceFilter === "all" || log.resource === resourceFilter;
      const matchesCenter = centerFilter === "all" || center === centerFilter;
      return matchesQuery && matchesAction && matchesResource && matchesCenter && rangeMatches(log.createdAt, dateRange);
    });
  }, [actionFilter, centerFilter, dateRange, logs, query, resourceFilter]);

  function exportCsv() {
    if (filteredLogs.length === 0) {
      setStatusMessage("No audit events match the current filters.");
      return;
    }

    const blob = new Blob([makeCsvRows(filteredLogs)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bee-suite-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatusMessage(`Exported ${filteredLogs.length.toLocaleString()} visible audit events.`);
  }

  return (
    <Card className="glass-panel">
      <ReportPrintStyles />
      <PrintableReport active={printActive} label="Printable audit event report">
        <header>
          <h1>Audit Event Report</h1>
          <p>
            Action: {actionFilter === "all" ? "All actions" : actionFilter} | Resource: {resourceFilter === "all" ? "All resources" : resourceFilter} | Center: {centerFilter === "all" ? "All centers" : centerFilter} | Date: {dateRangeLabels[dateRange]}
          </p>
          {query.trim() ? <p>Search: {query.trim()}</p> : null}
          <p>Generated: {formatPrintDateTime(printGeneratedAt)}</p>
          <p>{filteredLogs.length.toLocaleString()} visible events of {logs.length.toLocaleString()} loaded</p>
        </header>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Email</th>
              <th>Action</th>
              <th>Center</th>
              <th>Resource</th>
              <th>Resource ID</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id}>
                <td>{formatDateTime(log.createdAt)}</td>
                <td>{log.user?.name ?? "System"}</td>
                <td>{log.user?.email ?? "system"}</td>
                <td>{log.action}</td>
                <td>{centerLabel(log)}</td>
                <td>{log.resource}</td>
                <td>{log.resourceId ?? ""}</td>
              </tr>
            ))}
            {!filteredLogs.length ? (
              <tr><td colSpan={7}>No audit events match the current filters.</td></tr>
            ) : null}
          </tbody>
        </table>
      </PrintableReport>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Recent Events</CardTitle>
            <CardDescription>Filter and export the scoped audit trail currently visible to this role.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCsv}>
              <Download data-icon="inline-start" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={printReport}>
              <Printer data-icon="inline-start" />
              Print events
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_14rem_14rem_14rem_12rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search actor, action, resource, center..."
            />
          </div>
          <Select value={actionFilter} onValueChange={(value) => value && setActionFilter(value)}>
            <SelectTrigger aria-label="Audit action filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actionOptions.map((action) => (
                <SelectItem key={action} value={action}>
                  {action}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={resourceFilter} onValueChange={(value) => value && setResourceFilter(value)}>
            <SelectTrigger aria-label="Audit resource filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All resources</SelectItem>
              {resourceOptions.map((resource) => (
                <SelectItem key={resource} value={resource}>
                  {resource}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={centerFilter} onValueChange={(value) => value && setCenterFilter(value)}>
            <SelectTrigger aria-label="Audit center filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All centers</SelectItem>
              {centerOptions.map((center) => (
                <SelectItem key={center} value={center}>
                  {center}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={(value) => value && setDateRange(value as DateRange)}>
            <SelectTrigger aria-label="Audit date range filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(dateRangeLabels) as DateRange[]).map((range) => (
                <SelectItem key={range} value={range}>
                  {dateRangeLabels[range]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{filteredLogs.length.toLocaleString()} visible</Badge>
          <Badge variant="outline">{logs.length.toLocaleString()} loaded</Badge>
          {statusMessage ? <span className="text-xs text-muted-foreground">{statusMessage}</span> : null}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Center</TableHead>
              <TableHead>Resource</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                <TableCell>
                  <div className="font-medium">{log.user?.name ?? "System"}</div>
                  <div className="text-xs text-muted-foreground">{log.user?.email ?? "system"}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{log.action}</Badge>
                </TableCell>
                <TableCell>{centerLabel(log)}</TableCell>
                <TableCell>{log.resource} {log.resourceId ? log.resourceId.slice(0, 8) : ""}</TableCell>
              </TableRow>
            ))}
            {!filteredLogs.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No audit events match the current filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
