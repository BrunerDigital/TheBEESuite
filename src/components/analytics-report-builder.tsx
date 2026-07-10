"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clock, Download, FileText, MessageSquare, Printer, ReceiptText, Search, TrendingUp, UsersRound } from "lucide-react";
import { formatPrintDateTime, PrintableReport, ReportPrintStyles, usePrintableReport } from "@/components/printable-report";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AnalyticsReportData, ReportKind } from "@/lib/reporting-analytics";

export type AnalyticsReportBuilderFilters = {
  range: string;
  start: string;
  end: string;
  centerId: string;
};

const reportOptions: Array<{ value: ReportKind; label: string }> = [
  { value: "lead_funnel", label: "Lead funnel" },
  { value: "attendance", label: "Attendance" },
  { value: "billing", label: "Billing/AR" },
  { value: "messages", label: "Messages" },
  { value: "staff_hours", label: "Staff hours" },
];

function money(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hours(minutes: number) {
  return (Math.max(0, minutes) / 60).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not set"
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function barWidth(value: number) {
  return `${Math.max(4, Math.min(100, value))}%`;
}

function exportParams(input: AnalyticsReportBuilderFilters & { report: ReportKind; format: "csv" | "pdf" }) {
  const params = new URLSearchParams();
  params.set("report", input.report);
  params.set("format", input.format);
  params.set("range", input.range);
  if (input.start) params.set("start", input.start);
  if (input.end) params.set("end", input.end);
  if (input.centerId && input.centerId !== "all") params.set("centerId", input.centerId);
  return `/api/reports/export?${params.toString()}`;
}

function reportLabel(report: ReportKind) {
  return reportOptions.find((option) => option.value === report)?.label ?? "Operational report";
}

function reportRangeLabel(range: string) {
  if (range === "7") return "Last 7 days";
  if (range === "30") return "Last 30 days";
  if (range === "90") return "Last 90 days";
  if (range === "365") return "Last 12 months";
  return "Custom dates";
}

export function AnalyticsReportBuilder({
  data,
  filters,
}: {
  data: AnalyticsReportData;
  filters: AnalyticsReportBuilderFilters;
}) {
  const [range, setRange] = useState(filters.range || "365");
  const [start, setStart] = useState(filters.start);
  const [end, setEnd] = useState(filters.end);
  const [centerId, setCenterId] = useState(filters.centerId || "all");
  const [report, setReport] = useState<ReportKind>("lead_funnel");
  const [query, setQuery] = useState("");
  const { active: printActive, generatedAt: printGeneratedAt, print: printReport } = usePrintableReport();

  const exportState = { range, start, end, centerId, report };
  const selectedCenterLabel = centerId === "all"
    ? "All accessible centers"
    : data.centers.find((center) => center.id === centerId)?.label ?? "Selected center";
  const rangeLabel = range === "all"
    ? `${start ? formatDate(start) : formatDate(data.range.startDate)} to ${end ? formatDate(end) : formatDate(data.range.endDate)}`
    : reportRangeLabel(range);
  const printFilterSummary = [
    `Report: ${reportLabel(report)}`,
    `Center: ${selectedCenterLabel}`,
    `Range: ${rangeLabel}`,
    query.trim() ? `Search: ${query.trim()}` : null,
  ].filter(Boolean).join(" | ");
  const filteredLeadSources = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.leadSources.filter((row) =>
      !needle ||
      row.source.toLowerCase().includes(needle) ||
      row.centerLabel.toLowerCase().includes(needle),
    );
  }, [data.leadSources, query]);

  const filteredAttendance = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.attendanceTrends.filter((row) =>
      !needle ||
      row.date.includes(needle) ||
      row.centerLabel.toLowerCase().includes(needle),
    );
  }, [data.attendanceTrends, query]);

  const filteredBilling = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.billing.filter((row) =>
      !needle ||
      row.period.includes(needle) ||
      row.centerLabel.toLowerCase().includes(needle),
    );
  }, [data.billing, query]);

  const filteredMessages = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.messages.filter((row) => !needle || row.centerLabel.toLowerCase().includes(needle));
  }, [data.messages, query]);

  const filteredStaffHours = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.staffHours.filter((row) =>
      !needle ||
      row.staffName.toLowerCase().includes(needle) ||
      row.staffEmail.toLowerCase().includes(needle) ||
      row.centerLabel.toLowerCase().includes(needle) ||
      row.classroomName.toLowerCase().includes(needle),
    );
  }, [data.staffHours, query]);

  function download(format: "csv" | "pdf") {
    window.location.href = exportParams({ ...exportState, format });
  }

  return (
    <div className="space-y-4">
      <ReportPrintStyles />
      <PrintableReport active={printActive} label="Printable analytics report">
        <header>
          <h1>{reportLabel(report)} Report</h1>
          <p>{printFilterSummary}</p>
          <p>Loaded range: {formatDate(data.range.startDate)} to {formatDate(data.range.endDate)}</p>
          <p>Generated: {formatPrintDateTime(printGeneratedAt)}</p>
        </header>
        <h2>Summary</h2>
        <table>
          <tbody>
            <tr><th>Lead conversion</th><td>{data.totals.leadConversionRate}% enrolled</td></tr>
            <tr><th>Attendance rate</th><td>{data.totals.attendanceRate}% present</td></tr>
            <tr><th>Message response</th><td>{data.totals.avgResponseHours === null ? "No replies" : `${data.totals.avgResponseHours}h avg`}</td></tr>
            <tr><th>Staff hours</th><td>{hours(data.totals.staffHoursMinutes)} decimal hours</td></tr>
          </tbody>
        </table>

        {report === "lead_funnel" ? (
          <>
            <h2>Lead Source Conversion</h2>
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Center</th>
                  <th>Leads</th>
                  <th>Tours</th>
                  <th>Applications</th>
                  <th>Enrolled</th>
                  <th>Conversion</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeadSources.map((row) => (
                  <tr key={`${row.centerId}:${row.source}`}>
                    <td>{row.source}</td>
                    <td>{row.centerLabel}</td>
                    <td>{row.leads}</td>
                    <td>{row.tours}</td>
                    <td>{row.applications}</td>
                    <td>{row.enrolled}</td>
                    <td>{row.conversionRate}%</td>
                  </tr>
                ))}
                {!filteredLeadSources.length ? <tr><td colSpan={7}>No lead source rows match the report filters.</td></tr> : null}
              </tbody>
            </table>
            <h2>Funnel Stages</h2>
            <table>
              <thead><tr><th>Stage</th><th>Count</th><th>Share</th></tr></thead>
              <tbody>
                {data.funnelStages.map((stage) => (
                  <tr key={stage.stage}>
                    <td>{stage.stage.replaceAll("_", " ")}</td>
                    <td>{stage.count}</td>
                    <td>{stage.share}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {report === "attendance" ? (
          <>
            <h2>Attendance And Absence Trends</h2>
            <table>
              <thead>
                <tr><th>Period</th><th>Center</th><th>Present</th><th>Absent</th><th>Check-ins</th><th>Check-outs</th><th>Rate</th></tr>
              </thead>
              <tbody>
                {filteredAttendance.map((row) => (
                  <tr key={`${row.date}:${row.centerId}`}>
                    <td>{row.date}</td>
                    <td>{row.centerLabel}</td>
                    <td>{row.present}</td>
                    <td>{row.absent}</td>
                    <td>{row.checkIns}</td>
                    <td>{row.checkOuts}</td>
                    <td>{row.attendanceRate}%</td>
                  </tr>
                ))}
                {!filteredAttendance.length ? <tr><td colSpan={7}>No attendance rows match the report filters.</td></tr> : null}
              </tbody>
            </table>
          </>
        ) : null}

        {report === "billing" ? (
          <>
            <h2>Billing, Revenue, And AR</h2>
            <table>
              <thead>
                <tr><th>Period</th><th>Center</th><th>Invoices</th><th>Invoiced</th><th>Paid</th><th>Open AR</th><th>Overdue</th></tr>
              </thead>
              <tbody>
                {filteredBilling.map((row) => (
                  <tr key={`${row.period}:${row.centerId}`}>
                    <td>{row.period}</td>
                    <td>{row.centerLabel}</td>
                    <td>{row.invoiceCount}</td>
                    <td>{money(row.invoiceCents)}</td>
                    <td>{money(row.paidCents)}</td>
                    <td>{money(row.openCents)}</td>
                    <td>{money(row.overdueCents)}</td>
                  </tr>
                ))}
                {!filteredBilling.length ? <tr><td colSpan={7}>No billing rows match the report filters.</td></tr> : null}
              </tbody>
            </table>
          </>
        ) : null}

        {report === "messages" ? (
          <>
            <h2>Parent Response Time And Message Analytics</h2>
            <table>
              <thead>
                <tr><th>Center</th><th>Parent messages</th><th>Staff replies</th><th>Unread</th><th>Avg response</th><th>Response rate</th></tr>
              </thead>
              <tbody>
                {filteredMessages.map((row) => (
                  <tr key={row.centerId}>
                    <td>{row.centerLabel}</td>
                    <td>{row.parentMessages}</td>
                    <td>{row.staffReplies}</td>
                    <td>{row.unreadMessages}</td>
                    <td>{row.avgResponseHours === null ? "No replies" : `${row.avgResponseHours}h`}</td>
                    <td>{row.responseRate}%</td>
                  </tr>
                ))}
                {!filteredMessages.length ? <tr><td colSpan={6}>No message rows match the report filters.</td></tr> : null}
              </tbody>
            </table>
          </>
        ) : null}

        {report === "staff_hours" ? (
          <>
            <h2>Staff Hours And Time Clock</h2>
            <table>
              <thead>
                <tr><th>Teacher</th><th>Email</th><th>Center</th><th>Classroom</th><th>Status</th><th>Total decimal</th><th>Closed shifts</th><th>Open decimal</th><th>Last action</th></tr>
              </thead>
              <tbody>
                {filteredStaffHours.map((row) => (
                  <tr key={row.staffId}>
                    <td>{row.staffName}</td>
                    <td>{row.staffEmail}</td>
                    <td>{row.centerLabel}</td>
                    <td>{row.classroomName}</td>
                    <td>{row.status === "clocked_in" ? "Clocked in" : "Clocked out"}</td>
                    <td>{hours(row.totalMinutes)}</td>
                    <td>{row.closedShiftCount} / {hours(row.closedShiftMinutes)}</td>
                    <td>{row.openShiftMinutes ? hours(row.openShiftMinutes) : "None"}</td>
                    <td>{row.lastActionAt ? formatDate(row.lastActionAt) : "No history"}</td>
                  </tr>
                ))}
                {!filteredStaffHours.length ? <tr><td colSpan={9}>No staff hour rows match the report filters.</td></tr> : null}
              </tbody>
            </table>
          </>
        ) : null}
      </PrintableReport>
      <Card className="glass-panel">
        <CardHeader>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle>Report Builder</CardTitle>
              <CardDescription>
                Filter by center and date range, then export the selected operational report.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => download("csv")}>
                <Download data-icon="inline-start" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => download("pdf")}>
                <FileText data-icon="inline-start" />
                Export PDF
              </Button>
              <Button variant="outline" onClick={printReport}>
                <Printer data-icon="inline-start" />
                Print report
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action="/analytics" method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-[12rem_1fr_11rem_11rem_14rem_auto]">
            <input type="hidden" name="range" value={range} />
            <input type="hidden" name="centerId" value={centerId} />
            <div className="space-y-1">
              <Label>Report</Label>
              <Select value={report} onValueChange={(value) => value && setReport(value as ReportKind)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {reportOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Search Visible Rows</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Source, center, period, teacher..." />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Date Range</Label>
              <Select value={range} onValueChange={(value) => value && setRange(value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last 12 months</SelectItem>
                  <SelectItem value="all">Custom dates</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Start</Label>
              <Input name="start" type="date" value={start} onChange={(event) => {
                setStart(event.target.value);
                setRange("all");
              }} />
            </div>
            <div className="space-y-1">
              <Label>End</Label>
              <Input name="end" type="date" value={end} onChange={(event) => {
                setEnd(event.target.value);
                setRange("all");
              }} />
            </div>
            <div className="space-y-1">
              <Label>Center</Label>
              <Select value={centerId} onValueChange={(value) => value && setCenterId(value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accessible centers</SelectItem>
                  {data.centers.map((center) => (
                    <SelectItem key={center.id} value={center.id}>{center.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                <CalendarDays data-icon="inline-start" />
                Apply
              </Button>
            </div>
          </form>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Loaded range</div>
              <div className="mt-1 text-sm font-medium">{formatDate(data.range.startDate)} to {formatDate(data.range.endDate)}</div>
            </div>
            <div className="rounded-xl border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Lead conversion</div>
              <div className="mt-1 text-sm font-medium">{data.totals.leadConversionRate}% enrolled</div>
            </div>
            <div className="rounded-xl border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Attendance rate</div>
              <div className="mt-1 text-sm font-medium">{data.totals.attendanceRate}% present</div>
            </div>
            <div className="rounded-xl border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Message response</div>
              <div className="mt-1 text-sm font-medium">{data.totals.avgResponseHours === null ? "No replies" : `${data.totals.avgResponseHours}h avg`}</div>
            </div>
            <div className="rounded-xl border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Staff hours</div>
              <div className="mt-1 text-sm font-medium">{hours(data.totals.staffHoursMinutes)} decimal hours</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={report} onValueChange={(value) => value && setReport(value as ReportKind)} className="gap-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="lead_funnel"><TrendingUp data-icon="inline-start" />Lead funnel</TabsTrigger>
          <TabsTrigger value="attendance"><UsersRound data-icon="inline-start" />Attendance</TabsTrigger>
          <TabsTrigger value="billing"><ReceiptText data-icon="inline-start" />Billing/AR</TabsTrigger>
          <TabsTrigger value="messages"><MessageSquare data-icon="inline-start" />Messages</TabsTrigger>
          <TabsTrigger value="staff_hours"><Clock data-icon="inline-start" />Staff hours</TabsTrigger>
        </TabsList>
        <TabsContent value="lead_funnel" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>Lead Source Conversion</CardTitle>
                <CardDescription>Lead source, tour, application, and enrollment outcomes.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Center</TableHead>
                      <TableHead>Leads</TableHead>
                      <TableHead>Tours</TableHead>
                      <TableHead>Applications</TableHead>
                      <TableHead>Enrolled</TableHead>
                      <TableHead>Conversion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeadSources.map((row) => (
                      <TableRow key={`${row.centerId}:${row.source}`}>
                        <TableCell className="font-medium">{row.source}</TableCell>
                        <TableCell>{row.centerLabel}</TableCell>
                        <TableCell>{row.leads}</TableCell>
                        <TableCell>{row.tours}</TableCell>
                        <TableCell>{row.applications}</TableCell>
                        <TableCell>{row.enrolled}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: barWidth(row.conversionRate) }} />
                            </div>
                            <span>{row.conversionRate}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!filteredLeadSources.length ? (
                      <TableRow><TableCell colSpan={7} className="text-muted-foreground">No lead source rows match the report filters.</TableCell></TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>Funnel Stages</CardTitle>
                <CardDescription>Current distribution inside the selected reporting range.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.funnelStages.map((stage) => (
                  <div key={stage.stage} className="rounded-xl border bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{stage.stage.replaceAll("_", " ")}</div>
                      <Badge variant="outline">{stage.count}</Badge>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: barWidth(stage.share) }} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{stage.share}% of visible leads</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="attendance">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Attendance And Absence Trends</CardTitle>
              <CardDescription>Present, absent, check-in, and check-out trends by center and period.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Center</TableHead>
                    <TableHead>Present</TableHead>
                    <TableHead>Absent</TableHead>
                    <TableHead>Check-ins</TableHead>
                    <TableHead>Check-outs</TableHead>
                    <TableHead>Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAttendance.map((row) => (
                    <TableRow key={`${row.date}:${row.centerId}`}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.centerLabel}</TableCell>
                      <TableCell>{row.present}</TableCell>
                      <TableCell>{row.absent}</TableCell>
                      <TableCell>{row.checkIns}</TableCell>
                      <TableCell>{row.checkOuts}</TableCell>
                      <TableCell>{row.attendanceRate}%</TableCell>
                    </TableRow>
                  ))}
                  {!filteredAttendance.length ? (
                    <TableRow><TableCell colSpan={7} className="text-muted-foreground">No attendance rows match the report filters.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="billing">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Billing, Revenue, And AR</CardTitle>
              <CardDescription>Invoice totals, paid revenue, open AR, and overdue AR by center and period.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Center</TableHead>
                    <TableHead>Invoices</TableHead>
                    <TableHead>Invoiced</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Open AR</TableHead>
                    <TableHead>Overdue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBilling.map((row) => (
                    <TableRow key={`${row.period}:${row.centerId}`}>
                      <TableCell>{row.period}</TableCell>
                      <TableCell>{row.centerLabel}</TableCell>
                      <TableCell>{row.invoiceCount}</TableCell>
                      <TableCell>{money(row.invoiceCents)}</TableCell>
                      <TableCell>{money(row.paidCents)}</TableCell>
                      <TableCell>{money(row.openCents)}</TableCell>
                      <TableCell>{money(row.overdueCents)}</TableCell>
                    </TableRow>
                  ))}
                  {!filteredBilling.length ? (
                    <TableRow><TableCell colSpan={7} className="text-muted-foreground">No billing rows match the report filters.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="messages">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Parent Response Time And Message Analytics</CardTitle>
              <CardDescription>Parent-origin messages, staff replies, unread counts, and response speed.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Center</TableHead>
                    <TableHead>Parent messages</TableHead>
                    <TableHead>Staff replies</TableHead>
                    <TableHead>Unread</TableHead>
                    <TableHead>Avg response</TableHead>
                    <TableHead>Response rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMessages.map((row) => (
                    <TableRow key={row.centerId}>
                      <TableCell className="font-medium">{row.centerLabel}</TableCell>
                      <TableCell>{row.parentMessages}</TableCell>
                      <TableCell>{row.staffReplies}</TableCell>
                      <TableCell>{row.unreadMessages}</TableCell>
                      <TableCell>{row.avgResponseHours === null ? "No replies" : `${row.avgResponseHours}h`}</TableCell>
                      <TableCell>{row.responseRate}%</TableCell>
                    </TableRow>
                  ))}
                  {!filteredMessages.length ? (
                    <TableRow><TableCell colSpan={6} className="text-muted-foreground">No message rows match the report filters.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="staff_hours">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Staff Hours And Time Clock</CardTitle>
              <CardDescription>Teacher clock status, closed shifts, open shift time, and range totals for the selected centers.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Center</TableHead>
                    <TableHead>Classroom</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total decimal</TableHead>
                    <TableHead>Closed shifts</TableHead>
                    <TableHead>Open decimal</TableHead>
                    <TableHead>Last action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStaffHours.map((row) => (
                    <TableRow key={row.staffId}>
                      <TableCell>
                        <div className="font-medium">{row.staffName}</div>
                        <div className="text-xs text-muted-foreground">{row.staffEmail}</div>
                      </TableCell>
                      <TableCell>{row.centerLabel}</TableCell>
                      <TableCell>{row.classroomName}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "clocked_in" ? "default" : "outline"}>
                          {row.status === "clocked_in" ? "Clocked in" : "Clocked out"}
                        </Badge>
                      </TableCell>
                      <TableCell>{hours(row.totalMinutes)}</TableCell>
                      <TableCell>{row.closedShiftCount} / {hours(row.closedShiftMinutes)}</TableCell>
                      <TableCell>{row.openShiftMinutes ? hours(row.openShiftMinutes) : "None"}</TableCell>
                      <TableCell>{row.lastActionAt ? formatDate(row.lastActionAt) : "No history"}</TableCell>
                    </TableRow>
                  ))}
                  {!filteredStaffHours.length ? (
                    <TableRow><TableCell colSpan={8} className="text-muted-foreground">No staff hour rows match the report filters.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
