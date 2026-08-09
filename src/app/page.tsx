import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Building2,
  CircleHelp,
  ClipboardPenLine,
  GraduationCap,
  KeyRound,
  School,
  ShieldCheck,
  Smartphone,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { PublicThemeToggle } from "@/components/public-theme-toggle";

export const metadata: Metadata = {
  title: "Sign In or Get Started | The BEE Suite",
  description:
    "Sign in to The BEE Suite, choose your role workspace, finish account setup, or begin a new registration.",
};

const portalLinks: Array<{
  title: string;
  description: string;
  action: string;
  href: string;
  icon: LucideIcon;
  hexClass: string;
  iconClass: string;
  glowClass: string;
}> = [
  {
    title: "Director Workspace",
    description: "Open your school dashboard, daily operations, enrollment, billing, and family follow-up.",
    action: "Open Director Login",
    href: "/directors",
    icon: School,
    hexClass: "bg-amber-300/80",
    iconClass: "text-amber-200",
    glowClass: "group-hover:shadow-[0_0_30px_rgba(251,191,36,0.34)]",
  },
  {
    title: "Executive Workspace",
    description: "Review multi-school performance, readiness, reporting, and approvals in one place.",
    action: "Open Executive Login",
    href: "/executives",
    icon: Building2,
    hexClass: "bg-sky-300/70",
    iconClass: "text-sky-200",
    glowClass: "group-hover:shadow-[0_0_30px_rgba(125,211,252,0.28)]",
  },
  {
    title: "Teacher Workspace",
    description: "Get to attendance, classroom updates, daily reports, and family communication.",
    action: "Open Teacher Login",
    href: "/teachers",
    icon: GraduationCap,
    hexClass: "bg-emerald-300/70",
    iconClass: "text-emerald-200",
    glowClass: "group-hover:shadow-[0_0_30px_rgba(110,231,183,0.28)]",
  },
  {
    title: "Parent & Guardian Portal",
    description: "View family updates, documents, billing, messages, and your child’s school day.",
    action: "Open Parent Login",
    href: "/parents",
    icon: UsersRound,
    hexClass: "bg-violet-300/70",
    iconClass: "text-violet-200",
    glowClass: "group-hover:shadow-[0_0_30px_rgba(196,181,253,0.28)]",
  },
];

const gettingStartedLinks: Array<{
  title: string;
  description: string;
  action: string;
  href: string;
  icon: LucideIcon;
}> = [
  {
    title: "I Received an Invitation",
    description: "Use the email address or username connected to your invitation.",
    action: "Continue to Sign In",
    href: "/login",
    icon: KeyRound,
  },
  {
    title: "I’m Setting Up Parent Access",
    description: "Connect your parent or guardian account to your family profile.",
    action: "Set Up Parent Access",
    href: "/parents/setup",
    icon: UserRound,
  },
  {
    title: "I’m Registering a Child",
    description: "Start or continue a registration packet for a participating school.",
    action: "Start Registration",
    href: "/registration",
    icon: ClipboardPenLine,
  },
  {
    title: "I’m Setting Up a School",
    description: "Create a gated setup workspace for a school new to The BEE Suite.",
    action: "Start School Setup",
    href: "/onboarding",
    icon: ShieldCheck,
  },
];

const helpLinks = [
  {
    title: "Help & Guides",
    description: "Walkthroughs for access, daily work, billing, reports, and common questions.",
    href: "/resources",
    action: "Browse Guides",
    icon: BookOpenText,
  },
  {
    title: "Support",
    description: "Get help when you cannot sign in or are not sure where to start.",
    href: "/support",
    action: "Visit Support",
    icon: CircleHelp,
  },
  {
    title: "Use The BEE Suite on Your Device",
    description: "Open the install guide for your phone, tablet, or computer.",
    href: "/app",
    action: "View Device Options",
    icon: Smartphone,
  },
] satisfies Array<{
  title: string;
  description: string;
  href: string;
  action: string;
  icon: LucideIcon;
}>;

const primaryLinkClass =
  "inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-[0_12px_32px_rgba(217,119,6,0.18)] transition-[background-color,box-shadow,transform] motion-safe:hover:-translate-y-0.5 hover:bg-amber-300 hover:shadow-[0_16px_38px_rgba(217,119,6,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf7ec] dark:bg-amber-300 dark:shadow-[0_12px_32px_rgba(251,191,36,0.18)] dark:hover:bg-amber-200 dark:hover:shadow-[0_16px_38px_rgba(251,191,36,0.28)] dark:focus-visible:ring-amber-200 dark:focus-visible:ring-offset-[#03070d]";

const secondaryLinkClass =
  "inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-900/15 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition-[background-color,border-color,transform] motion-safe:hover:-translate-y-0.5 hover:border-amber-500/35 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf7ec] dark:border-white/15 dark:bg-white/[0.055] dark:text-white dark:shadow-none dark:hover:border-white/25 dark:hover:bg-white/[0.09] dark:focus-visible:ring-amber-200 dark:focus-visible:ring-offset-[#03070d]";

function HexIcon({
  icon: Icon,
  hexClass,
  iconClass,
  glowClass,
  size = "lg",
}: {
  icon: LucideIcon;
  hexClass: string;
  iconClass: string;
  glowClass?: string;
  size?: "sm" | "lg";
}) {
  return (
    <span
      aria-hidden="true"
      className={`${size === "lg" ? "size-[4.5rem] sm:size-20" : "size-12"} relative grid shrink-0 place-items-center [clip-path:polygon(50%_0%,93%_25%,93%_75%,50%_100%,7%_75%,7%_25%)] ${hexClass} ${glowClass ?? ""} transition-[box-shadow,transform] duration-300 motion-safe:group-hover:scale-[1.035]`}
    >
      <span className="absolute inset-px [clip-path:inherit] bg-[linear-gradient(145deg,#14202b_0%,#071019_72%)]" />
      <span className="absolute inset-[3px] [clip-path:inherit] bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.08),transparent_58%)]" />
      <Icon className={`${size === "lg" ? "size-7 sm:size-8" : "size-5"} relative z-10 ${iconClass}`} />
    </span>
  );
}

function HoneycombAccessRail() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 140 520"
      className="pointer-events-none absolute bottom-6 left-1 top-[6.65rem] hidden h-[calc(100%-8rem)] w-32 text-amber-600/55 dark:text-amber-300/75 lg:block"
      fill="none"
      preserveAspectRatio="none"
    >
      <path d="M66 3 121 34v70l-55 31-55-31V34L66 3Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="m66 132 55 31v70l-55 31-55-31v-70l55-31Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="m66 261 55 31v70l-55 31-55-31v-70l55-31Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="m66 390 55 31v70l-55 31-55-31v-70l55-31Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M121 69h18M121 198h18M121 327h18M121 456h18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#fbf7ec] text-slate-950 selection:bg-amber-300/70 selection:text-slate-950 dark:bg-[#03070d] dark:text-white">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-amber-300 px-4 py-3 font-semibold text-zinc-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-slate-900/10 bg-[#fbf7ec]/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#03070d]/90">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
          <BrandLogo href="/" compact size="sm" priority />
          <nav aria-label="Primary navigation" className="flex items-center gap-2 sm:gap-3">
            <Link
              href="#get-started"
              className="hidden min-h-11 touch-manipulation items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-white/70 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white dark:focus-visible:ring-amber-200 sm:inline-flex"
            >
              Get Started
            </Link>
            <Link
              href="/resources"
              className="hidden min-h-11 touch-manipulation items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-white/70 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white dark:focus-visible:ring-amber-200 md:inline-flex"
            >
              Help & Guides
            </Link>
            <PublicThemeToggle />
            <Link href="/login" className={`${primaryLinkClass} px-4 py-2.5`}>
              Sign In
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className="relative px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-20 lg:px-10 xl:py-16">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-24 top-10 h-[34rem] w-[34rem] rounded-full bg-amber-300/20 blur-3xl motion-safe:animate-pulse motion-safe:[animation-duration:7s] dark:bg-amber-300/[0.055]" />
            <div className="absolute right-[-14rem] top-16 h-[42rem] w-[42rem] rounded-full bg-sky-300/15 blur-3xl motion-safe:animate-pulse motion-safe:[animation-delay:1.5s] motion-safe:[animation-duration:8s] dark:bg-sky-400/[0.04]" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent dark:via-amber-300/20" />
          </div>

          <div className="relative mx-auto grid w-full max-w-[1440px] items-center gap-12 min-[1400px]:grid-cols-[minmax(0,0.68fr)_minmax(0,1.32fr)] min-[1400px]:gap-14">
            <div className="min-w-0 text-center min-[1400px]:text-left">
              <div className="flex flex-col items-center gap-7 min-[1400px]:flex-row min-[1400px]:items-start">
                <div className="grid h-20 w-14 shrink-0 place-items-center rounded-[1.45rem] border border-amber-500/40 bg-[linear-gradient(160deg,rgba(255,255,255,0.9),rgba(251,191,36,0.14))] text-amber-700 shadow-[inset_0_1px_rgba(255,255,255,0.9),0_20px_60px_rgba(217,119,6,0.12)] dark:border-amber-300/55 dark:bg-[linear-gradient(160deg,rgba(251,191,36,0.14),rgba(251,191,36,0.025))] dark:text-amber-200 dark:shadow-[inset_0_1px_rgba(255,255,255,0.12),0_20px_60px_rgba(251,191,36,0.08)]">
                  <KeyRound aria-hidden="true" className="size-6" />
                </div>
                <h1
                  aria-label="Welcome to The BEE Suite"
                  className="text-balance text-[clamp(2.65rem,6.4vw,5.2rem)] font-semibold leading-[0.95] tracking-[-0.055em]"
                >
                  <span className="min-[1400px]:block">Welcome</span>{" "}
                  <span className="min-[1400px]:block">to The</span>{" "}
                  <span className="min-[1400px]:block" translate="no">BEE Suite</span>
                </h1>
              </div>
              <p className="mx-auto mt-7 max-w-xl text-pretty text-base leading-7 text-slate-600 dark:text-zinc-300 sm:text-lg sm:leading-8 min-[1400px]:ml-[5.25rem] min-[1400px]:mr-0">
                Sign in to your workspace, finish setup from an invitation, or choose the portal that matches how you use The BEE Suite.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row min-[1400px]:ml-16 min-[1400px]:justify-start">
                <Link href="/login" className={primaryLinkClass}>
                  Sign In to The BEE Suite
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
                <Link href="#get-started" className={secondaryLinkClass}>
                  I’m New Here
                </Link>
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-500 dark:text-zinc-500 min-[1400px]:ml-[5.25rem]">
                Already signed in? We’ll take you to the workspace available for your account.
              </p>
            </div>

            <div
              data-testid="workspace-access-rail"
              className="relative min-w-0 rounded-[1.8rem] border border-slate-900/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.88),rgba(255,250,235,0.72))] p-4 shadow-[inset_0_1px_rgba(255,255,255,0.95),0_36px_100px_rgba(71,49,16,0.13)] backdrop-blur-xl dark:border-white/[0.14] dark:bg-[linear-gradient(145deg,rgba(17,29,41,0.78),rgba(5,12,20,0.92))] dark:shadow-[inset_0_1px_rgba(255,255,255,0.055),0_36px_100px_rgba(0,0,0,0.42)] sm:p-6 lg:p-7"
            >
              <div className="relative z-10 mb-6 flex items-end justify-between gap-5 pl-1 lg:pl-28">
                <div className="min-w-0">
                  <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">Choose Your Workspace</h2>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-zinc-400 sm:text-base">Go directly to the login made for your role.</p>
                </div>
                <ShieldCheck aria-hidden="true" className="hidden size-5 shrink-0 text-slate-400 dark:text-zinc-500 sm:block" />
              </div>

              <HoneycombAccessRail />
              <div className="relative z-10 grid gap-3 lg:pl-20">
                {portalLinks.map(({ title, description, action, href, icon, hexClass, iconClass, glowClass }) => (
                  <Link
                    key={href}
                    href={href}
                    className="group flex min-w-0 touch-manipulation items-center gap-4 rounded-[1.35rem] border border-slate-900/10 bg-white/70 p-3.5 shadow-[inset_0_1px_rgba(255,255,255,0.9),0_12px_34px_rgba(71,49,16,0.06)] transition-[background-color,border-color,box-shadow,transform] motion-safe:hover:translate-x-1 hover:border-amber-500/35 hover:bg-white hover:shadow-[0_16px_42px_rgba(71,49,16,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:border-white/[0.16] dark:bg-transparent dark:bg-[linear-gradient(100deg,rgba(17,30,42,0.82),rgba(8,18,28,0.72))] dark:shadow-[inset_0_1px_rgba(255,255,255,0.045)] dark:hover:border-white/30 dark:hover:bg-white/[0.075] dark:hover:shadow-[0_16px_42px_rgba(0,0,0,0.28)] dark:focus-visible:ring-amber-200 sm:gap-5 sm:p-4 lg:-ml-20"
                  >
                    <HexIcon icon={icon} hexClass={hexClass} iconClass={iconClass} glowClass={glowClass} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-slate-950 dark:text-white sm:text-lg">{title}</span>
                      <span className="mt-1 block text-pretty text-sm leading-5 text-slate-600 dark:text-zinc-400 sm:leading-6">{description}</span>
                      <span className="mt-3 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-200 xl:hidden">
                        {action}
                        <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
                      </span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-2 pl-3 text-sm font-semibold text-amber-700 dark:text-amber-200 xl:flex">
                      {action}
                      <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="get-started" className="scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
          <div className="mx-auto grid max-w-[1440px] gap-5 xl:grid-cols-[1.18fr_0.82fr]">
            <article className="rounded-[1.65rem] border border-slate-900/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(255,250,235,0.74))] p-5 shadow-[inset_0_1px_rgba(255,255,255,0.95),0_26px_70px_rgba(71,49,16,0.1)] dark:border-white/[0.13] dark:bg-[linear-gradient(145deg,rgba(15,27,39,0.78),rgba(5,12,20,0.92))] dark:shadow-[inset_0_1px_rgba(255,255,255,0.05),0_26px_70px_rgba(0,0,0,0.28)] sm:p-7">
              <div className="flex items-start gap-4">
                <HexIcon icon={KeyRound} hexClass="bg-amber-300/80" iconClass="text-amber-200" size="sm" />
                <div className="min-w-0">
                  <h2 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">New Here? Start With What You Need</h2>
                  <p className="mt-1.5 text-pretty text-sm leading-6 text-slate-600 dark:text-zinc-400">Choose the setup path that matches what you are doing today.</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                {gettingStartedLinks.map(({ title, description, action, href, icon: Icon }) => (
                  <Link
                    key={title}
                    href={href}
                    className="group flex min-h-48 min-w-0 touch-manipulation flex-col rounded-2xl border border-slate-900/10 bg-white/70 p-5 shadow-[inset_0_1px_rgba(255,255,255,0.85)] transition-[background-color,border-color,transform] motion-safe:hover:-translate-y-0.5 hover:border-amber-500/35 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:border-white/10 dark:bg-black/20 dark:shadow-none dark:hover:border-amber-300/30 dark:hover:bg-white/[0.055] dark:focus-visible:ring-amber-200"
                  >
                    <Icon aria-hidden="true" className="size-6 text-amber-700 dark:text-amber-200" />
                    <span className="mt-4 block font-semibold text-slate-950 dark:text-white">{title}</span>
                    <span className="mt-2 block text-sm leading-5 text-slate-600 dark:text-zinc-400">{description}</span>
                    <span className="mt-auto flex items-center gap-2 pt-5 text-sm font-semibold text-amber-700 dark:text-amber-200">
                      {action}
                      <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                ))}
              </div>
            </article>

            <article className="rounded-[1.65rem] border border-slate-900/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(255,250,235,0.74))] p-5 shadow-[inset_0_1px_rgba(255,255,255,0.95),0_26px_70px_rgba(71,49,16,0.1)] dark:border-white/[0.13] dark:bg-[linear-gradient(145deg,rgba(15,27,39,0.78),rgba(5,12,20,0.92))] dark:shadow-[inset_0_1px_rgba(255,255,255,0.05),0_26px_70px_rgba(0,0,0,0.28)] sm:p-7">
              <div className="flex items-start gap-4">
                <HexIcon icon={CircleHelp} hexClass="bg-amber-300/80" iconClass="text-amber-200" size="sm" />
                <div className="min-w-0">
                  <h2 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">Need Help Getting In?</h2>
                  <p className="mt-1.5 text-pretty text-sm leading-6 text-slate-600 dark:text-zinc-400">Find the right guide, support path, or device setup.</p>
                </div>
              </div>

              <div className="mt-6 divide-y divide-slate-900/10 overflow-hidden rounded-2xl border border-slate-900/10 bg-white/70 shadow-[inset_0_1px_rgba(255,255,255,0.85)] dark:divide-white/10 dark:border-white/10 dark:bg-black/20 dark:shadow-none">
                {helpLinks.map(({ title, description, href, action, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="group flex min-w-0 touch-manipulation items-center gap-4 p-4 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-600 dark:hover:bg-white/[0.055] dark:focus-visible:ring-amber-200 sm:p-5"
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0 text-amber-700 dark:text-amber-200" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-950 dark:text-white">{title}</span>
                      <span className="mt-1 block text-sm leading-5 text-slate-600 dark:text-zinc-400">{description}</span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-200 sm:flex">
                      {action}
                      <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                    <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-amber-700 dark:text-amber-200 sm:hidden" />
                  </Link>
                ))}
              </div>
            </article>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-900/10 px-4 py-7 dark:border-white/10 sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-5 text-center sm:flex-row sm:text-left">
          <BrandLogo href="/" compact size="sm" />
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-sm text-slate-600 dark:text-zinc-400 sm:justify-end">
            <Link href="/resources" className="min-h-11 touch-manipulation content-center transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:hover:text-white dark:focus-visible:ring-amber-200">
              Help & Guides
            </Link>
            <Link href="/support" className="min-h-11 touch-manipulation content-center transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:hover:text-white dark:focus-visible:ring-amber-200">
              Support
            </Link>
            <Link href="/privacy" className="min-h-11 touch-manipulation content-center transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:hover:text-white dark:focus-visible:ring-amber-200">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
