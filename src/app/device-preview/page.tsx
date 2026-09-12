import { notFound } from "next/navigation";
import Link from "next/link";
import { Activity, CreditCard, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AutomationWorkflowBuilder, type AutomationWorkflowBuilderData } from "@/components/automation-workflow-builder";
import { DevicePreviewGuard } from "@/components/device-preview-guard";
import { ExecutiveDashboard } from "@/components/dashboard";
import { KioskCheckIn } from "@/components/kiosk-check-in";
import { TeacherMobileWorkspace } from "@/components/teacher-mobile-workspace";
import { ParentPortalWorkspace } from "@/components/parent-portal-workspace";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { executiveParentPortalDemo } from "@/lib/executive-demo-data";
import { centers as demoCenters, kpis as demoKpis, pipelineStages as demoPipelineStages } from "@/lib/demo-data";
import { normalizeParentPortalView } from "@/lib/parent-portal-navigation";
import type { WorkspaceState } from "@/lib/workspace-selection";

type PreviewRole = "director" | "assistant-director" | "role-dashboard" | "parent" | "pickup" | "teacher" | "executive" | "regional" | "billing" | "auditor" | "workflow" | "kiosk" | "kiosk-staff";

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
    runs: [],
  }],
  stats: { total: 1, active: 1, paused: 0, recentRuns: 0 },
};

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

function ParentPreview({ screen, familySection, scenario }: { screen: string | undefined; familySection: string | undefined; scenario?: string }) {
  const activeView = normalizeParentPortalView(screen);
  const singleChildReview = scenario === "single-review";
  const schoolContext = scenario === "school-context";
  const quietHome = scenario === "quiet-home" || scenario?.startsWith("account-") === true;
  const longContent = scenario === "long-content";
  const featureStress = scenario === "feature-stress";
  const absentHome = scenario === "absent-home";
  const oneChild = singleChildReview || schoolContext || quietHome || longContent || absentHome;
  const family = {
    ...executiveParentPortalDemo.family,
    guardians: oneChild
      ? executiveParentPortalDemo.family.guardians.map((guardian, index) =>
          index === 0 ? { ...guardian, fullName: "App Review Parent" } : guardian,
        )
      : executiveParentPortalDemo.family.guardians,
    children: (oneChild
      ? executiveParentPortalDemo.family.children.slice(0, 1)
      : executiveParentPortalDemo.family.children
    ).map((child, index) => ({
      ...child,
      ...(schoolContext ? { classroom: { ...child.classroom, name: "Afterschool Hive" } } : {}),
      ...(longContent ? {
        preferredName: "Alexandria Isabella Montgomery-Rivera",
        fullName: "Alexandria Isabella Montgomery-Rivera",
        classroom: { ...child.classroom, name: "Early Explorers and Discoverers Afternoon Classroom" },
      } : {}),
      today: oneChild
        ? {
            status: absentHome ? "absent" as const : "not_marked" as const,
            label: absentHome ? "Absent" : "Not marked today",
            latestEventAt: null,
            currentLocationName: null,
            dailyReportShared: false,
          }
        : {
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
      centerName={longContent ? "Sunshine Academy of Early Learning and Family Discovery · North Campus" : schoolContext ? "Sunshine Academy - Little Harbor · Port Orange, FL" : "Sunshine Academy"}
      {...(featureStress ? {
        classroomTeachers: [{ id: "preview-teacher", name: "Ms. Alexandra Montgomery-Rivera", classroomNames: ["Early Explorers and Discoverers Afternoon Classroom"] }],
        documents: Array.from({ length: 12 }, (_, index) => ({
          id: `preview-document-${index + 1}`,
          name: index === 0 ? "Family handbook and extended-day classroom permission acknowledgment" : `School document ${index + 1}`,
          type: "enrollment",
          status: index === 2 ? "APPROVED" : "PENDING",
          expiresAt: null,
          storageKey: index === 0 ? "internal_signature_pending" : null,
        })),
        dailyReports: executiveParentPortalDemo.dailyReports.map((report) => ({
          ...report,
          teacherNote: "Today’s classroom note includes an unusually long reference: " + "ClassroomLearningReference".repeat(10),
          mood: "Happy, energetic, and excited about learning with friends",
        })),
      } : {})}
      {...(scenario === "empty" ? { documents: [], dailyReports: [], media: [] } : {})}
      {...(quietHome ? {
        billingAccount: { ...executiveParentPortalDemo.billingAccount, balanceCents: 0 },
        attentionSummary: { openInvoiceCount: 0, unacknowledgedIncidentCount: 0 },
        paymentActivitySummary: { pendingCount: 0, provisionalCreditCents: 0 },
        invoices: [],
        documents: [],
        incidents: [],
        announcements: [],
        ledgerEntries: [],
      } : {})}
      {...(scenario === "account-missing" ? { billingAccount: null } : {})}
      {...(scenario === "account-pending" ? { paymentActivitySummary: { pendingCount: 21, provisionalCreditCents: 0 }, accountPaymentBlocker: { count: 1, phase: "confirmation_unknown" as const, method: "card" as const, blocksInvoicePayments: false } } : {})}
      {...(scenario === "account-ach" ? { paymentActivitySummary: { pendingCount: 1, provisionalCreditCents: 15000 }, accountPaymentBlocker: { count: 1, phase: "ach_processing" as const, method: "ach" as const, blocksInvoicePayments: true } } : {})}
      {...(scenario === "account-open" ? { attentionSummary: { openInvoiceCount: 21, unacknowledgedIncidentCount: 0 } } : {})}
      {...(scenario === "account-credit" ? { billingAccount: { ...executiveParentPortalDemo.billingAccount, balanceCents: -2500 } } : {})}
      {...(scenario === "account-review" ? { parentBalanceReviewRequired: true } : {})}
      {...(scenario === "account-reauthorize" ? { paymentMethodReauthorizationRequired: true } : {})}
      {...(scenario === "account-transition" ? { paymentTransitionActive: true } : {})}
      {...(longContent ? {
        announcements: executiveParentPortalDemo.announcements.map((announcement) => ({
          ...announcement,
          title: "Family picnic and classroom celebration for our early learning community",
          body: `${announcement.body} `.repeat(12) + "Please contact the school office with any questions.",
        })),
      } : {})}
      currentGuardianId="exec-demo-guardian-a"
      {...(featureStress ? { announcements: [
        ...executiveParentPortalDemo.announcements,
        { id: "preview-announcement-2", title: "Picture day reminder", body: "Classroom pictures are next Wednesday. Send a labeled change of clothes; participation is optional.", sendAt: "2026-09-08T14:00:00.000Z" },
        { id: "preview-announcement-3", title: "Welcome to our family reading week", body: "Bring a favorite story to share with the classroom. Please write your child's name inside the cover so it can come home safely.", sendAt: "2026-09-07T14:00:00.000Z" },
      ] } : {})}
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
      messages={scenario === "empty" ? [] : executiveParentPortalDemo.messages.map((message, index) => ({
        ...message,
        isFromFamily: index % 2 === 1,
        canReport: index % 2 === 0,
        sender: { name: index % 2 === 1 ? "Jordan Rivera" : "Ms. Morgan" },
      }))}
      previewMode
      demoMode={!oneChild}
    />
  );
}

function TeacherPreview({ scenario }: { scenario?: string }) {
  const roster = (scenario === "empty" ? [] : ["Ava Rivera", "Mason Brooks", "Noah Williams", "Lily Chen", "Emma Davis"]).map((name, index) => ({
    id: `preview-child-${index + 1}`,
    fullName: scenario === "long-content" && index === 0 ? "Alexandria Isabella Montgomery-Rivera" : name,
    ageGroup: "Preschool",
    enrollmentStatus: "active",
    photoVideoPermission: true,
    classroom: { id: "preview-classroom", name: "Butterflies" },
    attendance: {
      status: index === 3 ? "checked_out" : index === 4 ? "not_marked" : "present",
      latestLogType: index === 3 ? "check_out" : index === 4 ? null : "check_in",
      latestLogAt: index === 4 ? null : "2026-09-10T12:05:00Z",
      lastMarkedAt: index === 4 ? null : "2026-09-10T12:05:00Z",
    },
    dailyReport: {
      status: index === 3 ? "sent" as const : index === 4 ? "not_started" as const : "draft" as const,
      latestReportAt: index === 4 ? null : "2026-09-10T15:00:00Z",
      sentAt: index === 3 ? "2026-09-10T16:00:00Z" : null,
      entries: { meals: 1, naps: 0, diapers: 0, activities: 1 },
    },
  }));
  return <TeacherMobileWorkspace previewMode previewHistoryGuard={scenario === "history-qa"} appReviewMode={scenario === "review"} teacherName="Morgan Lee" roster={roster}
    teacherProfile={{ id: "preview-teacher", name: "Morgan Lee", loginEmail: "morgan@example.com", contactEmail: "morgan@example.com", phone: "", title: "Teacher", centerId: "preview-center", centerName: "Sunshine Academy", classroomId: "preview-classroom", hasStaffKioskCode: true }}
    classroomOptions={[{ id: "preview-classroom", name: "Butterflies", ageGroup: "Preschool" }]}
    classroomRatios={[{ classroomId: "preview-classroom", name: "Butterflies", capacity: 20, ratioRule: "1:10", assignedStaff: 1 }]}
    kioskAccess={{ centerId: "preview-center", centerName: "Sunshine Academy", kioskPath: "/device-preview?view=kiosk-staff", hasStaffKioskCode: true, clockStatus: "clocked_in", lastActionAt: "2026-09-10T12:00:00Z", timeClockSummary: { totalMinutes: 240, closedShiftCount: 1, openShiftMinutes: 60, openShiftStartedAt: "2026-09-10T12:00:00Z" } }}
  />;
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

function PortfolioPreview({ regional = false, scenario }: { regional?: boolean; scenario?: string }) {
  const schoolComparisons = (scenario === "empty" ? [] : previewPortfolioWorkspace.options).map((school, index) => ({
    id: school.id, name: scenario === "long-content" && index === 0 ? "Sunshine Academy of Early Learning and Family Discovery · North Campus" : school.name,
    region: school.detail, children: 52, capacity: 60, occupancy: 87, staff: 9, leads: 3, toursToday: 1,
    revenueDollars: 12500, compliance: 100, fteCount: index === 1 ? null : 48, fteStatus: "Submitted", fteSubmitted: index !== 1,
  }));
  return <ExecutiveDashboard live={{
    role: regional ? "REGIONAL_MANAGER" : "PLATFORM_OWNER",
    accessScope: regional ? "tenant" : "platform",
    workspace: { mode: "all", label: "All locations", detail: `${schoolComparisons.length} schools in your authorized workspace` },
    kpis: demoKpis, pipelineStages: demoPipelineStages, centers: scenario === "empty" ? [] : demoCenters,
    aiSummary: "Review current-week reporting and classroom coverage across your authorized schools.",
    notifications: scenario === "empty" ? [] : [{ text: "One school needs a current-week FTE follow-up", widgetId: "executiveRollup" }],
    visibleLenses: [regional ? "regional" : "platform"], asOfLabel: "Safe preview data",
    executiveMetrics: {
      currentWeekStart: "2026-09-07T00:00:00Z", currentWeekKey: "2026-09-07", fteDeadlineLabel: "Friday",
      fteSubmittedSchools: schoolComparisons.filter((school) => school.fteSubmitted).length,
      fteMissingSchools: schoolComparisons.filter((school) => !school.fteSubmitted).length,
      schoolComparisons, weeklyFteTrend: [], fteSubmissions: [], payrollSummaries: [], refundRequests: [],
    },
  }} />;
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

function ShellPreview({ role, screen, familySection, scenario }: { role: Exclude<PreviewRole, "kiosk" | "kiosk-staff">; screen?: string; familySection?: string; scenario?: string }) {
  if (role === "role-dashboard" || role === "director" || role === "assistant-director") {
    const directorRole = role === "assistant-director" ? "ASSISTANT_DIRECTOR" : "CENTER_DIRECTOR";
    const directorLabel = role === "assistant-director" ? "Assistant Director" : "Center Director";
    return (
      <AppShell previewMode previewHrefBase={`/device-preview?view=${role}`} currentUser={{ name: "Avery Thompson", email: "avery@example.com", role: directorRole, centerIds: ["preview-center"], timeZone: "America/Indiana/Indianapolis", workspace: { ...previewPortfolioWorkspace, mode: "fixed", selection: "center:preview-center", activeCenterId: "preview-center", label: "Sunshine Academy", detail: "Carmel, IN", canSwitch: false, canSelectAll: false, authorizedCenterCount: 1, options: previewPortfolioWorkspace.options.slice(0, 1) }, scopeContext: { kind: "school", label: "Sunshine Academy", detail: `${directorLabel} · 1 school`, href: "/dashboard" } }}>
        <ExecutiveDashboard live={{
          role: directorRole,
          accessScope: "center",
          workspace: { mode: "fixed", label: "Sunshine Academy", detail: "Carmel, IN" },
          kpis: demoKpis,
          pipelineStages: demoPipelineStages,
          centers: demoCenters,
          aiSummary: "Attendance is steady. Review two pickup notes before the afternoon transition.",
          notifications: scenario === "empty" ? [] : [
            { text: scenario === "long-content" ? "Review the afternoon classroom coverage and follow-up instructions for the extended-day early learning program" : "Two classroom attendance follow-ups need review", widgetId: "attendanceSnapshot" },
            { text: "One enrollment follow-up is due today", widgetId: "enrollmentPipeline" },
            { text: "Review classroom staffing coverage", widgetId: "staffingRatios" },
            { text: "One compliance follow-up is due", widgetId: "complianceQueue" },
          ],
          visibleLenses: ["director"],
          asOfLabel: "Safe preview data",
        }} />
      </AppShell>
    );
  }
  if (role === "parent") {
    const reviewScenario = ["single-review", "school-context", "quiet-home", "long-content", "absent-home"].includes(scenario ?? "");
    return <AppShell previewMode previewHrefBase="/device-preview?view=parent" currentUser={{ name: reviewScenario ? "App Review Parent" : "Jordan Rivera", email: "parent@example.com", role: "PARENT_GUARDIAN", timeZone: "America/Indiana/Indianapolis", scopeContext: { kind: "family", label: "Rivera Family", detail: "Sunshine Academy", href: "/parent-portal" } }}><ParentPreview screen={screen} familySection={familySection} scenario={scenario} /></AppShell>;
  }
  if (role === "teacher") {
    return <AppShell previewMode previewHrefBase="/device-preview?view=teacher" currentUser={{ name: "Morgan Lee", email: "morgan@example.com", role: "TEACHER", centerIds: ["preview-center"], timeZone: "America/Indiana/Indianapolis", scopeContext: { kind: "classroom", label: "Butterflies", detail: "Sunshine Academy · Teacher", href: "/teacher-portal" } }}><TeacherPreview scenario={scenario} /></AppShell>;
  }
  if (role === "pickup") {
    return <AppShell previewMode previewHrefBase="/device-preview?view=pickup" currentUser={{ name: "Taylor Rivera", email: "pickup@example.com", role: "AUTHORIZED_PICKUP", timeZone: "America/Indiana/Indianapolis", scopeContext: { kind: "family", label: "Rivera Family", detail: "Authorized pickup access", href: "/parent-portal" } }}><PickupPreview /></AppShell>;
  }
  if (role === "executive" || role === "regional") {
    const regional = role === "regional";
    const selectedSchool = scenario === "school-context";
    const workspace: WorkspaceState = selectedSchool ? { ...previewPortfolioWorkspace, mode: "center", selection: "center:preview-center", activeCenterId: "preview-center", label: "Sunshine Academy", detail: "Carmel, IN", companyLabel: "Sunshine Group" } : previewPortfolioWorkspace;
    return <AppShell previewMode previewHrefBase={`/device-preview?view=${role}`} currentUser={{ name: regional ? "Riley Morgan" : "Casey Bennett", email: `${role}@example.com`, role: regional ? "REGIONAL_MANAGER" : "PLATFORM_OWNER", accessScope: regional ? "tenant" : "platform", centerIds: ["preview-center", "preview-center-two", "preview-center-three"], timeZone: "America/Indiana/Indianapolis", workspace, scopeContext: { kind: selectedSchool ? "school" : "portfolio", label: workspace.label, detail: `${selectedSchool ? "Sunshine Group · Carmel, IN" : "3 schools"} · ${regional ? "Regional Manager" : "Platform Owner"}`, href: "/multi-location-dashboard" } }}><PortfolioPreview regional={regional} scenario={scenario} /></AppShell>;
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
  return null;
}

export default async function DevicePreviewPage({ searchParams }: { searchParams: Promise<{ view?: string; screen?: string; section?: string; scenario?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();

  const { view, screen, section, scenario } = await searchParams;
  const role: PreviewRole = view === "role-dashboard" || view === "assistant-director" || view === "parent" || view === "pickup" || view === "teacher" || view === "executive" || view === "regional" || view === "billing" || view === "auditor" || view === "workflow" || view === "kiosk" || view === "kiosk-staff" ? view : "director";
  if (role === "kiosk" || role === "kiosk-staff") {
    return <DevicePreviewGuard><KioskCheckIn previewMode familyOnly={role === "kiosk"} center={{ id: "preview-center", name: "Sunshine Academy", place: "Carmel, Indiana", timeZone: "America/Indiana/Indianapolis" }} initialMode={role === "kiosk-staff" ? "staff" : "family"} /></DevicePreviewGuard>;
  }
  return <DevicePreviewGuard rewriteWorkspaceLinks={role === "director" || role === "assistant-director" || role === "role-dashboard" || role === "executive" || role === "regional"}>
    {scenario === "history-qa" ? <nav aria-label="Fake history destinations" className="relative z-[100] flex flex-wrap gap-3 bg-background p-3">
      <Link prefetch={false} href="/device-preview?view=parent&scenario=history-qa">Fake parent destination</Link>
      <Link prefetch={false} href="/device-preview?view=workflow&scenario=history-qa">Fake workflow destination</Link>
      <Link prefetch={false} href="/device-preview?view=billing&scenario=history-qa">Fake billing destination</Link>
      <Link prefetch={false} href="/device-preview?view=teacher&scenario=history-qa">Fake teacher destination</Link>
    </nav> : null}
    <ShellPreview role={role} screen={screen} familySection={section} scenario={scenario} />
  </DevicePreviewGuard>;
}
