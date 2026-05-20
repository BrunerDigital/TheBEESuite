"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarCheck2,
  CheckCircle2,
  CreditCard,
  Hexagon,
  LineChart,
  MessageSquareText,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const kpis = [
  { label: "Active Enrollments", value: "128", trend: "+8 vs last month", icon: UsersRound, tone: "text-amber-300" },
  { label: "Open Inquiries", value: "27", trend: "+5 this week", icon: MessageSquareText, tone: "text-sky-300" },
  { label: "Occupancy Rate", value: "87%", trend: "+4% vs last month", icon: LineChart, tone: "text-emerald-300" },
  { label: "Collected MTD", value: "$48.3k", trend: "+12% vs last month", icon: CreditCard, tone: "text-violet-300" },
];

const pipelineStages = [
  ["New Inquiry", 18, "from-amber-400/85 to-amber-500/35"],
  ["Tour Scheduled", 12, "from-yellow-300/80 to-amber-500/25"],
  ["Application", 9, "from-amber-300/65 to-yellow-500/20"],
  ["Offer Extended", 6, "from-lime-300/55 to-lime-500/15"],
  ["Enrolled", 9, "from-emerald-300/45 to-emerald-500/15"],
];

const slides = [
  {
    title: "Command center",
    body: "Executive visibility across enrollment, occupancy, staff ratios, billing readiness, and center tasks.",
    render: CommandCenterPreview,
  },
  {
    title: "Inquiry to tour",
    body: "Website forms route to the right school, notify the team, back up to Sheets, and create a workable CRM lead.",
    render: InquiryRoutingPreview,
  },
  {
    title: "School day loop",
    body: "Lobby check-in, teacher updates, parent photos, daily reports, and director oversight stay connected.",
    render: SchoolDayPreview,
  },
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

function HiveMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative block size-10 text-amber-300", className)} aria-hidden="true">
      <Hexagon className="absolute left-0 top-1 size-5" strokeWidth={2.2} />
      <Hexagon className="absolute left-[17px] top-1 size-5" strokeWidth={2.2} />
      <Hexagon className="absolute left-[8px] top-[17px] size-5" strokeWidth={2.2} />
    </span>
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

function CommandCenterPreview() {
  return (
    <div className="grid min-h-[560px] lg:grid-cols-[210px_1fr]">
      <aside className="hidden border-r border-white/10 bg-black/25 p-4 lg:block">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl border border-amber-300/35 bg-amber-400/15 text-amber-300">
            <HiveMark className="scale-75" />
          </span>
          <div>
            <div className="text-sm font-semibold text-amber-300">The Bee Suite</div>
            <div className="mt-1 text-[0.66rem] text-zinc-500">Childcare CRM</div>
          </div>
        </div>
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
              <ArrowRight className="size-5 text-amber-300" />
            </div>
            <div className="grid overflow-hidden rounded-lg border border-amber-300/30 sm:grid-cols-5">
              {pipelineStages.map(([label, count, gradient]) => (
                <div key={label as string} className={cn("bg-gradient-to-br px-3 py-3 text-center", gradient as string)}>
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
                ["Birthday reminders", "Celebrate Ava, Logan, Mia", Sparkles, "text-amber-300"],
                ["Records expiring", "4 children need updates", ShieldCheck, "text-red-300"],
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
  );
}

function InquiryRoutingPreview() {
  const routeSteps = [
    ["Inquiry form", "Parent submits program and location"],
    ["CRM lead", "Stage, family, child, and source are created"],
    ["Location alert", "Director and school inbox receive the lead"],
    ["Backup row", "Google Sheet keeps the intake record"],
  ];

  return (
    <div className="relative min-h-[560px] overflow-hidden p-5 sm:p-7">
      <div className="absolute right-4 top-5 h-28 w-44 opacity-25 hive-texture" />
      <div className="relative grid gap-5 lg:grid-cols-[0.76fr_1fr] lg:items-center">
        <GlassPanel className="p-5">
          <div className="text-sm font-semibold text-white">Embedded inquiry form</div>
          <div className="mt-5 space-y-4">
            {["Parent name", "Email", "Phone", "Program", "Preferred location"].map((label, index) => (
              <div key={label}>
                <div className="mb-1 text-[0.68rem] text-zinc-500">{label}</div>
                <div className="h-10 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-zinc-300">
                  {index === 3 ? "Preschool" : index === 4 ? "Oak Ridge Center" : index === 0 ? "Avery Johnson" : ""}
                </div>
              </div>
            ))}
            <div className="rounded-lg bg-amber-300 py-2 text-center text-sm font-semibold text-[#12151b]">Submit inquiry</div>
          </div>
        </GlassPanel>
        <div className="space-y-3">
          {routeSteps.map(([title, body], index) => (
            <div key={title} className="relative rounded-xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-md">
              <div className="flex items-start gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-amber-300/25 bg-amber-300/10 text-sm font-semibold text-amber-300">
                  {index + 1}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <div className="mt-1 text-sm leading-5 text-zinc-400">{body}</div>
                </div>
              </div>
              {index < routeSteps.length - 1 ? <div className="absolute -bottom-3 left-9 h-3 w-px bg-amber-300/40" /> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SchoolDayPreview() {
  return (
    <div className="relative min-h-[560px] overflow-hidden p-5 sm:p-7">
      <div className="absolute -left-16 bottom-0 size-64 rounded-full bg-sky-400/10 blur-3xl" />
      <div className="grid gap-4 lg:grid-cols-[1fr_0.82fr]">
        <GlassPanel className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Lobby check-in</div>
              <div className="mt-1 text-xs text-zinc-500">Guardian PIN verified</div>
            </div>
            <CheckCircle2 className="size-5 text-emerald-300" />
          </div>
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-black/30 p-4 text-center">
            <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Enter 4 digit PIN</div>
            <div className="mt-4 flex justify-center gap-3">
              {[4, 8, 2, 1].map((digit) => (
                <div key={digit} className="grid size-12 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-xl font-semibold text-white">
                  {digit}
                </div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }, (_, index) => (
                <div key={index} className="rounded-xl bg-white/[0.05] py-3 text-sm text-zinc-300">
                  {index + 1}
                </div>
              ))}
            </div>
          </div>
        </GlassPanel>
        <div className="grid gap-4">
          <GlassPanel className="p-5">
            <div className="text-sm font-semibold text-white">Teacher update</div>
            <div className="mt-4 aspect-[16/10] rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_35%_30%,rgba(245,181,27,0.28),transparent_12rem),linear-gradient(135deg,#111827,#06080b)] p-4">
              <div className="h-full rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="h-20 rounded-xl bg-amber-300/20" />
                <div className="mt-4 h-3 w-3/4 rounded bg-white/15" />
                <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
              </div>
            </div>
            <div className="mt-3 text-xs text-zinc-400">Photo, activity, nap, meal, and daily note prepared for parent view.</div>
          </GlassPanel>
          <GlassPanel className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Parent portal</div>
                <div className="mt-1 text-xs text-zinc-500">Shared moments and reports</div>
              </div>
              <MessageSquareText className="size-5 text-sky-300" />
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}

export function LandingHeroShowcase() {
  const [activeSlide, setActiveSlide] = useState(0);
  const ActivePreview = slides[activeSlide].render;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 7200);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="relative">
      <div className="absolute -right-5 -top-8 hidden h-40 w-48 opacity-50 hive-texture lg:block" />
      <GlassPanel className="relative overflow-hidden rounded-2xl border-amber-300/20 bg-[#090d12]/90">
        <div className="flex flex-col gap-4 border-b border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-amber-300/80">Live product view</div>
            <div className="mt-1 text-sm text-zinc-300">{slides[activeSlide].title}</div>
            <div className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">{slides[activeSlide].body}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous hero slide"
              onClick={() => setActiveSlide((current) => (current - 1 + slides.length) % slides.length)}
              className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-amber-300/35 hover:text-amber-300"
            >
              <ArrowLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next hero slide"
              onClick={() => setActiveSlide((current) => (current + 1) % slides.length)}
              className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-amber-300/35 hover:text-amber-300"
            >
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
        <div className="relative">
          <ActivePreview />
        </div>
        <div className="flex gap-2 border-t border-white/10 bg-black/20 p-4">
          {slides.map((slide, index) => (
            <button
              key={slide.title}
              type="button"
              onClick={() => setActiveSlide(index)}
              className={cn(
                "h-2 flex-1 rounded-full transition",
                index === activeSlide ? "bg-amber-300" : "bg-white/15 hover:bg-white/30",
              )}
              aria-label={`Show ${slide.title} slide`}
            />
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
