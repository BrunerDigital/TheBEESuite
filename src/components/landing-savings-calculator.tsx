"use client";

import { useMemo, useState } from "react";
import { Calculator, Clock, DollarSign, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EstimateField = {
  id: "centers" | "children" | "staff" | "hourlyRate" | "weeklyTuition";
  label: string;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
};

const fields: EstimateField[] = [
  { id: "centers", label: "Schools", min: 1, max: 75, step: 1 },
  { id: "children", label: "Enrolled children", min: 25, max: 6000, step: 25 },
  { id: "staff", label: "Teachers and staff", min: 5, max: 900, step: 5 },
  { id: "hourlyRate", label: "Admin hourly cost", min: 15, max: 55, step: 1, prefix: "$" },
  { id: "weeklyTuition", label: "Average weekly tuition", min: 125, max: 650, step: 5, prefix: "$" },
];

const initialEstimate = {
  centers: 3,
  children: 280,
  staff: 42,
  hourlyRate: 24,
  weeklyTuition: 235,
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function LandingSavingsCalculator() {
  const [estimate, setEstimate] = useState(initialEstimate);

  const result = useMemo(() => {
    const enrollmentHours = estimate.centers * 7 + estimate.children * 0.05;
    const billingHours = estimate.centers * 6 + estimate.children * 0.035;
    const classroomHours = estimate.staff * 0.35 + estimate.children * 0.04;
    const complianceHours = estimate.centers * 5 + estimate.staff * 0.18;
    const monthlyHours = Math.round(enrollmentHours + billingHours + classroomHours + complianceHours);
    const monthlyLaborValue = monthlyHours * estimate.hourlyRate;
    const visibleSeatOpportunity = Math.max(estimate.centers, Math.round(estimate.children * 0.025));
    const monthlySeatValue = visibleSeatOpportunity * estimate.weeklyTuition * 4.33;
    return {
      monthlyHours,
      monthlyLaborValue,
      visibleSeatOpportunity,
      monthlySeatValue,
      blendedPlanningValue: monthlyLaborValue + monthlySeatValue,
    };
  }, [estimate]);

  function updateField(field: EstimateField, rawValue: string) {
    const parsed = Number(rawValue);
    const nextValue = clamp(parsed, field.min, field.max);
    setEstimate((current) => ({ ...current, [field.id]: nextValue }));
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-xl border border-white/10 bg-black/25 p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl border border-amber-300/25 bg-amber-300/10 text-amber-300">
            <Calculator className="size-5" />
          </span>
          <div>
            <h3 className="text-xl font-semibold text-white">Estimate your monthly operating drag</h3>
            <p className="mt-1 text-sm leading-6 text-zinc-400">Adjust the assumptions for a directional planning conversation.</p>
          </div>
        </div>
        <div className="mt-6 space-y-5">
          {fields.map((field) => (
            <div key={field.id}>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`savings-${field.id}`} className="text-sm text-zinc-200">
                  {field.label}
                </Label>
                <div className="w-28">
                  <Input
                    id={`savings-${field.id}`}
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={estimate[field.id]}
                    onChange={(event) => updateField(field, event.target.value)}
                    className="h-10 border-white/10 bg-black/35 text-right text-white"
                    aria-label={field.label}
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="w-12 text-xs text-zinc-500">
                  {field.prefix}{number(field.min)}{field.suffix}
                </span>
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={estimate[field.id]}
                  onChange={(event) => updateField(field, event.target.value)}
                  className="h-2 flex-1 cursor-pointer accent-amber-300"
                  aria-label={`${field.label} slider`}
                />
                <span className="w-16 text-right text-xs text-zinc-500">
                  {field.prefix}{number(field.max)}{field.suffix}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-sky-300/20 bg-sky-300/[0.08] p-5">
          <Clock className="size-6 text-sky-200" />
          <div className="mt-5 text-4xl font-semibold tracking-normal text-white">{number(result.monthlyHours)}</div>
          <div className="mt-2 text-sm font-medium text-sky-100">estimated hours exposed each month</div>
          <p className="mt-3 text-sm leading-6 text-zinc-300">Lead follow-up, manual billing work, classroom note reconstruction, document chasing, and compliance prep.</p>
        </div>
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] p-5">
          <DollarSign className="size-6 text-emerald-200" />
          <div className="mt-5 text-4xl font-semibold tracking-normal text-white">{money(result.monthlyLaborValue)}</div>
          <div className="mt-2 text-sm font-medium text-emerald-100">estimated admin time value</div>
          <p className="mt-3 text-sm leading-6 text-zinc-300">A planning value for replacing repeat spreadsheet, inbox, and paper packet work with connected workflows.</p>
        </div>
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.08] p-5">
          <TrendingUp className="size-6 text-amber-200" />
          <div className="mt-5 text-4xl font-semibold tracking-normal text-white">{number(result.visibleSeatOpportunity)}</div>
          <div className="mt-2 text-sm font-medium text-amber-100">seats to watch before they sit open</div>
          <p className="mt-3 text-sm leading-6 text-zinc-300">A simple forecast target for upcoming starts, move-ups, waitlist fit, and rooms drifting below capacity.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.05] p-5">
          <Calculator className="size-6 text-zinc-200" />
          <div className="mt-5 text-4xl font-semibold tracking-normal text-white">{money(result.blendedPlanningValue)}</div>
          <div className="mt-2 text-sm font-medium text-zinc-100">monthly planning value to review</div>
          <p className="mt-3 text-sm leading-6 text-zinc-400">Directional only. Actual savings depend on process, adoption, tuition, staffing, and center configuration.</p>
        </div>
      </div>
    </div>
  );
}
