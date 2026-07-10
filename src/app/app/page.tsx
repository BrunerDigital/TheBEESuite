import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  DoorOpen,
  GraduationCap,
  LogIn,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";

export const metadata: Metadata = {
  title: "The BEE Suite App",
  description: "Role-based launcher for The BEE Suite parent, teacher, director, executive, and kiosk workflows.",
};

const roleOptions: Array<{
  title: string;
  eyebrow: string;
  href: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    title: "Parents",
    eyebrow: "Family phone app",
    href: "/parents",
    description: "Open the Parent Portal for child updates, documents, balances, messages, and tuition payments.",
    icon: UsersRound,
  },
  {
    title: "Teachers",
    eyebrow: "Classroom tablet",
    href: "/teachers",
    description: "Open classroom attendance, daily reports, photos, family updates, and teacher clock-in tools.",
    icon: GraduationCap,
  },
  {
    title: "Directors",
    eyebrow: "School workspace",
    href: "/directors",
    description: "Open school operations for enrollment, billing, staffing, compliance, reports, and setup.",
    icon: Building2,
  },
  {
    title: "Executives",
    eyebrow: "Corporate office",
    href: "/executives",
    description: "Open multi-location visibility, FTE review, account setup, reporting, and platform controls.",
    icon: ShieldCheck,
  },
  {
    title: "Kiosk",
    eyebrow: "Lobby tablet",
    href: "/check-in",
    description: "Open family check-in/out, authorized pickup verification, and staff clock-in/out.",
    icon: DoorOpen,
  },
];

export default function AppLauncherPage() {
  return (
    <main className="min-h-screen bg-[#05070a] text-white">
      <section className="relative overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(245,181,27,0.18),transparent_28rem),radial-gradient(circle_at_82%_18%,rgba(56,189,248,0.12),transparent_30rem),linear-gradient(135deg,#05070a_0%,#091018_58%,#1a1306_100%)]" />
        <div className="relative mx-auto flex min-h-[calc(100svh-2rem)] max-w-[1180px] flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 py-1.5">
            <BrandLogo href="/" compact size="sm" priority />
            <Button variant="outline" className="h-8 border-white/15 bg-white/[0.04] px-3 text-xs font-semibold text-white hover:bg-white/10" nativeButton={false} render={<Link href="/login" />}>
              <LogIn data-icon="inline-start" className="size-3.5" />
              Log in
            </Button>
          </header>

          <div className="flex flex-1 flex-col justify-center gap-4 py-3 sm:gap-6 sm:py-5 lg:py-7">
            <div className="max-w-3xl">
              <div className="flex items-start gap-2">
                <h1 className="text-2xl font-semibold leading-tight tracking-normal text-white sm:text-4xl lg:text-5xl">
                  Choose how you are using The BEE Suite today.
                </h1>
                <InfoTip label="About these options" side="bottom" align="end" className="mt-1 text-slate-400 hover:text-white">
                  Pick the workflow for this device. Each button opens the correct workspace in the same secure app.
                </InfoTip>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {roleOptions.map((option) => (
                <Link
                  key={option.title}
                  href={option.href}
                  aria-label={`${option.title}: ${option.description}`}
                  className="group grid min-h-[74px] grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.055] p-3 shadow-2xl shadow-black/20 backdrop-blur-xl transition hover:border-amber-300/70 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-amber-300/45 sm:min-h-[132px] sm:grid-cols-1 sm:items-stretch sm:p-4"
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-300 text-slate-950 sm:size-11">
                    <option.icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-200">{option.eyebrow}</div>
                    <h2 className="mt-1 text-lg font-semibold tracking-normal text-white sm:text-xl">{option.title}</h2>
                    <p className="mt-1 hidden text-xs leading-5 text-slate-300 sm:block sm:text-sm">{option.description}</p>
                  </div>
                  <div className="flex items-center sm:items-start sm:justify-end">
                    <ArrowRight className="size-5 text-slate-500 transition group-hover:translate-x-1 group-hover:text-amber-300" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
