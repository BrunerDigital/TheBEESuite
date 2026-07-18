import Link from "next/link";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
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
import { cn } from "@/lib/utils";

const workspaceConfig = {
  enrollment: {
    title: "Enrollment CRM",
    description: "Move families from first inquiry through tour, waitlist, and enrollment in one connected workspace.",
    note: "Lead journey workspace",
    columns: "sm:grid-cols-2 xl:grid-cols-4",
    views: [
      ["leads", "Leads", "Inbox and lead records", "/crm-leads", Users],
      ["pipeline", "Pipeline", "Stages and conversion", "/crm-leads?view=pipeline", Route],
      ["tours", "Tours", "Scheduling and follow-up", "/crm-leads?view=tours", CalendarDays],
      ["waitlist", "Waitlist", "Demand and openings", "/crm-leads?view=waitlist", ClipboardCheck],
    ],
  },
  growth: {
    title: "Campaigns & Automations",
    description: "Plan outreach and connect it to the automated workflows that carry each campaign forward.",
    note: "Growth workflow workspace",
    columns: "sm:grid-cols-2",
    views: [
      ["campaigns", "Campaigns", "Audience communication", "/campaigns", Megaphone],
      ["automations", "Automations", "Triggers and workflows", "/campaigns?view=automations", Workflow],
    ],
  },
  operations: {
    title: "School Operations",
    description: "Run the school day from one workspace—classrooms, live attendance, daily reports, and incident follow-up.",
    note: "Daily operations workspace",
    columns: "sm:grid-cols-2 xl:grid-cols-4",
    views: [
      ["classrooms", "Classrooms", "Rooms, ratios, and activity", "/classroom-dashboard", Activity],
      ["attendance", "Attendance", "Check-in and live status", "/classroom-dashboard?view=attendance", ClipboardCheck],
      ["reports", "Daily reports", "Care notes and family updates", "/classroom-dashboard?view=reports", BookOpen],
      ["incidents", "Incidents", "Safety records and review", "/classroom-dashboard?view=incidents", ShieldCheck],
    ],
  },
  families: {
    title: "Families & Communication",
    description: "Keep family records, child profiles, conversations, and shared media together without losing context.",
    note: "Relationship workspace",
    columns: "sm:grid-cols-2 xl:grid-cols-4",
    views: [
      ["families", "Families", "Guardians and household records", "/family-detail", Users],
      ["children", "Children", "Profiles, care, and permissions", "/family-detail?view=children", HeartHandshake],
      ["messages", "Messages", "Family conversations", "/family-detail?view=messages", MessageSquare],
      ["media", "Media review", "Photos and sharing approvals", "/family-detail?view=media", ImageIcon],
    ],
  },
  billing: {
    title: "Billing & Payments",
    description: "Manage invoices, balances, payment collection, deposits, and transaction follow-up in one financial workspace.",
    note: "School finance workspace",
    columns: "sm:grid-cols-2",
    views: [
      ["billing", "Billing & invoices", "Accounts, charges, and balances", "/billing-invoices", CreditCard],
      ["payments", "Payments", "Transactions and reconciliation", "/billing-invoices?view=payments", WalletCards],
    ],
  },
  records: {
    title: "Records & Compliance",
    description: "Create forms, manage documents, and track compliance evidence from a single organized record center.",
    note: "Documentation workspace",
    columns: "sm:grid-cols-3",
    views: [
      ["forms", "Forms", "Templates and submissions", "/forms", FileText],
      ["documents", "Documents", "Files and acknowledgements", "/forms?view=documents", BookOpen],
      ["compliance", "Compliance", "Tasks, evidence, and readiness", "/forms?view=compliance", ShieldCheck],
    ],
  },
  insights: {
    title: "Insights & Reputation",
    description: "Understand school performance and turn family feedback into clear, actionable reputation work.",
    note: "Performance workspace",
    columns: "sm:grid-cols-2",
    views: [
      ["analytics", "Analytics", "Trends and operating metrics", "/analytics", BarChart3],
      ["reputation", "Reputation", "Reviews and family sentiment", "/analytics?view=reputation", Star],
    ],
  },
  staff: {
    title: "Staff & Access",
    description: "Manage teacher records and control who can access each part of the school workspace.",
    note: "Team administration workspace",
    columns: "sm:grid-cols-2",
    views: [
      ["teachers", "Teachers", "Staff profiles and classrooms", "/staff", HeartHandshake],
      ["permissions", "Team permissions", "Roles and module access", "/staff?view=permissions", Users],
    ],
  },
  settings: {
    title: "Settings & Setup",
    description: "Keep integrations, billing preferences, launch setup, branding, and notifications in one low-frequency workspace.",
    note: "Configuration workspace",
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
          <div className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="size-5 text-primary" />{config.title}</div>
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
