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
  accent: string;
}> = [
  {
    title: "Director Workspace",
    description: "Open your school dashboard, daily operations, enrollment, billing, and family follow-up.",
    action: "Open Director Login",
    href: "/directors",
    icon: School,
    accent: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  },
  {
    title: "Executive Workspace",
    description: "Review multi-school performance, readiness, reporting, and approvals in one place.",
    action: "Open Executive Login",
    href: "/executives",
    icon: Building2,
    accent: "border-sky-300/30 bg-sky-300/10 text-sky-200",
  },
  {
    title: "Teacher Workspace",
    description: "Get to attendance, classroom updates, daily reports, and family communication.",
    action: "Open Teacher Login",
    href: "/teachers",
    icon: GraduationCap,
    accent: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  },
  {
    title: "Parent & Guardian Portal",
    description: "View family updates, documents, billing, messages, and your child’s school day.",
    action: "Open Parent Login",
    href: "/parents",
    icon: UsersRound,
    accent: "border-violet-300/30 bg-violet-300/10 text-violet-200",
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
    description: "Use the email address or username connected to your invitation to enter your workspace.",
    action: "Continue to Sign In",
    href: "/login",
    icon: KeyRound,
  },
  {
    title: "I’m Setting Up Parent Access",
    description: "Finish connecting your parent or guardian account to the family profile at your school.",
    action: "Set Up Parent Access",
    href: "/parents/setup",
    icon: UserRound,
  },
  {
    title: "I’m Registering a Child",
    description: "Start or continue the online registration packet for a participating school.",
    action: "Start Registration",
    href: "/registration",
    icon: ClipboardPenLine,
  },
  {
    title: "I’m Setting Up a School",
    description: "Create a gated setup workspace for a school that is new to The BEE Suite.",
    action: "Start School Setup",
    href: "/onboarding",
    icon: ShieldCheck,
  },
];

const helpLinks = [
  {
    title: "Help & Guides",
    description: "Find walkthroughs for access, daily work, billing, reports, and common questions.",
    href: "/resources",
    action: "Browse Guides",
    icon: BookOpenText,
  },
  {
    title: "Support",
    description: "Get help when you cannot sign in, need account guidance, or are not sure where to start.",
    href: "/support",
    action: "Visit Support",
    icon: CircleHelp,
  },
  {
    title: "Use The BEE Suite on Your Device",
    description: "Open the install guide for a phone, tablet, or desktop computer.",
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
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-[0_12px_32px_rgba(251,191,36,0.18)] transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-amber-200 hover:shadow-[0_16px_38px_rgba(251,191,36,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07090d]";

const secondaryLinkClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07090d]";

export default function Home() {
  return (
    <div className="min-h-dvh overflow-hidden bg-[#05070a] text-white">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-amber-300 px-4 py-3 font-semibold text-zinc-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#05070a]/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <BrandLogo href="/" compact size="sm" priority />
          <nav aria-label="Primary navigation" className="flex items-center gap-2 sm:gap-3">
            <Link
              href="#get-started"
              className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 sm:inline-flex"
            >
              Get Started
            </Link>
            <Link
              href="/resources"
              className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 md:inline-flex"
            >
              Help & Guides
            </Link>
            <Link href="/login" className={`${primaryLinkClass} px-4 py-2.5`}>
              Sign In
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className="relative px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8 lg:pb-24 lg:pt-24">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute left-[8%] top-8 h-64 w-64 rounded-full bg-amber-300/10 blur-3xl sm:h-96 sm:w-96" />
            <div className="absolute right-[4%] top-28 h-72 w-72 rounded-full bg-sky-400/[0.07] blur-3xl sm:h-[28rem] sm:w-[28rem]" />
          </div>

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
            <div className="min-w-0 text-center lg:text-left">
              <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-200 lg:mx-0">
                <KeyRound aria-hidden="true" className="size-6" />
              </div>
              <h1 className="text-balance text-[clamp(2.55rem,7vw,5.5rem)] font-semibold leading-[0.94] tracking-[-0.055em]">
                Welcome to The BEE Suite
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8 lg:mx-0">
                Sign in to your workspace, finish setup from an invitation, or choose the portal that matches how you use The BEE Suite.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                <Link href="/login" className={primaryLinkClass}>
                  Sign In to The BEE Suite
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
                <Link href="#get-started" className={secondaryLinkClass}>
                  I’m New Here
                </Link>
              </div>
              <p className="mt-5 text-sm leading-6 text-zinc-500">
                Already signed in? We’ll take you to the workspace available for your account.
              </p>
            </div>

            <div className="min-w-0 rounded-[2rem] border border-white/12 bg-white/[0.055] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-6">
              <div className="mb-5 flex items-end justify-between gap-4 px-1">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Choose Your Workspace</h2>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">Go directly to the login made for your role.</p>
                </div>
                <span className="hidden rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-zinc-400 sm:inline-flex">
                  Secure access
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {portalLinks.map(({ title, description, action, href, icon: Icon, accent }) => (
                  <Link
                    key={href}
                    href={href}
                    className="group flex min-h-48 min-w-0 flex-col rounded-2xl border border-white/10 bg-black/25 p-5 transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                  >
                    <span className={`flex size-11 items-center justify-center rounded-xl border ${accent}`}>
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <span className="mt-4 block text-base font-semibold text-white">{title}</span>
                    <span className="mt-2 block text-sm leading-6 text-zinc-400">{description}</span>
                    <span className="mt-auto flex items-center gap-2 pt-5 text-sm font-semibold text-amber-200">
                      {action}
                      <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="get-started" className="scroll-mt-24 border-y border-white/10 bg-white/[0.025] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">New Here? Start With What You Need</h2>
              <p className="mt-4 text-pretty text-base leading-7 text-zinc-400 sm:text-lg">
                Choose the path that fits what you are doing today. You can sign in, connect parent access, register a child, or begin a new school setup.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {gettingStartedLinks.map(({ title, description, action, href, icon: Icon }) => (
                <Link
                  key={title}
                  href={href}
                  className="group flex min-h-64 min-w-0 flex-col rounded-2xl border border-white/10 bg-[#0b0e14] p-6 transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-amber-300/25 hover:bg-[#10141c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                >
                  <span className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-zinc-200">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="mt-5 block text-lg font-semibold text-white">{title}</span>
                  <span className="mt-3 block text-sm leading-6 text-zinc-400">{description}</span>
                  <span className="mt-auto flex items-center gap-2 pt-6 text-sm font-semibold text-amber-200">
                    {action}
                    <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.065] to-white/[0.025] p-6 sm:p-8 lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-start lg:gap-12">
              <div>
                <h2 className="text-balance text-3xl font-semibold tracking-tight">Need Help Getting In?</h2>
                <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-zinc-400">
                  Find the right guide, contact support, or set up The BEE Suite on the device you use most.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {helpLinks.map(({ title, description, href, action, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="group min-w-0 rounded-2xl border border-white/10 bg-black/20 p-5 transition-[background-color,border-color] hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                  >
                    <Icon aria-hidden="true" className="size-5 text-amber-200" />
                    <span className="mt-4 block font-semibold text-white">{title}</span>
                    <span className="mt-2 block text-sm leading-6 text-zinc-400">{description}</span>
                    <span className="mt-4 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                      {action}
                      <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 px-4 py-7 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 text-center sm:flex-row sm:text-left">
          <BrandLogo href="/" compact size="sm" />
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-sm text-zinc-400 sm:justify-end">
            <Link href="/resources" className="min-h-11 content-center transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
              Help & Guides
            </Link>
            <Link href="/support" className="min-h-11 content-center transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
              Support
            </Link>
            <Link href="/privacy" className="min-h-11 content-center transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
