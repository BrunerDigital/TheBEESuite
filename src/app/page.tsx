import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Camera,
  CheckCircle2,
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
  ["Schools", "#school-use"],
  ["Registration", "/registration"],
  ["Testimonials", "#testimonials"],
  ["Reporting", "#reporting"],
];

const heroProof = [
  ["Tenant-isolated", "Separate brands, owner groups, schools, and users"],
  ["1 embed", "Inquiry form to CRM, email, and Sheets"],
  ["Human-reviewed AI", "Suggestions with safety guardrails"],
];

const heroLogo = {
  src: "/brand/the-bee-suite/logo-primary-horizontal-white.png",
  width: 1280,
  height: 360,
  alt: "The Bee Suite",
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
  ["Brand profile", "Name, theme, logo placeholder, custom domain, and parent-facing identity.", Building2],
  ["Owner groups", "Single-center owners, franchisees, and multi-location operators stay properly separated.", ShieldCheck],
  ["Centers", "Location profiles, CRM IDs, routing emails, capacity, and open or closed status.", MapPin],
  ["Users", "Role-scoped access for owners, regional teams, directors, staff, and auditors.", UsersRound],
  ["Branding layers", "Tenant, brand, owner group, and center customizations can override the right surfaces.", Sparkles],
  ["Inquiry form", "Copyable embed codes tied to the correct center or multi-location account.", ClipboardCheck],
  ["Online registration", "Public registration packets create application-stage leads and director review tasks.", FileCheck2],
  ["Payouts", "Stripe Connect readiness is captured, but live checkout stays gated until reviewed.", CreditCard],
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

const schoolScenes = [
  {
    title: "Lobby check-in on a tablet",
    body: "Parents use a 4 digit PIN set by the director, select their children, and create check-in or check-out records without staff retyping the day.",
    icon: TabletSmartphone,
  },
  {
    title: "Teacher updates during the day",
    body: "Classroom staff can share photos, notes, activities, meals, naps, and daily reports so families get a warmer window into the day.",
    icon: Camera,
  },
  {
    title: "Director follow-up desk",
    body: "Enrollment teams can add leads manually, move families through the pipeline, assign tasks, and use Mr. Bee to draft thoughtful replies.",
    icon: School,
  },
];

const testimonials = [
  {
    quote: "This is the first childcare CRM view that feels like it was designed around the actual work happening in a center, not a generic sales board.",
    person: "Pilot center director",
    role: "Multi-classroom preschool",
  },
  {
    quote: "The multi-location snapshot makes the morning standup faster. We can see where inquiries, tours, occupancy, and follow-ups need attention.",
    person: "Regional operator",
    role: "Childcare franchise group",
  },
  {
    quote: "The inquiry routing is the part I care about most. Every lead needs to reach the right school quickly, with a backup record we can trust.",
    person: "Enrollment coordinator",
    role: "Early education brand",
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

function SchoolSceneCard({
  title,
  body,
  icon: Icon,
  index,
}: {
  title: string;
  body: string;
  icon: LucideIcon;
  index: number;
}) {
  return (
    <GlassPanel className="relative overflow-hidden">
      <div className="relative aspect-[16/10] overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(245,181,27,0.24),transparent_12rem),linear-gradient(135deg,#121821,#05070a)]">
        <div className="absolute inset-x-6 top-6 h-8 rounded-t-2xl border border-white/10 bg-black/35" />
        <div className="absolute inset-x-8 bottom-5 top-11 rounded-2xl border border-white/10 bg-black/45 p-4 shadow-2xl shadow-black/40">
          {index === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Lobby kiosk</div>
              <div className="mt-5 flex gap-2">
                {[1, 2, 3, 4].map((dot) => (
                  <span key={dot} className="size-4 rounded-full bg-amber-300" />
                ))}
              </div>
              <div className="mt-6 grid w-full max-w-52 grid-cols-3 gap-2">
                {Array.from({ length: 9 }, (_, keypad) => (
                  <span key={keypad} className="rounded-lg bg-white/[0.07] py-2 text-xs text-zinc-300">
                    {keypad + 1}
                  </span>
                ))}
              </div>
            </div>
          ) : index === 1 ? (
            <div className="grid h-full grid-cols-[0.72fr_1fr] gap-4">
              <div className="rounded-xl bg-amber-300/20" />
              <div className="space-y-3 self-center">
                <div className="h-3 rounded bg-white/18" />
                <div className="h-3 w-2/3 rounded bg-white/12" />
                <div className="h-10 rounded-lg border border-amber-300/25 bg-amber-300/10" />
              </div>
            </div>
          ) : (
            <div className="h-full space-y-2">
              {["New Inquiry", "Tour Scheduled", "Application", "Enrolled"].map((stage, stageIndex) => (
                <div key={stage} className="grid grid-cols-[1fr_auto] rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
                  <span>{stage}</span>
                  <span className="font-semibold text-amber-300">{[18, 12, 9, 6][stageIndex]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="absolute left-5 top-5 grid size-11 place-items-center rounded-xl border border-amber-300/25 bg-black/45 text-amber-300 backdrop-blur-md">
          <Icon className="size-5" />
        </div>
      </div>
      <div className="p-5">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
      </div>
    </GlassPanel>
  );
}

function TestimonialCard({ quote, person, role }: { quote: string; person: string; role: string }) {
  return (
    <GlassPanel className="relative p-6">
      <Quote className="size-7 text-amber-300" />
      <p className="mt-5 text-base leading-7 text-zinc-200">{quote}</p>
      <div className="mt-6 border-t border-white/10 pt-4">
        <div className="text-sm font-semibold text-white">{person}</div>
        <div className="mt-1 text-xs text-zinc-500">{role}</div>
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
              Start onboarding
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
              The Bee Suite
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
          <LandingHeroShowcase />
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

      <section id="workflows" className="relative bg-[#05070a] px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute left-0 top-20 hidden h-80 w-80 opacity-25 hive-texture lg:block" />
        <div className="mx-auto max-w-[1400px]">
          <SectionHeading
            align="center"
            title="The workflows connect instead of living in separate tabs."
            body="Inquiry capture, classroom engagement, billing readiness, reporting, and AI assistance share the same center-aware foundation, so schools do less duplicate admin work."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {workflowCards.map((workflow) => (
              <WorkflowGraphic key={workflow.title} {...workflow} />
            ))}
          </div>
        </div>
      </section>

      <section id="school-use" className="relative overflow-hidden border-y border-white/10 bg-[#0a0f15] px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(56,189,248,0.09),transparent_28rem),radial-gradient(circle_at_85%_35%,rgba(245,181,27,0.12),transparent_24rem)]" />
        <div className="relative mx-auto max-w-[1400px]">
          <SectionHeading
            title="Designed for how schools actually use the system."
            body="The Bee Suite is not just a back-office dashboard. It supports the lobby, the classroom, the enrollment desk, and the executive view with role-aware screens."
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {schoolScenes.map((scene, index) => (
              <SchoolSceneCard key={scene.title} {...scene} index={index} />
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
            body="A new operator can create a gated workspace, define the ownership container, complete brand and center setup, copy their inquiry form, invite users, and prepare payout onboarding before live parent workflows are enabled."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {setupCards.map(([title, body, Icon]) => (
              <FeatureCard key={title as string} title={title as string} body={body as string} icon={Icon as LucideIcon} />
            ))}
          </div>
        </div>
      </section>

      <section id="testimonials" className="landing-parallax-band relative border-y border-white/10 px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative mx-auto max-w-[1400px]">
          <SectionHeading
            align="center"
            title="Built with operators, directors, and enrollment teams in mind."
            body="The first production rollout is focused on real center operations: lead capture, school-level ownership, executive visibility, and parent engagement foundations."
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
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
              body="The Bee Suite gives operators a fast view of enrollment health, inquiry conversion, school activity, open tasks, billing readiness, and FTE reporting. Existing spreadsheets can remain a backup while the app becomes the daily operating view."
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
              Create a trial workspace for a childcare center, preschool, agency, franchise, or multi-location brand, or review the public registration packet.
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
