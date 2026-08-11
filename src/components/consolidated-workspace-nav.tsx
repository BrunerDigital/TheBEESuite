import Link from "next/link";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileText,
  HeartHandshake,
  ImageIcon,
  Megaphone,
  MessageSquare,
  Route,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  WalletCards,
  Workflow,
} from "lucide-react";
import { beeWebWorkspaceAliases } from "@/lib/app-catalog";
import { cn } from "@/lib/utils";

const workspaceConfig = {
  enrollment: {
    brandAlias: beeWebWorkspaceAliases.enrollment.brandLabel,
    title: beeWebWorkspaceAliases.enrollment.functionalLabel,
    description: "Track prospective families from inquiry through tours, waitlists, and enrollment.",
    note: "From inquiry to enrollment",
    columns: "sm:grid-cols-2 xl:grid-cols-4",
    views: [
      ["leads", "Leads", "Inbox and lead records", "/crm-leads", Users],
      ["pipeline", "Pipeline", "Stages and conversion", "/crm-leads?view=pipeline", Route],
      ["tours", "Tours", "Scheduling and follow-up", "/crm-leads?view=tours", CalendarDays],
      ["waitlist", "Waitlist", "Demand and openings", "/crm-leads?view=waitlist", ClipboardCheck],
    ],
  },
  growth: {
    brandAlias: beeWebWorkspaceAliases.growth.brandLabel,
    title: beeWebWorkspaceAliases.growth.functionalLabel,
    description: "Plan outreach and review the automated steps connected to each campaign.",
    note: "Campaign planning",
    columns: "sm:grid-cols-2",
    views: [
      ["campaigns", "Campaigns", "Audience communication", "/campaigns", Megaphone],
      ["automations", "Automations", "Triggers and workflows", "/campaigns?view=automations", Workflow],
    ],
  },
  operations: {
    brandAlias: beeWebWorkspaceAliases.operations.brandLabel,
    title: beeWebWorkspaceAliases.operations.functionalLabel,
    description: "Review enrollment, classrooms, attendance, daily reports, and incident follow-up.",
    note: "Daily school tasks",
    columns: "sm:grid-cols-2 xl:grid-cols-5",
    views: [
      ["enrollment", "Enrollment status", "Current roster and exports", "/analytics?report=enrollment_status", ClipboardList],
      ["classrooms", "Classrooms", "Rooms, ratios, and activity", "/classroom-dashboard", Activity],
      ["attendance", "Attendance", "Check-in and live status", "/classroom-dashboard?view=attendance", ClipboardCheck],
      ["reports", "Daily reports", "Care notes and family updates", "/classroom-dashboard?view=reports", BookOpen],
      ["incidents", "Incidents", "Safety records and review", "/classroom-dashboard?view=incidents", ShieldCheck],
    ],
  },
  families: {
    brandAlias: null,
    title: "Families & Communication",
    description: "Review family records, child profiles, messages, and shared photos.",
    note: "Family records and messages",
    columns: "sm:grid-cols-2 xl:grid-cols-4",
    views: [
      ["families", "Families", "Guardians and household records", "/family-detail", Users],
      ["children", "Children", "Profiles, care, and permissions", "/family-detail?view=children", HeartHandshake],
      ["messages", "Messages", "Family conversations", "/family-detail?view=messages", MessageSquare],
      ["media", "Media review", "Photos and sharing approvals", "/family-detail?view=media", ImageIcon],
    ],
  },
  billing: {
    brandAlias: beeWebWorkspaceAliases.billing.brandLabel,
    title: beeWebWorkspaceAliases.billing.functionalLabel,
    description: "Manage invoices, balances, payments, deposits, and transaction follow-up.",
    note: "Invoices and payments",
    columns: "sm:grid-cols-2",
    views: [
      ["billing", "Billing & invoices", "Accounts, charges, and balances", "/billing-invoices", CreditCard],
      ["payments", "Payments", "Transactions and reconciliation", "/billing-invoices?view=payments", WalletCards],
    ],
  },
  records: {
    brandAlias: beeWebWorkspaceAliases.records.brandLabel,
    title: beeWebWorkspaceAliases.records.functionalLabel,
    description: "Create forms, manage documents, and track required records.",
    note: "Forms and required records",
    columns: "sm:grid-cols-3",
    views: [
      ["forms", "Forms", "Templates and submissions", "/forms", FileText],
      ["documents", "Documents", "Files and acknowledgements", "/forms?view=documents", BookOpen],
      ["compliance", "Compliance", "Tasks, evidence, and readiness", "/forms?view=compliance", ShieldCheck],
    ],
  },
  insights: {
    brandAlias: beeWebWorkspaceAliases.insights.brandLabel,
    title: beeWebWorkspaceAliases.insights.functionalLabel,
    description: "Review school performance, trends, and family feedback.",
    note: "Reports and family feedback",
    columns: "sm:grid-cols-3",
    views: [
      ["enrollment", "Enrollment status", "Current roster and exports", "/analytics?report=enrollment_status", ClipboardList],
      ["analytics", "Analytics", "Trends and operating metrics", "/analytics", BarChart3],
      ["reputation", "Reputation", "Reviews and family sentiment", "/analytics?view=reputation", Star],
    ],
  },
  staff: {
    brandAlias: beeWebWorkspaceAliases.staff.brandLabel,
    title: beeWebWorkspaceAliases.staff.functionalLabel,
    description: "Manage staff records, classroom assignments, roles, and access.",
    note: "Team and permissions",
    columns: "sm:grid-cols-2",
    views: [
      ["teachers", "Teachers", "Staff profiles and classrooms", "/staff", HeartHandshake],
      ["permissions", "Team permissions", "Roles and module access", "/staff?view=permissions", Users],
    ],
  },
  settings: {
    brandAlias: null,
    title: "Settings & Setup",
    description: "Manage integrations, billing preferences, school setup, branding, and notifications.",
    note: "School preferences and setup",
    columns: "sm:grid-cols-2 xl:grid-cols-5",
    views: [
      ["settings", "Settings", "Billing and school preferences", "/billing-settings", Settings],
      ["integrations", "Integrations", "Connected services", "/billing-settings?view=integrations", Workflow],
      ["setup", "School setup", "Launch and readiness", "/billing-settings?view=setup", ClipboardCheck],
      ["notifications", "Notifications", "Alerts and delivery rules", "/billing-settings?view=notifications", Bell],
      ["branding", "White-label", "Brand presentation", "/billing-settings?view=branding", Sparkles],
    ],
  },
} as const;

export type ConsolidatedWorkspace = keyof typeof workspaceConfig;

export function ConsolidatedWorkspaceNav({ workspace, activeView, allowedViews }: { workspace: ConsolidatedWorkspace; activeView: string; allowedViews?: readonly string[] }) {
  const config = workspaceConfig[workspace];
  const visibleViews = allowedViews ? config.views.filter(([id]) => allowedViews.includes(id)) : config.views;
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-primary/25 bg-card/75 shadow-xl shadow-black/10">
      <div className="flex flex-col gap-3 border-b border-border/70 bg-gradient-to-r from-primary/[0.10] via-transparent to-transparent px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-5 text-primary" />
            <span>{config.title}</span>
            {config.brandAlias ? (
              <span
                aria-hidden="true"
                className="whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-foreground"
              >
                {config.brandAlias}
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">{config.description}</p>
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">{config.note}</div>
      </div>
      <nav className={cn("grid", config.columns)} aria-label={`${config.title} views`}>
        {visibleViews.map(([id, label, detail, href, Icon]) => {
          const active = activeView === id;
          return <Link key={id} href={href} aria-current={active ? "page" : undefined} className={cn("group relative flex min-h-20 items-center gap-3 border-b border-border/60 px-5 py-3 transition hover:bg-primary/[0.06] sm:border-r", active && "bg-primary/[0.10] text-foreground before:absolute before:inset-x-5 before:bottom-0 before:h-0.5 before:rounded-full before:bg-primary")}><span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border bg-background/70 text-muted-foreground transition", active && "border-primary/40 bg-primary/15 text-primary")}><Icon className="size-4" /></span><span><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span></span></Link>;
        })}
      </nav>
    </section>
  );
}
