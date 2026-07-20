"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, BarChart3, CheckCircle2, FilterX, MapPin, Printer, Save, Search } from "lucide-react";
import { formatPrintDateTime, PrintableReport, ReportPrintStyles, usePrintableReport } from "@/components/printable-report";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { FteReportRow } from "@/components/fte-report-form";
import { aggregateFteWeeks, fteDateKey, latestFteReportsByCenter, latestFteReportsByCenterWeek } from "@/lib/fte-report-rollups";

const ALL = "all";

export type FteExplorerCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  city: string | null;
  state: string | null;
  ownerGroup: { name: string; ownerType: string } | null;
};

type Props = {
  centers: FteExplorerCenter[];
  reports: FteReportRow[];
};

type InlineCorrectionState = {
  id: string;
  centerId: string;
  weekStart: string;
  weekEnd: string;
  locationData: string;
  accountReceivableAmount: string;
  selfPayerBillAmount: string;
  subsidyBillAmount: string;
  totalBilledAmount: string;
  enrolledCount: string;
  fullTimeCount: string;
  partTimeCount: string;
  fteCount: string;
  licenseCapacity: string;
  occupancyPercent: string;
  payrollAmount: string;
  payrollPercent: string;
  newStarts: string;
  withdrawals: string;
  preregisteredChildren: string;
  infants: string;
  toddlers: string;
  twos: string;
  preschool: string;
  preK: string;
  schoolAge: string;
  status: string;
  notes: string;
};

function dateKey(value: string | null | undefined) {
  return fteDateKey(value);
}

function formatDate(value: string | null | undefined) {
  const key = dateKey(value);
  return key || "Not set";
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function centerLabel(center: FteExplorerCenter | undefined) {
  if (!center) return "Unknown school";
  return [
    center.crmLocationId ?? center.name,
    [center.city, center.state].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ");
}

function ownerLabel(center: FteExplorerCenter | undefined) {
  return center?.ownerGroup?.name ?? "Unassigned";
}

function stateLabel(center: FteExplorerCenter | undefined) {
  return center?.state ?? "Unassigned";
}

function inputNumber(value: number) {
  return value ? String(value) : "";
}

function inputOptionalNumber(value?: number | null) {
  return value === null || value === undefined ? "" : String(value);
}

function formatMoney(value?: number | null) {
  return value === null || value === undefined ? "Not set" : `$${value.toLocaleString()}`;
}

function formatPercent(value?: number | null) {
  return value === null || value === undefined ? "Not set" : `${value.toLocaleString()}%`;
}

function correctionFromReport(report: FteReportRow): InlineCorrectionState {
  return {
    id: report.id,
    centerId: report.centerId,
    weekStart: dateKey(report.weekStart),
    weekEnd: dateKey(report.weekEnd),
    locationData: report.locationData ?? "",
    accountReceivableAmount: inputOptionalNumber(report.accountReceivableAmount),
    selfPayerBillAmount: inputOptionalNumber(report.selfPayerBillAmount),
    subsidyBillAmount: inputOptionalNumber(report.subsidyBillAmount),
    totalBilledAmount: inputOptionalNumber(report.totalBilledAmount),
    enrolledCount: inputNumber(report.enrolledCount),
    fullTimeCount: inputNumber(report.fullTimeCount),
    partTimeCount: inputNumber(report.partTimeCount),
    fteCount: report.fteCount ? String(report.fteCount) : "",
    licenseCapacity: inputOptionalNumber(report.licenseCapacity),
    occupancyPercent: inputOptionalNumber(report.occupancyPercent),
    payrollAmount: inputOptionalNumber(report.payrollAmount),
    payrollPercent: inputOptionalNumber(report.payrollPercent),
    newStarts: inputOptionalNumber(report.newStarts),
    withdrawals: inputOptionalNumber(report.withdrawals),
    preregisteredChildren: inputOptionalNumber(report.preregisteredChildren),
    infants: inputNumber(report.infants),
    toddlers: inputNumber(report.toddlers),
    twos: inputNumber(report.twos),
    preschool: inputNumber(report.preschool),
    preK: inputNumber(report.preK),
    schoolAge: inputNumber(report.schoolAge),
    status: report.status,
    notes: report.notes ?? "",
  };
}

export function FteReportExplorer({ centers, reports }: Props) {
  const searchParams = useSearchParams();
  const requestedCenterId = searchParams.get("centerId") || ALL;
  const requestedWeekStart = searchParams.get("weekStart") || ALL;
  const requestedQuery = searchParams.get("q") || "";
  const initialCenterId = requestedCenterId !== ALL && centers.some((center) => center.id === requestedCenterId) ? requestedCenterId : ALL;
  const centerMap = useMemo(() => new Map(centers.map((center) => [center.id, center])), [centers]);
  const [centerId, setCenterId] = useState(initialCenterId);
  const [state, setState] = useState(ALL);
  const [ownerGroup, setOwnerGroup] = useState(ALL);
  const [weekStart, setWeekStart] = useState(requestedWeekStart);
  const [status, setStatus] = useState(ALL);
  const [query, setQuery] = useState(requestedQuery);
  const [correction, setCorrection] = useState<InlineCorrectionState | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const { active: printActive, generatedAt: printGeneratedAt, print: printReport } = usePrintableReport();

  const options = useMemo(() => ({
    states: uniqueSorted(centers.map((center) => center.state ?? "Unassigned")),
    ownerGroups: uniqueSorted(centers.map((center) => ownerLabel(center))),
    weeks: uniqueSorted(reports.map((report) => dateKey(report.weekStart))).reverse(),
    statuses: uniqueSorted(reports.map((report) => report.status)),
  }), [centers, reports]);

  const locationFilteredCenters = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return centers.filter((center) => {
      if (centerId !== ALL && center.id !== centerId) return false;
      if (state !== ALL && stateLabel(center) !== state) return false;
      if (ownerGroup !== ALL && ownerLabel(center) !== ownerGroup) return false;
      if (!normalizedQuery) return true;
      return [
        center.name,
        center.crmLocationId ?? "",
        centerLabel(center),
        ownerLabel(center),
        stateLabel(center),
      ].join(" ").toLowerCase().includes(normalizedQuery);
    });
  }, [centerId, centers, ownerGroup, query, state]);

  const locationFilteredReports = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return reports.filter((report) => {
      const center = centerMap.get(report.centerId);
      if (centerId !== ALL && report.centerId !== centerId) return false;
      if (state !== ALL && stateLabel(center) !== state) return false;
      if (ownerGroup !== ALL && ownerLabel(center) !== ownerGroup) return false;
      if (!normalizedQuery) return true;
      return [
        report.centerName,
        centerLabel(center),
        ownerLabel(center),
        stateLabel(center),
        report.submittedBy ?? "",
        report.notes ?? "",
      ].join(" ").toLowerCase().includes(normalizedQuery);
    });
  }, [centerId, centerMap, ownerGroup, query, reports, state]);

  const filteredReports = useMemo(() => locationFilteredReports.filter((report) => {
    if (weekStart !== ALL && dateKey(report.weekStart) !== weekStart) return false;
    if (status !== ALL && report.status !== status) return false;
    return true;
  }), [locationFilteredReports, status, weekStart]);

  const latestFilteredReports = useMemo(() => latestFteReportsByCenter(filteredReports), [filteredReports]);
  const rollupReports = useMemo(() => latestFteReportsByCenterWeek(filteredReports), [filteredReports]);
  const locationLatestReports = useMemo(() => latestFteReportsByCenter(locationFilteredReports), [locationFilteredReports]);
  const locationRollupReports = useMemo(() => latestFteReportsByCenterWeek(locationFilteredReports), [locationFilteredReports]);
  const filteredWeeks = useMemo(() => uniqueSorted(filteredReports.map((report) => dateKey(report.weekStart))).reverse(), [filteredReports]);
  const selectedWeekKey = weekStart !== ALL ? weekStart : filteredWeeks[0] ?? "";
  const selectedWeekReports = selectedWeekKey
    ? rollupReports.filter((report) => dateKey(report.weekStart) === selectedWeekKey)
    : [];
  const filteredCenterIds = new Set(filteredReports.map((report) => report.centerId));
  const totalFte = latestFilteredReports.reduce((sum, report) => sum + report.fteCount, 0);
  const totalEnrollment = latestFilteredReports.reduce((sum, report) => sum + report.enrolledCount, 0);
  const selectedWeekFte = selectedWeekReports.reduce((sum, report) => sum + report.fteCount, 0);
  const locationFilteredCenterCount = locationFilteredCenters.length;

  const trendWeeks = useMemo(() => {
    return aggregateFteWeeks(filteredReports, locationFilteredCenterCount).map((week) => ({
      week: week.weekStart,
      fte: week.fteTotal,
      enrolled: week.enrolledTotal,
      centers: week.submittedCenters,
    }));
  }, [filteredReports, locationFilteredCenterCount]);
  const maxTrendFte = Math.max(...trendWeeks.map((week) => week.fte), 1);

  const groupedByState = useMemo(() => {
    const grouped = new Map<string, { reports: number; fte: number; centers: Set<string> }>();
    for (const report of latestFilteredReports) {
      const key = stateLabel(centerMap.get(report.centerId));
      const row = grouped.get(key) ?? { reports: 0, fte: 0, centers: new Set<string>() };
      row.reports += 1;
      row.fte += report.fteCount;
      row.centers.add(report.centerId);
      grouped.set(key, row);
    }
    return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [centerMap, latestFilteredReports]);

  const groupedByOwner = useMemo(() => {
    const grouped = new Map<string, { reports: number; fte: number; centers: Set<string> }>();
    for (const report of latestFilteredReports) {
      const key = ownerLabel(centerMap.get(report.centerId));
      const row = grouped.get(key) ?? { reports: 0, fte: 0, centers: new Set<string>() };
      row.reports += 1;
      row.fte += report.fteCount;
      row.centers.add(report.centerId);
      grouped.set(key, row);
    }
    return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [centerMap, latestFilteredReports]);

  const selectedWeekReportsByCenter = useMemo(() => {
    const rows = selectedWeekKey
      ? locationRollupReports.filter((report) => dateKey(report.weekStart) === selectedWeekKey)
      : [];
    return new Map(rows.map((report) => [report.centerId, report]));
  }, [locationRollupReports, selectedWeekKey]);

  const latestReportsByCenter = useMemo(() => new Map(locationLatestReports.map((report) => [report.centerId, report])), [locationLatestReports]);

  const schoolRows = useMemo(() => locationFilteredCenters.map((center) => ({
    center,
    selectedWeekReport: selectedWeekReportsByCenter.get(center.id) ?? null,
    latestReport: latestReportsByCenter.get(center.id) ?? null,
  })), [latestReportsByCenter, locationFilteredCenters, selectedWeekReportsByCenter]);

  const selectedCenterRow = centerId !== ALL ? schoolRows.find((row) => row.center.id === centerId) ?? null : null;
  const printFilterSummary = [
    `School: ${centerId === ALL ? "All schools" : centerLabel(centerMap.get(centerId))}`,
    `State/region: ${state === ALL ? "All states" : state}`,
    `Owner: ${ownerGroup === ALL ? "All owner groups" : ownerGroup}`,
    `Week: ${weekStart === ALL ? "All weeks" : weekStart}`,
    `Status: ${status === ALL ? "All statuses" : status.replaceAll("_", " ")}`,
    query.trim() ? `Search: ${query.trim()}` : null,
  ].filter(Boolean).join(" | ");

  function resetFilters() {
    setCenterId(ALL);
    setState(ALL);
    setOwnerGroup(ALL);
    setWeekStart(ALL);
    setStatus(ALL);
    setQuery("");
  }

  function startCorrection(report: FteReportRow) {
    setStatusMessage("");
    setErrorMessage("");
    setCorrection(correctionFromReport(report));
  }

  function setCorrectionField(field: keyof InlineCorrectionState, value: string) {
    setCorrection((current) => current ? { ...current, [field]: value } : current);
  }

  function saveCorrection() {
    if (!correction) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");

      const response = await fetch("/api/fte-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(correction),
      });
      const json = await response.json().catch(() => null) as { error?: string; report?: { centerName?: string } } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "FTE correction could not be saved.");
        return;
      }

      setStatusMessage(`FTE correction saved${json?.report?.centerName ? ` for ${json.report.centerName}` : ""}.`);
      setCorrection(null);
      window.setTimeout(() => window.location.reload(), 700);
    });
  }

  return (
    <Card className="glass-panel">
      <ReportPrintStyles />
      <PrintableReport active={printActive} label="Printable FTE explorer report">
        <header>
          <h1>Historical FTE Explorer</h1>
          <p>{printFilterSummary}</p>
          <p>Generated: {formatPrintDateTime(printGeneratedAt)}</p>
        </header>
        <h2>Summary</h2>
        <table>
          <tbody>
            <tr><th>Filtered reports</th><td>{filteredReports.length.toLocaleString()}</td></tr>
            <tr><th>Filtered schools</th><td>{filteredCenterIds.size.toLocaleString()}</td></tr>
            <tr><th>Latest filtered FTE</th><td>{totalFte.toLocaleString()}</td></tr>
            <tr><th>Latest filtered enrollment</th><td>{totalEnrollment.toLocaleString()}</td></tr>
            <tr><th>Selected/latest week FTE</th><td>{selectedWeekFte.toLocaleString()}</td></tr>
          </tbody>
        </table>
        <h2>Trend</h2>
        <table>
          <thead><tr><th>Week</th><th>FTE</th><th>Enrollment</th><th>Submitted schools</th></tr></thead>
          <tbody>
            {trendWeeks.map((week) => (
              <tr key={week.week}>
                <td>{week.week}</td>
                <td>{week.fte.toLocaleString()}</td>
                <td>{week.enrolled.toLocaleString()}</td>
                <td>{week.centers.toLocaleString()}</td>
              </tr>
            ))}
            {!trendWeeks.length ? <tr><td colSpan={4}>No reports match these filters.</td></tr> : null}
          </tbody>
        </table>
        <h2>By State/Region</h2>
        <table>
          <thead><tr><th>State/region</th><th>FTE</th><th>Schools</th><th>Reports</th></tr></thead>
          <tbody>
            {groupedByState.map(([label, row]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{row.fte.toLocaleString()}</td>
                <td>{row.centers.size.toLocaleString()}</td>
                <td>{row.reports.toLocaleString()}</td>
              </tr>
            ))}
            {!groupedByState.length ? <tr><td colSpan={4}>No matching state/region data.</td></tr> : null}
          </tbody>
        </table>
        <h2>By Owner Group</h2>
        <table>
          <thead><tr><th>Owner group</th><th>FTE</th><th>Schools</th><th>Reports</th></tr></thead>
          <tbody>
            {groupedByOwner.map(([label, row]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{row.fte.toLocaleString()}</td>
                <td>{row.centers.size.toLocaleString()}</td>
                <td>{row.reports.toLocaleString()}</td>
              </tr>
            ))}
            {!groupedByOwner.length ? <tr><td colSpan={4}>No matching owner group data.</td></tr> : null}
          </tbody>
        </table>
        <h2>School Navigator</h2>
        <table>
          <thead><tr><th>School</th><th>Selected week</th><th>Latest FTE</th><th>Enrollment</th><th>Status</th></tr></thead>
          <tbody>
            {schoolRows.map((row) => (
              <tr key={row.center.id}>
                <td>{centerLabel(row.center)}</td>
                <td>{row.selectedWeekReport?.fteCount.toLocaleString() ?? "Due"}</td>
                <td>{row.latestReport?.fteCount.toLocaleString() ?? "None"}</td>
                <td>{row.latestReport?.enrolledCount.toLocaleString() ?? "None"}</td>
                <td>{row.selectedWeekReport?.status.replaceAll("_", " ") ?? "Due"}</td>
              </tr>
            ))}
            {!schoolRows.length ? <tr><td colSpan={5}>No schools match these filters.</td></tr> : null}
          </tbody>
        </table>
        <h2>Filtered Report History</h2>
        <table>
          <thead>
            <tr><th>Week</th><th>School</th><th>State</th><th>Owner</th><th>FTE</th><th>Enrollment</th><th>Total billed</th><th>Payroll amount</th><th>Starts</th><th>Withdrawn</th><th>Preregistered</th><th>Status</th><th>Updated</th><th>Submitted by</th></tr>
          </thead>
          <tbody>
            {filteredReports.map((report) => {
              const center = centerMap.get(report.centerId);
              return (
                <tr key={report.id}>
                  <td>{formatDate(report.weekStart)}</td>
                  <td>{centerLabel(center)}</td>
                  <td>{stateLabel(center)}</td>
                  <td>{ownerLabel(center)}</td>
                  <td>{report.fteCount.toLocaleString()}</td>
                  <td>{report.enrolledCount.toLocaleString()}</td>
                  <td>{formatMoney(report.totalBilledAmount)}</td>
                  <td>{formatMoney(report.payrollAmount)}</td>
                  <td>{report.newStarts ?? 0}</td>
                  <td>{report.withdrawals ?? 0}</td>
                  <td>{report.preregisteredChildren ?? 0}</td>
                  <td>{report.status.replaceAll("_", " ")}</td>
                  <td>{formatDate(report.updatedAt)}</td>
                  <td>{report.submittedBy ?? "Not set"}</td>
                </tr>
              );
            })}
            {!filteredReports.length ? <tr><td colSpan={14}>No FTE reports match these filters.</td></tr> : null}
          </tbody>
        </table>
      </PrintableReport>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              Historical FTE Explorer
            </CardTitle>
            <CardDescription>
              Filter executive FTE history by school, state/region, owner group, week, status, and search terms. FTE is the submitted weekly value; when derived, full-time counts as 1.0 and part-time as 0.5. Each row’s Updated value is its data-as-of time.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={printReport}>
              <Printer data-icon="inline-start" />
              Print FTE report
            </Button>
            <Button variant="outline" onClick={resetFilters}>
              <FilterX data-icon="inline-start" />
              Reset filters
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {statusMessage ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Correction saved</AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        ) : null}
        {errorMessage ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search school, owner, notes..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Select value={centerId} onValueChange={(value) => value && setCenterId(value)}>
            <SelectTrigger><SelectValue placeholder="All schools" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All schools</SelectItem>
              {centers.map((center) => (
                <SelectItem key={center.id} value={center.id}>{centerLabel(center)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={state} onValueChange={(value) => value && setState(value)}>
            <SelectTrigger><SelectValue placeholder="All states" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All states</SelectItem>
              {options.states.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={ownerGroup} onValueChange={(value) => value && setOwnerGroup(value)}>
            <SelectTrigger><SelectValue placeholder="All owner groups" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All owner groups</SelectItem>
              {options.ownerGroups.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={weekStart} onValueChange={(value) => value && setWeekStart(value)}>
            <SelectTrigger><SelectValue placeholder="All weeks" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All weeks</SelectItem>
              {options.weeks.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[14rem_repeat(4,minmax(0,1fr))]">
          <Select value={status} onValueChange={(value) => value && setStatus(value)}>
            <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {options.statuses.map((item) => <SelectItem key={item} value={item}>{item.replaceAll("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="rounded-xl border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground">Filtered reports</div>
            <div className="text-lg font-semibold">{filteredReports.length.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground">Filtered schools</div>
            <div className="text-lg font-semibold">{filteredCenterIds.size.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground">Latest filtered FTE</div>
            <div className="text-lg font-semibold">{totalFte.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground">Selected/latest week FTE</div>
            <div className="text-lg font-semibold">{selectedWeekFte.toLocaleString()}</div>
          </div>
        </div>

        {selectedCenterRow ? (
          <div className="rounded-xl border bg-background/50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin data-icon="inline-start" />
                  Selected school
                </div>
                <div className="mt-1 text-lg font-semibold">{centerLabel(selectedCenterRow.center)}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedWeekKey ? `Viewing week ${selectedWeekKey}` : "No weekly reports are available for this filter set"}
                </div>
              </div>
              <Button variant="outline" onClick={() => setCenterId(ALL)}>
                <FilterX data-icon="inline-start" />
                Clear school
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MetricPill label="Selected week FTE" value={selectedCenterRow.selectedWeekReport?.fteCount.toLocaleString() ?? "Due"} />
              <MetricPill label="Latest FTE" value={selectedCenterRow.latestReport?.fteCount.toLocaleString() ?? "None"} />
              <MetricPill label="Enrollment" value={selectedCenterRow.latestReport?.enrolledCount.toLocaleString() ?? "None"} />
              <MetricPill label="Full-time" value={selectedCenterRow.latestReport?.fullTimeCount.toLocaleString() ?? "None"} />
              <MetricPill label="Part-time" value={selectedCenterRow.latestReport?.partTimeCount.toLocaleString() ?? "None"} />
              <MetricPill label="Total billed" value={formatMoney(selectedCenterRow.latestReport?.totalBilledAmount)} />
              <MetricPill label="Payroll amount" value={formatMoney(selectedCenterRow.latestReport?.payrollAmount)} />
              <MetricPill label="Occupancy" value={formatPercent(selectedCenterRow.latestReport?.occupancyPercent)} />
              <MetricPill label="Starts/withdrawn" value={`${selectedCenterRow.latestReport?.newStarts ?? 0} / ${selectedCenterRow.latestReport?.withdrawals ?? 0}`} />
              <MetricPill label="Preregistered" value={(selectedCenterRow.latestReport?.preregisteredChildren ?? 0).toLocaleString()} />
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Filtered trend</div>
                <div className="text-xs text-muted-foreground">Last 8 weeks in the current filter set</div>
              </div>
              <Badge variant="outline">{totalEnrollment.toLocaleString()} latest enrollment</Badge>
            </div>
            <div className="flex min-h-48 items-end gap-3 overflow-x-auto border-b pb-4">
              {trendWeeks.map((week) => (
                <div key={week.week} className="flex min-w-24 flex-1 flex-col items-center gap-2">
                  <div className="flex h-32 w-full items-end rounded-t-xl bg-muted/35 px-3 pt-3">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-amber-500 to-yellow-300"
                      style={{ height: `${Math.max(8, (week.fte / maxTrendFte) * 100)}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold">{week.fte.toLocaleString()}</div>
                    <div className="text-[11px] text-muted-foreground">{week.week}</div>
                    <div className="text-[11px] text-muted-foreground">{week.centers} schools</div>
                  </div>
                </div>
              ))}
              {!trendWeeks.length ? <p className="p-6 text-sm text-muted-foreground">No reports match these filters.</p> : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <SummaryTable title="By state/region" rows={groupedByState} />
            <SummaryTable title="By owner group" rows={groupedByOwner} />
          </div>
        </div>

        <div className="rounded-xl border">
          <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold">School navigator</div>
              <div className="text-xs text-muted-foreground">
                {selectedWeekKey ? `Selected week ${selectedWeekKey}` : "No matching weekly reports yet"}
              </div>
            </div>
            <Badge variant="outline">{schoolRows.length.toLocaleString()} schools</Badge>
          </div>
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Selected week</TableHead>
                  <TableHead>Latest FTE</TableHead>
                  <TableHead>Enrollment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schoolRows.map((row) => (
                  <TableRow key={row.center.id} className={row.center.id === centerId ? "bg-muted/35" : undefined}>
                    <TableCell className="font-medium">{centerLabel(row.center)}</TableCell>
                    <TableCell>{row.selectedWeekReport?.fteCount.toLocaleString() ?? "Due"}</TableCell>
                    <TableCell>{row.latestReport?.fteCount.toLocaleString() ?? "None"}</TableCell>
                    <TableCell>{row.latestReport?.enrolledCount.toLocaleString() ?? "None"}</TableCell>
                    <TableCell>
                      <Badge variant={row.selectedWeekReport ? "secondary" : "outline"}>
                        {row.selectedWeekReport?.status.replaceAll("_", " ") ?? "Due"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant={row.center.id === centerId ? "secondary" : "outline"} size="sm" onClick={() => setCenterId(row.center.id)}>
                        <ArrowRight data-icon="inline-start" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!schoolRows.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">No schools match these filters.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>School</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>FTE</TableHead>
                <TableHead>Enrollment</TableHead>
                <TableHead>Total billed</TableHead>
                <TableHead>Payroll amount</TableHead>
                <TableHead>Occupancy</TableHead>
                <TableHead>Starts/withdrawn</TableHead>
                <TableHead>Preregistered</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Correction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReports.slice(0, 30).map((report) => {
                const center = centerMap.get(report.centerId);
                return (
                  <Fragment key={report.id}>
                    <TableRow>
                      <TableCell>{formatDate(report.weekStart)}</TableCell>
                      <TableCell className="font-medium">{centerLabel(center)}</TableCell>
                      <TableCell>{stateLabel(center)}</TableCell>
                      <TableCell>{ownerLabel(center)}</TableCell>
                      <TableCell>{report.fteCount.toLocaleString()}</TableCell>
                      <TableCell>{report.enrolledCount.toLocaleString()}</TableCell>
                      <TableCell>{formatMoney(report.totalBilledAmount)}</TableCell>
                      <TableCell>{formatMoney(report.payrollAmount)}</TableCell>
                      <TableCell>{formatPercent(report.occupancyPercent)}</TableCell>
                      <TableCell>{report.newStarts ?? 0} / {report.withdrawals ?? 0}</TableCell>
                      <TableCell>{report.preregisteredChildren ?? 0}</TableCell>
                      <TableCell><Badge variant="outline">{report.status.replaceAll("_", " ")}</Badge></TableCell>
                      <TableCell>{formatDate(report.updatedAt)}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => startCorrection(report)}>
                          Correct
                        </Button>
                      </TableCell>
                    </TableRow>
                    {correction?.id === report.id ? (
                      <TableRow>
                        <TableCell colSpan={14} className="bg-muted/30">
                          <div className="space-y-4 rounded-xl border bg-background/80 p-4">
                            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <div className="text-sm font-semibold">Inline executive correction</div>
                                <div className="text-xs text-muted-foreground">
                                  Changes are audited, backed up to the FTE sheet integration, and routed through the same scoped API as director submissions.
                                </div>
                              </div>
                              <Badge variant="outline">{centerLabel(center)}</Badge>
                            </div>
                            <div className="grid gap-3 md:grid-cols-4">
                              <InlineNumberField label="Enrolled" value={correction.enrolledCount} onChange={(value) => setCorrectionField("enrolledCount", value)} />
                              <InlineNumberField label="Full-time" value={correction.fullTimeCount} onChange={(value) => setCorrectionField("fullTimeCount", value)} />
                              <InlineNumberField label="Part-time" value={correction.partTimeCount} onChange={(value) => setCorrectionField("partTimeCount", value)} />
                              <InlineNumberField label="FTE" value={correction.fteCount} onChange={(value) => setCorrectionField("fteCount", value)} />
                            </div>
                            <div className="grid gap-3 md:grid-cols-4">
                              <InlineTextField label="Location data" value={correction.locationData} onChange={(value) => setCorrectionField("locationData", value)} />
                              <InlineNumberField label="Accounts receivable" value={correction.accountReceivableAmount} onChange={(value) => setCorrectionField("accountReceivableAmount", value)} />
                              <InlineNumberField label="Self-payer billed" value={correction.selfPayerBillAmount} onChange={(value) => setCorrectionField("selfPayerBillAmount", value)} />
                              <InlineNumberField label="Subsidy billed" value={correction.subsidyBillAmount} onChange={(value) => setCorrectionField("subsidyBillAmount", value)} />
                              <InlineNumberField label="Total billed" value={correction.totalBilledAmount} onChange={(value) => setCorrectionField("totalBilledAmount", value)} />
                              <InlineNumberField label="License capacity" value={correction.licenseCapacity} onChange={(value) => setCorrectionField("licenseCapacity", value)} />
                              <InlineNumberField label="Occupancy %" value={correction.occupancyPercent} onChange={(value) => setCorrectionField("occupancyPercent", value)} />
                              <InlineNumberField label="Payroll amount" value={correction.payrollAmount} onChange={(value) => setCorrectionField("payrollAmount", value)} />
                              <InlineNumberField label="Payroll %" value={correction.payrollPercent} onChange={(value) => setCorrectionField("payrollPercent", value)} />
                              <InlineNumberField label="New starts" value={correction.newStarts} onChange={(value) => setCorrectionField("newStarts", value)} />
                              <InlineNumberField label="Withdrawals" value={correction.withdrawals} onChange={(value) => setCorrectionField("withdrawals", value)} />
                              <InlineNumberField label="Preregistered" value={correction.preregisteredChildren} onChange={(value) => setCorrectionField("preregisteredChildren", value)} />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                              <InlineNumberField label="Infants" value={correction.infants} onChange={(value) => setCorrectionField("infants", value)} />
                              <InlineNumberField label="Toddlers" value={correction.toddlers} onChange={(value) => setCorrectionField("toddlers", value)} />
                              <InlineNumberField label="Twos" value={correction.twos} onChange={(value) => setCorrectionField("twos", value)} />
                              <InlineNumberField label="Preschool" value={correction.preschool} onChange={(value) => setCorrectionField("preschool", value)} />
                              <InlineNumberField label="Pre-K" value={correction.preK} onChange={(value) => setCorrectionField("preK", value)} />
                              <InlineNumberField label="School age" value={correction.schoolAge} onChange={(value) => setCorrectionField("schoolAge", value)} />
                            </div>
                            <div className="grid gap-3 lg:grid-cols-[12rem_1fr]">
                              <div className="space-y-1">
                                <Label>Status</Label>
                                <Select value={correction.status} onValueChange={(value) => value && setCorrectionField("status", value)}>
                                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="submitted">Submitted</SelectItem>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="corrected">Corrected</SelectItem>
                                    <SelectItem value="approved">Approved</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label>Correction notes</Label>
                                <Textarea
                                  value={correction.notes}
                                  onChange={(event) => setCorrectionField("notes", event.target.value)}
                                  placeholder="Explain the correction for audit history and operations review."
                                />
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <Button disabled={isPending} onClick={saveCorrection}>
                                <Save data-icon="inline-start" />
                                Save correction
                              </Button>
                              <Button variant="outline" disabled={isPending} onClick={() => setCorrection(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
              {!filteredReports.length ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-muted-foreground">No FTE reports match these filters.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function InlineNumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" />
    </div>
  );
}

function InlineTextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function SummaryTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, { reports: number; fte: number; centers: Set<string> }]>;
}) {
  return (
    <div className="rounded-xl border">
      <div className="border-b p-3 text-sm font-semibold">{title}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Group</TableHead>
            <TableHead>FTE</TableHead>
            <TableHead>Schools</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 8).map(([label, row]) => (
            <TableRow key={label}>
              <TableCell className="font-medium">{label}</TableCell>
              <TableCell>{row.fte.toLocaleString()}</TableCell>
              <TableCell>{row.centers.size.toLocaleString()}</TableCell>
            </TableRow>
          ))}
          {!rows.length ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground">No matching data.</TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
