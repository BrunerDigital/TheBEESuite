"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Baby,
  BadgeDollarSign,
  CalendarCheck,
  CheckCircle2,
  FileWarning,
  MessageSquare,
  Printer,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { formatPrintDateTime, PrintableReport, ReportPrintStyles, usePrintableReport } from "@/components/printable-report";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedDateTime } from "@/lib/zoned-date-time";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardWidgetConfigurator } from "@/components/dashboard-widget-configurator";
import { DashboardSnapshotControls } from "@/components/dashboard-snapshot-controls";
import { InquiryEmbedCard } from "@/components/inquiry-embed-card";
import { SetupChecklistPanel } from "@/components/setup-checklist-panel";
import { CollapsibleCard, WorkspaceBoard, type WorkspaceBoardItem } from "@/components/workspace-preferences";
import type { DashboardAttendanceSnapshot, DashboardAttendanceSnapshotRow } from "@/lib/dashboard-attendance-snapshot";
import type { DashboardWidgetId, DashboardWidgetView } from "@/lib/dashboard-widgets";
import { prioritizeFteFollowUp } from "@/lib/corporate-dashboard";
import { formatMoneyCents } from "@/lib/staff-compensation";
import { analytics, centers, classrooms, kpis, leads, messages, notifications, pipelineStages } from "@/lib/demo-data";
import { directorLaunchChecklistTasks, teacherProfileChecklistTasks, type SetupChecklistKey } from "@/lib/setup-checklists";
import { formatStaffDecimalHours } from "@/lib/staff-kiosk";
import { cn } from "@/lib/utils";

const iconMap = [Baby, Users, CalendarCheck, BadgeDollarSign, CheckCircle2, ShieldAlert, MessageSquare, FileWarning];
const kpiWidgetIds: readonly DashboardWidgetId[] = [
  "attendanceSnapshot",
  "classroomCapacity",
  "attendanceSnapshot",
  "enrollmentPipeline",
  "toursAndTasks",
  "billingRevenue",
  "staffingRatios",
  "complianceQueue",
];
type DashboardLens = "platform" | "brand" | "regional" | "director" | "billing" | "teacher" | "parent" | "pickup";
type DashboardNotification = string | { text: string; widgetId?: DashboardWidgetId };

function notificationText(item: DashboardNotification) {
  return typeof item === "string" ? item : item.text;
}

function withQueryParam(href: string, key: string, value: string | number | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return href;
  const [base, hash = ""] = href.split("#", 2);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${encodeURIComponent(key)}=${encodeURIComponent(text)}${hash ? `#${hash}` : ""}`;
}

export type LiveDashboardData = {
  kpis: typeof kpis;
  pipelineStages: typeof pipelineStages;
  centers: typeof centers;
  leadRows?: typeof leads;
  aiSummary: string;
  aiHighlights?: string[];
  analytics?: typeof analytics;
  attendanceSnapshot?: DashboardAttendanceSnapshot;
  classroomSnapshots?: typeof classrooms;
  notifications?: DashboardNotification[];
  parentMessages?: typeof messages;
  asOfLabel?: string;
  showDemoFallbackData?: boolean;
  visibleLenses?: readonly DashboardLens[];
  dashboardWidgets?: DashboardWidgetView[];
  dashboardWidgetRoleLabel?: string;
  inquiryEmbed?: {
    title: string;
    description: string;
    embedCode: string;
  };
  inquiryEmbeds?: Array<{
    title: string;
    description: string;
    embedCode: string;
  }>;
  setupChecklists?: Array<{
    key: SetupChecklistKey;
    title: string;
    description: string;
    completedIds: string[];
    automaticCompletedIds?: string[];
    graphicHref: string;
  }>;
  executiveMetrics?: {
    currentWeekStart: string;
    currentWeekKey: string;
    fteDeadlineLabel: string;
    fteSubmittedSchools: number;
    fteMissingSchools: number;
    schoolComparisons: Array<{
      id: string;
      name: string;
      region: string;
      children: number;
      capacity: number;
      occupancy: number;
      staff: number;
      leads: number;
      toursToday: number;
      revenueDollars: number;
      compliance: number;
      fteCount: number | null;
      fteStatus: string;
      fteSubmitted: boolean;
    }>;
    weeklyFteTrend: Array<{
      week: string;
      submitted: number;
      missing: number;
      fteTotal: number;
      enrolledTotal: number;
    }>;
    fteSubmissions: Array<{
      id: string;
      centerId: string;
      schoolName: string;
      region: string;
      weekStart: string;
      weekEnd: string | null;
      enrolledCount: number;
      fullTimeCount: number;
      partTimeCount: number;
      fteCount: number;
      totalBilledAmount: number | null;
      payrollAmount: number | null;
      payrollPercent: number | null;
      newStarts: number | null;
      withdrawals: number | null;
      preregisteredChildren: number | null;
      status: string;
      source: string;
      submittedBy: string;
      submittedAt: string;
      updatedAt: string;
    }>;
    payrollSummaries: Array<{
      id: string;
      submissionId: string;
      centerId: string;
      schoolName: string;
      periodStart: string;
      periodEnd: string;
      employeeCount: number;
      totalMinutes: number;
      regularMinutes: number;
      overtimeMinutes: number;
      openMinutes: number;
      estimatedGrossCents: number | null;
      employeeSummaries: Array<{
        employeeId: string;
        employeeName: string;
        title: string;
        department: string;
        payCode: string;
        totalMinutes: number;
        regularMinutes: number;
        overtimeMinutes: number;
        openMinutes: number;
        estimatedGrossCents: number | null;
      }>;
      submittedBy: string;
      submittedAt: string;
    }>;
  };
};

function percentBar(value: number, max = 100) {
  return `${Math.max(0, Math.min(100, max ? (value / max) * 100 : 0))}%`;
}

function compactSchoolName(value: string) {
  return value.replace(/^Kid City USA\s*[-–]\s*/i, "").trim() || value;
}

function fteReportHref(centerId: string, weekStart?: string | null) {
  return withQueryParam(withQueryParam("/fte-reports", "centerId", centerId), "weekStart", weekStart);
}

function formatDashboardMoney(value: number | null | undefined) {
  return value === null || value === undefined ? "Not set" : `$${value.toLocaleString()}`;
}

function formatDashboardPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "Not set" : `${value.toLocaleString()}%`;
}

function formatDashboardNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "Not set" : value.toLocaleString();
}

function formatDashboardDateTime(value: string | null | undefined, timeZone: string) {
  return formatZonedDateTime(value, timeZone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

function ExecutiveLensDashboard({
  lens,
  metrics,
  trendData,
  actionQueue,
}: {
  lens: Exclude<DashboardLens, "director" | "billing" | "teacher" | "parent" | "pickup">;
  metrics: NonNullable<LiveDashboardData["executiveMetrics"]>;
  trendData: typeof analytics;
  actionQueue: DashboardNotification[];
}) {
  const timeZone = useSchoolTimeZone();
  const [payrollSchoolFilter, setPayrollSchoolFilter] = useState("all");
  const [selectedPayrollSummaryId, setSelectedPayrollSummaryId] = useState<string | null>(null);
  const {
    active: payrollPrintActive,
    generatedAt: payrollPrintGeneratedAt,
    print: printPayrollReport,
  } = usePrintableReport();
  const payrollSchools = [...new Map(metrics.payrollSummaries.map((summary) => [
    summary.centerId,
    { centerId: summary.centerId, schoolName: summary.schoolName },
  ])).values()].sort((left, right) => left.schoolName.localeCompare(right.schoolName));
  const filteredPayrollSummaries = payrollSchoolFilter === "all"
    ? metrics.payrollSummaries
    : metrics.payrollSummaries.filter((summary) => summary.centerId === payrollSchoolFilter);
  const selectedPayrollSummary = metrics.payrollSummaries.find((summary) => summary.id === selectedPayrollSummaryId) ?? null;
  const sortedByOccupancy = [...metrics.schoolComparisons].sort((left, right) => right.occupancy - left.occupancy).slice(0, 10);
  const sortedByRevenue = [...metrics.schoolComparisons].sort((left, right) => right.revenueDollars - left.revenueDollars).slice(0, 8);
  const sortedByLeads = [...metrics.schoolComparisons].sort((left, right) => right.leads - left.leads).slice(0, 8);
  const fteFollowUpSchools = prioritizeFteFollowUp(metrics.schoolComparisons);
  const maxRevenueDollars = Math.max(...sortedByRevenue.map((school) => school.revenueDollars), 1);
  const maxLeadCount = Math.max(...sortedByLeads.map((school) => school.leads), 1);
  const maxFteTotal = Math.max(...metrics.weeklyFteTrend.map((week) => week.fteTotal), 1);
  const submittedPercent = metrics.schoolComparisons.length
    ? Math.round((metrics.fteSubmittedSchools / metrics.schoolComparisons.length) * 100)
    : 0;
  const averageOccupancy = metrics.schoolComparisons.length
    ? Math.round(metrics.schoolComparisons.reduce((sum, school) => sum + school.occupancy, 0) / metrics.schoolComparisons.length)
    : 0;
  const totalOpenSeats = metrics.schoolComparisons.reduce((sum, school) => sum + Math.max(school.capacity - school.children, 0), 0);
  const title = lens === "platform" ? "Platform executive view" : lens === "brand" ? "Brand executive view" : "Regional executive view";
  const executiveItems: WorkspaceBoardItem[] = [
    {
      id: "executive-summary",
      title,
      className: "xl:col-span-2 2xl:col-span-3",
      children: (
        <CollapsibleCard
          id={`dashboard-${lens}-executive-summary`}
          className="glass-panel"
          contentClassName="grid gap-3 md:grid-cols-4"
          title={title}
          description="Company-level KPI visualizations across visible schools."
          headerActions={(
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/multi-location-dashboard" />}>
              <ArrowUpRight data-icon="inline-start" />
              Open multi-location
            </Button>
          )}
        >
          <div className="rounded-xl border bg-background/50 p-4">
            <div className="text-xs text-muted-foreground">FTE submitted</div>
            <div className="mt-2 text-3xl font-semibold">{submittedPercent}%</div>
            <p className="mt-1 text-xs text-muted-foreground">{metrics.fteSubmittedSchools}/{metrics.schoolComparisons.length} schools · due {metrics.fteDeadlineLabel}</p>
            <Progress className="mt-3" value={submittedPercent} />
          </div>
          <div className="rounded-xl border bg-background/50 p-4">
            <div className="text-xs text-muted-foreground">Missing FTE reports</div>
            <div className="mt-2 text-3xl font-semibold">{metrics.fteMissingSchools}</div>
            <p className="mt-1 text-xs text-muted-foreground">Current week {metrics.currentWeekStart}</p>
            <Progress className="mt-3" value={Math.max(0, 100 - submittedPercent)} />
          </div>
          <div className="rounded-xl border bg-background/50 p-4">
            <div className="text-xs text-muted-foreground">Average occupancy</div>
            <div className="mt-2 text-3xl font-semibold">{averageOccupancy}%</div>
            <p className="mt-1 text-xs text-muted-foreground">{totalOpenSeats.toLocaleString()} open seats across visible schools</p>
            <Progress className="mt-3" value={averageOccupancy} />
          </div>
          <div className="rounded-xl border bg-background/50 p-4">
            <div className="text-xs text-muted-foreground">Executive actions</div>
            <div className="mt-2 text-3xl font-semibold">{actionQueue.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">FTE, compliance, enrollment, billing, and parent-response queue</p>
            <Progress className="mt-3" value={Math.min(actionQueue.length * 12, 100)} />
          </div>
        </CollapsibleCard>
      ),
    },
    {
      id: "weekly-fte-progress",
      title: "Weekly FTE progress",
      className: "2xl:col-span-2",
      children: (
        <CollapsibleCard
          id={`dashboard-${lens}-weekly-fte-progress`}
          className="glass-panel"
          title="Weekly FTE progress"
          description="Submitted schools, missing schools, and total FTE by week."
        >
          {metrics.weeklyFteTrend.length ? (
            <div className="flex h-72 items-end gap-4 rounded-xl border bg-background/40 p-5">
              {metrics.weeklyFteTrend.map((week) => (
                <div key={week.week} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-56 w-full items-end justify-center gap-1">
                    <span className="w-4 rounded-t-md bg-primary" title={`${week.submitted} submitted`} style={{ height: percentBar(week.submitted, metrics.schoolComparisons.length || 1) }} />
                    <span className="w-4 rounded-t-md bg-destructive/70" title={`${week.missing} missing`} style={{ height: percentBar(week.missing, metrics.schoolComparisons.length || 1) }} />
                    <span className="w-4 rounded-t-md bg-[var(--chart-2)]" title={`${week.fteTotal} FTE`} style={{ height: percentBar(week.fteTotal, maxFteTotal) }} />
                  </div>
                  <span className="truncate text-xs text-muted-foreground">{week.week}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">No FTE submissions are visible yet.</p>
          )}
        </CollapsibleCard>
      ),
    },
    {
      id: "current-week-fte",
      title: "Current-week FTE by school",
      children: (
        <CollapsibleCard
          id={`dashboard-${lens}-current-week-fte`}
          className="glass-panel"
          contentClassName="grid gap-3"
          title="Current-week FTE by school"
          description="Schools missing this week are highlighted for follow-up."
        >
          <div className="grid max-h-[36rem] gap-3 overflow-auto pr-1">
          {fteFollowUpSchools.map((school) => (
            <div key={school.id} className="rounded-xl border bg-background/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{compactSchoolName(school.name)}</div>
                  <div className="text-xs text-muted-foreground">{school.region}</div>
                </div>
                <Badge
                  variant={school.fteSubmitted ? "default" : "destructive"}
                  render={(
                    <Link href={fteReportHref(school.id, metrics.currentWeekKey)} aria-label={`Open FTE report follow-up for ${school.name}`} />
                  )}
                >
                  {school.fteSubmitted ? school.fteStatus : "Missing"}
                </Badge>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Progress value={school.fteSubmitted ? 100 : 8} />
                <span className="w-14 text-right text-xs font-medium">{school.fteCount ?? 0} FTE</span>
              </div>
            </div>
          ))}
          </div>
        </CollapsibleCard>
      ),
    },
    {
      id: "school-fte-submissions",
      title: "School FTE submissions",
      className: "xl:col-span-2 2xl:col-span-3",
      children: (
        <CollapsibleCard
          id={`dashboard-${lens}-school-fte-submissions`}
          className="glass-panel"
          title="School FTE submissions"
          description="Submission-level FTE history from every visible school."
          headerActions={(
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/fte-reports" />}>
              <ArrowUpRight data-icon="inline-start" />
              Open reports
            </Button>
          )}
        >
          {metrics.fteSubmissions.length ? (
            <div className="max-h-[30rem] overflow-auto rounded-xl border bg-background/40">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="min-w-[14rem]">School</TableHead>
                    <TableHead>Week</TableHead>
                    <TableHead className="text-right">FTE / enrolled</TableHead>
                    <TableHead className="text-right">Billing / payroll</TableHead>
                    <TableHead className="text-right">Movement</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.fteSubmissions.map((submission) => {
                    const href = fteReportHref(submission.centerId, submission.weekStart);
                    const startsLabel = submission.newStarts === null ? "Starts not set" : `${submission.newStarts.toLocaleString()} starts`;
                    const withdrawalsLabel = submission.withdrawals === null ? "Withdrawn not set" : `${submission.withdrawals.toLocaleString()} withdrawn`;
                    const preregisteredLabel = submission.preregisteredChildren === null ? "Preregistered not set" : `${submission.preregisteredChildren.toLocaleString()} preregistered`;
                    return (
                      <TableRow key={submission.id}>
                        <TableCell className="max-w-[18rem] whitespace-normal">
                          <Link href={href} className="font-medium hover:underline">
                            {compactSchoolName(submission.schoolName)}
                          </Link>
                          <div className="text-xs text-muted-foreground">{submission.region}</div>
                        </TableCell>
                        <TableCell>
                          <Link href={href} className="font-medium hover:underline">{submission.weekStart}</Link>
                          <div className="text-xs text-muted-foreground">{submission.weekEnd ? `Ends ${submission.weekEnd}` : "Week end not set"}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="font-medium">{submission.fteCount.toLocaleString()} FTE</div>
                          <div className="text-xs text-muted-foreground">{submission.enrolledCount.toLocaleString()} enrolled · {submission.fullTimeCount.toLocaleString()} FT · {submission.partTimeCount.toLocaleString()} PT</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="font-medium">{formatDashboardMoney(submission.totalBilledAmount)}</div>
                          <div className="text-xs text-muted-foreground">{formatDashboardMoney(submission.payrollAmount)} payroll · {formatDashboardPercent(submission.payrollPercent)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="font-medium">{startsLabel}</div>
                          <div className="text-xs text-muted-foreground">{withdrawalsLabel} · {preregisteredLabel}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={submission.status === "submitted" ? "default" : "secondary"} render={<Link href={href} aria-label={`Open ${submission.schoolName} FTE submission for ${submission.weekStart}`} />}>
                            {submission.status}
                          </Badge>
                          <div className="mt-1 text-xs text-muted-foreground">{submission.source}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{submission.submittedBy}</div>
                          <div className="text-xs text-muted-foreground">{formatDashboardDateTime(submission.updatedAt, timeZone)}</div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">No school FTE submissions are visible yet.</p>
          )}
        </CollapsibleCard>
      ),
    },
    {
      id: "payroll-summary-submissions",
      title: "Payroll summaries",
      className: "xl:col-span-2 2xl:col-span-3",
      children: (
        <CollapsibleCard
          id={`dashboard-${lens}-payroll-summary-submissions`}
          className="glass-panel"
          title="Payroll summaries"
          description="Payroll summaries sent by directors for executive review, including totals for each employee."
        >
          {metrics.payrollSummaries.length ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="w-full max-w-sm space-y-1">
                  <div className="text-xs font-medium uppercase text-muted-foreground">School</div>
                  <Select value={payrollSchoolFilter} onValueChange={(value) => value && setPayrollSchoolFilter(value)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All visible schools</SelectItem>
                      {payrollSchools.map((school) => (
                        <SelectItem key={school.centerId} value={school.centerId}>{compactSchoolName(school.schoolName)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-sm text-muted-foreground">
                  {filteredPayrollSummaries.length} submitted report{filteredPayrollSummaries.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="max-h-[30rem] overflow-auto rounded-xl border bg-background/40">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>School</TableHead>
                    <TableHead>Pay period</TableHead>
                    <TableHead className="text-right">Employees</TableHead>
                    <TableHead className="text-right">Regular / OT</TableHead>
                    <TableHead className="text-right">Total / open</TableHead>
                    <TableHead className="text-right">Est. gross</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Report</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayrollSummaries.map((summary) => (
                      <TableRow key={summary.id}>
                        <TableCell className="font-medium">{compactSchoolName(summary.schoolName)}</TableCell>
                        <TableCell>{summary.periodStart} to {summary.periodEnd}</TableCell>
                        <TableCell className="text-right">{summary.employeeCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          {formatStaffDecimalHours(summary.regularMinutes)} / {formatStaffDecimalHours(summary.overtimeMinutes)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatStaffDecimalHours(summary.totalMinutes)} / {formatStaffDecimalHours(summary.openMinutes)}
                        </TableCell>
                        <TableCell className="text-right">{formatMoneyCents(summary.estimatedGrossCents)}</TableCell>
                        <TableCell>
                          <div>{summary.submittedBy}</div>
                          <div className="text-xs text-muted-foreground">{formatDashboardDateTime(summary.submittedAt, timeZone)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedPayrollSummaryId(summary.id)}>
                            Open report
                          </Button>
                        </TableCell>
                      </TableRow>
                  ))}
                  {!filteredPayrollSummaries.length ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                        No payroll reports have been submitted for this school.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">No payroll summaries have been sent yet.</p>
          )}
        </CollapsibleCard>
      ),
    },
    {
      id: "occupancy-comparison",
      title: "Occupancy comparison",
      children: (
        <CollapsibleCard
          id={`dashboard-${lens}-occupancy-comparison`}
          className="glass-panel"
          contentClassName="grid gap-3"
          title="Occupancy comparison"
          description="Top schools by current child count against licensed capacity."
        >
          {sortedByOccupancy.map((school) => (
            <div key={school.id} className="grid gap-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{compactSchoolName(school.name)}</span>
                <span className="text-muted-foreground">{school.occupancy}%</span>
              </div>
              <Progress value={school.occupancy} />
            </div>
          ))}
        </CollapsibleCard>
      ),
    },
    {
      id: "revenue-comparison",
      title: "Revenue comparison",
      children: (
        <CollapsibleCard
          id={`dashboard-${lens}-revenue-comparison`}
          className="glass-panel"
          contentClassName="grid gap-3"
          title="Revenue comparison"
          description="Invoice total snapshot by school."
        >
          {sortedByRevenue.map((school) => (
            <div key={school.id} className="grid gap-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{compactSchoolName(school.name)}</span>
                <span className="text-muted-foreground">${school.revenueDollars.toLocaleString()}</span>
              </div>
              <Progress value={(school.revenueDollars / maxRevenueDollars) * 100} />
            </div>
          ))}
        </CollapsibleCard>
      ),
    },
    {
      id: "lead-tour-pressure",
      title: "Lead and tour pressure",
      children: (
        <CollapsibleCard
          id={`dashboard-${lens}-lead-tour-pressure`}
          className="glass-panel"
          contentClassName="grid gap-3"
          title="Lead and tour pressure"
          description="Schools with the highest active inquiry load."
        >
          {sortedByLeads.map((school) => (
            <div key={school.id} className="rounded-xl border bg-background/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{compactSchoolName(school.name)}</div>
                  <div className="text-xs text-muted-foreground">{school.toursToday} tours today</div>
                </div>
                <Badge
                  variant="secondary"
                  render={<Link href={withQueryParam("/crm-leads", "q", school.name)} aria-label={`Open CRM leads for ${school.name}`} />}
                >
                  {school.leads} leads
                </Badge>
              </div>
              <Progress className="mt-3" value={(school.leads / maxLeadCount) * 100} />
            </div>
          ))}
        </CollapsibleCard>
      ),
    },
    ...(trendData.length ? [{
      id: "company-trend-snapshot",
      title: "Company trend snapshot",
      className: "xl:col-span-2 2xl:col-span-3",
      children: (
        <CollapsibleCard
          id={`dashboard-${lens}-company-trend-snapshot`}
          className="glass-panel"
          title="Company trend snapshot"
          description="Enrollment funnel and revenue trend for visible schools."
        >
          <div className="flex h-72 items-end gap-4 rounded-xl border bg-background/40 p-5">
            {trendData.map((point) => (
              <div key={point.month} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex h-56 w-full items-end justify-center gap-1">
                  <span className="w-3 rounded-t-md bg-[var(--chart-3)]" style={{ height: percentBar(point.leads, Math.max(...trendData.map((item) => item.leads), 1)) }} />
                  <span className="w-3 rounded-t-md bg-primary" style={{ height: percentBar(point.tours, Math.max(...trendData.map((item) => item.tours), 1)) }} />
                  <span className="w-3 rounded-t-md bg-[var(--chart-2)]" style={{ height: percentBar(point.enrolled, Math.max(...trendData.map((item) => item.enrolled), 1)) }} />
                  <span className="w-3 rounded-t-md bg-[var(--chart-5)]" style={{ height: percentBar(point.revenue, Math.max(...trendData.map((item) => item.revenue), 1)) }} />
                </div>
                <span className="text-xs text-muted-foreground">{point.month}</span>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      ),
    } satisfies WorkspaceBoardItem] : []),
  ];

  return (
    <>
      <ReportPrintStyles />
      <WorkspaceBoard storageId={`dashboard-${lens}-executive`} className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-3" items={executiveItems} />
      <Dialog open={Boolean(selectedPayrollSummary)} onOpenChange={(open) => {
        if (!open) setSelectedPayrollSummaryId(null);
      }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Payroll report</DialogTitle>
            <DialogDescription>
              {selectedPayrollSummary
                ? `${compactSchoolName(selectedPayrollSummary.schoolName)} · ${selectedPayrollSummary.periodStart} to ${selectedPayrollSummary.periodEnd}`
                : "Submitted payroll report"}
            </DialogDescription>
          </DialogHeader>
          {selectedPayrollSummary ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
                <div>
                  <div className="font-medium">{selectedPayrollSummary.employeeCount} employees · {formatStaffDecimalHours(selectedPayrollSummary.totalMinutes)} total hours</div>
                  <div className="text-muted-foreground">Submitted by {selectedPayrollSummary.submittedBy} on {formatDashboardDateTime(selectedPayrollSummary.submittedAt, timeZone)}</div>
                </div>
                <Button type="button" variant="outline" onClick={printPayrollReport}>
                  <Printer data-icon="inline-start" />
                  Print report
                </Button>
              </div>
              {selectedPayrollSummary.employeeSummaries.length ? (
                <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department / pay code</TableHead>
                      <TableHead className="text-right">Regular</TableHead>
                      <TableHead className="text-right">OT</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                      <TableHead className="text-right">Est. gross</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPayrollSummary.employeeSummaries.map((employee) => (
                      <TableRow key={employee.employeeId}>
                        <TableCell>
                          <div className="font-medium">{employee.employeeName}</div>
                          <div className="text-xs text-muted-foreground">{employee.title}</div>
                        </TableCell>
                        <TableCell>{[employee.department, employee.payCode].filter(Boolean).join(" · ")}</TableCell>
                        <TableCell className="text-right">{formatStaffDecimalHours(employee.regularMinutes)}</TableCell>
                        <TableCell className="text-right">{formatStaffDecimalHours(employee.overtimeMinutes)}</TableCell>
                        <TableCell className="text-right font-medium">{formatStaffDecimalHours(employee.totalMinutes)}</TableCell>
                        <TableCell className="text-right">{formatStaffDecimalHours(employee.openMinutes)}</TableCell>
                        <TableCell className="text-right">{formatMoneyCents(employee.estimatedGrossCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <div className="font-semibold">This is an older total-only submission.</div>
                  <p className="mt-1">
                    Employee details were not stored when this report was submitted. The school must send this payroll summary again to create the full employee list.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <PrintableReport active={payrollPrintActive && Boolean(selectedPayrollSummary)} label="Printable payroll report">
        {selectedPayrollSummary ? (
          <>
            <header>
              <h1>Payroll Report</h1>
              <p>{selectedPayrollSummary.schoolName}</p>
              <p>Pay period: {selectedPayrollSummary.periodStart} to {selectedPayrollSummary.periodEnd}</p>
              <p>Submitted by {selectedPayrollSummary.submittedBy}: {formatPrintDateTime(selectedPayrollSummary.submittedAt, timeZone)}</p>
              <p>Printed: {formatPrintDateTime(payrollPrintGeneratedAt, timeZone)}</p>
            </header>
            <h2>Employee payroll summary</h2>
            {selectedPayrollSummary.employeeSummaries.length ? (
              <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department / pay code</th>
                  <th>Regular</th>
                  <th>OT</th>
                  <th>Total</th>
                  <th>Open</th>
                  <th>Estimated gross</th>
                </tr>
              </thead>
              <tbody>
                {selectedPayrollSummary.employeeSummaries.map((employee) => (
                  <tr key={employee.employeeId}>
                    <td>{employee.employeeName}{employee.title ? ` · ${employee.title}` : ""}</td>
                    <td>{[employee.department, employee.payCode].filter(Boolean).join(" · ")}</td>
                    <td>{formatStaffDecimalHours(employee.regularMinutes)}</td>
                    <td>{formatStaffDecimalHours(employee.overtimeMinutes)}</td>
                    <td>{formatStaffDecimalHours(employee.totalMinutes)}</td>
                    <td>{formatStaffDecimalHours(employee.openMinutes)}</td>
                    <td>{formatMoneyCents(employee.estimatedGrossCents)}</td>
                  </tr>
                ))}
                <tr>
                  <th colSpan={2}>School total</th>
                  <th>{formatStaffDecimalHours(selectedPayrollSummary.regularMinutes)}</th>
                  <th>{formatStaffDecimalHours(selectedPayrollSummary.overtimeMinutes)}</th>
                  <th>{formatStaffDecimalHours(selectedPayrollSummary.totalMinutes)}</th>
                  <th>{formatStaffDecimalHours(selectedPayrollSummary.openMinutes)}</th>
                  <th>{formatMoneyCents(selectedPayrollSummary.estimatedGrossCents)}</th>
                </tr>
              </tbody>
              </table>
            ) : (
              <p>
                Employee details are unavailable for this older total-only submission. Resend the payroll summary from the school workspace to create the full employee list.
              </p>
            )}
          </>
        ) : null}
      </PrintableReport>
    </>
  );
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function AttendanceSegmentBar({
  present,
  checkedOut,
  absent,
  notMarked,
  total,
}: {
  present: number;
  checkedOut: number;
  absent: number;
  notMarked: number;
  total: number;
}) {
  const segments = [
    { key: "present", value: present, className: "bg-primary" },
    { key: "checkedOut", value: checkedOut, className: "bg-[var(--chart-2)]" },
    { key: "absent", value: absent, className: "bg-destructive" },
    { key: "notMarked", value: notMarked, className: "bg-muted-foreground/40" },
  ];

  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
      {total ? segments.map((segment) => (
        segment.value ? (
          <span
            key={segment.key}
            className={segment.className}
            style={{ width: `${percent(segment.value, total)}%` }}
          />
        ) : null
      )) : <span className="w-full bg-muted-foreground/20" />}
    </div>
  );
}

function AttendanceClassroomRow({ row, href }: { row: DashboardAttendanceSnapshotRow; href: string }) {
  return (
    <Link
      href={withQueryParam(href, "classroomId", row.classroomId)}
      className="group grid gap-3 rounded-lg border bg-background/45 p-3 transition hover:border-primary/40 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center"
      aria-label={`Open attendance details for ${row.classroomName}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium">{row.classroomName}</div>
          <ArrowUpRight className="size-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" />
        </div>
        <div className="text-xs text-muted-foreground">{row.centerName}</div>
      </div>
      <div className="grid gap-2">
        <AttendanceSegmentBar
          present={row.present}
          checkedOut={row.checkedOut}
          absent={row.absent}
          notMarked={row.notMarked}
          total={row.total}
        />
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <span>{row.present} in</span>
          <span>{row.checkedOut} out</span>
          <span>{row.absent} absent</span>
          <span>{row.notMarked} open</span>
        </div>
      </div>
    </Link>
  );
}

function AttendanceSnapshotCard({
  snapshot,
  isTeacherDashboard,
  href,
}: {
  snapshot: DashboardAttendanceSnapshot;
  isTeacherDashboard: boolean;
  href: string;
}) {
  const attendanceRate = snapshot.total ? Math.round((snapshot.present / snapshot.total) * 100) : 0;
  return (
    <CollapsibleCard
      id="dashboard-attendance-snapshot"
      className="glass-panel"
      contentClassName="grid gap-5"
      title="Attendance Snapshot"
      description={isTeacherDashboard
        ? "Current check-in view for your assigned classroom."
        : "Current check-in view across all classes in your school scope."}
      headerActions={<Badge variant="outline">{snapshot.scopeLabel}</Badge>}
    >
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border bg-background/45 p-3">
            <div className="text-xs text-muted-foreground">Present now</div>
            <div className="mt-1 text-2xl font-semibold">{snapshot.present}/{snapshot.total}</div>
          </div>
          <div className="rounded-lg border bg-background/45 p-3">
            <div className="text-xs text-muted-foreground">Attendance rate</div>
            <div className="mt-1 text-2xl font-semibold">{attendanceRate}%</div>
          </div>
          <div className="rounded-lg border bg-background/45 p-3">
            <div className="text-xs text-muted-foreground">Checked out</div>
            <div className="mt-1 text-2xl font-semibold">{snapshot.checkedOut}</div>
          </div>
          <div className="rounded-lg border bg-background/45 p-3">
            <div className="text-xs text-muted-foreground">Needs mark</div>
            <div className="mt-1 text-2xl font-semibold">{snapshot.notMarked}</div>
          </div>
        </div>
        <div className="grid gap-2">
          <AttendanceSegmentBar
            present={snapshot.present}
            checkedOut={snapshot.checkedOut}
            absent={snapshot.absent}
            notMarked={snapshot.notMarked}
            total={snapshot.total}
          />
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span><b className="text-foreground">{snapshot.present}</b> present</span>
            <span><b className="text-foreground">{snapshot.checkedOut}</b> checked out</span>
            <span><b className="text-foreground">{snapshot.absent}</b> absent</span>
            <span><b className="text-foreground">{snapshot.notMarked}</b> not marked</span>
          </div>
        </div>
        {snapshot.rows.length ? (
          <div className="grid gap-3">
            {snapshot.rows.map((row) => (
              <AttendanceClassroomRow key={row.classroomId} row={row} href={href} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border bg-background/45 p-3 text-sm text-muted-foreground">
            No classroom attendance records are visible for this login yet.
          </p>
        )}
    </CollapsibleCard>
  );
}

export function ExecutiveDashboard({ live }: { live?: LiveDashboardData }) {
  const timeZone = useSchoolTimeZone();
  const dashboardKpis = live?.kpis ?? kpis;
  const dashboardPipeline = live?.pipelineStages ?? pipelineStages;
  const dashboardCenters = live?.centers ?? centers;
  const dashboardLeads = live ? live.leadRows ?? [] : leads;
  const visibleLenses = live?.visibleLenses?.length
    ? live.visibleLenses
    : (["platform", "brand", "regional", "director", "teacher", "parent"] as const);
  const defaultLens = visibleLenses.includes("director") ? "director" : visibleLenses[0] ?? "director";
  const secondaryLenses = visibleLenses.filter((lens) => lens !== "director");
  const showDemoFallbackData = Boolean(live?.showDemoFallbackData);
  const configuredWidgets = live?.dashboardWidgets?.length ? live.dashboardWidgets : [];
  const hasWidgetConfiguration = configuredWidgets.length > 0;
  const visibleWidgetIdSet = new Set(configuredWidgets.filter((widget) => widget.visible).map((widget) => widget.id));
  const widgetOrder = new Map(configuredWidgets.map((widget, index) => [widget.id, index]));
  const isWidgetVisible = (widgetId: DashboardWidgetId) => !hasWidgetConfiguration || visibleWidgetIdSet.has(widgetId);
  const isAnyWidgetVisible = (widgetIds: DashboardWidgetId[]) => widgetIds.some((widgetId) => isWidgetVisible(widgetId));
  const dashboardKpiRows = dashboardKpis
    .map((kpi, index) => ({
      kpi,
      index,
      Icon: iconMap[index] ?? Baby,
      widgetId: kpiWidgetIds[index] ?? "executiveRollup",
    }))
    .filter((row) => isWidgetVisible(row.widgetId))
    .sort((left, right) => {
      const leftOrder = widgetOrder.get(left.widgetId) ?? left.index + 100;
      const rightOrder = widgetOrder.get(right.widgetId) ?? right.index + 100;
      return leftOrder - rightOrder || left.index - right.index;
    });
  const visibleDashboardKpis = dashboardKpiRows.map((row) => row.kpi);
  const topKpiRows = dashboardKpiRows.filter((row) => row.index < 4);
  const lowerKpiRows = dashboardKpiRows.filter((row) => row.index >= 4);
  const dashboardAnalytics = live?.analytics?.length
    ? live.analytics
    : showDemoFallbackData
      ? analytics
      : [];
  const rawActionQueue = live?.notifications?.length
    ? live.notifications
    : showDemoFallbackData
      ? notifications
      : [];
  const actionQueue = rawActionQueue.filter((item) => typeof item === "string" || !item.widgetId || isWidgetVisible(item.widgetId));
  const classroomSnapshots = live?.classroomSnapshots?.length
    ? live.classroomSnapshots
    : showDemoFallbackData
      ? classrooms
      : [];
  const attendanceSnapshot = live?.attendanceSnapshot ?? (showDemoFallbackData ? {
    scopeLabel: "Demo school",
    total: classroomSnapshots.reduce((sum, room) => sum + Number(room.present), 0),
    present: classroomSnapshots.reduce((sum, room) => sum + Number(room.present), 0),
    checkedOut: 0,
    absent: 0,
    notMarked: 0,
    rows: classroomSnapshots.map((room) => ({
      classroomId: String(room.name),
      classroomName: String(room.name),
      centerName: "Kid City USA - Demo",
      total: Number(room.present),
      present: Number(room.present),
      checkedOut: 0,
      absent: 0,
      notMarked: 0,
    })),
  } : null);
  const parentMessages = live?.parentMessages?.length
    ? live.parentMessages
    : showDemoFallbackData
      ? messages
      : [];
  const isClassroomDemo = showDemoFallbackData && !live?.classroomSnapshots?.length;
  const isParentMessageDemo = showDemoFallbackData && !live?.parentMessages?.length;
  const aiSummary = live?.aiSummary ??
    "Your visible centers are operating inside configured workflow targets. Prioritize high-fit inquiries, review open tasks, and confirm sensitive actions before sending messages or changing records.";
  const aiHighlights = live?.aiHighlights?.length
    ? live.aiHighlights
    : showDemoFallbackData
      ? ["4 high-fit leads", "8 expiring docs", "2 open seats"]
      : [];
  const asOfLabel = live?.asOfLabel ?? "Demo workspace";
  const maxRevenue = Math.max(...dashboardAnalytics.map((point) => point.revenue), 1);
  const maxFunnelCount = Math.max(...dashboardAnalytics.flatMap((point) => [point.leads, point.tours, point.enrolled]), 1);
  const openSeatsByAgeGroup = Array.from(
    classroomSnapshots.reduce((groups, room) => {
      const label = String(room.ageGroup || "Unassigned");
      const capacity = Number(room.capacity);
      const present = Number(room.present);
      groups.set(label, (groups.get(label) ?? 0) + Math.max(capacity - present, 0));
      return groups;
    }, new Map<string, number>()),
    ([label, value]) => ({ label, value }),
  ).filter((item) => item.value > 0);
  const totalOpenSeats = openSeatsByAgeGroup.reduce((sum, item) => sum + item.value, 0);
  const ageGroupColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
  const inquiryEmbeds = live?.inquiryEmbeds?.length
    ? live.inquiryEmbeds
    : live?.inquiryEmbed
      ? [live.inquiryEmbed]
      : [];
  const setupChecklists = live?.setupChecklists ?? [];
  const barHeight = (value: number, max: number) => `${value ? Math.max((value / max) * 100, 6) : 0}%`;
  const kpiValue = (label: string, fallback = "0") => dashboardKpis.find((kpi) => kpi.label === label)?.value ?? fallback;
  const kpiTrend = (label: string, fallback = "") => dashboardKpis.find((kpi) => kpi.label === label)?.trend ?? fallback;
  const showAiBrief = isWidgetVisible("aiBrief");
  const showEnrollment = isWidgetVisible("enrollmentPipeline");
  const showClassroomCapacity = isWidgetVisible("classroomCapacity");
  const showFamilyCommunication = isWidgetVisible("familyCommunication");
  const showExecutiveRollup = isWidgetVisible("executiveRollup");
  const isTeacherDashboard = visibleLenses.length === 1 && visibleLenses.includes("teacher");
  const isBillingDashboard = visibleLenses.length === 1 && visibleLenses.includes("billing");
  const isParentDashboard = visibleLenses.length === 1 && visibleLenses.includes("parent");
  const isPickupDashboard = visibleLenses.length === 1 && visibleLenses.includes("pickup");
  const commandCenterDescription = isTeacherDashboard
    ? "Classroom attendance, daily reports, incident notes, family messages, and ratio awareness for your assigned room."
    : isBillingDashboard
      ? "Invoices, payments, family billing messages, and account follow-up for your permitted billing scope."
      : isParentDashboard
        ? "Your family portal, child updates, messages, documents, invoices, and payment actions."
        : isPickupDashboard
          ? "Authorized pickup access, child status, approved pickup details, and family account updates."
          : "Enrollment, classroom operations, billing, compliance-ready documentation, and parent trust signals in one white-label operating system.";
  const aiBriefHref = isTeacherDashboard ? "/teacher-portal" : isBillingDashboard ? "/messages" : isParentDashboard || isPickupDashboard ? "/parent-portal" : "/ai-command";
  const visibleSnapshotPipeline = showEnrollment ? dashboardPipeline : [];
  const visibleSnapshotLeads = isAnyWidgetVisible(["enrollmentPipeline", "toursAndTasks"]) ? dashboardLeads : [];
  const visibleSnapshotCenters = !isTeacherDashboard && !isBillingDashboard && !isParentDashboard && !isPickupDashboard && isAnyWidgetVisible(["executiveRollup", "attendanceSnapshot", "classroomCapacity", "staffingRatios"])
    ? dashboardCenters
    : [];
  const attendanceHref = isParentDashboard || isPickupDashboard ? "/parent-portal" : isTeacherDashboard ? "/classroom-dashboard" : "/attendance";
  const attendanceDetail = isParentDashboard || isPickupDashboard
    ? "Family attendance and pickup status"
    : isTeacherDashboard
      ? "Classroom attendance"
      : kpiTrend("Occupancy", "Attendance and occupancy");
  const showAttendanceSnapshotCard = Boolean(attendanceSnapshot)
    && isWidgetVisible("attendanceSnapshot")
    && (isTeacherDashboard || visibleLenses.includes("director"));
  const visibleConfiguredWidgets = hasWidgetConfiguration ? configuredWidgets.filter((widget) => widget.visible) : [];
  const widgetSummaries: Partial<Record<DashboardWidgetId, { value: string; detail: string; href: string }>> = {
    aiBrief: { value: aiHighlights.length ? aiHighlights.join(" · ") : "Ready", detail: "Human review required", href: aiBriefHref },
    executiveRollup: { value: `${dashboardCenters.length}`, detail: "Visible centers", href: "/multi-location-dashboard" },
    enrollmentPipeline: { value: kpiValue("New leads"), detail: kpiTrend("New leads", "Live enrollment pipeline"), href: "/crm-leads" },
    toursAndTasks: { value: kpiValue("Tours today"), detail: kpiTrend("Tours today", "Open tour and CRM tasks"), href: "/tours" },
    attendanceSnapshot: attendanceSnapshot
      ? {
          value: `${attendanceSnapshot.present}/${attendanceSnapshot.total}`,
          detail: `${attendanceSnapshot.checkedOut} checked out · ${attendanceSnapshot.absent} absent · ${attendanceSnapshot.notMarked} not marked`,
          href: attendanceHref,
        }
      : { value: kpiValue("Active children"), detail: attendanceDetail, href: attendanceHref },
    classroomCapacity: { value: `${totalOpenSeats}`, detail: "Open seats by age group", href: "/center-dashboard" },
    billingRevenue: { value: kpiValue("Outstanding balances"), detail: kpiTrend("Outstanding balances", "Billing snapshot"), href: "/billing-invoices" },
    staffingRatios: {
      value: kpiValue("Teachers"),
      detail: kpiTrend("Teachers", isTeacherDashboard ? "Classroom coverage" : "Teacher coverage"),
      href: isTeacherDashboard ? "/classroom-dashboard" : "/staff",
    },
    complianceQueue: {
      value: kpiValue("Incidents to review"),
      detail: kpiTrend("Incidents to review", isTeacherDashboard ? "Classroom reports" : "Review queue"),
      href: isTeacherDashboard ? "/incident-reports" : "/compliance",
    },
    familyCommunication: { value: `${parentMessages.length}`, detail: "Recent family messages", href: "/messages" },
    parentAccount: { value: "Portal", detail: "Family account view", href: "/parent-portal" },
  };
  const { active: printActive, generatedAt: printGeneratedAt, print: printDashboard } = usePrintableReport();
  const canPrintDashboard = visibleLenses.some((lens) => ["platform", "brand", "regional", "director", "billing"].includes(lens));
  const dashboardPrintScope = visibleLenses
    .filter((lens) => ["platform", "brand", "regional", "director", "billing"].includes(lens))
    .map((lens) => lens.replaceAll("_", " "))
    .join(", ") || live?.dashboardWidgetRoleLabel || "Dashboard";

  function renderKpiCard({ kpi, Icon, widgetId }: (typeof dashboardKpiRows)[number], valueClassName: string) {
    const href = widgetSummaries[widgetId]?.href ?? "/dashboard";
    return (
      <Link
        href={href}
        className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${kpi.label}`}
      >
        <Card className="glass-panel h-full transition group-hover:border-primary/40 group-hover:bg-background/70">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
            <CardDescription>{kpi.label}</CardDescription>
            <Icon className="text-primary" />
          </CardHeader>
          <CardContent>
            <div className={cn("font-semibold", valueClassName)}>{kpi.value}</div>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.trend}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
              Open view
              <ArrowUpRight className="size-3" />
            </span>
          </CardContent>
        </Card>
      </Link>
    );
  }

  const topKpiItems: WorkspaceBoardItem[] = topKpiRows.map((row) => ({
    id: `top-kpi-${row.widgetId}-${row.kpi.label}`,
    title: row.kpi.label,
    children: renderKpiCard(row, "text-3xl"),
  }));
  const lowerKpiItems: WorkspaceBoardItem[] = lowerKpiRows.map((row) => ({
    id: `director-kpi-${row.widgetId}-${row.kpi.label}`,
    title: row.kpi.label,
    children: renderKpiCard(row, "text-2xl"),
  }));

  return (
    <div className="flex flex-col gap-6">
      <ReportPrintStyles />
      <PrintableReport active={printActive} label="Printable dashboard snapshot">
        <header>
          <h1>The BEE Suite Dashboard Snapshot</h1>
          <p>Scope: {dashboardPrintScope}</p>
          <p>As of: {asOfLabel}</p>
          <p>Generated: {formatPrintDateTime(printGeneratedAt, timeZone)}</p>
        </header>
        <h2>KPI Summary</h2>
        <table>
          <thead><tr><th>Metric</th><th>Value</th><th>Detail</th></tr></thead>
          <tbody>
            {visibleDashboardKpis.map((kpi) => (
              <tr key={kpi.label}>
                <td>{kpi.label}</td>
                <td>{kpi.value}</td>
                <td>{kpi.trend}</td>
              </tr>
            ))}
            {!visibleDashboardKpis.length ? <tr><td colSpan={3}>No KPI widgets are visible for this login.</td></tr> : null}
          </tbody>
        </table>

        {attendanceSnapshot ? (
          <>
            <h2>Attendance Snapshot</h2>
            <table>
              <tbody>
                <tr><th>Scope</th><td>{attendanceSnapshot.scopeLabel}</td></tr>
                <tr><th>Present</th><td>{attendanceSnapshot.present}/{attendanceSnapshot.total}</td></tr>
                <tr><th>Checked out</th><td>{attendanceSnapshot.checkedOut}</td></tr>
                <tr><th>Absent</th><td>{attendanceSnapshot.absent}</td></tr>
                <tr><th>Not marked</th><td>{attendanceSnapshot.notMarked}</td></tr>
              </tbody>
            </table>
            <table>
              <thead><tr><th>Classroom</th><th>Center</th><th>Present</th><th>Checked out</th><th>Absent</th><th>Not marked</th><th>Total</th></tr></thead>
              <tbody>
                {attendanceSnapshot.rows.map((row) => (
                  <tr key={row.classroomId}>
                    <td>{row.classroomName}</td>
                    <td>{row.centerName}</td>
                    <td>{row.present}</td>
                    <td>{row.checkedOut}</td>
                    <td>{row.absent}</td>
                    <td>{row.notMarked}</td>
                    <td>{row.total}</td>
                  </tr>
                ))}
                {!attendanceSnapshot.rows.length ? <tr><td colSpan={7}>No attendance rows are visible.</td></tr> : null}
              </tbody>
            </table>
          </>
        ) : null}

        {live?.executiveMetrics ? (
          <>
            <h2>Executive FTE And School Comparison</h2>
            <table>
              <tbody>
                <tr><th>Current week</th><td>{live.executiveMetrics.currentWeekStart}</td></tr>
                <tr><th>Deadline</th><td>{live.executiveMetrics.fteDeadlineLabel}</td></tr>
                <tr><th>FTE submitted schools</th><td>{live.executiveMetrics.fteSubmittedSchools}</td></tr>
                <tr><th>FTE missing schools</th><td>{live.executiveMetrics.fteMissingSchools}</td></tr>
              </tbody>
            </table>
            <table>
              <thead>
                <tr><th>School</th><th>Region</th><th>Children</th><th>Capacity</th><th>Occupancy</th><th>Staff</th><th>Leads</th><th>Tours today</th><th>Revenue</th><th>FTE</th><th>Status</th></tr>
              </thead>
              <tbody>
                {live.executiveMetrics.schoolComparisons.map((school) => (
                  <tr key={school.id}>
                    <td>{school.name}</td>
                    <td>{school.region}</td>
                    <td>{school.children}</td>
                    <td>{school.capacity}</td>
                    <td>{school.occupancy}%</td>
                    <td>{school.staff}</td>
                    <td>{school.leads}</td>
                    <td>{school.toursToday}</td>
                    <td>${school.revenueDollars.toLocaleString()}</td>
                    <td>{school.fteCount ?? 0}</td>
                    <td>{school.fteSubmitted ? school.fteStatus : "Missing"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h2>Weekly FTE Trend</h2>
            <table>
              <thead><tr><th>Week</th><th>Submitted</th><th>Missing</th><th>FTE total</th><th>Enrolled total</th></tr></thead>
              <tbody>
                {live.executiveMetrics.weeklyFteTrend.map((week) => (
                  <tr key={week.week}>
                    <td>{week.week}</td>
                    <td>{week.submitted}</td>
                    <td>{week.missing}</td>
                    <td>{week.fteTotal.toLocaleString()}</td>
                    <td>{week.enrolledTotal.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h2>School FTE Submissions</h2>
            <table>
              <thead><tr><th>School</th><th>Week</th><th>FTE</th><th>Enrolled</th><th>Total billed</th><th>Payroll</th><th>Starts</th><th>Withdrawn</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>
                {live.executiveMetrics.fteSubmissions.map((submission) => (
                  <tr key={submission.id}>
                    <td>{submission.schoolName}</td>
                    <td>{submission.weekStart}</td>
                    <td>{submission.fteCount.toLocaleString()}</td>
                    <td>{submission.enrolledCount.toLocaleString()}</td>
                    <td>{formatDashboardMoney(submission.totalBilledAmount)}</td>
                    <td>{formatDashboardMoney(submission.payrollAmount)}</td>
                    <td>{formatDashboardNumber(submission.newStarts)}</td>
                    <td>{formatDashboardNumber(submission.withdrawals)}</td>
                    <td>{submission.status}</td>
                    <td>{formatDashboardDateTime(submission.updatedAt, timeZone)}</td>
                  </tr>
                ))}
                {!live.executiveMetrics.fteSubmissions.length ? <tr><td colSpan={10}>No FTE submissions are visible.</td></tr> : null}
              </tbody>
            </table>
          </>
        ) : null}

        {dashboardAnalytics.length ? (
          <>
            <h2>Enrollment And Revenue Trend</h2>
            <table>
              <thead><tr><th>Month</th><th>Leads</th><th>Tours</th><th>Enrolled</th><th>Revenue</th></tr></thead>
              <tbody>
                {dashboardAnalytics.map((point) => (
                  <tr key={point.month}>
                    <td>{point.month}</td>
                    <td>{point.leads}</td>
                    <td>{point.tours}</td>
                    <td>{point.enrolled}</td>
                    <td>${point.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {visibleSnapshotPipeline.length ? (
          <>
            <h2>Enrollment Pipeline</h2>
            <table>
              <thead><tr><th>Stage</th><th>Count</th><th>Value</th></tr></thead>
              <tbody>
                {visibleSnapshotPipeline.map((stage) => (
                  <tr key={stage.name}>
                    <td>{stage.name}</td>
                    <td>{stage.count}</td>
                    <td>{stage.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {classroomSnapshots.length ? (
          <>
            <h2>Classroom Capacity</h2>
            <table>
              <thead><tr><th>Classroom</th><th>Age group</th><th>Present/enrolled</th><th>Capacity</th><th>Open seats</th><th>Ratio</th></tr></thead>
              <tbody>
                {classroomSnapshots.map((room) => (
                  <tr key={`${room.name}-${room.ageGroup}`}>
                    <td>{room.name}</td>
                    <td>{room.ageGroup}</td>
                    <td>{room.present}</td>
                    <td>{room.capacity}</td>
                    <td>{Math.max(Number(room.capacity) - Number(room.present), 0)}</td>
                    <td>{room.ratio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {dashboardLeads.length ? (
          <>
            <h2>Lead Scoring And Tours</h2>
            <table>
              <thead><tr><th>Family</th><th>Child</th><th>Source</th><th>Stage</th><th>Score</th><th>Desired start</th><th>Tags</th></tr></thead>
              <tbody>
                {dashboardLeads.map((lead) => (
                  <tr key={`${lead.family}-${lead.child}`}>
                    <td>{lead.family}</td>
                    <td>{lead.child}</td>
                    <td>{lead.source}</td>
                    <td>{lead.stage}</td>
                    <td>{lead.score}</td>
                    <td>{lead.desiredStart}</td>
                    <td>{lead.tags.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {actionQueue.length ? (
          <>
            <h2>Action Queue</h2>
            <table>
              <thead><tr><th>#</th><th>Item</th></tr></thead>
              <tbody>
                {actionQueue.map((item, index) => (
                  <tr key={`${index}-${notificationText(item)}`}>
                    <td>{index + 1}</td>
                    <td>{notificationText(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {parentMessages.length ? (
          <>
            <h2>Parent Messages</h2>
            <table>
              <thead><tr><th>From</th><th>Subject</th><th>Status</th><th>Sentiment</th><th>Preview</th></tr></thead>
              <tbody>
                {parentMessages.map((message) => (
                  <tr key={`${message.from}-${message.subject}`}>
                    <td>{message.from}</td>
                    <td>{message.subject}</td>
                    <td>{message.status}</td>
                    <td>{message.sentiment}</td>
                    <td>{message.preview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </PrintableReport>
      <section className="relative overflow-hidden rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/20">
        <div className="hive-texture absolute inset-0 opacity-[0.08]" />
        <div className={showAiBrief ? "relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]" : "relative grid gap-6"}>
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-primary">{asOfLabel}</p>
                <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
                  The BEE Suite command center
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {commandCenterDescription}
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                {canPrintDashboard ? <Button className="w-full sm:w-auto" variant="outline" onClick={printDashboard}>
                  <Printer data-icon="inline-start" />
                  Print dashboard
                </Button> : null}
                {showAiBrief ? <Button className="w-full sm:w-auto" nativeButton={false} render={<Link href={aiBriefHref} />}>
                  <Sparkles data-icon="inline-start" />
                  {isTeacherDashboard ? "Open teacher portal" : isBillingDashboard ? "Open messages" : isParentDashboard || isPickupDashboard ? "Open family portal" : "Review AI brief"}
                </Button> : null}
                {isAnyWidgetVisible(["enrollmentPipeline", "toursAndTasks"]) ? <Button className="w-full sm:w-auto" variant="outline" nativeButton={false} render={<Link href="/crm-leads" />}>
                  <ArrowUpRight data-icon="inline-start" />
                  Open pipeline
                </Button> : null}
              </div>
            </div>
            {topKpiRows.length ? (
              <WorkspaceBoard storageId="dashboard-command-center-kpis" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" items={topKpiItems} />
            ) : null}
          </div>
          {showAiBrief ? (
          <CollapsibleCard
            id="dashboard-ai-daily-summary"
            className="border-primary/30 bg-primary/10"
            title={(
              <span className="flex items-center gap-2 text-lg">
                <Sparkles className="text-primary" />
                AI daily center summary
              </span>
            )}
            description="Human review required"
          >
              <p className="text-sm leading-6 text-muted-foreground">
                {aiSummary}
              </p>
              {aiHighlights.length ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {aiHighlights.map((item) => (
                  <div key={item} className="rounded-lg border bg-background/50 p-3 text-sm font-medium">
                    {item}
                  </div>
                ))}
              </div>
              ) : null}
          </CollapsibleCard>
          ) : null}
        </div>
      </section>

      {configuredWidgets.length ? (
        <DashboardWidgetConfigurator
          key={configuredWidgets.map((widget) => `${widget.id}:${widget.visible}`).join("|")}
          initialWidgets={configuredWidgets}
          roleLabel={live?.dashboardWidgetRoleLabel ?? "Current role"}
        />
      ) : null}

      {setupChecklists.length ? (
        <section className="grid gap-4">
          {setupChecklists.map((checklist) => (
            <SetupChecklistPanel
              key={checklist.key}
              checklistKey={checklist.key}
              title={checklist.title}
              description={checklist.description}
              tasks={checklist.key === "director_launch" ? directorLaunchChecklistTasks : teacherProfileChecklistTasks}
              initialCompletedIds={checklist.completedIds}
              automaticCompletedIds={checklist.automaticCompletedIds}
              graphicHref={checklist.graphicHref}
              compact
            />
          ))}
        </section>
      ) : null}

      {showAttendanceSnapshotCard && attendanceSnapshot ? (
        <AttendanceSnapshotCard snapshot={attendanceSnapshot} isTeacherDashboard={isTeacherDashboard} href={attendanceHref} />
      ) : null}

      <DashboardSnapshotControls
        kpis={visibleDashboardKpis}
        pipelineStages={visibleSnapshotPipeline}
        centers={visibleSnapshotCenters}
        leads={visibleSnapshotLeads}
        visibleLenses={visibleLenses}
        defaultLens={defaultLens}
        aiSummary={aiSummary}
      />

      {inquiryEmbeds.length && isAnyWidgetVisible(["enrollmentPipeline", "toursAndTasks"]) ? (
        <div className="grid gap-4">
          {inquiryEmbeds.map((embed) => (
            <InquiryEmbedCard
              key={`${embed.title}-${embed.embedCode}`}
              title={embed.title}
              description={embed.description}
              embedCode={embed.embedCode}
            />
          ))}
        </div>
      ) : null}

      <Tabs defaultValue={defaultLens} className="flex flex-col gap-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          {visibleLenses.includes("platform") ? <TabsTrigger value="platform">Platform admin</TabsTrigger> : null}
          {visibleLenses.includes("brand") ? <TabsTrigger value="brand">Brand admin</TabsTrigger> : null}
          {visibleLenses.includes("regional") ? <TabsTrigger value="regional">Regional</TabsTrigger> : null}
          {visibleLenses.includes("director") ? <TabsTrigger value="director">Center director</TabsTrigger> : null}
          {visibleLenses.includes("billing") ? <TabsTrigger value="billing">Billing</TabsTrigger> : null}
          {visibleLenses.includes("teacher") ? <TabsTrigger value="teacher">Teacher</TabsTrigger> : null}
          {visibleLenses.includes("parent") ? <TabsTrigger value="parent">Parent</TabsTrigger> : null}
          {visibleLenses.includes("pickup") ? <TabsTrigger value="pickup">Pickup</TabsTrigger> : null}
        </TabsList>
        {visibleLenses.includes("director") ? <TabsContent value="director" className="mt-0">
          <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
            <div className="grid gap-6">
              {lowerKpiRows.length ? (
                <WorkspaceBoard storageId="dashboard-director-kpis" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" items={lowerKpiItems} />
              ) : null}
              {isAnyWidgetVisible(["enrollmentPipeline", "billingRevenue", "classroomCapacity", "staffingRatios"]) ? (
                <WorkspaceBoard
                  storageId="dashboard-director-operations"
                  className="grid gap-6 xl:grid-cols-2"
                  items={[
                    ...(isAnyWidgetVisible(["enrollmentPipeline", "billingRevenue"]) ? [{
                      id: "enrollment-revenue-snapshot",
                      title: "Enrollment and revenue snapshot",
                      children: (
                        <CollapsibleCard
                          id="dashboard-director-enrollment-revenue"
                          className="glass-panel"
                          title="Enrollment and revenue snapshot"
                          description="Leads, tours, enrollments, and revenue index"
                        >
                          {dashboardAnalytics.length ? (
                            <div className="flex h-64 items-end gap-4 rounded-xl border bg-background/40 p-4">
                              {dashboardAnalytics.map((point) => (
                                <div key={point.month} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                                  <div className="flex h-52 w-full items-end justify-center gap-1">
                                    <span
                                      className="w-4 rounded-t-md bg-primary"
                                      style={{ height: barHeight(point.revenue, maxRevenue) }}
                                    />
                                    <span
                                      className="w-4 rounded-t-md bg-[var(--chart-2)]"
                                      style={{ height: barHeight(point.enrolled, maxFunnelCount) }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground">{point.month}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                              No enrollment or revenue trend data is available for this login yet.
                            </p>
                          )}
                        </CollapsibleCard>
                      ),
                    } satisfies WorkspaceBoardItem] : []),
                    ...(isAnyWidgetVisible(["classroomCapacity", "staffingRatios"]) ? [{
                      id: "capacity-by-classroom",
                      title: "Capacity by classroom",
                      children: (
                        <CollapsibleCard
                          id="dashboard-director-capacity-by-classroom"
                          className="glass-panel"
                          contentClassName="flex flex-col gap-4"
                          title="Capacity by classroom"
                          description={isClassroomDemo ? "Demo account preview; no live classrooms are populated yet" : "Open seats and ratio pulse"}
                        >
                          {classroomSnapshots.slice(0, 6).map((room) => (
                            <div key={room.name} className="flex flex-col gap-2">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-medium">{room.name}</div>
                                  <div className="text-xs text-muted-foreground">{room.ageGroup} · ratio {room.ratio}</div>
                                </div>
                                <Badge
                                  variant="secondary"
                                  render={<Link href={withQueryParam("/center-dashboard", "q", String(room.name))} aria-label={`Open capacity details for ${room.name}`} />}
                                >
                                  {Math.max(Number(room.capacity) - Number(room.present), 0)} open
                                </Badge>
                              </div>
                              <Progress value={(Number(room.present) / Math.max(Number(room.capacity), 1)) * 100} />
                            </div>
                          ))}
                          {!classroomSnapshots.length ? (
                            <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                              No classroom records are visible for this login yet.
                            </p>
                          ) : null}
                        </CollapsibleCard>
                      ),
                    } satisfies WorkspaceBoardItem] : []),
                  ]}
                />
              ) : null}
              {isAnyWidgetVisible(["enrollmentPipeline", "toursAndTasks"]) ? (
                <WorkspaceBoard
                  storageId="dashboard-director-enrollment"
                  className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]"
                  items={[
                    ...(showEnrollment ? [{
                      id: "enrollment-pipeline",
                      title: "Enrollment pipeline",
                      children: (
                        <CollapsibleCard
                          id="dashboard-director-enrollment-pipeline"
                          className="glass-panel"
                          contentClassName="grid gap-3 sm:grid-cols-2"
                          title="Enrollment pipeline"
                          description="Board-ready stages"
                        >
                          {dashboardPipeline.slice(0, 8).map((stage) => (
                            <Link
                              key={stage.name}
                              href={withQueryParam("/crm-leads", "q", stage.name)}
                              className="group rounded-xl border bg-background/50 p-3 transition hover:border-primary/40 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`Open CRM leads for ${stage.name}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">{stage.name}</span>
                                <Badge>{stage.count}</Badge>
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">Projected value {stage.value}</p>
                              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
                                Open matching leads
                                <ArrowUpRight className="size-3" />
                              </span>
                            </Link>
                          ))}
                        </CollapsibleCard>
                      ),
                    } satisfies WorkspaceBoardItem] : []),
                    ...(isAnyWidgetVisible(["enrollmentPipeline", "toursAndTasks"]) ? [{
                      id: "lead-scoring-tours",
                      title: "Lead scoring and tours",
                      children: (
                        <CollapsibleCard
                          id="dashboard-director-lead-scoring-tours"
                          className="glass-panel"
                          contentClassName="flex flex-col gap-3"
                          title="Lead scoring and tours"
                          description="Childcare-specific CRM records"
                        >
                          {dashboardLeads.map((lead) => (
                            <Link
                              key={lead.family}
                              href={withQueryParam("/crm-leads", "q", lead.family)}
                              className="group grid gap-3 rounded-xl border bg-background/50 p-3 transition hover:border-primary/40 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[1fr_auto]"
                              aria-label={`Open CRM lead for ${lead.family}`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <div className="font-medium">{lead.family}</div>
                                  <ArrowUpRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />
                                </div>
                                <p className="text-sm text-muted-foreground">{lead.child} · {lead.source} · start {lead.desiredStart}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {lead.tags.map((tag) => (
                                    <Badge key={tag} variant="secondary">{tag}</Badge>
                                  ))}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-semibold">{lead.score}</div>
                                <p className="text-xs text-muted-foreground">{lead.stage}</p>
                              </div>
                            </Link>
                          ))}
                          {!dashboardLeads.length ? (
                            <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                              No visible CRM leads are available for this login yet.
                            </p>
                          ) : null}
                        </CollapsibleCard>
                      ),
                    } satisfies WorkspaceBoardItem] : []),
                  ]}
                />
              ) : null}
            </div>
            <aside>
              <WorkspaceBoard
                storageId="dashboard-director-sidebar"
                className="flex flex-col gap-6"
                items={[
                  ...(isAnyWidgetVisible(["toursAndTasks", "complianceQueue", "familyCommunication", "classroomCapacity", "enrollmentPipeline"]) ? [{
                    id: "action-queue",
                    title: "Action queue",
                    children: (
                      <CollapsibleCard
                        id="dashboard-director-action-queue"
                        className="glass-panel"
                        contentClassName="flex flex-col gap-3"
                        title="Action queue"
                        description="Notifications, reminders, and review items"
                      >
                        {actionQueue.slice(0, 8).map((item, index) => {
                          const href = typeof item === "string"
                            ? "/notifications"
                            : item.widgetId
                              ? widgetSummaries[item.widgetId]?.href ?? "/notifications"
                              : "/notifications";
                          return (
                            <Link
                              key={notificationText(item)}
                              href={withQueryParam(href, "q", notificationText(item))}
                              className="group flex items-start gap-3 rounded-xl border bg-background/50 p-3 transition hover:border-primary/40 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                                {index + 1}
                              </span>
                              <p className="min-w-0 flex-1 text-sm leading-5">{notificationText(item)}</p>
                              <ArrowUpRight className="mt-1 size-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" />
                            </Link>
                          );
                        })}
                        {!actionQueue.length ? (
                          <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                            No dashboard action items are visible for this login yet.
                          </p>
                        ) : null}
                      </CollapsibleCard>
                    ),
                  } satisfies WorkspaceBoardItem] : []),
                  ...(showFamilyCommunication ? [{
                    id: "parent-messages",
                    title: "Parent messages",
                    children: (
                      <CollapsibleCard
                        id="dashboard-director-parent-messages"
                        className="glass-panel"
                        contentClassName="flex flex-col gap-4"
                        title="Parent messages"
                        description={isParentMessageDemo ? "Demo account preview; no live parent conversations are populated yet" : "Unread and priority conversations"}
                      >
                        {parentMessages.map((message) => (
                          <Link
                            key={message.subject}
                            href={withQueryParam("/messages", "q", message.from)}
                            className="group flex gap-3 rounded-lg p-1 transition hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Open message from ${message.from}`}
                          >
                            <Avatar className="size-9">
                              <AvatarFallback>{message.from.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-medium">{message.from}</p>
                                <Badge variant="outline">{message.status}</Badge>
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{message.preview}</p>
                            </div>
                            <ArrowUpRight className="mt-2 size-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" />
                          </Link>
                        ))}
                        {!parentMessages.length ? (
                          <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                            No parent messages are visible for this login yet.
                          </p>
                        ) : null}
                      </CollapsibleCard>
                    ),
                  } satisfies WorkspaceBoardItem] : []),
                ]}
              />
            </aside>
          </div>
        </TabsContent> : null}
        {secondaryLenses.map((tab) => {
          const executiveMetrics = live?.executiveMetrics ?? null;
          const isExecutiveLens = Boolean(executiveMetrics && ["platform", "brand", "regional"].includes(tab));
          const secondaryItems: WorkspaceBoardItem[] = [
            ...(isExecutiveLens && executiveMetrics ? [{
              id: `${tab}-executive-lens`,
              title: `${tab} executive lens`,
              className: "md:col-span-3",
              children: (
                <ExecutiveLensDashboard
                  lens={tab as Exclude<DashboardLens, "director" | "billing" | "teacher" | "parent" | "pickup">}
                  metrics={executiveMetrics}
                  trendData={dashboardAnalytics}
                  actionQueue={actionQueue}
                />
              ),
            } satisfies WorkspaceBoardItem] : []),
            ...(!isExecutiveLens ? visibleConfiguredWidgets.map((widget) => {
              const summary = widgetSummaries[widget.id];
              return {
                id: `${tab}-widget-${widget.id}`,
                title: widget.title,
                children: (
                  <CollapsibleCard
                    id={`dashboard-${tab}-widget-${widget.id}`}
                    className="glass-panel"
                    contentClassName="flex flex-col gap-3"
                    eyebrow={<Badge variant="outline">{widget.category}</Badge>}
                    title={widget.title}
                    description={widget.description}
                  >
                    {summary ? (
                      <>
                        <div>
                          <div className="text-2xl font-semibold">{summary.value}</div>
                          <p className="text-xs text-muted-foreground">{summary.detail}</p>
                        </div>
                        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={summary.href} />}>
                          <ArrowUpRight data-icon="inline-start" />
                          Open
                        </Button>
                      </>
                    ) : null}
                  </CollapsibleCard>
                ),
              } satisfies WorkspaceBoardItem;
            }) : []),
            ...(!isExecutiveLens && showExecutiveRollup ? dashboardCenters.map((center) => ({
              id: `${tab}-center-${center.name}`,
              title: center.name,
              children: (
                <Link
                  href={withQueryParam("/multi-location-dashboard", "q", center.name)}
                  className="group block rounded-xl border bg-background/50 p-4 transition hover:border-primary/40 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open multi-location view for ${center.name}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{center.name}</div>
                    <ArrowUpRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{center.region} · {center.director}</p>
                  <Separator className="my-4" />
                  <div className="grid grid-cols-3 gap-3 text-center text-sm">
                    <div><b>{center.children}</b><span className="block text-xs text-muted-foreground">Children</span></div>
                    <div><b>{center.staff}</b><span className="block text-xs text-muted-foreground">Teachers</span></div>
                    <div><b>{center.compliance}%</b><span className="block text-xs text-muted-foreground">Docs</span></div>
                  </div>
                </Link>
              ),
            } satisfies WorkspaceBoardItem)) : []),
          ];

          return (
            <TabsContent key={tab} value={tab} className="mt-0">
              <CollapsibleCard
                id={`dashboard-${tab}-lens-container`}
                className="glass-panel"
                contentClassName="grid gap-4"
                title={<span className="capitalize">{tab} dashboard lens</span>}
                description={`${live?.dashboardWidgetRoleLabel ?? "Role"} widgets from the current permission scope`}
              >
                {secondaryItems.length ? (
                  <WorkspaceBoard storageId={`dashboard-${tab}-lens`} className="grid gap-4 md:grid-cols-3" items={secondaryItems} />
                ) : (
                  <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                    No dashboard widgets are visible for this login yet.
                  </p>
                )}
              </CollapsibleCard>
            </TabsContent>
          );
        })}
      </Tabs>

      {isAnyWidgetVisible(["enrollmentPipeline", "toursAndTasks", "classroomCapacity"]) ? (
        <WorkspaceBoard
          storageId="dashboard-shared-insights"
          className="grid gap-6 lg:grid-cols-2"
          items={[
            ...(isAnyWidgetVisible(["enrollmentPipeline", "toursAndTasks"]) ? [{
              id: "enrollment-funnel",
              title: "Enrollment funnel",
              children: (
                <CollapsibleCard
                  id="dashboard-enrollment-funnel"
                  className="glass-panel"
                  title="Enrollment funnel"
                  description="Inquiry to enrolled conversion snapshot"
                >
                  {dashboardAnalytics.length ? (
                    <div className="flex h-72 items-end gap-4 rounded-xl border bg-background/40 p-5">
                      {dashboardAnalytics.map((point) => (
                        <div key={point.month} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                          <div className="flex h-56 w-full items-end justify-center gap-1">
                            <span className="w-3 rounded-t-md bg-[var(--chart-3)]" style={{ height: barHeight(point.leads, maxFunnelCount) }} />
                            <span className="w-3 rounded-t-md bg-primary" style={{ height: barHeight(point.tours, maxFunnelCount) }} />
                            <span className="w-3 rounded-t-md bg-[var(--chart-2)]" style={{ height: barHeight(point.enrolled, maxFunnelCount) }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{point.month}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                      No enrollment funnel trend data is available for this login yet.
                    </p>
                  )}
                </CollapsibleCard>
              ),
            } satisfies WorkspaceBoardItem] : []),
            ...(showClassroomCapacity ? [{
              id: "open-seats-by-age-group",
              title: "Open seats by age group",
              children: (
                <CollapsibleCard
                  id="dashboard-open-seats-by-age-group"
                  className="glass-panel"
                  title="Open seats by age group"
                  description="Capacity planning for enrollment"
                >
                  {openSeatsByAgeGroup.length ? (
                    <div className="grid gap-6 rounded-xl border bg-background/40 p-5 sm:grid-cols-[14rem_1fr]">
                      <div className="grid aspect-square place-items-center rounded-full border bg-primary/10">
                        <div className="grid size-28 place-items-center rounded-full bg-card text-center">
                          <span className="text-3xl font-semibold">{totalOpenSeats}</span>
                          <span className="-mt-7 text-xs text-muted-foreground">open seats</span>
                        </div>
                      </div>
                      <div className="flex flex-col justify-center gap-3">
                        {openSeatsByAgeGroup.map((item, index) => (
                          <Link
                            key={item.label}
                            href={withQueryParam("/center-dashboard", "q", item.label)}
                            className="group flex items-center justify-between gap-3 rounded-lg border bg-background/50 p-3 transition hover:border-primary/40 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Open center capacity for ${item.label}`}
                          >
                            <span className="flex items-center gap-2 text-sm font-medium">
                              <span className="size-3 rounded-full" style={{ background: ageGroupColors[index % ageGroupColors.length] }} />
                              {item.label}
                            </span>
                            <span className="flex items-center gap-2">
                              <Badge variant="secondary">{item.value} open</Badge>
                              <ArrowUpRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                      No open-seat data is available for this login yet.
                    </p>
                  )}
                </CollapsibleCard>
              ),
            } satisfies WorkspaceBoardItem] : []),
          ]}
        />
      ) : null}
    </div>
  );
}
