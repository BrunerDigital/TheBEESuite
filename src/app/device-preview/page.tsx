import { notFound } from "next/navigation";
import { Activity, BadgeDollarSign, BellRing, CheckCircle2, Clock3, CreditCard, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AutomationWorkflowBuilder, type AutomationWorkflowBuilderData } from "@/components/automation-workflow-builder";
import { DevicePreviewGuard } from "@/components/device-preview-guard";
import { ExecutiveDashboard } from "@/components/dashboard";
import { KioskCheckIn } from "@/components/kiosk-check-in";
import { ParentPortalWorkspace } from "@/components/parent-portal-workspace";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { executiveParentPortalDemo } from "@/lib/executive-demo-data";
import { centers as demoCenters, kpis as demoKpis, pipelineStages as demoPipelineStages } from "@/lib/demo-data";
import { normalizeParentPortalView } from "@/lib/parent-portal-navigation";
import type { WorkspaceState } from "@/lib/workspace-selection";

type PreviewRole = "director" | "role-dashboard" | "parent" | "pickup" | "teacher" | "executive" | "regional" | "billing" | "auditor" | "workflow" | "kiosk" | "kiosk-staff";

export const dynamic = "force-dynamic";

const workflowData: AutomationWorkflowBuilderData = {
  automations: [{
    id: "workflow-preview",
    name: "Tour follow-up and enrollment nurture",
    trigger: "tour_completed",
    condition: { audience: "Families with completed tours", rule: "No application submitted after one day", requiresReview: true },
    action: { type: "send_campaign", channel: "email", templateKey: "tour_follow_up", subject: "Thanks for visiting Sunshine Academy", body: "Thank you for touring our school. We would love to answer any questions about your child’s next step." },
    delay: "1 day",
    status: "active",
    brand: { name: "Sunshine Academy" },
    runs: [{ id: "run-preview", status: "completed", createdAt: "2026-08-09T16:30:00.000Z", logs: { matched: 12, reviewed: 12, sent: 12 } }],
  }],
  stats: { total: 8, active: 6, paused: 2, recentRuns: 14 },
};

const metrics = [
  { label: "Children present", value: "142 / 158", detail: "89.9% checked in", Icon: Users },
  { label: "Staff on site", value: "28 / 32", detail: "Coverage is on target", Icon: CheckCircle2 },
  { label: "Open follow-ups", value: "2", detail: "Review before pickup", Icon: BellRing },
  { label: "Collected today", value: "$18,420", detail: "Current families only", Icon: BadgeDollarSign },
];

const previewPortfolioWorkspace: WorkspaceState = {
  mode: "all",
  selection: "all",
  activeCenterId: null,
  label: "All locations",
  detail: "3 schools in your authorized workspace",
  companyLabel: "Sunshine Learning Group",
  required: false,
  canSwitch: true,
  canSelectAll: true,
  invalidSelection: false,
  authorizedCenterCount: 3,
  options: [
    { id: "preview-center", name: "Sunshine Academy", detail: "Carmel, IN", companyName: "Sunshine Learning Group" },
    { id: "preview-center-two", name: "Little Harbor", detail: "Fishers, IN", companyName: "Sunshine Learning Group" },
    { id: "preview-center-three", name: "Maple Grove", detail: "Westfield, IN", companyName: "Sunshine Learning Group" },
  ],
};

function DirectorPreview() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="honeyglass-hero overflow-hidden rounded-2xl border bg-card p-5 sm:p-7">
        <Badge className="mb-4">Director overview</Badge>
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-end">
          <div className="min-w-0">
            <h1 className="text-pretty text-3xl font-semibold tracking-tight sm:text-4xl">Good morning, Avery</h1>
            <p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
              Your school is steady. Two items need a closer look before afternoon pickup.
            </p>
          </div>
          <Card className="dashboard-ai-brief min-w-0">
            <CardHeader className="pb-2">
              <CardTitle as="h2" className="text-base">Today&apos;s focus</CardTitle>
              <CardDescription>Staff coverage and pickup readiness</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-sm">
              <Clock3 className="size-4 shrink-0 text-primary" aria-hidden="true" />
              Next review at 2:30 PM
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, Icon }) => (
          <Card key={label} className="min-w-0 overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <CardDescription className="min-w-0 truncate">{label}</CardDescription>
                <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">{value}</div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader><CardTitle as="h2">School pulse</CardTitle><CardDescription>What needs attention now</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-700/50 dark:bg-amber-950/20"><div className="font-medium">Creative Kids</div><p className="mt-1 text-sm text-muted-foreground">Ratio below target · 14 of 18 present</p></div>
            <div className="rounded-lg border p-4"><div className="font-medium">Explorer Pre-K</div><p className="mt-1 text-sm text-muted-foreground">One child has not signed in</p></div>
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden">
          <CardHeader><CardTitle as="h2">Common director tasks</CardTitle><CardDescription>Director shortcuts in the full workspace</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {['Attendance', 'Message families', 'Report incident', 'Run report'].map((label) => <div key={label} className="rounded-lg border p-4 text-sm font-medium">{label}</div>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ParentPreview({ screen, familySection }: { screen: string | undefined; familySection: string | undefined }) {
  const activeView = normalizeParentPortalView(screen);
  const family = {
    ...executiveParentPortalDemo.family,
    children: executiveParentPortalDemo.family.children.map((child, index) => ({
      ...child,
      today: {
        status: index === 0 ? "checked_in" as const : "checked_out" as const,
        label: index === 0 ? "Checked in" : "Checked out",
        latestEventAt: index === 0 ? "2026-08-10T12:04:00.000Z" : "2026-08-10T19:32:00.000Z",
        currentLocationName: index === 0 ? child.classroom.name : null,
        dailyReportShared: true,
      },
    })),
  };

  return (
    <ParentPortalWorkspace
      {...executiveParentPortalDemo}
      activeView={activeView}
      familySection={familySection}
      family={family}
      centerName="Sunshine Academy"
      currentGuardianId="exec-demo-guardian-a"
      kioskCredentials={[{
        guardianId: "exec-demo-guardian-a",
        guardianName: "Jordan Rivera",
        familyId: "exec-demo-family",
        familyName: "Rivera Family",
        centerId: "preview-center",
        centerName: "Sunshine Academy",
        hasPin: true,
        pinSetAt: "2026-08-01T14:00:00.000Z",
        qrToken: "preview-family-qr-token",
        kioskPath: "/check-in/preview-center/family",
      }]}
      messages={executiveParentPortalDemo.messages.map((message, index) => ({
        ...message,
        isFromFamily: index % 2 === 1,
        sender: { name: index % 2 === 1 ? "Jordan Rivera" : "Ms. Morgan" },
      }))}
      previewMode
      demoMode
    />
  );
}

function TeacherPreview() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="overflow-hidden rounded-2xl border bg-card p-5 sm:p-7">
        <Badge className="mb-4">Butterflies classroom</Badge>
        <h1 className="text-pretty text-3xl font-semibold tracking-tight">Today with your class</h1>
        <p className="mt-2 text-sm text-muted-foreground">Fourteen children present · two daily reports need review</p>
      </section>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card id="teacher-roster" className="scroll-mt-36 min-w-0 overflow-hidden"><CardHeader><CardTitle as="h2">Roster</CardTitle><CardDescription>Children currently in your classroom</CardDescription></CardHeader><CardContent className="grid gap-2">{['Ava Rivera', 'Mason Brooks', 'Noah Williams', 'Lily Chen'].map((name) => <div key={name} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span className="truncate font-medium">{name}</span><Badge variant="outline">Present</Badge></div>)}</CardContent></Card>
        <Card id="teacher-quick-log" className="scroll-mt-36 min-w-0 overflow-hidden"><CardHeader><CardTitle as="h2">Quick log</CardTitle><CardDescription>Record the classroom day with fewer taps</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">{['Meal', 'Nap', 'Diaper', 'Activity', 'Photo', 'Note'].map((label) => <div key={label} className="rounded-lg border p-4 text-center text-sm font-semibold">{label}</div>)}</CardContent></Card>
      </div>
    </div>
  );
}

function PreviewMetrics({ items }: { items: Array<{ label: string; value: string; detail: string }> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border bg-card p-4">
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

function PortfolioPreview({ regional = false }: { regional?: boolean }) {
  const schools = [
    { name: "Sunshine Academy", location: "Carmel, Indiana", occupancy: "91%", status: "On track" },
    { name: "Little Harbor", location: "Fishers, Indiana", occupancy: "87%", status: "Review staffing" },
    { name: "Maple Grove", location: "Westfield, Indiana", occupancy: "93%", status: "On track" },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="rounded-2xl border bg-card p-5 sm:p-7">
        <Badge className="mb-4">{regional ? "Regional operations" : "Executive portfolio"}</Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{regional ? "North region" : "School portfolio"}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">Compare school health, follow up on exceptions, and keep decisions tied to the right location.</p>
      </section>
      <PreviewMetrics items={[
        { label: "Open schools", value: regional ? "5" : "14", detail: "All reporting" },
        { label: "Children enrolled", value: regional ? "612" : "1,684", detail: "Current enrollment" },
        { label: "Portfolio occupancy", value: "90%", detail: "+2.4% this quarter" },
        { label: "Items to review", value: "3", detail: "Staffing and compliance" },
      ]} />
      <Card className="overflow-hidden">
        <CardHeader><CardTitle as="h2">School comparison</CardTitle><CardDescription>Operational signals by location</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>School</TableHead><TableHead>Location</TableHead><TableHead>Occupancy</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{schools.map((school) => <TableRow key={school.name}><TableCell className="font-medium">{school.name}</TableCell><TableCell>{school.location}</TableCell><TableCell className="tabular-nums">{school.occupancy}</TableCell><TableCell><Badge variant={school.status === "On track" ? "secondary" : "outline"}>{school.status}</Badge></TableCell></TableRow>)}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function BillingPreview() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="rounded-2xl border bg-card p-5 sm:p-7">
        <Badge className="mb-4"><CreditCard data-icon="inline-start" aria-hidden="true" /> Billing operations</Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Family billing</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">Review current-family balances, payments, and invoice exceptions without mixing in historical family debt.</p>
      </section>
      <PreviewMetrics items={[
        { label: "Current balance", value: "$48,240", detail: "Across active families" },
        { label: "Payments today", value: "$18,420", detail: "32 completed" },
        { label: "Needs review", value: "4", detail: "No charge attempted" },
      ]} />
      <Card>
        <CardHeader><CardTitle as="h2">Billing review queue</CardTitle><CardDescription>Exceptions requiring a staff decision</CardDescription></CardHeader>
        <CardContent className="divide-y">{[["Rivera Family", "Payment pending", "$1,245"], ["Brooks Family", "Subsidy review", "$860"], ["Chen Family", "Credit available", "-$125"]].map(([family, status, amount]) => <div key={family} className="flex min-h-16 items-center justify-between gap-4 py-3"><div><div className="font-medium">{family}</div><div className="text-sm text-muted-foreground">{status}</div></div><div className="font-semibold tabular-nums">{amount}</div></div>)}</CardContent>
      </Card>
    </div>
  );
}

function AuditorPreview() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="rounded-2xl border bg-card p-5 sm:p-7"><Badge className="mb-4"><ShieldCheck data-icon="inline-start" aria-hidden="true" /> Read-only audit</Badge><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Compliance review</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">Review access, document, and operational exceptions. This lens cannot change school records.</p></section>
      <Card><CardHeader><CardTitle as="h2">Open review items</CardTitle><CardDescription>Evidence and ownership stay visible together</CardDescription></CardHeader><CardContent className="grid gap-3">{[["Staff credential renewal", "Little Harbor · due in 12 days"], ["Attendance correction", "Sunshine Academy · director review"], ["Document retention check", "Maple Grove · no action overdue"]].map(([title, detail]) => <div key={title} className="flex items-start gap-3 rounded-lg border p-4"><Activity className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><div><div className="font-medium">{title}</div><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div></div>)}</CardContent></Card>
    </div>
  );
}

function PickupPreview() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <section className="rounded-2xl border bg-card p-5 sm:p-7"><Badge className="mb-4">Authorized pickup</Badge><h1 className="text-3xl font-semibold tracking-tight">Rivera family pickup</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Check the child&apos;s current status and use the school kiosk when it is time to pick up.</p></section>
      <Card><CardHeader><CardTitle as="h2">Pickup access</CardTitle><CardDescription>Preview of the limited pickup experience</CardDescription></CardHeader><CardContent className="grid gap-3"><div className="flex items-center justify-between gap-3 rounded-lg border p-4"><div><div className="font-medium">Ava Rivera</div><p className="mt-1 text-sm text-muted-foreground">Butterflies · checked in at 8:04 AM</p></div><Badge variant="secondary">At school</Badge></div><div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">This preview includes child status only. It does not load billing, profile, document, or private message data.</div></CardContent></Card>
    </div>
  );
}

function ShellPreview({ role, screen, familySection }: { role: Exclude<PreviewRole, "kiosk" | "kiosk-staff">; screen?: string; familySection?: string }) {
  if (role === "role-dashboard") {
    return (
      <AppShell previewMode previewHrefBase="/device-preview?view=role-dashboard" currentUser={{ name: "Avery Thompson", email: "avery@example.com", role: "CENTER_DIRECTOR", centerIds: ["preview-center"], timeZone: "America/Indiana/Indianapolis", workspace: { ...previewPortfolioWorkspace, mode: "fixed", selection: "center:preview-center", activeCenterId: "preview-center", label: "Sunshine Academy", detail: "Carmel, IN", canSwitch: false, canSelectAll: false, authorizedCenterCount: 1, options: previewPortfolioWorkspace.options.slice(0, 1) }, scopeContext: { kind: "school", label: "Sunshine Academy", detail: "Center Director · 1 school", href: "/dashboard" } }}>
        <ExecutiveDashboard live={{
          role: "CENTER_DIRECTOR",
          accessScope: "center",
          workspace: { mode: "fixed", label: "Sunshine Academy", detail: "Carmel, IN" },
          kpis: demoKpis,
          pipelineStages: demoPipelineStages,
          centers: demoCenters,
          aiSummary: "Attendance is steady. Review two pickup notes before the afternoon transition.",
          notifications: ["Two daily reports need review", "One enrollment follow-up is due today"],
          visibleLenses: ["director"],
          asOfLabel: "Safe preview data",
        }} />
      </AppShell>
    );
  }
  if (role === "parent") {
    return <AppShell previewMode previewHrefBase="/device-preview?view=parent" currentUser={{ name: "Jordan Rivera", email: "parent@example.com", role: "PARENT_GUARDIAN", timeZone: "America/Indiana/Indianapolis", scopeContext: { kind: "family", label: "Rivera Family", detail: "Sunshine Academy", href: "/parent-portal" } }}><ParentPreview screen={screen} familySection={familySection} /></AppShell>;
  }
  if (role === "teacher") {
    return <AppShell previewMode previewHrefBase="/device-preview?view=teacher" currentUser={{ name: "Morgan Lee", email: "morgan@example.com", role: "TEACHER", centerIds: ["preview-center"], timeZone: "America/Indiana/Indianapolis", scopeContext: { kind: "classroom", label: "Butterflies", detail: "Sunshine Academy · Teacher", href: "/teacher-portal" } }}><TeacherPreview /></AppShell>;
  }
  if (role === "pickup") {
    return <AppShell previewMode previewHrefBase="/device-preview?view=pickup" currentUser={{ name: "Taylor Rivera", email: "pickup@example.com", role: "AUTHORIZED_PICKUP", timeZone: "America/Indiana/Indianapolis", scopeContext: { kind: "family", label: "Rivera Family", detail: "Authorized pickup access", href: "/parent-portal" } }}><PickupPreview /></AppShell>;
  }
  if (role === "executive" || role === "regional") {
    const regional = role === "regional";
    return <AppShell previewMode previewHrefBase={`/device-preview?view=${role}`} currentUser={{ name: regional ? "Riley Morgan" : "Casey Bennett", email: `${role}@example.com`, role: regional ? "REGIONAL_MANAGER" : "PLATFORM_OWNER", accessScope: regional ? "tenant" : "platform", centerIds: ["preview-center", "preview-center-two", "preview-center-three"], timeZone: "America/Indiana/Indianapolis", workspace: previewPortfolioWorkspace, scopeContext: { kind: "portfolio", label: "All locations", detail: regional ? "3 schools · Regional Manager" : "3 schools · Platform Owner", href: "/multi-location-dashboard" } }}><PortfolioPreview regional={regional} /></AppShell>;
  }
  if (role === "billing") {
    return <AppShell previewMode previewHrefBase="/device-preview?view=billing" currentUser={{ name: "Jamie Patel", email: "billing@example.com", role: "BILLING_ADMIN", centerIds: ["preview-center"], timeZone: "America/Indiana/Indianapolis", scopeContext: { kind: "school", label: "Sunshine Academy", detail: "Billing Admin · 1 school", href: "/billing-invoices" } }}><BillingPreview /></AppShell>;
  }
  if (role === "auditor") {
    return <AppShell previewMode previewHrefBase="/device-preview?view=auditor" currentUser={{ name: "Alex Kim", email: "auditor@example.com", role: "READ_ONLY_AUDITOR", accessScope: "tenant", centerIds: ["preview-center", "preview-center-two", "preview-center-three"], timeZone: "America/Indiana/Indianapolis", workspace: previewPortfolioWorkspace, scopeContext: { kind: "portfolio", label: "All locations", detail: "3 schools · Read Only Auditor", href: "/multi-location-dashboard" } }}><AuditorPreview /></AppShell>;
  }
  if (role === "workflow") {
    return <AppShell previewMode previewHrefBase="/device-preview?view=workflow" currentUser={{ name: "Avery Thompson", email: "avery@example.com", role: "CENTER_DIRECTOR", centerIds: ["preview-center"], timeZone: "America/Indiana/Indianapolis", scopeContext: { kind: "school", label: "Sunshine Academy", detail: "Center Director · 1 school", href: "/dashboard" } }}><AutomationWorkflowBuilder data={workflowData} readOnly /></AppShell>;
  }
  return <AppShell previewMode previewHrefBase="/device-preview?view=director" currentUser={{ name: "Avery Thompson", email: "avery@example.com", role: "CENTER_DIRECTOR", centerIds: ["preview-center"], timeZone: "America/Indiana/Indianapolis", scopeContext: { kind: "school", label: "Sunshine Academy", detail: "Center Director · 1 school", href: "/dashboard" } }}><DirectorPreview /></AppShell>;
}

export default async function DevicePreviewPage({ searchParams }: { searchParams: Promise<{ view?: string; screen?: string; section?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();

  const { view, screen, section } = await searchParams;
  const role: PreviewRole = view === "role-dashboard" || view === "parent" || view === "pickup" || view === "teacher" || view === "executive" || view === "regional" || view === "billing" || view === "auditor" || view === "workflow" || view === "kiosk" || view === "kiosk-staff" ? view : "director";
  if (role === "kiosk" || role === "kiosk-staff") {
    return <DevicePreviewGuard><KioskCheckIn previewMode familyOnly={role === "kiosk"} center={{ id: "preview-center", name: "Sunshine Academy", place: "Carmel, Indiana", timeZone: "America/Indiana/Indianapolis" }} initialMode={role === "kiosk-staff" ? "staff" : "family"} /></DevicePreviewGuard>;
  }
  return <DevicePreviewGuard><ShellPreview role={role} screen={screen} familySection={section} /></DevicePreviewGuard>;
}
