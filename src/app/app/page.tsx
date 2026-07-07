import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  DoorOpen,
  FileText,
  GraduationCap,
  MonitorSmartphone,
  ShieldCheck,
  TabletSmartphone,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Install The BEE Suite App",
  description: "Installable app launcher for The BEE Suite kiosk, parent, teacher, and admin workflows.",
};

const roleOptions: Array<{
  title: string;
  eyebrow: string;
  href: string;
  description: string;
  icon: LucideIcon;
  items: string[];
}> = [
  {
    title: "Kiosk",
    eyebrow: "Lobby tablet",
    href: "/check-in",
    description:
      "School signs in, connects the tablet to the right location, then leaves the kiosk open for family check-in/out and staff clock-in/out.",
    icon: DoorOpen,
    items: ["Parent PIN and QR flow", "Authorized pickup verification", "Staff clock-in/out"],
  },
  {
    title: "Parents",
    eyebrow: "Family phone app",
    href: "/parents",
    description:
      "Families log in to see child dashboard details, classroom photos, messages, documents, balances, and tuition payment options.",
    icon: UsersRound,
    items: ["Child updates and photos", "Tuition and balances", "Messages and documents"],
  },
  {
    title: "Teachers",
    eyebrow: "Classroom tablet",
    href: "/teachers",
    description:
      "Teachers log in to their assigned classroom to take attendance, upload photos, fill out daily reports, message families, and clock in.",
    icon: GraduationCap,
    items: ["Classroom roster", "Reports and incidents", "Family photo updates"],
  },
  {
    title: "Directors",
    eyebrow: "School workspace",
    href: "/directors",
    description:
      "Directors continue into the school operations workspace for enrollment, billing, compliance, reporting, staffing, and setup.",
    icon: Building2,
    items: ["Enrollment and leads", "Billing readiness", "Operations reports"],
  },
  {
    title: "Executives",
    eyebrow: "Corporate office",
    href: "/executives",
    description:
      "Corporate users continue into the executive workspace for multi-location visibility, FTE review, account setup, and controls.",
    icon: ShieldCheck,
    items: ["Multi-location view", "FTE review", "Platform controls"],
  },
];

const platformNotes = [
  {
    title: "iPad and iPhone",
    detail: "Open this screen in Safari, use Share, then Add to Home Screen.",
    icon: TabletSmartphone,
  },
  {
    title: "Android and Fire tablets",
    detail: "Open this screen in Chrome or Silk, then choose Install app or Add to Home screen from the browser menu.",
    icon: MonitorSmartphone,
  },
  {
    title: "One source of truth",
    detail: "The installed app opens the same secured web app, so updates ship once and every device gets the latest version.",
    icon: ShieldCheck,
  },
];

const workflowSignals = [
  [ClipboardCheck, "Attendance"],
  [Camera, "Photos"],
  [FileText, "Reports"],
  [CreditCard, "Tuition"],
] satisfies Array<[LucideIcon, string]>;

function WorkflowSignalGrid({ className = "" }: { className?: string }) {
  return (
    <div className={`grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4 ${className}`}>
      {workflowSignals.map(([Icon, label]) => (
        <div key={label} className="rounded-lg border border-white/10 bg-white/[0.05] p-3">
          <Icon className="size-5 text-amber-300" />
          <div className="mt-2 text-sm font-semibold text-white">{label}</div>
        </div>
      ))}
    </div>
  );
}

function NativePackagingNote({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100 ${className}`}>
      App Store listings are split by role. The first iOS submission should wrap the parent login at /parents, then route signed-in guardians into the existing parent portal.
    </div>
  );
}

export default function AppLauncherPage() {
  return (
    <main className="min-h-screen bg-[#05070a] text-white">
      <section className="relative overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(245,181,27,0.18),transparent_28rem),radial-gradient(circle_at_82%_18%,rgba(56,189,248,0.12),transparent_30rem),linear-gradient(135deg,#05070a_0%,#091018_58%,#1a1306_100%)]" />
        <div className="relative mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[1400px] flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 py-2">
            <BrandLogo href="/" size="md" priority />
            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-10 border-white/15 bg-white/[0.04] px-4 text-white hover:bg-white/10" nativeButton={false} render={<Link href="/directors" />}>
                Log in
              </Button>
              <Button className="h-10 px-4" nativeButton={false} render={<Link href="/executives" />}>
                Executive login
              </Button>
            </div>
          </header>

          <div className="grid flex-1 gap-8 py-8 lg:grid-cols-[0.74fr_1fr] lg:items-center lg:py-10">
            <div className="max-w-2xl">
              <Badge className="bg-amber-300 text-slate-950">
                <CheckCircle2 data-icon="inline-start" />
                Installable app launcher
              </Badge>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-normal text-white sm:text-5xl lg:text-6xl">
                Choose how you are using The BEE Suite today.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
                Add this to the home screen on classroom tablets, lobby kiosks, parent phones, and leader devices. Each option opens the correct role-safe workflow in the same secure app.
              </p>

              <WorkflowSignalGrid className="mt-7 hidden lg:grid" />
              <NativePackagingNote className="mt-7 hidden lg:block" />
            </div>

            <div>
              <div className="grid gap-4 md:grid-cols-2">
                {roleOptions.map((option) => (
                  <Link
                    key={option.title}
                    href={option.href}
                    className="group flex h-full flex-col justify-between rounded-lg border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl transition hover:border-amber-300/70 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-amber-300/45"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div className="grid size-11 place-items-center rounded-lg bg-amber-300 text-slate-950">
                          <option.icon className="size-5" />
                        </div>
                        <ArrowRight className="mt-2 size-5 text-slate-500 transition group-hover:translate-x-1 group-hover:text-amber-300" />
                      </div>
                      <div className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">{option.eyebrow}</div>
                      <h2 className="mt-2 text-2xl font-semibold tracking-normal text-white">{option.title}</h2>
                      <p className="mt-3 text-sm leading-6 text-slate-300">{option.description}</p>
                    </div>
                    <div className="mt-5 grid gap-2">
                      {option.items.map((item) => (
                        <div key={item} className="flex items-center gap-2 text-sm text-slate-200">
                          <CheckCircle2 className="size-4 text-emerald-300" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
              <WorkflowSignalGrid className="mt-6 lg:hidden" />
              <NativePackagingNote className="mt-6 lg:hidden" />
            </div>
          </div>

          <footer className="grid gap-3 border-t border-white/10 py-5 md:grid-cols-3">
            {platformNotes.map((note) => (
              <div key={note.title} className="flex gap-3 rounded-lg border border-white/10 bg-black/15 p-4">
                <note.icon className="mt-0.5 size-5 text-sky-300" />
                <div>
                  <div className="text-sm font-semibold text-white">{note.title}</div>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{note.detail}</p>
                </div>
              </div>
            ))}
          </footer>
        </div>
      </section>
    </main>
  );
}
