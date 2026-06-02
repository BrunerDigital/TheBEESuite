"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { AlertCircle, BarChart3, CheckCircle2, FilterX, Save, Search } from "lucide-react";
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
  enrolledCount: string;
  fullTimeCount: string;
  partTimeCount: string;
  fteCount: string;
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
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
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

function correctionFromReport(report: FteReportRow): InlineCorrectionState {
  return {
    id: report.id,
    centerId: report.centerId,
    weekStart: dateKey(report.weekStart),
    weekEnd: dateKey(report.weekEnd),
    enrolledCount: inputNumber(report.enrolledCount),
    fullTimeCount: inputNumber(report.fullTimeCount),
    partTimeCount: inputNumber(report.partTimeCount),
    fteCount: report.fteCount ? String(report.fteCount) : "",
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
  const centerMap = useMemo(() => new Map(centers.map((center) => [center.id, center])), [centers]);
  const [centerId, setCenterId] = useState(ALL);
  const [state, setState] = useState(ALL);
  const [ownerGroup, setOwnerGroup] = useState(ALL);
  const [weekStart, setWeekStart] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [query, setQuery] = useState("");
  const [correction, setCorrection] = useState<InlineCorrectionState | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const options = useMemo(() => ({
    states: uniqueSorted(centers.map((center) => center.state ?? "Unassigned")),
    ownerGroups: uniqueSorted(centers.map((center) => ownerLabel(center))),
    weeks: uniqueSorted(reports.map((report) => dateKey(report.weekStart))).reverse(),
    statuses: uniqueSorted(reports.map((report) => report.status)),
  }), [centers, reports]);

  const filteredReports = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return reports.filter((report) => {
      const center = centerMap.get(report.centerId);
      if (centerId !== ALL && report.centerId !== centerId) return false;
      if (state !== ALL && stateLabel(center) !== state) return false;
      if (ownerGroup !== ALL && ownerLabel(center) !== ownerGroup) return false;
      if (weekStart !== ALL && dateKey(report.weekStart) !== weekStart) return false;
      if (status !== ALL && report.status !== status) return false;
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
  }, [centerId, centerMap, ownerGroup, query, reports, state, status, weekStart]);

  const filteredCenterIds = new Set(filteredReports.map((report) => report.centerId));
  const totalFte = filteredReports.reduce((sum, report) => sum + report.fteCount, 0);
  const totalEnrollment = filteredReports.reduce((sum, report) => sum + report.enrolledCount, 0);
  const latestWeek = options.weeks[0] ?? "";
  const currentFilteredReports = latestWeek
    ? filteredReports.filter((report) => dateKey(report.weekStart) === latestWeek)
    : [];

  const trendWeeks = useMemo(() => {
    const grouped = new Map<string, FteReportRow[]>();
    for (const report of filteredReports) {
      const key = dateKey(report.weekStart);
      if (!key) continue;
      const rows = grouped.get(key) ?? [];
      rows.push(report);
      grouped.set(key, rows);
    }
    return Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-8)
      .map(([week, rows]) => ({
        week,
        fte: rows.reduce((sum, report) => sum + report.fteCount, 0),
        enrolled: rows.reduce((sum, report) => sum + report.enrolledCount, 0),
        centers: new Set(rows.map((report) => report.centerId)).size,
      }));
  }, [filteredReports]);
  const maxTrendFte = Math.max(...trendWeeks.map((week) => week.fte), 1);

  const groupedByState = useMemo(() => {
    const grouped = new Map<string, { reports: number; fte: number; centers: Set<string> }>();
    for (const report of filteredReports) {
      const key = stateLabel(centerMap.get(report.centerId));
      const row = grouped.get(key) ?? { reports: 0, fte: 0, centers: new Set<string>() };
      row.reports += 1;
      row.fte += report.fteCount;
      row.centers.add(report.centerId);
      grouped.set(key, row);
    }
    return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [centerMap, filteredReports]);

  const groupedByOwner = useMemo(() => {
    const grouped = new Map<string, { reports: number; fte: number; centers: Set<string> }>();
    for (const report of filteredReports) {
      const key = ownerLabel(centerMap.get(report.centerId));
      const row = grouped.get(key) ?? { reports: 0, fte: 0, centers: new Set<string>() };
      row.reports += 1;
      row.fte += report.fteCount;
      row.centers.add(report.centerId);
      grouped.set(key, row);
    }
    return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [centerMap, filteredReports]);

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
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              Historical FTE Explorer
            </CardTitle>
            <CardDescription>
              Filter executive FTE history by school, state/region, owner group, week, status, and search terms.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={resetFilters}>
            <FilterX data-icon="inline-start" />
            Reset filters
          </Button>
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
            <div className="text-xs text-muted-foreground">Filtered FTE</div>
            <div className="text-lg font-semibold">{totalFte.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground">Current filtered week</div>
            <div className="text-lg font-semibold">{currentFilteredReports.reduce((sum, report) => sum + report.fteCount, 0).toLocaleString()}</div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Filtered trend</div>
                <div className="text-xs text-muted-foreground">Last 8 weeks in the current filter set</div>
              </div>
              <Badge variant="outline">{totalEnrollment.toLocaleString()} enrolled rows</Badge>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>School</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>FTE</TableHead>
                <TableHead>Enrollment</TableHead>
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
                        <TableCell colSpan={9} className="bg-muted/30">
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
                  <TableCell colSpan={9} className="text-muted-foreground">No FTE reports match these filters.</TableCell>
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
