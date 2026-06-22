"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Baby,
  BadgeDollarSign,
  CalendarCheck,
  CheckCircle2,
  FileWarning,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardWidgetConfigurator } from "@/components/dashboard-widget-configurator";
import { DashboardSnapshotControls } from "@/components/dashboard-snapshot-controls";
import { InquiryEmbedCard } from "@/components/inquiry-embed-card";
import { SetupChecklistPanel } from "@/components/setup-checklist-panel";
import type { DashboardAttendanceSnapshot, DashboardAttendanceSnapshotRow } from "@/lib/dashboard-attendance-snapshot";
import type { DashboardWidgetId, DashboardWidgetView } from "@/lib/dashboard-widgets";
import { analytics, centers, classrooms, kpis, leads, messages, notifications, pipelineStages } from "@/lib/demo-data";
import { directorLaunchChecklistTasks, teacherProfileChecklistTasks, type SetupChecklistKey } from "@/lib/setup-checklists";

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
  };
};

function percentBar(value: number, max = 100) {
  return `${Math.max(0, Math.min(100, max ? (value / max) * 100 : 0))}%`;
}

function compactSchoolName(value: string) {
  return value.replace(/^Kid City USA\s*[-–]\s*/i, "").trim() || value;
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
  const sortedByOccupancy = [...metrics.schoolComparisons].sort((left, right) => right.occupancy - left.occupancy).slice(0, 10);
  const sortedByRevenue = [...metrics.schoolComparisons].sort((left, right) => right.revenueDollars - left.revenueDollars).slice(0, 8);
  const sortedByLeads = [...metrics.schoolComparisons].sort((left, right) => right.leads - left.leads).slice(0, 8);
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

  return (
    <div className="grid gap-6">
      <Card className="glass-panel">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>Company-level KPI visualizations across visible schools.</CardDescription>
            </div>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/multi-location-dashboard" />}>
              <ArrowUpRight data-icon="inline-start" />
              Open multi-location
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
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
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Weekly FTE progress</CardTitle>
            <CardDescription>Submitted schools, missing schools, and total FTE by week.</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Current-week FTE by school</CardTitle>
            <CardDescription>Schools missing this week are highlighted for follow-up.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {metrics.schoolComparisons.slice(0, 12).map((school) => (
              <div key={school.id} className="rounded-xl border bg-background/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{compactSchoolName(school.name)}</div>
                    <div className="text-xs text-muted-foreground">{school.region}</div>
                  </div>
                  <Badge variant={school.fteSubmitted ? "default" : "destructive"}>{school.fteSubmitted ? school.fteStatus : "Missing"}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={school.fteSubmitted ? 100 : 8} />
                  <span className="w-14 text-right text-xs font-medium">{school.fteCount ?? 0} FTE</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Occupancy comparison</CardTitle>
            <CardDescription>Top schools by current child count against licensed capacity.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {sortedByOccupancy.map((school) => (
              <div key={school.id} className="grid gap-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{compactSchoolName(school.name)}</span>
                  <span className="text-muted-foreground">{school.occupancy}%</span>
                </div>
                <Progress value={school.occupancy} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Revenue comparison</CardTitle>
            <CardDescription>Invoice total snapshot by school.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {sortedByRevenue.map((school) => (
              <div key={school.id} className="grid gap-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{compactSchoolName(school.name)}</span>
                  <span className="text-muted-foreground">${school.revenueDollars.toLocaleString()}</span>
                </div>
                <Progress value={(school.revenueDollars / maxRevenueDollars) * 100} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Lead and tour pressure</CardTitle>
            <CardDescription>Schools with the highest active inquiry load.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {sortedByLeads.map((school) => (
              <div key={school.id} className="rounded-xl border bg-background/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{compactSchoolName(school.name)}</div>
                    <div className="text-xs text-muted-foreground">{school.toursToday} tours today</div>
                  </div>
                  <Badge variant="secondary">{school.leads} leads</Badge>
                </div>
                <Progress className="mt-3" value={(school.leads / maxLeadCount) * 100} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {trendData.length ? (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Company trend snapshot</CardTitle>
            <CardDescription>Enrollment funnel and revenue trend for visible schools.</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      ) : null}
    </div>
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

function AttendanceClassroomRow({ row }: { row: DashboardAttendanceSnapshotRow }) {
  return (
    <div className="grid gap-3 rounded-lg border bg-background/45 p-3 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{row.classroomName}</div>
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
    </div>
  );
}

function AttendanceSnapshotCard({
  snapshot,
  isTeacherDashboard,
}: {
  snapshot: DashboardAttendanceSnapshot;
  isTeacherDashboard: boolean;
}) {
  const attendanceRate = snapshot.total ? Math.round((snapshot.present / snapshot.total) * 100) : 0;
  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Attendance Snapshot</CardTitle>
            <CardDescription>
              {isTeacherDashboard
                ? "Current check-in view for your assigned classroom."
                : "Current check-in view across all classes in your school scope."}
            </CardDescription>
          </div>
          <Badge variant="outline">{snapshot.scopeLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
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
              <AttendanceClassroomRow key={row.classroomId} row={row} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border bg-background/45 p-3 text-sm text-muted-foreground">
            No classroom attendance records are visible for this login yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ExecutiveDashboard({ live }: { live?: LiveDashboardData }) {
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
    "Your visible centers are operating inside configured workflow targets. Prioritize high-fit inquiries, review open tasks, and confirm any sensitive action before sending messages or changing records. AI does not make safety, billing, custody, medical, legal, or compliance decisions.";
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

  return (
    <div className="flex flex-col gap-6">
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {topKpiRows.map(({ kpi, Icon }) => {
                return (
                  <Card key={kpi.label} className="glass-panel">
                    <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                      <CardDescription>{kpi.label}</CardDescription>
                      <Icon className="text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-semibold">{kpi.value}</div>
                      <p className="mt-1 text-xs text-muted-foreground">{kpi.trend}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            ) : null}
          </div>
          {showAiBrief ? (
          <Card className="border-primary/30 bg-primary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="text-primary" />
                AI daily center summary
              </CardTitle>
              <CardDescription>Human review required</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
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
        <AttendanceSnapshotCard snapshot={attendanceSnapshot} isTeacherDashboard={isTeacherDashboard} />
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
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {lowerKpiRows.map(({ kpi, Icon }) => {
                  return (
                    <Card key={kpi.label} className="glass-panel">
                      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                        <CardDescription>{kpi.label}</CardDescription>
                        <Icon className="text-primary" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold">{kpi.value}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{kpi.trend}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              ) : null}
              {isAnyWidgetVisible(["enrollmentPipeline", "billingRevenue", "classroomCapacity", "staffingRatios"]) ? (
              <div className="grid gap-6 xl:grid-cols-2">
                {isAnyWidgetVisible(["enrollmentPipeline", "billingRevenue"]) ? (
                <Card className="glass-panel">
                  <CardHeader>
                    <CardTitle>Enrollment and revenue snapshot</CardTitle>
                    <CardDescription>Leads, tours, enrollments, and revenue index</CardDescription>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
                ) : null}
                {isAnyWidgetVisible(["classroomCapacity", "staffingRatios"]) ? (
                <Card className="glass-panel">
                  <CardHeader>
                    <CardTitle>Capacity by classroom</CardTitle>
                    <CardDescription>
                      {isClassroomDemo ? "Demo account preview; no live classrooms are populated yet" : "Open seats and ratio pulse"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {classroomSnapshots.slice(0, 6).map((room) => (
                      <div key={room.name} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">{room.name}</div>
                            <div className="text-xs text-muted-foreground">{room.ageGroup} · ratio {room.ratio}</div>
                          </div>
                          <Badge variant="secondary">{Math.max(Number(room.capacity) - Number(room.present), 0)} open</Badge>
                        </div>
                        <Progress value={(Number(room.present) / Math.max(Number(room.capacity), 1)) * 100} />
                      </div>
                    ))}
                    {!classroomSnapshots.length ? (
                      <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                        No classroom records are visible for this login yet.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
                ) : null}
              </div>
              ) : null}
              {isAnyWidgetVisible(["enrollmentPipeline", "toursAndTasks"]) ? (
              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                {showEnrollment ? (
                <Card className="glass-panel">
                  <CardHeader>
                    <CardTitle>Enrollment pipeline</CardTitle>
                    <CardDescription>Drag-and-drop board-ready stages</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    {dashboardPipeline.slice(0, 8).map((stage) => (
                      <div key={stage.name} className="rounded-xl border bg-background/50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{stage.name}</span>
                          <Badge>{stage.count}</Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">Projected value {stage.value}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                ) : null}
                {isAnyWidgetVisible(["enrollmentPipeline", "toursAndTasks"]) ? (
                <Card className="glass-panel">
                  <CardHeader>
                    <CardTitle>Lead scoring and tours</CardTitle>
                    <CardDescription>Childcare-specific CRM records</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {dashboardLeads.map((lead) => (
                      <div key={lead.family} className="grid gap-3 rounded-xl border bg-background/50 p-3 sm:grid-cols-[1fr_auto]">
                        <div>
                          <div className="font-medium">{lead.family}</div>
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
                      </div>
                    ))}
                    {!dashboardLeads.length ? (
                      <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                        No visible CRM leads are available for this login yet.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
                ) : null}
              </div>
              ) : null}
            </div>
            <aside className="flex flex-col gap-6">
              {isAnyWidgetVisible(["toursAndTasks", "complianceQueue", "familyCommunication", "classroomCapacity", "enrollmentPipeline"]) ? (
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle>Action queue</CardTitle>
                  <CardDescription>Notifications, reminders, and review items</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {actionQueue.slice(0, 8).map((item, index) => (
                    <div key={notificationText(item)} className="flex items-start gap-3 rounded-xl border bg-background/50 p-3">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                        {index + 1}
                      </span>
                      <p className="text-sm leading-5">{notificationText(item)}</p>
                    </div>
                  ))}
                  {!actionQueue.length ? (
                    <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                      No dashboard action items are visible for this login yet.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
              ) : null}
              {showFamilyCommunication ? (
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle>Parent messages</CardTitle>
                  <CardDescription>
                    {isParentMessageDemo ? "Demo account preview; no live parent conversations are populated yet" : "Unread and priority conversations"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {parentMessages.map((message) => (
                    <div key={message.subject} className="flex gap-3">
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
                    </div>
                  ))}
                  {!parentMessages.length ? (
                    <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                      No parent messages are visible for this login yet.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
              ) : null}
            </aside>
          </div>
        </TabsContent> : null}
        {secondaryLenses.map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-0">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="capitalize">{tab} dashboard lens</CardTitle>
                <CardDescription>{live?.dashboardWidgetRoleLabel ?? "Role"} widgets from the current permission scope</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                {live?.executiveMetrics && ["platform", "brand", "regional"].includes(tab) ? (
                  <div className="md:col-span-3">
                    <ExecutiveLensDashboard
                      lens={tab as Exclude<DashboardLens, "director" | "billing" | "teacher" | "parent" | "pickup">}
                      metrics={live.executiveMetrics}
                      trendData={dashboardAnalytics}
                      actionQueue={actionQueue}
                    />
                  </div>
                ) : null}
                {!(live?.executiveMetrics && ["platform", "brand", "regional"].includes(tab)) ? visibleConfiguredWidgets.map((widget) => {
                  const summary = widgetSummaries[widget.id];
                  return (
                    <div key={widget.id} className="flex flex-col gap-3 rounded-xl border bg-background/50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{widget.category}</Badge>
                        <span className="text-sm font-medium">{widget.title}</span>
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">{widget.description}</p>
                      {summary ? (
                        <>
                          <Separator />
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
                    </div>
                  );
                }) : null}
                {!(live?.executiveMetrics && ["platform", "brand", "regional"].includes(tab)) && showExecutiveRollup ? dashboardCenters.map((center) => (
                  <div key={center.name} className="rounded-xl border bg-background/50 p-4">
                    <div className="font-medium">{center.name}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{center.region} · {center.director}</p>
                    <Separator className="my-4" />
                    <div className="grid grid-cols-3 gap-3 text-center text-sm">
                      <div><b>{center.children}</b><span className="block text-xs text-muted-foreground">Children</span></div>
                      <div><b>{center.staff}</b><span className="block text-xs text-muted-foreground">Teachers</span></div>
                      <div><b>{center.compliance}%</b><span className="block text-xs text-muted-foreground">Docs</span></div>
                    </div>
                  </div>
                )) : null}
                {!(live?.executiveMetrics && ["platform", "brand", "regional"].includes(tab)) && !visibleConfiguredWidgets.length && (!showExecutiveRollup || !dashboardCenters.length) ? (
                  <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                    No dashboard widgets are visible for this login yet.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {isAnyWidgetVisible(["enrollmentPipeline", "toursAndTasks", "classroomCapacity"]) ? (
      <section className="grid gap-6 lg:grid-cols-2">
        {isAnyWidgetVisible(["enrollmentPipeline", "toursAndTasks"]) ? (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Enrollment funnel</CardTitle>
            <CardDescription>Inquiry to enrolled conversion snapshot</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
        ) : null}
        {showClassroomCapacity ? (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Open seats by age group</CardTitle>
            <CardDescription>Capacity planning for enrollment</CardDescription>
          </CardHeader>
          <CardContent>
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
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border bg-background/50 p-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="size-3 rounded-full" style={{ background: ageGroupColors[index % ageGroupColors.length] }} />
                      {item.label}
                    </span>
                    <Badge variant="secondary">{item.value} open</Badge>
                  </div>
                ))}
              </div>
            </div>
            ) : (
              <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                No open-seat data is available for this login yet.
              </p>
            )}
          </CardContent>
        </Card>
        ) : null}
      </section>
      ) : null}

      <Alert className="border-amber-400/30 bg-amber-400/10">
        <AlertTriangle />
        <AlertTitle>Compliance-ready documentation support</AlertTitle>
        <AlertDescription>
          The BEE Suite provides workflow and documentation support, but does not provide legal, licensing, medical, custody, billing, or compliance advice.
        </AlertDescription>
      </Alert>
    </div>
  );
}
