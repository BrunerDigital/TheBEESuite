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
import { DashboardSnapshotControls } from "@/components/dashboard-snapshot-controls";
import { InquiryEmbedCard } from "@/components/inquiry-embed-card";
import { analytics, centers, classrooms, kpis, leads, messages, notifications, pipelineStages } from "@/lib/demo-data";

const iconMap = [Baby, Users, CalendarCheck, BadgeDollarSign, CheckCircle2, ShieldAlert, MessageSquare, FileWarning];
type DashboardLens = "platform" | "brand" | "regional" | "director" | "teacher" | "parent";

export type LiveDashboardData = {
  kpis: typeof kpis;
  pipelineStages: typeof pipelineStages;
  centers: typeof centers;
  leadRows?: typeof leads;
  aiSummary: string;
  aiHighlights?: string[];
  analytics?: typeof analytics;
  classroomSnapshots?: typeof classrooms;
  notifications?: typeof notifications;
  parentMessages?: typeof messages;
  asOfLabel?: string;
  showDemoFallbackData?: boolean;
  visibleLenses?: readonly DashboardLens[];
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
};

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
  const dashboardAnalytics = live?.analytics?.length
    ? live.analytics
    : showDemoFallbackData
      ? analytics
      : [];
  const actionQueue = live?.notifications?.length
    ? live.notifications
    : showDemoFallbackData
      ? notifications
      : [];
  const classroomSnapshots = live?.classroomSnapshots?.length
    ? live.classroomSnapshots
    : showDemoFallbackData
      ? classrooms
      : [];
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
  const barHeight = (value: number, max: number) => `${value ? Math.max((value / max) * 100, 6) : 0}%`;

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/20">
        <div className="hive-texture absolute inset-0 opacity-[0.08]" />
        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-primary">{asOfLabel}</p>
                <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
                  The BEE Suite command center
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Enrollment, classroom operations, billing, compliance-ready documentation, and parent trust signals in one white-label operating system.
                </p>
              </div>
              <div className="flex gap-2">
                <Button>
                  <Sparkles data-icon="inline-start" />
                  Review AI brief
                </Button>
                <Button variant="outline" nativeButton={false} render={<Link href="/crm-leads" />}>
                  <ArrowUpRight data-icon="inline-start" />
                  Open pipeline
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {dashboardKpis.slice(0, 4).map((kpi, index) => {
                const Icon = iconMap[index];
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
          </div>
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
        </div>
      </section>

      <DashboardSnapshotControls
        kpis={dashboardKpis}
        pipelineStages={dashboardPipeline}
        centers={dashboardCenters}
        leads={dashboardLeads}
        visibleLenses={visibleLenses}
        defaultLens={defaultLens}
        aiSummary={aiSummary}
      />

      {inquiryEmbeds.length ? (
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
          {visibleLenses.includes("teacher") ? <TabsTrigger value="teacher">Teacher</TabsTrigger> : null}
          {visibleLenses.includes("parent") ? <TabsTrigger value="parent">Parent</TabsTrigger> : null}
        </TabsList>
        {visibleLenses.includes("director") ? <TabsContent value="director" className="mt-0">
          <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
            <div className="grid gap-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {dashboardKpis.slice(4).map((kpi, index) => {
                  const Icon = iconMap[index + 4];
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
              <div className="grid gap-6 xl:grid-cols-2">
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
              </div>
              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <Card className="glass-panel">
                  <CardHeader>
                    <CardTitle>Pipeline foundation</CardTitle>
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
              </div>
            </div>
            <aside className="flex flex-col gap-6">
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle>Action queue</CardTitle>
                  <CardDescription>Notifications, reminders, and review items</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {actionQueue.slice(0, 8).map((item, index) => (
                    <div key={item} className="flex items-start gap-3 rounded-xl border bg-background/50 p-3">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                        {index + 1}
                      </span>
                      <p className="text-sm leading-5">{item}</p>
                    </div>
                  ))}
                  {!actionQueue.length ? (
                    <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
                      No dashboard action items are visible for this login yet.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
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
            </aside>
          </div>
        </TabsContent> : null}
        {secondaryLenses.map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-0">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="capitalize">{tab} dashboard lens</CardTitle>
                <CardDescription>
                  This v1 includes a role-aware dashboard pattern. Production auth will filter widgets and records by tenant, center, classroom, family, and permission scope.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                {dashboardCenters.map((center) => (
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
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <section className="grid gap-6 lg:grid-cols-2">
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
      </section>

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
