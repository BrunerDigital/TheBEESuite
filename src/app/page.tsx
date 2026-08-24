import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LandingHeroShowcase, LandingRoleShowcase } from "@/components/landing-hero-showcase";
import { PublicThemeToggle } from "@/components/public-theme-toggle";

export const metadata: Metadata = {
  title: "Childcare Operations, Connected | The BEE Suite",
  description:
    "Connect enrollment, classrooms, family communication, billing, and multi-location oversight in The BEE Suite.",
};

const workspaces = [
  {
    title: "Director Workspace",
    description: "Daily operations, enrollment, billing, staff, records, and family follow-up.",
    href: "/directors",
  },
  {
    title: "Executive Workspace",
    description: "Multi-school performance, readiness, reporting, access, and approvals.",
    href: "/executives",
  },
  {
    title: "Teacher Workspace",
    description: "Attendance, classroom updates, daily reports, photos, incidents, and messages.",
    href: "/teachers",
  },
  {
    title: "Parent & Guardian Portal",
    description: "Daily updates, documents, billing, messages, and family account details.",
    href: "/parents",
  },
] as const;

const gettingStartedLinks = [
  { label: "Use an invitation", href: "/login" },
  { label: "Set up parent access", href: "/parents/setup" },
  { label: "Register a child", href: "/registration" },
  { label: "Set up a school", href: "/onboarding" },
] as const;

const primaryLinkClass =
  "inline-flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl bg-[#f6bd2c] px-6 py-3 text-sm font-semibold text-[#071018] shadow-[0_16px_38px_rgba(246,189,44,0.18)] transition-[background-color,box-shadow,transform] motion-safe:hover:-translate-y-0.5 hover:bg-[#ffd15a] hover:shadow-[0_20px_46px_rgba(246,189,44,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6bd2c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#071018]";

const outlineLinkClass =
  "inline-flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl border border-amber-500/70 bg-white/55 px-6 py-3 text-sm font-semibold text-slate-950 transition-[background-color,border-color,transform] motion-safe:hover:-translate-y-0.5 hover:border-amber-500 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf7ec] dark:border-[#f6bd2c]/70 dark:bg-white/[0.025] dark:text-white dark:hover:border-[#ffd15a] dark:hover:bg-white/[0.07] dark:focus-visible:ring-[#f6bd2c] dark:focus-visible:ring-offset-[#071018]";

function WorkspaceLink({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group grid min-h-28 touch-manipulation grid-cols-[1fr_auto] items-center gap-5 border-b border-slate-900/15 py-5 transition-colors hover:border-amber-500/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-4 dark:border-white/15 dark:hover:border-amber-300/70 dark:focus-visible:ring-amber-300 dark:focus-visible:ring-offset-[#071018] sm:min-h-32 sm:py-6"
    >
      <span>
        <span className="block text-lg font-semibold tracking-[-0.02em] text-slate-950 dark:text-white sm:text-xl">
          {title}
        </span>
        <span className="mt-2 block max-w-xl text-sm leading-6 text-slate-600 dark:text-zinc-400">
          {description}
        </span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="size-5 text-slate-950 transition-transform motion-safe:group-hover:translate-x-1.5 dark:text-white"
      />
    </Link>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-white text-slate-950 selection:bg-amber-300 selection:text-[#071018] dark:bg-[#071018] dark:text-white">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-[#f6bd2c] px-4 py-3 font-semibold text-[#071018] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>

      <div className="relative overflow-hidden bg-[#fbf7ec] text-slate-950 dark:bg-[#071018] dark:text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_42%,rgba(246,189,44,0.20),transparent_34rem),linear-gradient(112deg,#fbf7ec_0%,#fbf7ec_52%,#f3ead8_100%)] dark:bg-[radial-gradient(circle_at_74%_42%,rgba(32,70,94,0.34),transparent_34rem),linear-gradient(112deg,#071018_0%,#071018_52%,#0b1b27_100%)]"
        />

        <header className="relative z-40 border-b border-slate-900/10 bg-[#fbf7ec]/88 backdrop-blur-xl dark:border-white/10 dark:bg-[#071018]/88">
          <div className="mx-auto flex min-h-18 max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10 xl:px-14">
            <BrandLogo
              href="/"
              compact
              size="sm"
              priority
              className="min-h-11 touch-manipulation"
              textClassName="[&>span:first-child]:text-amber-700 dark:[&>span:first-child]:text-amber-300"
            />

            <nav aria-label="Primary navigation" className="flex items-center gap-2 sm:gap-3">
              <div className="mr-3 hidden items-center gap-1 lg:flex xl:gap-2">
                <Link
                  href="#product"
                  className="inline-flex min-h-11 touch-manipulation items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white dark:focus-visible:ring-amber-300"
                >
                  Product
                </Link>
                <Link
                  href="#role-views"
                  className="inline-flex min-h-11 touch-manipulation items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white dark:focus-visible:ring-amber-300"
                >
                  For Every Role
                </Link>
                <Link
                  href="#in-schools"
                  className="inline-flex min-h-11 touch-manipulation items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white dark:focus-visible:ring-amber-300"
                >
                  In Schools
                </Link>
                <Link
                  href="/resources"
                  className="inline-flex min-h-11 touch-manipulation items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white dark:focus-visible:ring-amber-300"
                >
                  Help &amp; Guides
                </Link>
              </div>
              <PublicThemeToggle />
              <Link
                href="/login"
                className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-xl border border-amber-500/80 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-[background-color,border-color,color] hover:border-amber-500 hover:bg-amber-300 hover:text-[#071018] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf7ec] dark:border-amber-300/80 dark:text-white dark:hover:border-amber-300 dark:focus-visible:ring-amber-300 dark:focus-visible:ring-offset-[#071018]"
              >
                Sign In
              </Link>
            </nav>
          </div>
        </header>

        <main id="main-content" className="relative">
          <section className="relative px-4 pb-10 pt-14 sm:px-6 sm:pb-14 sm:pt-18 lg:px-10 xl:px-14 xl:pb-8 xl:pt-12">
            <div className="mx-auto grid max-w-[1480px] items-center gap-10 lg:min-h-[calc(100svh-7.5rem)] lg:grid-cols-[0.86fr_1.14fr] lg:gap-7 xl:gap-9 2xl:min-h-[46rem]">
              <div className="relative z-20 max-w-2xl py-4 text-center lg:py-10 lg:text-left">
                <h1 className="text-balance text-[clamp(3.15rem,5.7vw,5.9rem)] font-semibold leading-[0.92] tracking-[-0.065em]">
                  The school day, connected.
                </h1>
                <p className="mx-auto mt-7 max-w-xl text-pretty text-base leading-7 text-slate-600 dark:text-zinc-300 sm:text-lg sm:leading-8 lg:mx-0">
                  One secure suite for enrollment, classrooms, family communication, billing, and multi-location oversight.
                </p>
                <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                  <Link href="/login" className={primaryLinkClass}>
                    Sign In to The BEE Suite
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                  <Link href="#product" className={outlineLinkClass}>
                    See the product
                  </Link>
                </div>
                <p className="mt-7 text-sm leading-6 text-slate-500 dark:text-zinc-400 sm:text-base">
                  Built for directors, teachers, families, and multi-school teams.
                </p>
              </div>

              <div className="relative z-10 min-w-0 lg:-mr-8 xl:-mr-10 2xl:-mr-16">
                <LandingHeroShowcase />
              </div>
            </div>
          </section>

          <section
            id="product"
            className="scroll-mt-20 bg-white px-4 py-20 text-slate-950 dark:bg-[#0a151f] dark:text-white sm:px-6 sm:py-24 lg:px-10 lg:py-28 xl:px-14"
          >
            <div className="mx-auto max-w-[1400px]">
              <div className="mb-12 max-w-4xl sm:mb-16 lg:mb-20">
                <div aria-hidden="true" className="mb-7 h-1 w-20 bg-[#f6bd2c]" />
                <h2 className="text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                  One suite. The right view for every role.
                </h2>
                <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-slate-600 dark:text-zinc-300 sm:text-lg sm:leading-8">
                  Each workspace keeps the school, classroom, family, and role context clear.
                </p>
              </div>

              <div id="role-views" className="scroll-mt-24">
                <LandingRoleShowcase />
              </div>
            </div>
          </section>

          <section
            id="in-schools"
            className="scroll-mt-20 bg-[#f5f3ee] px-4 py-20 text-slate-950 dark:bg-[#0d1b26] dark:text-white sm:px-6 sm:py-24 lg:px-10 lg:py-28 xl:px-14"
          >
            <div className="mx-auto grid max-w-[1400px] items-center gap-5 lg:grid-cols-[1.08fr_0.82fr_0.8fr] xl:gap-7">
              <div className="relative aspect-[1.18/1] overflow-hidden rounded-[1.5rem] bg-slate-200 shadow-[0_24px_60px_rgba(20,30,36,0.12)] dark:bg-slate-900">
                <Image
                  src="/brand/the-bee-suite/usage/bee-suite-classroom-daily-updates.png"
                  alt="A teacher using The BEE Suite on a tablet in a preschool classroom"
                  fill
                  sizes="(max-width: 1024px) 100vw, 43vw"
                  className="object-cover object-center"
                />
              </div>
              <div className="relative aspect-[1.03/1] overflow-hidden rounded-[1.5rem] bg-slate-200 shadow-[0_24px_60px_rgba(20,30,36,0.12)] dark:bg-slate-900 lg:translate-y-10">
                <Image
                  src="/brand/the-bee-suite/usage/bee-suite-director-operations.png"
                  alt="Two school leaders using The BEE Suite together in a childcare office"
                  fill
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover object-center"
                />
              </div>
              <div className="px-1 pt-10 lg:pl-8 lg:pt-0 xl:pl-12">
                <div aria-hidden="true" className="mb-7 h-1 w-16 bg-[#f6bd2c]" />
                <h2 className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.05em] sm:text-5xl">
                  Built for the way schools actually work.
                </h2>
                <div className="mt-8 space-y-5 text-base leading-7 text-slate-600 dark:text-zinc-300">
                  <p className="border-l-2 border-amber-400 pl-4">Welcome families with a smoother front desk.</p>
                  <p className="border-l-2 border-amber-400 pl-4">Keep classroom updates close at hand.</p>
                  <p className="border-l-2 border-amber-400 pl-4">Give leaders one clear operating picture.</p>
                </div>
                <Link
                  href="#workspaces"
                  className="mt-9 inline-flex min-h-11 touch-manipulation items-center gap-2 border-b border-amber-500 pb-1 text-sm font-semibold text-slate-950 transition-colors hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-4 dark:text-white dark:hover:text-amber-300 dark:focus-visible:ring-amber-300 dark:focus-visible:ring-offset-[#0d1b26]"
                >
                  See how the day connects
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
            </div>
          </section>

          <section
            id="workspaces"
            className="scroll-mt-20 bg-white px-4 py-20 text-slate-950 dark:bg-[#071018] dark:text-white sm:px-6 sm:py-24 lg:px-10 lg:py-28 xl:px-14"
          >
            <div className="mx-auto max-w-[1400px]">
              <div className="max-w-4xl">
                <h2 className="text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                  Your workspace is ready.
                </h2>
                <p className="mt-5 text-base leading-7 text-slate-600 dark:text-zinc-300 sm:text-lg">
                  Choose the view that matches how you use The BEE Suite.
                </p>
              </div>

              <div className="mt-10 grid gap-x-16 lg:grid-cols-2">
                {workspaces.map((workspace) => (
                  <WorkspaceLink key={workspace.href} {...workspace} />
                ))}
              </div>

              <Link href="/login" className={`${primaryLinkClass} mt-10`}>
                Sign In to The BEE Suite
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </section>

          <section id="get-started" className="scroll-mt-20 border-y border-white/10 bg-[#0b1b27] px-4 py-10 sm:px-6 lg:px-10 xl:px-14">
            <div className="mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-12">
              <h2 className="text-2xl font-semibold tracking-[-0.035em] text-white sm:text-3xl">New to The BEE Suite?</h2>
              <div className="grid border-white/15 sm:grid-cols-2 lg:grid-cols-4 lg:border-l">
                {gettingStartedLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex min-h-14 touch-manipulation items-center justify-between gap-3 border-b border-white/15 py-3 text-sm font-medium text-zinc-200 transition-colors hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-inset sm:px-5 lg:border-b-0 lg:border-r"
                  >
                    {item.label}
                    <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-amber-300 transition-transform motion-safe:group-hover:translate-x-1" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </main>

        <footer className="relative border-t border-white/10 bg-[#071018] px-4 py-9 sm:px-6 lg:px-10 xl:px-14">
          <div className="mx-auto max-w-[1400px]">
            <div className="flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                <Link href="/resources" className="inline-flex min-h-11 touch-manipulation items-center text-sm font-medium text-zinc-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                  Help &amp; Guides
                </Link>
                <Link href="/support" className="inline-flex min-h-11 touch-manipulation items-center text-sm font-medium text-zinc-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                  Support
                </Link>
              </div>
              <Link href="/login" className="inline-flex min-h-11 touch-manipulation items-center gap-2 text-sm font-semibold text-amber-300 transition-colors hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                Sign In
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <div className="flex flex-col gap-6 pt-8 sm:flex-row sm:items-center sm:justify-between">
              <BrandLogo href="/" compact size="sm" className="min-h-11 touch-manipulation" />
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-400">
                <Link href="/privacy" className="inline-flex min-h-11 touch-manipulation items-center transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                  Privacy
                </Link>
                <Link href="/terms" className="inline-flex min-h-11 touch-manipulation items-center transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                  Terms
                </Link>
                <Link href="/app" className="inline-flex min-h-11 touch-manipulation items-center transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                  Use on your device
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
