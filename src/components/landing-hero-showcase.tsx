"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type DeviceKind = "desktop" | "tablet" | "phone";

const roleViews = [
  {
    id: "director",
    label: "Directors",
    title: "Run the school day from one operating view.",
    body: "Enrollment, classrooms, attendance, family communication, billing, records, and reporting stay in the right school context.",
    src: "/brand/the-bee-suite/screenshots/current/director-desktop-dashboard-light.png",
    alt: "Director daily operations dashboard in The BEE Suite",
    device: "desktop" as const,
    href: "/directors",
  },
  {
    id: "teacher",
    label: "Teachers",
    title: "Keep classroom updates close at hand.",
    body: "Tablet-first attendance, care logs, daily reports, photos, incidents, and messages support the classroom without adding end-of-day paperwork.",
    src: "/brand/the-bee-suite/screenshots/current/teacher-ipad-daily-report-light.png",
    alt: "Teacher daily report workspace on an iPad in The BEE Suite",
    device: "tablet" as const,
    href: "/teachers",
  },
  {
    id: "family",
    label: "Families",
    title: "Give families one focused mobile portal.",
    body: "School-approved daily updates, documents, messages, invoices, and family account details stay clear on the device parents already use.",
    src: "/brand/the-bee-suite/screenshots/current/parent-iphone-overview-light.png",
    alt: "Parent family portal on an iPhone in The BEE Suite",
    device: "phone" as const,
    href: "/parents",
  },
  {
    id: "executive",
    label: "Multi-school teams",
    title: "See every school without flattening the details.",
    body: "Multi-location oversight preserves the location context leaders need for reporting, readiness, access, and operating follow-up.",
    src: "/brand/the-bee-suite/screenshots/current/executive-desktop-dashboard-light.png",
    alt: "Executive multi-school dashboard in The BEE Suite",
    device: "desktop" as const,
    href: "/executives",
  },
] as const;

function LaptopDevice({
  src,
  alt,
  className,
  preload = false,
}: {
  src: string;
  alt: string;
  className?: string;
  preload?: boolean;
}) {
  return (
    <div data-device="laptop" className={cn("relative", className)}>
      <div className="relative overflow-hidden rounded-[1rem] border-[5px] border-[#111820] bg-[#111820] shadow-[0_34px_70px_rgba(0,0,0,0.38)] sm:rounded-[1.35rem] sm:border-[7px]">
        <div className="pointer-events-none absolute left-1/2 top-0 z-20 h-2 w-12 -translate-x-1/2 rounded-b-lg bg-[#111820] sm:h-2.5 sm:w-16" />
        <div className="relative aspect-[1.44/1] overflow-hidden bg-[#f7f5f0]">
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(max-width: 768px) 86vw, (max-width: 1280px) 58vw, 46vw"
            className="object-cover object-top"
            loading={preload ? "eager" : undefined}
            fetchPriority={preload ? "high" : undefined}
          />
        </div>
      </div>
      <div aria-hidden="true" className="mx-auto h-2 w-[108%] -translate-x-[3.7%] rounded-b-[65%] bg-[linear-gradient(180deg,#9da3a6,#31383e_48%,#151a1e)] shadow-[0_8px_18px_rgba(0,0,0,0.3)]" />
    </div>
  );
}

function TabletDevice({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div
      data-device="tablet"
      className={cn(
        "relative overflow-hidden rounded-[1.5rem] border-[7px] border-[#151b20] bg-[#151b20] shadow-[0_30px_70px_rgba(0,0,0,0.4)]",
        className,
      )}
    >
      <span aria-hidden="true" className="absolute left-1/2 top-1.5 z-20 size-1 -translate-x-1/2 rounded-full bg-white/25" />
      <div className="relative aspect-[0.75/1] overflow-hidden rounded-[1rem] bg-[#f7f5f0]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 43vw, (max-width: 1280px) 25vw, 18vw"
          className="object-cover object-top"
        />
      </div>
    </div>
  );
}

function PhoneDevice({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div
      data-device="phone"
      className={cn(
        "relative overflow-hidden rounded-[1.65rem] border-[6px] border-[#141a20] bg-[#141a20] shadow-[0_28px_60px_rgba(0,0,0,0.4)]",
        className,
      )}
    >
      <span aria-hidden="true" className="absolute left-1/2 top-1 z-20 h-2 w-10 -translate-x-1/2 rounded-full bg-[#141a20]" />
      <div className="relative aspect-[0.462/1] overflow-hidden rounded-[1.15rem] bg-[#f7f5f0]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 28vw, (max-width: 1280px) 15vw, 10vw"
          className="object-cover object-top"
        />
      </div>
    </div>
  );
}

function DeviceForRole({ device, src, alt }: { device: DeviceKind; src: string; alt: string }) {
  if (device === "phone") {
    return <PhoneDevice src={src} alt={alt} className="mx-auto w-[11.5rem] sm:w-[14rem] lg:w-[16rem]" />;
  }

  if (device === "tablet") {
    return <TabletDevice src={src} alt={alt} className="mx-auto w-[18rem] sm:w-[23rem] lg:w-[27rem]" />;
  }

  return <LaptopDevice src={src} alt={alt} className="mx-auto w-full max-w-[50rem]" />;
}

export function LandingHeroShowcase() {
  return (
    <div className="relative mx-auto h-[25rem] w-full max-w-[50rem] sm:h-[34rem] lg:h-[38rem] xl:h-[42rem]">
      <div className="absolute left-[4%] right-[4%] top-0 h-[clamp(11rem,52vw,12.75rem)] w-auto overflow-hidden rounded-[1.4rem] border border-white/10 opacity-95 shadow-[0_24px_64px_rgba(0,0,0,0.3)] sm:left-auto sm:right-0 sm:h-[42%] sm:w-[34%] sm:rounded-[1.8rem] xl:-right-8">
        <Image
          src="/brand/the-bee-suite/usage/bee-suite-lobby-check-in.png"
          alt="A parent and school director using The BEE Suite at a childcare front desk"
          fill
          sizes="(max-width: 639px) 92vw, (max-width: 768px) 34vw, 20vw"
          className="object-cover object-[52%_40%]"
        />
      </div>

      <LaptopDevice
        src="/brand/the-bee-suite/screenshots/current/director-desktop-dashboard-light.png"
        alt="The BEE Suite director dashboard on a laptop"
        className="absolute bottom-[10%] left-[11%] z-10 w-[78%]"
        preload
      />
      <TabletDevice
        src="/brand/the-bee-suite/screenshots/current/teacher-ipad-daily-report-light.png"
        alt="The BEE Suite teacher daily report on a tablet"
        className="absolute bottom-0 right-[1%] z-20 w-[28%] rotate-[2.5deg]"
      />
      <PhoneDevice
        src="/brand/the-bee-suite/screenshots/current/parent-iphone-overview-light.png"
        alt="The BEE Suite parent portal on a phone"
        className="absolute bottom-[2%] left-[3%] z-20 w-[17%] -rotate-[1.5deg]"
      />
    </div>
  );
}

export function LandingRoleShowcase() {
  const [activeId, setActiveId] = useState<(typeof roleViews)[number]["id"]>("director");
  const activeView = roleViews.find((view) => view.id === activeId) ?? roleViews[0];

  return (
    <div className="grid items-center gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16 xl:gap-24">
      <div>
        <div
          role="tablist"
          aria-label="Product views by role"
          className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-900/12 px-1 pb-px [scrollbar-width:none] dark:border-white/12 [&::-webkit-scrollbar]:hidden"
        >
          {roleViews.map((view) => (
            <button
              key={view.id}
              id={`role-tab-${view.id}`}
              type="button"
              role="tab"
              aria-selected={activeId === view.id}
              aria-controls="role-product-panel"
              onClick={() => setActiveId(view.id)}
              className={cn(
                "relative min-h-12 shrink-0 touch-manipulation px-2 py-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-amber-300 dark:focus-visible:ring-offset-[#071018] sm:px-3 sm:text-sm",
                activeId === view.id
                  ? "text-amber-700 after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-amber-500 dark:text-amber-300"
                  : "text-slate-500 hover:text-slate-950 dark:text-zinc-400 dark:hover:text-white",
              )}
            >
              {view.label}
            </button>
          ))}
        </div>

        <div className="mt-8">
          <h3 className="text-balance text-2xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-white sm:text-3xl">
            {activeView.title}
          </h3>
          <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-slate-600 dark:text-zinc-300">
            {activeView.body}
          </p>
          <Link
            href={activeView.href}
            className="mt-7 inline-flex min-h-11 touch-manipulation items-center gap-2 border-b border-amber-500 pb-1 text-sm font-semibold text-slate-950 transition-colors hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-4 dark:text-white dark:hover:text-amber-300"
          >
            Explore {activeView.label.toLowerCase()} workspace
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>

      <div
        id="role-product-panel"
        role="tabpanel"
        aria-labelledby={`role-tab-${activeView.id}`}
        className="relative min-h-[22rem] content-center sm:min-h-[31rem] lg:min-h-[36rem]"
      >
        <div aria-hidden="true" className="absolute inset-x-[8%] bottom-[5%] h-[28%] rounded-full bg-amber-200/28 blur-3xl dark:bg-amber-300/[0.06]" />
        <div key={activeView.id} className="relative motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
          <DeviceForRole device={activeView.device} src={activeView.src} alt={activeView.alt} />
        </div>
      </div>
    </div>
  );
}
