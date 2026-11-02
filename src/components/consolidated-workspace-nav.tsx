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
    description: "Review enrollment, classroom presence, move-ups, attendance, daily reports, and incidents.",
    note: "Daily school tasks",
    columns: "grid-flow-col auto-cols-[minmax(11rem,1fr)] overflow-x-auto sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 xl:grid-cols-4",
    views: [
      ["enrollment", "Enrollment status", "Current roster and exports", "/analytics?report=enrollment_status", ClipboardList],
      ["classrooms", "Classrooms", "Rooms, ratios, and activity", "/classroom-dashboard", Activity],
      ["presence", "Classroom presence", "Live counts and historical lookups", "/classroom-dashboard?view=presence", Users],
      ["move-ups", "Move-ups", "Six-month reviews and year-long programs", "/classroom-dashboard?view=move-ups", CalendarDays],
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
      ["branding", "White-label", "Brand presentation", "/billing-settings?view=branding", ImageIcon],
    ],
  },
} as const;

export type ConsolidatedWorkspace = keyof typeof workspaceConfig;

export function ConsolidatedWorkspaceNav({ workspace, activeView, allowedViews }: { workspace: ConsolidatedWorkspace; activeView: string; allowedViews?: readonly string[] }) {
  const config = workspaceConfig[workspace];
  const visibleViews = allowedViews ? config.views.filter(([id]) => allowedViews.includes(id)) : config.views;
  return (
    <section className="mb-4 rounded-xl border bg-card p-2">
      <nav className="flex flex-wrap gap-1" aria-label={`${config.title} views`}>
        {visibleViews.map(([id, label, detail, href, Icon]) => {
          const active = activeView === id;
          return (
            <Link key={id} href={href} aria-current={active ? "page" : undefined} aria-description={detail}
              className={cn("inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-primary/10 text-foreground ring-1 ring-primary/30" : "text-muted-foreground")}>
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
