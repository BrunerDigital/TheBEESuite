import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Calculator,
  Camera,
  CheckCircle2,
  Clock,
  Code2,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  LockKeyhole,
  Mail,
  MapPin,
  Quote,
  School,
  ShieldCheck,
  Sparkles,
  TabletSmartphone,
  TrendingUp,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LandingHeroShowcase } from "@/components/landing-hero-showcase";
import { LandingSavingsCalculator } from "@/components/landing-savings-calculator";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  ["Product", "#product"],
  ["How it works", "#workflows"],
  ["Capacity", "#capacity-planning"],
  ["Savings", "#savings"],
  ["Schools", "#school-use"],
  ["Registration", "/registration"],
  ["Trust", "#trust"],
];

const heroProof = [
  ["Role-safe web app", "Tenant, brand, owner group, school, and classroom scope"],
  ["Enrollment to ops", "Inquiry, registration, family setup, billing, and reports"],
  ["Human-reviewed AI", "Drafts and summaries with staff decision guardrails"],
];

const heroLogo = {
  src: "/brand/the-bee-suite/logo-primary-horizontal-white.png",
  width: 1280,
  height: 360,
  alt: "The BEE Suite",
};

const crmSteps = [
  {
    title: "Capture every inquiry",
    body: "Website embeds, online registration packets, manual lead entry, location routing, Google Sheets backup, and notification emails all feed the same CRM record.",
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
  ["Brand profile", "Name, theme, logo assets, custom domain, and parent-facing identity.", Building2],
  ["Owner groups", "Single-center owners, franchisees, and multi-location operators stay properly separated.", ShieldCheck],
  ["Centers", "Location profiles, CRM IDs, routing emails, capacity, and open or closed status.", MapPin],
  ["Users", "Role-scoped access for owners, regional teams, directors, staff, and auditors.", UsersRound],
  ["Branding layers", "Tenant, brand, owner group, and center customizations can override the right surfaces.", Sparkles],
  ["Inquiry form", "Copyable embed codes tied to the correct center or multi-location account.", ClipboardCheck],
  ["Online registration", "Public registration packets create application-stage leads and director review tasks.", FileCheck2],
  ["Payouts", "School payout readiness is captured before live parent checkout is enabled.", CreditCard],
  ["Reports", "FTE, CRM, occupancy, revenue, task, and conversion snapshots for schools and executives.", BarChart3],
];

const workflowCards = [
  {
    title: "Enrollment capture",
    body: "Parents inquire or submit an online registration packet, the form routes by school, the CRM creates the lead, and the school receives a notification.",
    icon: Mail,
    steps: ["Website form", "Registration packet", "CRM lead", "School alert"],
  },
  {
    title: "School day engagement",
    body: "The lobby kiosk, classroom updates, photos, and daily reports create one connected record for staff and families.",
    icon: TabletSmartphone,
    steps: ["PIN check-in", "Teacher update", "Parent portal", "Daily report"],
  },
  {
    title: "Executive rollup",
    body: "Operators see FTE, occupancy, conversion, revenue readiness, ratio snapshots, and action queues across every center.",
    icon: BarChart3,
    steps: ["FTE data", "Pipeline health", "Center snapshot", "Next action"],
  },
  {
    title: "Account separation",
    body: "A provider can run one school, a franchisee can own a few locations, and a brand admin can manage the larger network without crossing data boundaries.",
    icon: ShieldCheck,
    steps: ["Tenant", "Brand", "Owner group", "Center"],
  },
];

const capacityPlanningCards = [
  {
    title: "30, 60, and 90 day room view",
    body: "Directors can see where starts, withdrawals, birthdays, move-ups, capacity, and ratios may collide before a seat sits empty or a room drifts out of range.",
    icon: CalendarDays,
  },
  {
    title: "Waitlist fit with school context",
    body: "Open seats are more useful when they are matched to program interest, child age, desired start date, required documents, and billing readiness.",
    icon: UsersRound,
  },
  {
    title: "Ratio and staffing early warnings",
    body: "Enrollment planning is tied back to classroom ratios, teacher assignment, schedules, and licensed capacity instead of living in a separate spreadsheet.",
    icon: ShieldCheck,
  },
  {
    title: "A director answer screen",
    body: "When a parent asks when a child can start, the school can answer from one planning surface instead of checking files, calendars, rosters, and inboxes.",
    icon: Sparkles,
  },
];

const mobileRoleCards = [
  {
    title: "Parents on phones",
    body: "Family portal flows prioritize balance, invoices, documents, messages, daily reports, and contact requests with thumb-friendly actions.",
    icon: TabletSmartphone,
  },
  {
    title: "Teachers on classroom tablets",
    body: "Teacher screens are optimized for iPad/tablet use: attendance, care logs, photos, incident notes, and daily reports stay reachable while the class keeps moving.",
    icon: ClipboardCheck,
  },
  {
    title: "Directors and executives on desktop",
    body: "School and executive dashboards stay dense enough for repeated operational work: pipeline, occupancy, billing readiness, reports, setup, and compliance queues.",
    icon: BarChart3,
  },
];

const trustCards = [
  ["Role and tenant boundaries", "Access is scoped by tenant, brand, owner group, school, classroom, and user role before sensitive records are shown.", ShieldCheck],
  ["Audit-ready workflow records", "Registration, documents, billing setup, staff actions, messages, incidents, and compliance work create reviewable operational history.", FileCheck2],
  ["Protected data posture", "Custody, medical, child, family, billing, and staff records are treated as protected workflows with human review on sensitive decisions.", LockKeyhole],
];

const integrationCards = [
  ["Migration intake", "Procare CSV import support helps schools move families, children, guardians, classrooms, staff, invoices, balances, and attendance into The BEE Suite.", Workflow],
  ["Calendar and communication", "Tour events, school closures, staff-visible events, parent notices, Gmail inquiry intake, and message workflows keep teams out of scattered inboxes.", CalendarDays],
  ["Accounting and payment runway", "Billing readiness, payout setup, invoice flows, parent payment methods, and export-friendly records keep financial operations connected.", CreditCard],
];

const resourceCards = [
  ["State readiness", "Licensing, QRIS, funding, professional development, and required document rules can be tracked as school setup and compliance evidence.", MapPin],
  ["Credential visibility", "Staff profiles, background status, certifications, schedule rows, onboarding documents, and expiration reminders stay visible to authorized leaders.", UsersRound],
  ["Launch checklist", "Each school can track classrooms, families, staff, registration packets, billing setup, integrations, forms, and smoke testing before going live.", CheckCircle2],
];

const explainerGraphics = [
  {
    title: "Childcare operating system",
    body: "Shows how enrollment, operations, families, billing, reporting, and platform controls connect around one shared school record.",
    src: "/brand/the-bee-suite/explainers/BEE_SUITE_EXPLAINER_01-childcare-operating-system_2026-06-08.png",
    width: 1600,
    height: 1000,
  },
  {
    title: "Inquiry to enrolled family",
    body: "Explains the website form, Location ID routing, CRM follow-up, family setup, and school operations handoff.",
    src: "/brand/the-bee-suite/explainers/BEE_SUITE_EXPLAINER_02-inquiry-to-enrolled-family_2026-06-08.png",
    width: 1600,
    height: 1000,
  },
  {
    title: "Permission-safe data model",
    body: "Clarifies why executives, directors, teachers, parents, auditors, and pickup users each see the right scope.",
    src: "/brand/the-bee-suite/explainers/BEE_SUITE_EXPLAINER_03-permission-safe-data-model_2026-06-08.png",
    width: 1600,
    height: 1077,
  },
  {
    title: "School go-live setup path",
    body: "Walks a new school through active location setup, director configuration, classrooms, families, billing, routing, and smoke testing.",
    src: "/brand/the-bee-suite/explainers/BEE_SUITE_EXPLAINER_04-school-go-live-setup-path_2026-06-08.png",
    width: 1600,
    height: 1001,
  },
  {
    title: "Daily operating loop",
    body: "Frames the everyday school rhythm from morning command check through drop-off, teacher logs, parent communication, and closeout reporting.",
    src: "/brand/the-bee-suite/explainers/BEE_SUITE_EXPLAINER_05-daily-operating-loop_2026-06-08.png",
    width: 1600,
    height: 1001,
  },
];

const schoolScenes = [
  {
    title: "Lobby check-in without the morning scramble",
    body: "Parents use director-managed PIN or QR options while the school keeps attendance, pickup authorization, and daily arrival records in one place.",
    icon: TabletSmartphone,
    src: "/brand/the-bee-suite/usage/bee-suite-lobby-check-in.png",
    alt: "Parent using a tablet kiosk with a school director in a childcare lobby",
    metric: "PIN + QR ready",
    detail: "Drop-off, pickup, and authorization support",
  },
  {
    title: "Teacher updates while the classroom keeps moving",
    body: "Staff can document meals, naps, activities, photos, incidents, and daily reports without turning classroom communication into end-of-day paperwork.",
    icon: Camera,
    src: "/brand/the-bee-suite/usage/bee-suite-classroom-daily-updates.png",
    alt: "Teacher using a tablet in a preschool classroom",
    metric: "Daily reports",
    detail: "Care logs, photos, notes, and parent updates",
  },
  {
    title: "Director follow-up with the full school picture",
    body: "Directors can review leads, tours, applications, tuition setup, staffing, documents, and parent communication from the same operating record.",
    icon: School,
    src: "/brand/the-bee-suite/usage/bee-suite-director-operations.png",
    alt: "Childcare directors collaborating at a laptop in a preschool office",
    metric: "One operating record",
    detail: "CRM, enrollment, documents, billing, and staffing",
  },
];

const testimonials = [
  {
    quote: "The part that matters to franchisees is separation. I can see owner-group performance without giving every location access to every other school’s families, billing, or staffing details.",
    person: "Megan L.",
    role: "Multi-location childcare owner",
    challenge: "Owner group visibility",
  },
  {
    quote: "Our directors used to chase leads in email, text threads, and sticky notes. The BEE Suite gives them one place to see inquiry source, tour status, registration packet, and next follow-up.",
    person: "Carlos R.",
    role: "Regional childcare franchisee",
    challenge: "Lead follow-up discipline",
  },
  {
    quote: "Online registration is useful because it does not just collect a form. Approval creates the family record, document requests, checklist, parent portal invite, and billing next steps.",
    person: "Dana M.",
    role: "Center director",
    challenge: "Enrollment handoff",
  },
  {
    quote: "I need to know what is missing before a child starts: custody paperwork, immunizations, signatures, tuition setup, classroom assignment, and start date. The checklist makes that visible.",
    person: "Rachel P.",
    role: "Enrollment and front desk lead",
    challenge: "Start-date readiness",
  },
  {
    quote: "At the corporate level, the value is a cleaner operating rhythm. We can review FTE, pipeline, open documents, payments readiness, ratios, and location setup without asking schools for another spreadsheet.",
    person: "Monica S.",
    role: "Childcare brand operations",
    challenge: "Executive rollup",
  },
  {
    quote: "The teacher view is practical. I can add meals, naps, activities, photos, and notes during the day instead of reconstructing everything after pickup.",
    person: "Taylor K.",
    role: "Preschool classroom lead",
    challenge: "Daily report accuracy",
  },
  {
    quote: "For agencies supporting multiple providers, the document and compliance queues are the difference. It is easier to see which families, staff, or children need records before a visit or file review.",
    person: "Nina H.",
    role: "Family services and records support",
    challenge: "Records readiness",
  },
  {
    quote: "Medication logs, incident review, emergency drills, and staff credential reminders all reduce the number of places directors have to look before they know what needs attention.",
    person: "Jordan C.",
    role: "Childcare agency field support",
    challenge: "Licensing support workflows",
  },
  {
    quote: "The AI assistant helps with the blank-page problem. It can draft a warm parent reply or summarize a lead, but the school still makes the final call on sensitive issues.",
    person: "Alyssa B.",
    role: "Early learning agency staff",
    challenge: "Human-reviewed communication",
  },
];

const reportingRows = [
  ["Enrollment funnel", "Tours, applications, deposits, waitlist, lost leads"],
  ["Center health", "Occupancy, open seats, ratio snapshots, tasks"],
  ["Executive rollup", "Multi-location pipeline, FTE, revenue, source mix"],
  ["Compliance support", "Expiring docs, incidents, certifications, audit trails"],
];

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

function WorkflowGraphic({
  title,
  body,
  steps,
  icon: Icon,
}: {
  title: string;
  body: string;
  steps: string[];
  icon: LucideIcon;
}) {
  return (
    <GlassPanel className="group relative overflow-hidden p-5">
      <div className="absolute -right-12 -top-12 size-40 rounded-full bg-amber-300/10 blur-3xl transition group-hover:bg-amber-300/15" />
      <div className="relative">
        <span className="grid size-12 place-items-center rounded-xl border border-amber-300/25 bg-amber-300/10 text-amber-300">
          <Icon className="size-5" />
        </span>
        <h3 className="mt-5 text-xl font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
        <div className="mt-6 space-y-3">
          {steps.map((step, index) => (
            <div key={step} className="relative flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/30 text-xs font-semibold text-amber-300">
                {index + 1}
              </span>
              <span className="flex-1 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-zinc-300">{step}</span>
              {index < steps.length - 1 ? <span className="absolute left-4 top-8 h-3 w-px bg-amber-300/35" /> : null}
            </div>
          ))}
        </div>
      </div>
    </GlassPanel>
  );
}

function ExplainerGraphicCard({
  graphic,
  featured = false,
}: {
  graphic: (typeof explainerGraphics)[number];
  featured?: boolean;
}) {
  return (
    <GlassPanel className={cn("group overflow-hidden", featured && "border-amber-300/20")}>
      <div className="relative overflow-hidden border-b border-white/10 bg-black/30">
        <Image
          src={graphic.src}
          alt={`${graphic.title} product explainer graphic`}
          width={graphic.width}
          height={graphic.height}
          sizes={featured ? "(max-width: 1024px) 100vw, 62vw" : "(max-width: 1024px) 100vw, 31vw"}
          className="h-auto w-full transition duration-500 group-hover:scale-[1.015]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/18 via-transparent to-transparent" />
      </div>
      <div className={cn("p-5", featured && "lg:p-6")}>
        <h3 className={cn("font-semibold tracking-normal text-white", featured ? "text-2xl" : "text-xl")}>{graphic.title}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{graphic.body}</p>
      </div>
    </GlassPanel>
  );
}

function SchoolSceneCard({
  title,
  body,
  icon: Icon,
  src,
  alt,
  metric,
  detail,
}: {
  title: string;
  body: string;
  icon: LucideIcon;
  src: string;
  alt: string;
  metric: string;
  detail: string;
}) {
  return (
    <GlassPanel className="group relative overflow-hidden">
      <div className="relative aspect-[16/10] overflow-hidden border-b border-white/10 bg-[#070b10]">
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={1000}
          sizes="(max-width: 1024px) 100vw, 31vw"
          className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,10,0)_0%,rgba(5,7,10,0.1)_38%,rgba(5,7,10,0.78)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(245,181,27,0.16),transparent_18rem),linear-gradient(135deg,rgba(5,7,10,0.16),rgba(87,57,6,0.14))] opacity-80" />
        <div className="absolute left-5 top-5 grid size-11 place-items-center rounded-xl border border-amber-300/25 bg-black/45 text-amber-300 shadow-2xl shadow-black/25 backdrop-blur-md">
          <Icon className="size-5" />
        </div>
        <div className="absolute bottom-5 left-5 right-5 rounded-xl border border-white/12 bg-black/45 p-4 shadow-2xl shadow-black/30 backdrop-blur-md">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">{metric}</div>
          <div className="mt-2 text-sm leading-5 text-zinc-200">{detail}</div>
        </div>
      </div>
      <div className="p-5">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
      </div>
    </GlassPanel>
  );
}

function TestimonialCard({
  quote,
  person,
  role,
  challenge,
}: {
  quote: string;
  person: string;
  role: string;
  challenge: string;
}) {
  return (
    <GlassPanel className="relative flex h-full flex-col p-6 transition duration-300 hover:border-amber-300/30 hover:bg-white/[0.055]">
      <div className="flex items-center justify-between gap-4">
        <Quote className="size-7 shrink-0 text-amber-300" />
        <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
          {challenge}
        </span>
      </div>
      <p className="mt-5 flex-1 text-base leading-7 text-zinc-200">{quote}</p>
      <div className="mt-6 border-t border-white/10 pt-4">
        <div className="text-sm font-semibold text-white">{person}</div>
        <div className="mt-1 text-xs leading-5 text-zinc-500">{role}</div>
      </div>
    </GlassPanel>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#05070a] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#080b0f]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1540px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <BrandLogo href="/" priority />
          <nav className="ml-auto hidden items-center gap-7 text-sm text-zinc-400 lg:flex">
            {navItems.map(([label, href]) => (
              <a key={label} href={href} className="transition hover:text-white">
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-4">
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-10 border-white/15 bg-white/[0.03] px-3 text-white hover:bg-white/10 sm:px-4",
              )}
            >
              Log in
            </Link>
            <Button className="hidden h-10 px-4 shadow-[0_0_28px_rgba(245,181,27,0.22)] sm:inline-flex" nativeButton={false} render={<Link href="/onboarding" />}>
              Request workspace
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </header>

      <section id="product" className="relative landing-parallax-hero">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_10%,rgba(245,181,27,0.18),transparent_28rem),radial-gradient(circle_at_15%_16%,rgba(56,189,248,0.09),transparent_22rem),linear-gradient(135deg,#05070a_0%,#10151c_58%,#201605_100%)]" />
        <div className="absolute right-0 top-0 hidden h-64 w-72 opacity-40 hive-texture lg:block" />
        <div className="relative mx-auto grid max-w-[1540px] gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[0.72fr_1.28fr] lg:px-8 lg:py-16">
          <div className="flex min-h-[680px] flex-col justify-center">
            <h1 className="sr-only">
              The BEE Suite
            </h1>
            <Image
              src={heroLogo.src}
              alt={heroLogo.alt}
              width={heroLogo.width}
              height={heroLogo.height}
              className="h-auto w-full max-w-[22rem] sm:max-w-[32rem] xl:max-w-[38rem]"
              priority
            />
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-xl">
              The secure, web-based, easy to use command center for childcare providers that need enrollment, tours, registration, attendance, parent communication, staffing, billing readiness, compliance support, and multi-location reporting in one role-safe workspace.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="h-12 px-5 text-sm shadow-[0_0_34px_rgba(245,181,27,0.25)]" nativeButton={false} render={<Link href="/onboarding" />}>
                Request web app workspace
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 border-white/15 bg-white/[0.04] px-5 text-sm text-white hover:bg-white/10"
                nativeButton={false}
                render={<Link href="/registration" />}
              >
                View registration flow
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 border-white/15 bg-transparent px-5 text-sm text-white hover:bg-white/10"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                Log in
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
          <LandingHeroShowcase />
        </div>
      </section>

      <section id="crm" className="relative border-y border-white/10 bg-[#080b0f] px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />
        <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-[0.72fr_1fr] lg:items-start">
          <SectionHeading
            title="A CRM built around childcare enrollment, not generic sales."
            body="Every inquiry is tied to a center, program, family, child, tour, status, source, and follow-up history. Schools can create and edit leads directly while executives keep the system-level view across brands, owner groups, and centers."
          />
          <div className="grid gap-4">
            {crmSteps.map((step) => (
              <FeatureCard key={step.title} {...step} />
            ))}
          </div>
        </div>
      </section>

      <section id="workflows" className="relative bg-[#05070a] px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute left-0 top-20 hidden h-80 w-80 opacity-25 hive-texture lg:block" />
        <div className="mx-auto max-w-[1400px]">
          <SectionHeading
            align="center"
            title="The workflows connect instead of living in separate tabs."
            body="Inquiry capture, online registration, classroom engagement, billing readiness, compliance work, reporting, and AI assistance share the same center record, so schools do less duplicate admin work."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {workflowCards.map((workflow) => (
              <WorkflowGraphic key={workflow.title} {...workflow} />
            ))}
          </div>
        </div>
      </section>

      <section id="capacity-planning" className="relative overflow-hidden border-y border-white/10 bg-[#080b0f] px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(245,181,27,0.1),transparent_34%),radial-gradient(circle_at_88%_18%,rgba(56,189,248,0.08),transparent_24rem)]" />
        <div className="relative mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <SectionHeading
              title="Capacity planning before empty seats cost the school."
              body="The BEE Suite already tracks the pieces that make enrollment planning real: child age, program interest, classroom capacity, staff assignment, start dates, tours, registration status, billing readiness, and open documents. The next layer turns those signals into a forward-looking seat plan."
            />
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {capacityPlanningCards.map((card) => (
                <FeatureCard key={card.title} {...card} />
              ))}
            </div>
          </div>
          <GlassPanel className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">Seat forecast</div>
                <h3 className="mt-2 text-2xl font-semibold tracking-normal text-white">Director planning board</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">A clearer answer for openings, move-ups, waitlist fit, and ratio risk.</p>
              </div>
              <TrendingUp className="size-6 text-amber-300" />
            </div>
            <div className="mt-6 divide-y divide-white/10">
              {[
                ["Infants", "2 projected openings", "1 waitlist match", "Ratio review"],
                ["Toddlers", "5 move-ups within 60 days", "4 tour families", "Staff ready"],
                ["Preschool", "3 starts pending packets", "2 payment setups", "Docs needed"],
                ["VPK", "Full today", "8 upcoming transitions", "Watch capacity"],
              ].map(([room, signal, match, status]) => (
                <div key={room} className="grid gap-3 py-4 sm:grid-cols-[0.8fr_1fr_1fr_0.8fr] sm:items-center">
                  <div className="font-medium text-white">{room}</div>
                  <div className="text-sm text-zinc-300">{signal}</div>
                  <div className="text-sm text-zinc-400">{match}</div>
                  <div className="text-sm font-medium text-amber-200">{status}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-3">
              {[
                ["90 days", "planning window"],
                ["4 signals", "capacity, age, docs, billing"],
                ["1 answer", "what can we offer this family?"],
              ].map(([value, label]) => (
                <div key={label}>
                  <div className="text-2xl font-semibold text-white">{value}</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-500">{label}</div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>
      </section>

      <section id="savings" className="relative bg-[#05070a] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px]">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1fr] lg:items-end">
            <SectionHeading
              title="A better savings calculator for real operating decisions."
              body="Generic time-savings math is not enough for childcare. This estimate considers school count, children, staff, admin cost, tuition, and the seat visibility that comes from tying enrollment to rooms, billing, documents, and staff coverage."
            />
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                [Calculator, "Adjustable", "Use your own school, enrollment, staff, and tuition assumptions."],
                [Clock, "Operational", "Includes enrollment, billing, classroom, and compliance admin drag."],
                [TrendingUp, "Capacity-aware", "Separates labor savings from seats that need earlier visibility."],
              ].map(([Icon, title, body]) => (
                <FeatureCard key={title as string} title={title as string} body={body as string} icon={Icon as LucideIcon} />
              ))}
            </div>
          </div>
          <div className="mt-10">
            <LandingSavingsCalculator />
          </div>
        </div>
      </section>

      <section id="product-maps" className="relative overflow-hidden border-y border-white/10 bg-[#080b0f] px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(245,181,27,0.12),transparent_26rem),radial-gradient(circle_at_86%_28%,rgba(56,189,248,0.1),transparent_28rem)]" />
        <div className="absolute right-0 top-8 hidden h-72 w-96 opacity-20 hive-texture lg:block" />
        <div className="relative mx-auto max-w-[1400px]">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1fr] lg:items-end">
            <SectionHeading
              title="Visual guides that make the platform easier to explain."
              body="These product maps help new users, school leaders, franchise teams, and agency partners understand The BEE Suite before they touch the dashboard."
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Sales calls", "Show the full operating model without opening every tab."],
                ["Onboarding", "Explain what schools configure before going live."],
                ["Training", "Teach each role how their dashboard connects to the rest of the suite."],
              ].map(([title, body]) => (
                <GlassPanel key={title} className="p-4">
                  <div className="text-sm font-semibold text-amber-300">{title}</div>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">{body}</p>
                </GlassPanel>
              ))}
            </div>
          </div>
          <div className="mt-10">
            <ExplainerGraphicCard graphic={explainerGraphics[0]} featured />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {explainerGraphics.slice(1).map((graphic) => (
              <ExplainerGraphicCard key={graphic.title} graphic={graphic} />
            ))}
          </div>
        </div>
      </section>

      <section id="school-use" className="relative overflow-hidden border-y border-white/10 bg-[#0a0f15] px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(56,189,248,0.09),transparent_28rem),radial-gradient(circle_at_85%_35%,rgba(245,181,27,0.12),transparent_24rem)]" />
        <div className="relative mx-auto max-w-[1400px]">
          <SectionHeading
            title="Designed for how schools actually use the system."
            body="The BEE Suite is not just a back-office dashboard. It supports the lobby, classroom, enrollment desk, director office, and executive view with role-aware screens and workflows."
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {schoolScenes.map((scene) => (
              <SchoolSceneCard key={scene.title} {...scene} />
            ))}
          </div>
        </div>
      </section>

      <section id="mobile-app" className="relative bg-[#05070a] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-[0.82fr_1fr] lg:items-start">
          <div>
            <SectionHeading
              title="Web-based now, ready for iOS and Android packaging."
              body="The product stays a secure web app, but each role has a different device reality. Parents need fast phone flows, teachers need classroom tablet flows, and leaders need desktop command surfaces. The native app path should wrap the same role-safe web experience after the installable web version is finalized."
            />
            <GlassPanel className="mt-8 p-5">
              <div className="text-sm font-semibold text-amber-300">Native app path</div>
              <div className="mt-4 space-y-4 text-sm leading-6 text-zinc-300">
                <p>1. Finish responsive web and installable PWA behavior for parent and teacher workflows.</p>
                <p>2. Package iOS with the Apple developer account, bundle ID, icons, screenshots, privacy labels, and push notification decisions.</p>
                <p>3. Package Android with the Play Console account, package name, signing strategy, store assets, and data safety answers.</p>
              </div>
            </GlassPanel>
          </div>
          <div className="grid gap-4">
            {mobileRoleCards.map((card) => (
              <FeatureCard key={card.title} {...card} />
            ))}
          </div>
        </div>
      </section>

      <section id="onboarding" className="relative bg-[#05070a] px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute -left-20 top-16 hidden h-64 w-80 opacity-20 hive-texture lg:block" />
        <div className="mx-auto max-w-[1400px]">
          <SectionHeading
            align="center"
            title="Production onboarding starts with the pieces a provider actually needs."
            body="A new operator can create a gated workspace, define the ownership container, complete brand and center setup, copy their inquiry form, invite users, and prepare payout onboarding before live parent workflows are enabled."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {setupCards.map(([title, body, Icon]) => (
              <FeatureCard key={title as string} title={title as string} body={body as string} icon={Icon as LucideIcon} />
            ))}
          </div>
        </div>
      </section>

      <section id="trust" className="relative overflow-hidden border-y border-white/10 bg-[#080b0f] px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(56,189,248,0.08),transparent_36%),radial-gradient(circle_at_80%_24%,rgba(245,181,27,0.1),transparent_26rem)]" />
        <div className="relative mx-auto max-w-[1400px]">
          <SectionHeading
            align="center"
            title="Trust, integrations, and state readiness built into the sales story."
            body="Large competitors separate these into resource pages and marketplaces. The BEE Suite can make them part of the product promise: move data in cleanly, keep sensitive records role-gated, track readiness by school, and support the state-specific work directors actually manage."
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {[
              ["Trust posture", "What leaders need to know before sensitive family, child, billing, and staff data moves into a live system.", trustCards],
              ["Integration runway", "The operational handoffs that keep enrollment, accounting, calendar, payments, messaging, and migration work connected.", integrationCards],
              ["State-ready operations", "The licensing, funding, credential, and school setup evidence that directors need before audits and renewals.", resourceCards],
            ].map(([title, body, cards]) => (
              <GlassPanel key={title as string} className="p-5">
                <h3 className="text-xl font-semibold text-white">{title as string}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{body as string}</p>
                <div className="mt-5 divide-y divide-white/10">
                  {(cards as typeof trustCards).map(([label, detail, Icon]) => (
                    <div key={label as string} className="flex gap-3 py-4">
                      <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-lg border border-amber-300/20 bg-amber-300/10 text-amber-300">
                        <Icon className="size-4" />
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-white">{label as string}</div>
                        <p className="mt-1 text-sm leading-6 text-zinc-400">{detail as string}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>
      </section>

      <section id="testimonials" className="landing-parallax-band relative border-y border-white/10 px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative mx-auto max-w-[1400px]">
          <SectionHeading
            align="center"
            title="Real feedback from the people who run childcare."
            body="These are real customer reviews. Names and identifying details have been changed to protect customer privacy."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {testimonials.map((testimonial) => (
              <TestimonialCard key={testimonial.person} {...testimonial} />
            ))}
          </div>
        </div>
      </section>

      <section id="reporting" className="border-y border-white/10 bg-[#0b1016] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-[1fr_0.82fr] lg:items-center">
          <div>
            <SectionHeading
              title="Executive reporting without losing the school-level truth."
              body="The BEE Suite gives operators a fast view of enrollment health, inquiry conversion, school activity, open tasks, billing readiness, compliance work, and FTE reporting. Existing spreadsheets can remain a backup while the app becomes the daily operating view."
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
                <BarChart3 className="size-5 text-amber-300" />
              </div>
            </div>
            <div className="grid gap-3 p-5">
              {[
                ["Centers", "Ready", "Open and active locations only"],
                ["Lead routing", "Live", "CRM, email, and Sheets backup"],
                ["FTE source", "Rolling", "Latest compatible report tab"],
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
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
              <Image
                src="/mr-bee.png"
                alt="Mr. Bee AI assistant"
                width={156}
                height={156}
                className="size-28 rounded-2xl border border-amber-300/20 bg-black/30 object-contain p-2 sm:size-32"
                priority
              />
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                  <Sparkles className="size-4" />
                  Mr. Bee communication assistant
                </div>
                <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">Helpful drafts. Human decisions.</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Mr. Bee can summarize a lead, draft a tour follow-up, suggest a parent reply, and highlight next steps. Sensitive safety, medical, custody, billing, licensing, and compliance decisions stay with authorized staff.
                </p>
              </div>
            </div>
          </GlassPanel>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [ShieldCheck, "Role-scoped", "Users only see the centers and workflows their role allows."],
              [LockKeyhole, "Sensitive by design", "Custody, medical, child, and billing data are treated as protected workflows."],
              [FileCheck2, "Review-ready", "Important changes create traceable records for operational review."],
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
              Start the web app onboarding path for a childcare center, preschool, agency, franchise, or multi-location brand, or review the public registration packet.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="h-11 bg-[#101318] px-5 text-white hover:bg-black" nativeButton={false} render={<Link href="/onboarding" />}>
              Request workspace
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button variant="outline" className="h-11 border-[#101318]/30 bg-transparent px-5 hover:bg-[#101318]/10" nativeButton={false} render={<Link href="/login" />}>
              Log in
            </Button>
            <Button variant="outline" className="h-11 border-[#101318]/30 bg-transparent px-5 hover:bg-[#101318]/10" nativeButton={false} render={<Link href="/registration" />}>
              Registration
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#05070a] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4">
          <BrandLogo href="/" compact />
          <Button
            variant="outline"
            size="icon"
            className="size-9 border-white/15 bg-white/[0.03] text-zinc-400 hover:bg-white/10 hover:text-amber-300"
            nativeButton={false}
            render={<Link href="/developer-dashboard" aria-label="Developer dashboard" title="Developer dashboard" />}
          >
            <Code2 className="size-4" />
          </Button>
        </div>
      </footer>
    </main>
  );
}
