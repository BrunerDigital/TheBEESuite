import { notFound } from "next/navigation";
import { BadgeDollarSign, BellRing, CheckCircle2, Clock3, MessageSquare, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AutomationWorkflowBuilder, type AutomationWorkflowBuilderData } from "@/components/automation-workflow-builder";
import { KioskCheckIn } from "@/components/kiosk-check-in";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PreviewRole = "director" | "parent" | "teacher" | "workflow" | "kiosk" | "kiosk-staff";

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

function DirectorPreview() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="honeyglass-hero overflow-hidden rounded-3xl border bg-card/85 p-5 shadow-2xl shadow-black/10 sm:p-7">
        <Badge className="mb-4">Director command center</Badge>
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-end">
          <div className="min-w-0">
            <h1 className="text-pretty text-3xl font-semibold tracking-tight sm:text-4xl">Good morning, Avery</h1>
            <p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
              Your school is steady. Two items need a closer look before afternoon pickup.
            </p>
          </div>
          <Card className="dashboard-ai-brief min-w-0 border-primary/25 bg-background/65">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Today&apos;s focus</CardTitle>
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
          <Card key={label} className="glass-panel min-w-0 overflow-hidden">
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
        <Card className="glass-panel min-w-0 overflow-hidden">
          <CardHeader><CardTitle>School pulse</CardTitle><CardDescription>What needs attention now</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <div className="rounded-xl border bg-primary/[0.06] p-4"><div className="font-medium">Creative Kids</div><p className="mt-1 text-sm text-muted-foreground">Ratio below target · 14 of 18 present</p></div>
            <div className="rounded-xl border bg-background/50 p-4"><div className="font-medium">Explorer Pre-K</div><p className="mt-1 text-sm text-muted-foreground">One child has not signed in</p></div>
          </CardContent>
        </Card>
        <Card className="glass-panel min-w-0 overflow-hidden">
          <CardHeader><CardTitle>Quick actions</CardTitle><CardDescription>Frequent director workflows</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {['Attendance', 'Message families', 'Report incident', 'Run report'].map((label) => <div key={label} className="rounded-xl border bg-background/50 p-4 text-sm font-medium">{label}</div>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ParentPreview() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section id="today" className="scroll-mt-36 overflow-hidden rounded-3xl border bg-card/85 p-5 shadow-xl sm:p-7">
        <Badge className="mb-4">Today</Badge>
        <h1 className="text-pretty text-3xl font-semibold tracking-tight">Ava&apos;s day at a glance</h1>
        <p className="mt-2 text-sm text-muted-foreground">Checked in at 8:04 AM · Butterflies classroom</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Status", "Checked in"],
            ["Latest update", "Sensory garden"],
            ["Pickup", "Daniel Rivera"],
          ].map(([label, value]) => <div key={label} className="rounded-2xl border bg-background/55 p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-semibold">{value}</div></div>)}
        </div>
      </section>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card id="messages" className="glass-panel scroll-mt-36 min-w-0 overflow-hidden">
          <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="size-5 text-primary" /> Messages</CardTitle><CardDescription>Your family conversation with Sunshine Academy</CardDescription></CardHeader>
          <CardContent className="space-y-3"><div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted p-4 text-sm">Ava had a wonderful day and was proud of her art project.</div><div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary p-4 text-sm text-primary-foreground">Thank you for the update!</div></CardContent>
        </Card>
        <Card id="billing" className="glass-panel scroll-mt-36 min-w-0 overflow-hidden">
          <CardHeader><CardTitle>Payments</CardTitle><CardDescription>Family balance and saved payment method</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-semibold tabular-nums">$245.00</div><p className="mt-2 text-sm text-muted-foreground">Visa ending in 4242 · Autopay enabled</p></CardContent>
        </Card>
      </div>
    </div>
  );
}

function TeacherPreview() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="overflow-hidden rounded-3xl border bg-card/85 p-5 shadow-xl sm:p-7">
        <Badge className="mb-4">Butterflies classroom</Badge>
        <h1 className="text-pretty text-3xl font-semibold tracking-tight">Today with your class</h1>
        <p className="mt-2 text-sm text-muted-foreground">Fourteen children present · two daily reports need review</p>
      </section>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card id="teacher-roster" className="glass-panel scroll-mt-36 min-w-0 overflow-hidden"><CardHeader><CardTitle>Roster</CardTitle><CardDescription>Children currently in your classroom</CardDescription></CardHeader><CardContent className="grid gap-2">{['Ava Rivera', 'Mason Brooks', 'Noah Williams', 'Lily Chen'].map((name) => <div key={name} className="flex items-center justify-between gap-3 rounded-xl border bg-background/50 p-3 text-sm"><span className="truncate font-medium">{name}</span><Badge variant="outline">Present</Badge></div>)}</CardContent></Card>
        <Card id="teacher-quick-log" className="glass-panel scroll-mt-36 min-w-0 overflow-hidden"><CardHeader><CardTitle>Quick log</CardTitle><CardDescription>Record the classroom day with fewer taps</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">{['Meal', 'Nap', 'Diaper', 'Activity', 'Photo', 'Note'].map((label) => <div key={label} className="rounded-2xl border bg-primary/[0.06] p-4 text-center text-sm font-semibold">{label}</div>)}</CardContent></Card>
      </div>
    </div>
  );
}

function ShellPreview({ role }: { role: Exclude<PreviewRole, "kiosk" | "kiosk-staff"> }) {
  if (role === "parent") {
    return <AppShell previewMode previewHrefBase="/device-preview?view=parent" currentUser={{ name: "Jessica Rivera", email: "jessica@example.com", role: "PARENT_GUARDIAN", timeZone: "America/Indiana/Indianapolis", scopeContext: { kind: "family", label: "Family portal", detail: "Linked family access", href: "/parent-portal" } }}><ParentPreview /></AppShell>;
  }
  if (role === "teacher") {
    return <AppShell previewMode previewHrefBase="/device-preview?view=teacher" currentUser={{ name: "Morgan Lee", email: "morgan@example.com", role: "TEACHER", centerIds: ["preview-center"], timeZone: "America/Indiana/Indianapolis", scopeContext: { kind: "classroom", label: "Butterflies", detail: "Sunshine Academy · Teacher", href: "/teacher-portal" } }}><TeacherPreview /></AppShell>;
  }
  if (role === "workflow") {
    return <AppShell previewMode previewHrefBase="/device-preview?view=workflow" currentUser={{ name: "Avery Thompson", email: "avery@example.com", role: "CENTER_DIRECTOR", centerIds: ["preview-center"], timeZone: "America/Indiana/Indianapolis", scopeContext: { kind: "school", label: "Sunshine Academy", detail: "Center Director · 1 school", href: "/dashboard" } }}><AutomationWorkflowBuilder data={workflowData} /></AppShell>;
  }
  return <AppShell previewMode previewHrefBase="/device-preview?view=director" currentUser={{ name: "Avery Thompson", email: "avery@example.com", role: "CENTER_DIRECTOR", centerIds: ["preview-center"], timeZone: "America/Indiana/Indianapolis", scopeContext: { kind: "school", label: "Sunshine Academy", detail: "Center Director · 1 school", href: "/dashboard" } }}><DirectorPreview /></AppShell>;
}

export default async function DevicePreviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();

  const { view } = await searchParams;
  const role: PreviewRole = view === "parent" || view === "teacher" || view === "workflow" || view === "kiosk" || view === "kiosk-staff" ? view : "director";
  if (role === "kiosk" || role === "kiosk-staff") {
    return <KioskCheckIn center={{ id: "preview-center", name: "Sunshine Academy", place: "Carmel, Indiana", timeZone: "America/Indiana/Indianapolis" }} initialMode={role === "kiosk-staff" ? "staff" : "family"} />;
  }
  return <ShellPreview role={role} />;
}
