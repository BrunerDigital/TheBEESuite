import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  Hexagon,
  LineChart,
  LockKeyhole,
  Mail,
  MapPin,
  MessageSquareText,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  ["Product", "#product"],
  ["CRM", "#crm"],
  ["Onboarding", "#onboarding"],
  ["Reporting", "#reporting"],
];

const heroProof = [
  ["94", "Kid City locations live-ready"],
  ["1", "Form to CRM and Sheets"],
  ["24/7", "Operational visibility"],
];

const kpis = [
  { label: "Active Enrollments", value: "128", trend: "+8 vs last month", icon: UsersRound, tone: "text-amber-300" },
  { label: "Open Enquiries", value: "27", trend: "+5 this week", icon: MessageSquareText, tone: "text-sky-300" },
  { label: "Occupancy Rate", value: "87%", trend: "+4% vs last month", icon: LineChart, tone: "text-emerald-300" },
  { label: "Collected MTD", value: "$48,320", trend: "+12% vs last month", icon: CreditCard, tone: "text-violet-300" },
];

const pipelineStages = [
  ["New Inquiry", 18, "from-amber-400/85 to-amber-500/35"],
  ["Tour Scheduled", 12, "from-yellow-300/80 to-amber-500/25"],
  ["Application", 9, "from-amber-300/65 to-yellow-500/20"],
  ["Offer Extended", 6, "from-lime-300/55 to-lime-500/15"],
  ["Enrolled", 9, "from-emerald-300/45 to-emerald-500/15"],
];

const crmSteps = [
  {
    title: "Capture every inquiry",
    body: "Website embeds, manual lead entry, location routing, Google Sheets backup, and notification emails all feed the same CRM record.",
    icon: Mail,
  },
  {
    title: "Move families with context",
    body: "Directors can update stages, notes, tours, tasks, start dates, program interest, and child details without leaving the pipeline.",
    icon: Workflow,
  },
  {
    title: "Follow up with Mr. Bee",
    body: "AI suggestions draft warm replies and next steps, while sensitive enrollment, billing, safety, and compliance decisions stay human-reviewed.",
    icon: Sparkles,
  },
];

const setupCards = [
  ["Brand profile", "Name, theme, logo placeholder, custom domain, and parent-facing identity.", Building2],
  ["Centers", "Location profiles, CRM IDs, routing emails, capacity, and open or closed status.", MapPin],
  ["Users", "Role-scoped access for owners, regional teams, directors, staff, and auditors.", UsersRound],
  ["Inquiry form", "Copyable embed codes tied to the correct center or multi-location account.", ClipboardCheck],
  ["Payouts", "Stripe Connect readiness is captured, but live checkout stays gated until reviewed.", CreditCard],
  ["Reports", "FTE, CRM, occupancy, revenue, task, and conversion snapshots for schools and executives.", BarChart3],
];

const reportingRows = [
  ["Enrollment funnel", "Tours, applications, deposits, waitlist, lost leads"],
  ["Center health", "Occupancy, open seats, ratio snapshots, tasks"],
  ["Executive rollup", "Multi-location pipeline, FTE, revenue, source mix"],
  ["Compliance support", "Expiring docs, incidents, certifications, audit trails"],
];

function HiveMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative block size-10 text-amber-300", className)} aria-hidden="true">
      <Hexagon className="absolute left-0 top-1 size-5" strokeWidth={2.2} />
      <Hexagon className="absolute left-[17px] top-1 size-5" strokeWidth={2.2} />
      <Hexagon className="absolute left-[8px] top-[17px] size-5" strokeWidth={2.2} />
    </span>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3" aria-label="The Bee Suite home">
      <span className="grid size-10 place-items-center rounded-xl border border-amber-300/35 bg-amber-400/15 text-amber-300 shadow-[0_0_28px_rgba(245,181,27,0.18)]">
        <HiveMark className="scale-75" />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold leading-none tracking-normal text-amber-300">The Bee Suite</span>
        {!compact ? <span className="mt-1 block text-[0.68rem] text-zinc-400">Childcare CRM & Operations</span> : null}
      </span>
    </Link>
  );
}

function GlassPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025))] shadow-2xl shadow-black/25 backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

function StatTile({
  label,
  value,
  trend,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  trend: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <GlassPanel className="overflow-hidden p-4">
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon className={cn("mt-1 size-5 shrink-0", tone)} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-zinc-400">{label}</div>
          <div className="mt-1 whitespace-nowrap text-[1.45rem] font-semibold leading-none tracking-normal text-white sm:text-[1.65rem] xl:text-[1.45rem] 2xl:text-[1.65rem]">
            {value}
          </div>
          <div className="mt-2 text-xs text-emerald-300">{trend}</div>
        </div>
      </div>
    </GlassPanel>
  );
}

function MiniChart() {
  return (
    <div className="relative h-32 overflow-hidden rounded-lg border border-white/10 bg-black/20">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:100%_32px,80px_100%]" />
      <svg viewBox="0 0 480 140" className="absolute inset-0 size-full" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="landing-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f5b51b" stopOpacity="0.46" />
            <stop offset="100%" stopColor="#f5b51b" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path
          d="M0 116 C35 82 59 98 88 82 C120 64 137 86 166 64 C199 38 218 72 246 52 C282 26 306 58 334 38 C373 10 389 36 420 20 C446 6 460 24 480 5 L480 140 L0 140 Z"
          fill="url(#landing-chart-fill)"
        />
        <path
          d="M0 116 C35 82 59 98 88 82 C120 64 137 86 166 64 C199 38 218 72 246 52 C282 26 306 58 334 38 C373 10 389 36 420 20 C446 6 460 24 480 5"
          fill="none"
          stroke="#f5b51b"
          strokeLinecap="round"
          strokeWidth="4"
        />
      </svg>
      <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[0.66rem] text-zinc-500">
        <span>Apr 16</span>
        <span>Apr 30</span>
        <span>May 14</span>
      </div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative">
      <div className="absolute -right-5 -top-8 hidden h-40 w-48 opacity-50 hive-texture lg:block" />
      <GlassPanel className="relative overflow-hidden rounded-2xl border-amber-300/20 bg-[#090d12]/90">
        <div className="grid min-h-[560px] lg:grid-cols-[210px_1fr]">
          <aside className="hidden border-r border-white/10 bg-black/25 p-4 lg:block">
            <BrandMark />
            <nav className="mt-7 space-y-1.5">
              {["Command Center", "Dashboard", "Inbox", "Families", "Enrollments", "Reports"].map((item, index) => (
                <div
                  key={item}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-xs",
                    index === 0 ? "border border-amber-300/20 bg-amber-300/14 text-amber-200" : "text-zinc-400",
                  )}
                >
                  <Hexagon className="size-3.5" />
                  <span>{item}</span>
                </div>
              ))}
            </nav>
            <div className="mt-8 rounded-xl border border-amber-300/20 bg-amber-300/8 p-3">
              <div className="text-xs font-medium text-white">Little Explorers Center</div>
              <div className="mt-1 text-[0.68rem] text-zinc-500">Center ID: LEC-1001</div>
            </div>
          </aside>

          <div className="min-w-0 p-4 sm:p-5">
            <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                <div className="rounded-xl border border-white/10 bg-black/30 py-2 pl-10 pr-4 text-sm text-zinc-500">
                  Search families, children, staff, invoices, and more...
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 text-xs font-semibold text-amber-300">
                  <Plus className="size-4" />
                  Quick Add
                </button>
                <button aria-label="Notifications" className="grid size-10 place-items-center rounded-xl border border-white/10 bg-black/20 text-zinc-300">
                  <Bell className="size-4" />
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-normal text-white">Welcome back, Maya</h2>
                <p className="mt-1 text-sm text-zinc-400">Here is what is happening across your centers today.</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                <CalendarCheck2 className="size-4 text-amber-300" />
                May 16, 2025
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {kpis.map((kpi) => (
                <StatTile key={kpi.label} {...kpi} />
              ))}
            </div>

            <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_0.74fr]">
              <GlassPanel className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Enrollment Pipeline</div>
                    <div className="mt-1 text-xs text-zinc-500">Total prospects: 54</div>
                  </div>
                  <ChevronRight className="size-5 text-amber-300" />
                </div>
                <div className="grid overflow-hidden rounded-lg border border-amber-300/30 sm:grid-cols-5">
                  {pipelineStages.map(([label, count, gradient]) => (
                    <div key={label} className={cn("bg-gradient-to-br px-3 py-3 text-center", gradient as string)}>
                      <div className="text-[0.66rem] text-white/80">{label}</div>
                      <div className="mt-1 text-xl font-semibold text-white">{count}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <MiniChart />
                </div>
              </GlassPanel>

              <GlassPanel className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">AI Daily Center Summary</div>
                  <Sparkles className="size-4 text-amber-300" />
                </div>
                <p className="text-sm leading-6 text-zinc-300">
                  Good morning. Mr. Bee found 2 tours today, 4 follow-ups due, and 3 compliance reminders that need review.
                </p>
                <div className="mt-4 space-y-3">
                  {[
                    ["Tours scheduled", "10:00 AM, 1:30 PM", CalendarCheck2, "text-sky-300"],
                    ["Birthdays this month", "Celebrate Ava, Logan, Mia", Sparkles, "text-amber-300"],
                    ["Immunization records", "4 children need updates", ShieldCheck, "text-red-300"],
                  ].map(([title, body, Icon, tone]) => (
                    <div key={title as string} className="flex gap-3 rounded-lg bg-black/20 p-3">
                      <Icon className={cn("mt-0.5 size-4", tone as string)} />
                      <div>
                        <div className="text-xs font-medium text-white">{title as string}</div>
                        <div className="mt-0.5 text-[0.68rem] text-zinc-500">{body as string}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

function SectionHeading({
  title,
  body,
  align = "left",
}: {
  title: string;
  body: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      <h2 className="text-3xl font-semibold tracking-normal text-white sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-zinc-400">{body}</p>
    </div>
  );
}

function FeatureCard({ title, body, icon: Icon }: { title: string; body: string; icon: LucideIcon }) {
  return (
    <GlassPanel className="p-5 transition duration-300 hover:border-amber-300/35 hover:bg-white/[0.07]">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-amber-300/25 bg-amber-300/10 text-amber-300">
          <Icon className="size-5" />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
        </div>
      </div>
    </GlassPanel>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#05070a] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#080b0f]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1540px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <BrandMark />
          <nav className="ml-auto hidden items-center gap-7 text-sm text-zinc-400 md:flex">
            {navItems.map(([label, href]) => (
              <a key={label} href={href} className="transition hover:text-white">
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-4">
            <Button
              variant="outline"
              className="hidden h-10 border-white/15 bg-white/[0.03] px-4 text-white hover:bg-white/10 sm:inline-flex"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              Log in
            </Button>
            <Button className="h-10 px-4 shadow-[0_0_28px_rgba(245,181,27,0.22)]" nativeButton={false} render={<Link href="/onboarding" />}>
              Start onboarding
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </header>

      <section id="product" className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_10%,rgba(245,181,27,0.18),transparent_28rem),radial-gradient(circle_at_15%_16%,rgba(56,189,248,0.09),transparent_22rem),linear-gradient(135deg,#05070a_0%,#10151c_58%,#201605_100%)]" />
        <div className="absolute right-0 top-0 hidden h-64 w-72 opacity-40 hive-texture lg:block" />
        <div className="relative mx-auto grid max-w-[1540px] gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[0.72fr_1.28fr] lg:px-8 lg:py-16">
          <div className="flex min-h-[680px] flex-col justify-center">
            <h1 className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-normal text-white sm:text-6xl xl:text-7xl">
              The Bee Suite
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-xl">
              A premium childcare CRM and operations command center for enrollment, tours, family communication, staffing, billing readiness, reporting, and multi-location visibility.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="h-12 px-5 text-sm shadow-[0_0_34px_rgba(245,181,27,0.25)]" nativeButton={false} render={<Link href="/onboarding" />}>
                Create trial workspace
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 border-white/15 bg-white/[0.04] px-5 text-sm text-white hover:bg-white/10"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                Log in to CRM
              </Button>
            </div>
            <div className="mt-9 grid gap-3 sm:grid-cols-3">
              {heroProof.map(([value, label]) => (
                <div key={label} className="border-l border-amber-300/55 pl-4">
                  <div className="text-2xl font-semibold text-white">{value}</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-400">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <DashboardPreview />
        </div>
      </section>

      <section id="crm" className="relative border-y border-white/10 bg-[#080b0f] px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />
        <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-[0.72fr_1fr] lg:items-start">
          <SectionHeading
            title="A CRM built around childcare enrollment, not generic sales."
            body="Every inquiry is tied to a center, program, family, child, tour, status, source, and follow-up history. Schools can create and edit leads directly, while executives keep the system-level view."
          />
          <div className="grid gap-4">
            {crmSteps.map((step) => (
              <FeatureCard key={step.title} {...step} />
            ))}
          </div>
        </div>
      </section>

      <section id="onboarding" className="relative bg-[#05070a] px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute -left-20 top-16 hidden h-64 w-80 opacity-20 hive-texture lg:block" />
        <div className="mx-auto max-w-[1400px]">
          <SectionHeading
            align="center"
            title="Trial workspaces start with the pieces a provider actually needs."
            body="A new operator can create a gated workspace, complete brand and center setup, copy their inquiry form, invite users, and prepare payout onboarding before live parent workflows are enabled."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {setupCards.map(([title, body, Icon]) => (
              <FeatureCard key={title as string} title={title as string} body={body as string} icon={Icon as LucideIcon} />
            ))}
          </div>
        </div>
      </section>

      <section id="reporting" className="border-y border-white/10 bg-[#0b1016] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-[1fr_0.82fr] lg:items-center">
          <div>
            <SectionHeading
              title="Executive reporting without losing the school-level truth."
              body="The Bee Suite gives operators a fast view of enrollment health, inquiry conversion, school activity, open tasks, billing readiness, and FTE reporting. Kid City can keep the FTE Google Sheet as a backup while the app shows the executive snapshot."
            />
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {reportingRows.map(([title, body]) => (
                <div key={title} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <CheckCircle2 className="size-4 text-amber-300" />
                    {title}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
                </div>
              ))}
            </div>
          </div>
          <GlassPanel className="overflow-hidden border-amber-300/20">
            <div className="border-b border-white/10 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Multi-location snapshot</div>
                  <div className="mt-1 text-xs text-zinc-500">Open centers, lead volume, FTE source, and conversion health</div>
                </div>
                <Settings2 className="size-5 text-amber-300" />
              </div>
            </div>
            <div className="grid gap-3 p-5">
              {[
                ["Open centers", "94", "Synced from active Kid City profiles"],
                ["Lead routing", "Ready", "CRM, email, and Google Sheets backup"],
                ["FTE source", "Rolling", "Latest compatible tab or FTE Data"],
                ["AI guardrails", "Review", "Suggestions never make final decisions"],
              ].map(([label, value, detail]) => (
                <div key={label} className="grid grid-cols-[1fr_auto] gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div>
                    <div className="text-sm font-medium text-white">{label}</div>
                    <div className="mt-1 text-xs leading-5 text-zinc-500">{detail}</div>
                  </div>
                  <div className="self-center text-xl font-semibold text-amber-300">{value}</div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>
      </section>

      <section className="bg-[#05070a] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-[0.72fr_1fr] lg:items-center">
          <GlassPanel className="relative overflow-hidden p-6">
            <div className="absolute -right-8 -top-8 size-52 rounded-full bg-amber-300/10 blur-3xl" />
            <div className="relative flex items-center gap-5">
              <Image
                src="/mr-bee.png"
                alt="Mr. Bee AI assistant"
                width={156}
                height={156}
                className="size-24 rounded-2xl border border-amber-300/20 bg-black/30 object-contain p-2 sm:size-32"
                priority
              />
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                  <Sparkles className="size-4" />
                  Mr. Bee communication assistant
                </div>
                <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">Helpful drafts. Human decisions.</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Mr. Bee can summarize a lead, draft a tour follow-up, suggest a parent reply, and highlight next steps. Sensitive safety, medical, custody, billing, and compliance decisions stay with authorized staff.
                </p>
              </div>
            </div>
          </GlassPanel>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [ShieldCheck, "Role-scoped", "Users only see the centers and workflows their role allows."],
              [LockKeyhole, "Sensitive by design", "Custody, medical, child, and billing data are treated as protected workflows."],
              [FileCheck2, "Audit-ready", "Important changes create traceable records for review."],
            ].map(([Icon, title, body]) => (
              <FeatureCard key={title as string} title={title as string} body={body as string} icon={Icon as LucideIcon} />
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-amber-300 px-4 py-16 text-[#101318] sm:px-6 lg:px-8">
        <div className="absolute bottom-0 right-0 h-48 w-72 opacity-30 hive-texture" />
        <div className="relative mx-auto flex max-w-[1400px] flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal">Ready to run enrollment from one command center?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#29313a]">
              Create a trial workspace for a childcare center, preschool, agency, franchise, or multi-location brand.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="h-11 bg-[#101318] px-5 text-white hover:bg-black" nativeButton={false} render={<Link href="/onboarding" />}>
              Start onboarding
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button variant="outline" className="h-11 border-[#101318]/30 bg-transparent px-5 hover:bg-[#101318]/10" nativeButton={false} render={<Link href="/login" />}>
              Log in
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
