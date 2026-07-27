import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  Code2,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  LockKeyhole,
  Mail,
  MapPin,
  School,
  ShieldCheck,
  Sparkles,
  TabletSmartphone,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LandingHeroShowcase } from "@/components/landing-hero-showcase";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  ["Product", "#product"],
  ["How it works", "#workflows"],
  ["Roles", "#role-views"],
  ["Billing", "#billing"],
  ["Launch", "#product-maps"],
  ["Guides", "/resources"],
  ["Registration", "/registration"],
  ["Trust", "#trust"],
];

const heroProof = [
  ["Current product proof", "Light-mode desktop, iPad, and iPhone screens"],
  ["Right view, every role", "Executive, director, teacher, and parent workspaces"],
  ["Launch by feature", "Independent gates for access, kiosk, billing, and payments"],
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
  ["Payouts", "School payout readiness is captured before live parent payments are enabled.", CreditCard],
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
    title: "Billing and payments",
    body: "School-scoped tuition assignments, Thursday invoice scheduling, payment methods, autopay, Terminal, and reconciliation stay connected to the right family and child.",
    icon: CreditCard,
    steps: ["Tuition assignment", "Weekly invoice", "Parent payment", "Reconciliation"],
  },
  {
    title: "Executive rollup",
    body: "Operators review FTE, enrollment health, school readiness, payroll reports, and action queues without losing location-level context.",
    icon: BarChart3,
    steps: ["FTE data", "Pipeline health", "Center snapshot", "Next action"],
  },
  {
    title: "Account separation",
    body: "A provider can run one school, a franchisee can own a few locations, and a brand admin can manage the larger network without crossing data boundaries.",
    icon: ShieldCheck,
    steps: ["Tenant", "Brand", "Owner group", "Center"],
  },
  {
    title: "School-ready rollout",
    body: "Setup, parent access, kiosk, billing, payments, migration, and wider rollout remain separate readiness decisions for each school.",
    icon: CheckCircle2,
    steps: ["Prepare", "Verify", "Train", "Approve"],
  },
];

const currentOperationsCards = [
  {
    title: "School-linked registration",
    body: "Public registration packets stay tied to the selected school, create director review work, and preserve the family and child context needed for enrollment.",
    icon: FileCheck2,
  },
  {
    title: "ProCare migration with review",
    body: "Multi-report imports stage unresolved data, preserve relationship warnings, show progress, and require review before invitations or operational cutover.",
    icon: Workflow,
  },
  {
    title: "School-local daily operations",
    body: "Attendance, teacher care times, payroll clocks, daily reports, and reporting periods use the school’s local operating context.",
    icon: CalendarDays,
  },
  {
    title: "Payment readiness by school",
    body: "Card, bank, autopay, payout, and Terminal workflows remain gated until the school’s technical and business readiness is confirmed.",
    icon: CreditCard,
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
  ["Migration intake", "ProCare report packages can be staged, validated, reviewed, and resumed without treating incomplete relationships as approved data.", Workflow],
  ["School-scoped marketing accounts", "Authorized teams can connect supported social and paid-media accounts, choose the intended account, review connection status, and keep publishing and analytics tied to the correct school.", BarChart3],
  ["Calendar and communication", "Tour events, closures, parent notices, inquiry routing, campaign drafts, and message workflows can be configured within the authorized school scope.", CalendarDays],
  ["Accounting and payment runway", "Tuition assignments, invoice schedules, payout readiness, parent payment methods, Terminal, and reconciliation remain connected and school-gated.", CreditCard],
];

const resourceCards = [
  ["State readiness", "Licensing, QRIS, funding, professional development, and required document rules can be tracked as school setup and compliance evidence.", MapPin],
  ["Credential visibility", "Staff profiles, background status, certifications, schedule rows, onboarding documents, and expiration reminders stay visible to authorized leaders.", UsersRound],
  ["Independent launch gates", "Each school can verify setup, migration, parent access, kiosk, billing, payments, and broader rollout separately before promotion.", CheckCircle2],
];

const explainerGraphics = [
  {
    title: "School launch gates",
    body: "Separates technical release from school readiness across setup, parent access, kiosk, billing, payments, migration, and wider rollout.",
    src: "/brand/the-bee-suite/explainers/bee-suite-school-launch-gates-2026-07-27-v3.png",
    width: 1600,
    height: 1000,
  },
  {
    title: "Parent access and installation",
    body: "Shows the current invite, first-login, and install path across iPhone, iPad, Android, Fire tablet, and desktop.",
    src: "/brand/the-bee-suite/explainers/bee-suite-parent-access-install-2026-07-27-v3.png",
    width: 1600,
    height: 1000,
  },
  {
    title: "Parent payment options",
    body: "Explains card-first checkout, saved payment methods, one-time bank payments, autopay status, and exact-total review.",
    src: "/brand/the-bee-suite/explainers/bee-suite-parent-payment-options-2026-07-27-v3.png",
    width: 1600,
    height: 1000,
  },
  {
    title: "Weekly tuition flow",
    body: "Keeps the assigned child billing record as the source of truth from school selection through the Thursday invoice run.",
    src: "/brand/the-bee-suite/explainers/bee-suite-weekly-tuition-flow-2026-07-27-v3.png",
    width: 1600,
    height: 1000,
  },
  {
    title: "Director daily flow",
    body: "Connects the morning school review, family and classroom follow-up, billing oversight, records, communication, and closeout.",
    src: "/brand/the-bee-suite/explainers/bee-suite-director-daily-flow-2026-07-27-v3.png",
    width: 1600,
    height: 1000,
  },
  {
    title: "Teacher daily flow",
    body: "Shows the iPad-first classroom rhythm for roster review, attendance, care logs, photos, incidents, messages, and daily reports.",
    src: "/brand/the-bee-suite/explainers/bee-suite-teacher-daily-flow-2026-07-27-v3.png",
    width: 1600,
    height: 1000,
  },
  {
    title: "Kiosk pickup flow",
    body: "Covers guardian PIN or QR verification, child selection, check-in or pickup, signatures, staff clocks, and escalation.",
    src: "/brand/the-bee-suite/explainers/bee-suite-kiosk-pickup-flow-2026-07-27-v3.png",
    width: 1600,
    height: 1000,
  },
  {
    title: "FTE reporting flow",
    body: "Preserves the selected reporting week from school submission through executive review and follow-up.",
    src: "/brand/the-bee-suite/explainers/bee-suite-fte-reporting-flow-2026-07-27-v3.png",
    width: 1600,
    height: 1000,
  },
  {
    title: "Terminal payment flow",
    body: "Shows the school-scoped Stripe Terminal path from reader registration through card-present payment and reconciliation.",
    src: "/brand/the-bee-suite/explainers/bee-suite-terminal-payment-flow-2026-07-27-v3.png",
    width: 1600,
    height: 1000,
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
              href="/directors"
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
              Childcare operations, in one role-safe suite. Connect enrollment, school-day work, family communication, billing, records, and multi-location reporting without losing the school and role context behind each decision.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="h-12 px-5 text-sm shadow-[0_0_34px_rgba(245,181,27,0.25)]" nativeButton={false} render={<Link href="/onboarding" />}>
                Request a workspace
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 border-white/15 bg-white/[0.04] px-5 text-sm text-white hover:bg-white/10"
                nativeButton={false}
                render={<Link href="/registration" />}
              >
                See the registration flow
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 border-white/15 bg-transparent px-5 text-sm text-white hover:bg-white/10"
                nativeButton={false}
                render={<Link href="/directors" />}
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
            title="The workflows connect around the same school record."
            body="Inquiry capture, school-linked registration, classroom work, parent access, billing, reporting, and rollout readiness stay connected while each role works in the scope designed for it."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workflowCards.map((workflow) => (
              <WorkflowGraphic key={workflow.title} {...workflow} />
            ))}
          </div>
        </div>
      </section>

      <section id="role-views" className="relative overflow-hidden border-y border-white/10 bg-[#080b0f] px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(245,181,27,0.1),transparent_34%),radial-gradient(circle_at_88%_18%,rgba(56,189,248,0.08),transparent_24rem)]" />
        <div className="relative mx-auto max-w-[1400px]">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1fr] lg:items-end">
            <SectionHeading
              title="The right screen for every role and device."
              body="Directors and executives work from desktop. Teachers use iPad-first classroom flows with desktop support. Parents can use iPhone, iPad, or desktop, with the phone experience kept focused on family tasks."
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Directors + executives", "Desktop-first operating and reporting views."],
                ["Teachers", "iPad-first classroom work, plus desktop access."],
                ["Parents", "iPhone-first family portal, plus iPad and desktop."],
              ].map(([title, body]) => (
                <GlassPanel key={title} className="p-4">
                  <div className="text-sm font-semibold text-amber-300">{title}</div>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">{body}</p>
                </GlassPanel>
              ))}
            </div>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <GlassPanel className="overflow-hidden border-amber-300/20 p-2">
              <Image
                src="/brand/the-bee-suite/sop-graphics/2026-07-27-v2/role-device-standards-guide.png"
                alt="The BEE Suite role and device standards for executives, directors, teachers, and parents"
                width={1600}
                height={1000}
                className="h-auto w-full rounded-lg"
              />
            </GlassPanel>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {currentOperationsCards.map((card) => (
                <FeatureCard key={card.title} {...card} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="billing" className="relative bg-[#05070a] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-[0.76fr_1fr] lg:items-start">
          <div>
            <SectionHeading
              title="Billing stays connected to the child, family, and school."
              body="The assigned child billing record is the weekly tuition source of truth. Authorized teams can review invoices, payment status, saved methods, autopay, Terminal activity, and reconciliation without separating billing from the operating record."
            />
            <div className="mt-8 space-y-4">
              {[
                ["Thursday invoice scheduling", "Eligible weekly tuition assignments create the following week’s invoice before the payment run."],
                ["Parent payment choices", "Card-first checkout, saved card or bank, one-time bank payment, and autopay status remain visible in the family context."],
                ["School-scoped Terminal", "Registered readers and card-present payments stay tied to the selected school and reconciliation view."],
                ["Independent readiness gate", "No school is promoted for live payments until technical readiness and business approval are complete."],
              ].map(([title, body]) => (
                <div key={title} className="flex gap-4 border-b border-white/10 pb-4 last:border-0 last:pb-0">
                  <CheckCircle2 className="mt-1 size-5 shrink-0 text-amber-300" />
                  <div>
                    <div className="text-sm font-semibold text-white">{title}</div>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <GlassPanel className="overflow-hidden border-amber-300/20 p-2">
            <Image
              src="/brand/the-bee-suite/explainers/bee-suite-weekly-tuition-flow-2026-07-27-v3.png"
              alt="The BEE Suite weekly tuition flow"
              width={1600}
              height={1000}
              className="h-auto w-full rounded-lg"
            />
          </GlassPanel>
        </div>
      </section>

      <section id="product-maps" className="relative overflow-hidden border-y border-white/10 bg-[#080b0f] px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(245,181,27,0.12),transparent_26rem),radial-gradient(circle_at_86%_28%,rgba(56,189,248,0.1),transparent_28rem)]" />
        <div className="absolute right-0 top-8 hidden h-72 w-96 opacity-20 hive-texture lg:block" />
        <div className="relative mx-auto max-w-[1400px]">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1fr] lg:items-end">
            <SectionHeading
              title="Current SOP graphics for the flows that need precision."
              body="The July 27 visual library covers launch gates, parent access, payment choices, weekly tuition, director and teacher routines, kiosk pickup, FTE reporting, and Terminal payments."
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Explain", "Show the exact sequence without opening every app surface."],
                ["Prepare", "Make prerequisites and stop conditions visible before launch."],
                ["Train", "Keep the instructions aligned with the current role and device."],
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
            body="The BEE Suite supports the lobby, classroom, enrollment desk, billing workflow, director office, and executive view with role-aware screens and school-scoped records."
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
              title="Installable web access, organized by role."
              body="The product stays one platform while each entry point remains focused. Parents use the family portal, teachers use classroom tools, directors use school operations, and executives use multi-location oversight."
            />
            <GlassPanel className="mt-8 p-5">
              <div className="text-sm font-semibold text-amber-300">Current access path</div>
              <div className="mt-4 space-y-4 text-sm leading-6 text-zinc-300">
                <p>1. Open the role-specific sign-in or family invite link provided by the school.</p>
                <p>2. Install the web app on a supported phone, tablet, or desktop when the role guide recommends it.</p>
                <p>3. Keep each login tied to the intended school, classroom, family, or executive scope.</p>
              </div>
              <Button className="mt-5 h-10 px-4" nativeButton={false} render={<Link href="/app" />}>
                Open role access
                <ArrowRight data-icon="inline-end" />
              </Button>
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
            title="Prepare each school before promoting live workflows."
            body="Workspace setup, school identity, classrooms, users, registration, migration, parent access, kiosk, billing, payments, and reporting can be prepared in sequence while each activation decision remains independent."
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
            title="Trust, integrations, and readiness stay inside the operating story."
            body="Move data with review, keep sensitive records role-gated, configure provider connections within the intended school scope, and track readiness without implying that software makes legal, safety, custody, medical, billing, or licensing decisions."
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {[
              ["Trust posture", "What leaders need to know before sensitive family, child, billing, and staff data moves into a live system.", trustCards],
              ["Integration runway", "The school-scoped connections that keep enrollment, marketing, accounting, calendar, payments, messaging, and migration work connected.", integrationCards],
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

      <section id="resources" className="landing-parallax-band relative border-y border-white/10 px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div>
            <SectionHeading
              title="Current visual guides for the people who use the system."
              body="The public resource library now uses the same July 27 light-mode product screens as the app story: teacher iPad and desktop, director and executive desktop, and parent iPhone, iPad, and desktop."
            />
            <div className="mt-8 space-y-4">
              {[
                ["Role-specific", "Training stays focused on the actions and data each role is authorized to use."],
                ["Device-specific", "Examples match the screen size people use most often for that workflow."],
                ["Launch-aware", "Guides explain prerequisites and stop conditions without treating a software release as school approval."],
              ].map(([title, body]) => (
                <div key={title} className="flex gap-4">
                  <CheckCircle2 className="mt-1 size-5 shrink-0 text-amber-300" />
                  <div>
                    <div className="text-sm font-semibold text-white">{title}</div>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">{body}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button className="mt-8 h-11 px-5" nativeButton={false} render={<Link href="/resources" />}>
              Open SOPs and guides
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
          <GlassPanel className="overflow-hidden border-amber-300/20 p-2">
            <Image
              src="/brand/the-bee-suite/sop-graphics/2026-07-27-v2/director-desktop-operations-guide.png"
              alt="The BEE Suite director desktop operations guide"
              width={1600}
              height={1000}
              className="h-auto w-full rounded-lg"
            />
          </GlassPanel>
        </div>
      </section>

      <section id="reporting" className="border-y border-white/10 bg-[#0b1016] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-[1fr_0.82fr] lg:items-center">
          <div>
            <SectionHeading
              title="Executive reporting without losing the school-level truth."
              body="The BEE Suite gives operators a location-aware view of enrollment health, inquiry conversion, school activity, payroll reports, billing readiness, compliance work, and the selected FTE reporting period."
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
                ["School scope", "Clear", "Authorized locations and requested filters only"],
                ["FTE period", "Selected", "The submitted reporting week stays visible"],
                ["Payroll history", "Managed", "Active employees in payroll output; former staff retained as history"],
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
            <h2 className="text-3xl font-semibold tracking-normal">Ready to connect the whole school day?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#29313a]">
              Request a workspace for a childcare center, preschool, agency, franchise, or multi-location brand, or review the school-linked registration flow and current public guides.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="h-11 bg-[#101318] px-5 text-white hover:bg-black" nativeButton={false} render={<Link href="/onboarding" />}>
              Request workspace
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button variant="outline" className="h-11 border-[#101318]/30 bg-transparent px-5 hover:bg-[#101318]/10" nativeButton={false} render={<Link href="/directors" />}>
              Log in
            </Button>
            <Button variant="outline" className="h-11 border-[#101318]/30 bg-transparent px-5 hover:bg-[#101318]/10" nativeButton={false} render={<Link href="/registration" />}>
              Registration
            </Button>
            <Button variant="outline" className="h-11 border-[#101318]/30 bg-transparent px-5 hover:bg-[#101318]/10" nativeButton={false} render={<Link href="/resources" />}>
              Guides
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#05070a] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4">
          <BrandLogo href="/" compact />
          <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            <Link className="hover:text-amber-200" href="/resources">
              SOPs and guides
            </Link>
            <Link className="hover:text-amber-200" href="/support">
              Support
            </Link>
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
        </div>
      </footer>
    </main>
  );
}
