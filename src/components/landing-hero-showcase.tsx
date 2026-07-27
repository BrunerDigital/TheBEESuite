"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const slides = [
  {
    id: "director",
    label: "Director desktop",
    title: "Run the school day from one operating view.",
    body: "Families, classrooms, attendance, daily reports, billing, records, and enrollment stay in the right school context.",
    src: "/brand/the-bee-suite/screenshots/2026-07-27-light/director-desktop-dashboard-light.png",
    width: 1425,
    height: 990,
    imageClass: "object-contain",
  },
  {
    id: "teacher",
    label: "Teacher iPad",
    title: "Document the day while the classroom keeps moving.",
    body: "Teachers can work from iPad-first daily-report, care-log, attendance, photo, incident, and message flows.",
    src: "/brand/the-bee-suite/screenshots/2026-07-27-light/teacher-ipad-daily-report-light.png",
    width: 1009,
    height: 1346,
    imageClass: "object-contain px-8 py-5 sm:px-16",
  },
  {
    id: "parent",
    label: "Parent iPhone",
    title: "Give families a focused mobile portal.",
    body: "Parents can review school-approved daily updates, invoices, documents, messages, and family account details.",
    src: "/brand/the-bee-suite/screenshots/2026-07-27-light/parent-iphone-overview-light.png",
    width: 375,
    height: 812,
    imageClass: "object-contain px-20 py-5 sm:px-32 lg:px-40",
  },
  {
    id: "executive",
    label: "Executive desktop",
    title: "Keep every school visible without flattening the details.",
    body: "Executive dashboards preserve location-level context across FTE reporting, access, readiness, and operating follow-up.",
    src: "/brand/the-bee-suite/screenshots/2026-07-27-light/executive-desktop-dashboard-light.png",
    width: 1425,
    height: 990,
    imageClass: "object-contain",
  },
] as const;

export function LandingHeroShowcase() {
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = slides[activeSlide];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 7600);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="relative">
      <div className="absolute -right-5 -top-8 hidden h-40 w-48 opacity-50 hive-texture lg:block" />
      <div className="relative overflow-hidden rounded-2xl border border-amber-300/20 bg-[#090d12]/92 shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-4 border-b border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/90">
              <CheckCircle2 className="size-4" />
              Current light-mode product
            </div>
            <div className="mt-2 text-base font-semibold text-white">{slide.label}</div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400">
              {slide.title} {slide.body}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Previous product screenshot"
              onClick={() => setActiveSlide((current) => (current - 1 + slides.length) % slides.length)}
              className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-amber-300/35 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <ArrowLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next product screenshot"
              onClick={() => setActiveSlide((current) => (current + 1) % slides.length)}
              className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-amber-300/35 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>

        <div className="relative min-h-[560px] bg-[#f7f8fa] sm:min-h-[620px]">
          <Image
            key={slide.id}
            src={slide.src}
            alt={`${slide.label} view of The BEE Suite`}
            fill
            sizes="(max-width: 1024px) 100vw, 58vw"
            className={cn("select-none", slide.imageClass)}
            priority={activeSlide === 0}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-white/10 bg-black/25 p-3 sm:grid-cols-4">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSlide(index)}
              className={cn(
                "min-w-0 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                index === activeSlide
                  ? "border-amber-300/45 bg-amber-300/12 text-amber-200"
                  : "border-white/10 bg-white/[0.035] text-zinc-400 hover:border-white/20 hover:text-white",
              )}
              aria-label={`Show ${item.label} screenshot`}
              aria-pressed={index === activeSlide}
            >
              <span className="block truncate">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
