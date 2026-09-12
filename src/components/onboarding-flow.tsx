"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  LockKeyhole,
  Mail,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SchoolDataSetupPath, SchoolDataSourceSystem } from "@/lib/school-data-setup";
import { ONBOARDING_DRAFT_STORAGE_KEY, parseOnboardingDraft, serializeOnboardingDraft } from "@/lib/onboarding-draft";
import { parseOnboardingLocationRoster } from "@/lib/onboarding-location-roster";
import { cn } from "@/lib/utils";

const steps = [
  {
    title: "Brand",
    icon: Building2,
    fields: ["brandName", "workEmail"],
  },
  {
    title: "Centers",
    icon: MapPin,
    fields: ["centerCount", "state"],
  },
  {
    title: "Starting data",
    icon: ClipboardList,
    fields: ["dataSetupPath"],
  },
  {
    title: "Payouts",
    icon: BadgeDollarSign,
    fields: ["softwarePlan", "addOnBundle", "merchantFeeStrategy", "payoutAdminName", "payoutAdminEmail", "payoutReadiness"],
  },
  {
    title: "Launch",
    icon: Clock3,
    fields: ["timeline", "priority"],
  },
  {
    title: "Review",
    icon: ShieldCheck,
    fields: [],
  },
];

type FormState = {
  brandName: string;
  workEmail: string;
  centerCount: string;
  state: string;
  locationRoster: string;
  timeline: string;
  priority: string;
  payoutAdminName: string;
  payoutAdminEmail: string;
  payoutReadiness: string;
  softwarePlan: string;
  addOnBundle: string;
  merchantFeeStrategy: string;
  dataSetupPath: SchoolDataSetupPath | "";
  dataSourceSystem: SchoolDataSourceSystem | "";
  noCurrentFamiliesExpected: boolean;
  notes: string;
};

type WorkspaceSetup = {
  existingWorkspace?: boolean;
  status?: string;
  notificationId?: string;
  tenantId?: string;
  tenantName?: string;
  tenantSlug?: string;
  ownerGroupId?: string;
  ownerGroupName?: string;
  ownerGroupType?: string;
  accessScope?: string;
  organizationId?: string | null;
  organizationName?: string;
  centerId?: string;
  centerName?: string;
  centerCount?: number;
  centers?: Array<{ id: string; name: string }>;
  schoolSetupStatus?: string;
  dataSetupPath?: string;
  userId?: string;
  loginUrl?: string;
  embedCode?: string;
  auth?: {
    user?: {
      ok?: boolean;
      created?: boolean;
      alreadyExisted?: boolean;
      error?: string;
    };
    passwordReset?: {
      ok?: boolean;
      status?: number;
      error?: string;
    };
  };
};

const initialForm: FormState = {
  brandName: "",
  workEmail: "",
  centerCount: "",
  state: "",
  locationRoster: "",
  timeline: "",
  priority: "",
  payoutAdminName: "",
  payoutAdminEmail: "",
  payoutReadiness: "",
  softwarePlan: "",
  addOnBundle: "",
  merchantFeeStrategy: "",
  dataSetupPath: "",
  dataSourceSystem: "",
  noCurrentFamiliesExpected: false,
  notes: "",
};

function hasValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function sourceLabelForReview(value: SchoolDataSourceSystem | "") {
  if (value === "procare") return "ProCare export package";
  if (value === "other") return "Another system or spreadsheet";
  return "Missing";
}

function dataSetupPathLabel(value: SchoolDataSetupPath | null | "") {
  if (value === "import_existing") return "Move existing records";
  if (value === "start_clean") return "Clean workspace";
  return "Missing";
}

function onboardingDisplayValue(value: string) {
  if (value === "Multi-location pilot - all features included") return "Multi-location plan - all features included";
  if (value === "Enterprise pilot configuration") return "Enterprise launch configuration";
  return value;
}

export function OnboardingFlow() {
  const controlPrefix = useId();
  const [activeStep, setActiveStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceSetup | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [isPending, startTransition] = useTransition();
  const locationReview = useMemo(() => parseOnboardingLocationRoster(form.locationRoster, {
    state: form.state,
    email: form.workEmail,
    dataSetupPath: form.dataSetupPath,
    dataSourceSystem: form.dataSourceSystem,
  }), [form.dataSetupPath, form.dataSourceSystem, form.locationRoster, form.state, form.workEmail]);

  const currentStep = steps[activeStep];
  const stepIsComplete = (step: (typeof steps)[number]): boolean => {
    if (step.title === "Centers") {
      const requestedCenters = Number(form.centerCount);
      const validCount = Number.isInteger(requestedCenters) && requestedCenters >= 1 && requestedCenters <= 100;
      const rosterReady = requestedCenters > 1
        ? locationReview.locations.length === requestedCenters && locationReview.errors.length === 0
        : !form.locationRoster.trim() || (locationReview.locations.length === 1 && locationReview.errors.length === 0);
      return validCount && hasValue(form.state) && rosterReady;
    }
    if (step.title === "Starting data") {
      return Boolean(form.dataSetupPath)
        && (form.dataSetupPath === "start_clean" || Boolean(form.dataSourceSystem));
    }
    if (step.title === "Review") {
      return steps.slice(0, -1).every((candidate) => stepIsComplete(candidate));
    }
    return step.fields.length > 0 && step.fields.every((field) => hasValue(form[field as keyof FormState]));
  };
  const completedSteps = steps.map((step) => stepIsComplete(step));
  const completedRequiredSteps = completedSteps.slice(0, -1).filter(Boolean).length;
  const progress = Math.round((completedRequiredSteps / (steps.length - 1)) * 100);
  const canContinue = stepIsComplete(currentStep);
  const controlId = (field: keyof FormState) => `${controlPrefix}-${field}`;
  const draftEmbedCode = useMemo(() => {
    const appBaseUrl = typeof window !== "undefined" ? window.location.origin : "https://thebeesuite.io";
    const brandName = form.brandName || "Your Childcare Brand";
    return `<div id="bee-suite-inquiry-form"></div>
<script
  src="${appBaseUrl}/bee-suite-inquiry-form.js"
  data-target="bee-suite-inquiry-form"
  data-endpoint="${appBaseUrl}/api/inquiries"
  data-brand-name="${brandName.replace(/"/g, "&quot;")}"
  data-center-id="CENTER_ID_FROM_THE_BEE_SUITE"
  data-location-name="Primary Center"
  async
></script>`;
  }, [form.brandName]);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const restored = parseOnboardingDraft(window.localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY));
        if (restored) {
          setForm((current) => ({ ...current, ...restored.form } as FormState));
          setActiveStep(restored.activeStep);
          setDraftRestored(true);
        }
      } catch {
        // Storage may be unavailable in private browsing or restricted webviews.
      }
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!draftReady || submitted) return;
    try {
      window.localStorage.setItem(ONBOARDING_DRAFT_STORAGE_KEY, serializeOnboardingDraft(form, activeStep));
    } catch {
      // Draft persistence is an enhancement and must never block onboarding.
    }
  }, [activeStep, draftReady, form, submitted]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submitIntake() {
    setSubmitError("");
    startTransition(async () => {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          dataSetup: {
            path: form.dataSetupPath,
            sourceSystem: form.dataSourceSystem,
            noCurrentFamiliesExpected: form.noCurrentFamiliesExpected,
            notes: form.notes,
          },
          pageUrl: typeof window !== "undefined" ? window.location.href : "",
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        notificationId?: string;
        workspace?: WorkspaceSetup;
        error?: string;
        errors?: Record<string, string>;
      } | null;

      if (!response.ok) {
        const firstFieldError = data?.errors ? Object.values(data.errors)[0] : "";
        setSubmitError(firstFieldError || data?.error || "Onboarding intake could not be submitted.");
        return;
      }

      setSubmissionId(data?.notificationId ?? "");
      setWorkspace(data?.workspace ?? null);
      setSubmitted(true);
      try {
        window.localStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
      } catch {
        // The workspace was created even if this browser does not expose storage.
      }
      setDraftRestored(false);
    });
  }

  function nextStep() {
    if (activeStep < steps.length - 1) {
      setActiveStep((step) => step + 1);
      return;
    }
    submitIntake();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white" aria-busy={isPending}>
      <header className="border-b border-white/10 bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <BrandLogo href="/" size="sm" compact priority />
          <Button className="ml-auto border-white/20 bg-white/5 text-white hover:bg-white/10" variant="outline" nativeButton={false} render={<Link href="/directors" />}>
            Log in
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.72fr_1fr] lg:px-8">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h1 className="text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
            Set up your childcare brand.
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            This creates a BEE Suite workspace for your childcare organization, then guides you through school profile,
            account, inquiry form, and payout setup before online payments are enabled.
          </p>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Onboarding progress</span>
              <span className="text-primary">{progress}%</span>
            </div>
            <Progress value={progress} className="mt-3" aria-label="Onboarding completion" />
            <div className="mt-5 grid gap-2">
              {steps.map((step, index) => (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  disabled={isPending}
                  aria-current={activeStep === index ? "step" : undefined}
                  aria-label={`${step.title}, step ${index + 1} of ${steps.length}${completedSteps[index] || submitted ? ", complete" : ""}`}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-[color,background-color,border-color] motion-reduce:transition-none",
                    activeStep === index
                      ? "border-primary bg-primary/15 text-white"
                      : "border-white/10 bg-slate-900/60 text-slate-300 hover:bg-white/10",
                  )}
                  >
                    <step.icon className="size-4 text-primary" />
                    <span>{step.title}</span>
                  {completedSteps[index] || submitted ? <CheckCircle2 className="ml-auto size-4 text-emerald-300" /> : null}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section>
          {submitted ? (
            <Card className="rounded-2xl border-emerald-300/30 bg-emerald-300/10 text-white">
              <CardHeader>
                <div className="grid size-12 place-items-center rounded-xl bg-emerald-300 text-slate-950">
                  <CheckCircle2 />
                </div>
                <CardTitle as="h2" className="text-3xl">
                  {workspace?.existingWorkspace ? "Workspace access is ready" : "Your workspace is ready"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 text-slate-200">
                <p className="leading-7">
                  {workspace?.existingWorkspace
                    ? `${form.workEmail} already has BEE Suite access. We requested an account recovery email. If it does not arrive, use Forgot password or contact support.`
                    : `${form.brandName || "Your organization"} now has a BEE Suite workspace, an owner account, and ${(workspace?.centerCount ?? 1).toLocaleString()} school profile${(workspace?.centerCount ?? 1) === 1 ? "" : "s"}.`}
                  {" "}Use School Setup to finish school profiles, invite staff, install the inquiry form, and complete payout setup.
                </p>
                {!workspace?.auth?.passwordReset?.ok ? (
                  <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                    We could not confirm the password setup email. If it does not arrive, use Forgot password on the sign-in page or contact support.
                  </div>
                ) : null}
                <div className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
                  <div className="text-sm font-semibold text-white">Inquiry form embed setup</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    This code is connected to the primary school created during setup. Each additional school has its own code in School Setup.
                  </p>
                  <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-black/50 p-3 text-xs leading-5 text-slate-200">{workspace?.embedCode || draftEmbedCode}</pre>
                </div>
                {submissionId ? (
                  <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3 text-sm">
                    Intake reference: <span className="font-semibold text-white">{submissionId}</span>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Brand", form.brandName],
                    ["Organization", workspace?.ownerGroupName || form.brandName || "Your organization"],
                    ["Account", workspace?.tenantName || form.brandName || "The BEE Suite"],
                    ["Primary school", workspace?.centerName || "School profile"],
                    ["Centers requested", form.centerCount],
                    ["Data starting point", form.dataSetupPath === "import_existing" ? "Move existing records" : "Clean workspace"],
                    ["School setup", workspace?.schoolSetupStatus || "Continue in workspace"],
                    ["Payout owner", form.payoutAdminName],
                    ["Software plan", onboardingDisplayValue(form.softwarePlan)],
                    ["Priority", form.priority],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                      <div className="text-xs text-slate-400">{label}</div>
                      <div className="mt-1 text-sm font-medium text-white">{value || "To confirm"}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button nativeButton={false} render={<Link href={workspace?.loginUrl || "/directors"} />}>
                    Open login
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                  <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={() => setSubmitted(false)}>
                    Edit intake
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl border-white/10 bg-white text-slate-950">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-slate-950 text-primary">
                    <currentStep.icon />
                  </span>
                  <div>
                    <div className="text-sm text-slate-500">Step {activeStep + 1} of {steps.length}</div>
                    <CardTitle as="h2" className="text-2xl">{currentStep.title}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {draftRestored ? (
                  <div role="status" className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 sm:flex-row sm:items-center">
                    <span>Your saved onboarding draft was restored on this device.</span>
                    <Button type="button" size="sm" variant="outline" className="sm:ml-auto" onClick={() => {
                      try {
                        window.localStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
                      } catch {
                        // Reset the in-memory form even when storage is restricted.
                      }
                      setForm(initialForm);
                      setActiveStep(0);
                      setDraftRestored(false);
                    }}>Start over</Button>
                  </div>
                ) : null}
                {activeStep === 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={controlId("brandName")}>Brand name</Label>
                      <Input id={controlId("brandName")} name="brandName" autoComplete="organization" value={form.brandName} onChange={(event) => update("brandName", event.target.value)} placeholder="Your childcare brand…" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={controlId("workEmail")}>Work email</Label>
                      <Input id={controlId("workEmail")} name="workEmail" autoComplete="email" spellCheck={false} value={form.workEmail} onChange={(event) => update("workEmail", event.target.value)} placeholder="owner@example.com" type="email" required />
                    </div>
                  </div>
                ) : null}

                {activeStep === 1 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={controlId("centerCount")}>Number of centers</Label>
                      <Input id={controlId("centerCount")} name="centerCount" autoComplete="off" value={form.centerCount} onChange={(event) => update("centerCount", event.target.value)} placeholder="12" inputMode="numeric" type="number" min={1} max={100} step={1} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={controlId("state")}>Primary state or region</Label>
                      <Input id={controlId("state")} name="state" autoComplete="address-level1" value={form.state} onChange={(event) => update("state", event.target.value)} placeholder="Florida…" required />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor={controlId("locationRoster")}>School details {Number(form.centerCount) > 1 ? "(required for every school)" : "(optional now)"}</Label>
                      <Textarea
                        id={controlId("locationRoster")}
                        name="locationRoster"
                        autoComplete="off"
                        value={form.locationRoster}
                        onChange={(event) => update("locationRoster", event.target.value)}
                        rows={Math.max(5, Math.min(12, Number(form.centerCount) + 2 || 5))}
                        placeholder={'Name | Address | City | State | ZIP | Phone | Email | Licensed Capacity | Data Path | Source System\nDowntown School | 100 Main St | Orlando | FL | 32801 | 407-555-0100 | director@example.com | 120 | import_existing | procare'}
                      />
                      <p className="text-xs leading-5 text-slate-600">Paste from a spreadsheet using tab, pipe, or comma-separated columns. Data Path and Source System are optional per-school overrides; otherwise the starting-data choice below is used. For multiple locations, the row count must match the requested school count so no placeholder locations are created.</p>
                      {form.locationRoster.trim() ? (
                        <div className={cn("rounded-lg border p-3 text-xs", locationReview.errors.length ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>
                          {locationReview.errors.length
                            ? locationReview.errors.slice(0, 5).map((error) => <div key={error}>{error}</div>)
                            : `${locationReview.locations.length.toLocaleString()} complete school row${locationReview.locations.length === 1 ? "" : "s"} ready.`}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {activeStep === 2 ? (
                  <div className="grid gap-5">
                    <div>
                      <h3 className="text-pretty text-lg font-semibold">How will these schools begin by default?</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">This chooses the default setup path. A school-detail row can override it for a specific location. Family records are added or imported only after secure workspace access is ready.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        {
                          value: "import_existing" as const,
                          title: "Move Existing Records",
                          detail: "Use guarded preview, duplicate matching, corrections, and school confirmation before importing.",
                        },
                        {
                          value: "start_clean" as const,
                          title: "Start Clean",
                          detail: "Set up the school first, then add families and children directly as enrollment begins.",
                        },
                      ].map((option) => {
                        const selected = form.dataSetupPath === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              update("dataSetupPath", option.value);
                              if (option.value === "start_clean") update("dataSourceSystem", "");
                              if (option.value === "import_existing") update("noCurrentFamiliesExpected", false);
                            }}
                            className={cn(
                              "min-h-32 rounded-xl border p-4 text-left transition-[border-color,background-color,color] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950",
                              selected ? "border-amber-500 bg-amber-50" : "bg-white hover:border-amber-400 hover:bg-amber-50/50",
                            )}
                          >
                            <span className="flex items-center justify-between gap-3 font-semibold">
                              {option.title}
                              {selected ? <CheckCircle2 aria-hidden="true" className="size-5 text-emerald-700" /> : null}
                            </span>
                            <span className="mt-2 block text-sm leading-5 text-slate-600">{option.detail}</span>
                          </button>
                        );
                      })}
                    </div>
                    {form.dataSetupPath === "import_existing" ? (
                      <div className="space-y-2">
                        <Label htmlFor={controlId("dataSourceSystem")}>Previous source</Label>
                        <Select value={form.dataSourceSystem} onValueChange={(value) => update("dataSourceSystem", (value ?? "") as SchoolDataSourceSystem | "")}>
                          <SelectTrigger id={controlId("dataSourceSystem")}><SelectValue placeholder="Choose the previous system…" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="procare">ProCare export package</SelectItem>
                            <SelectItem value="other">Another system or spreadsheet</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs leading-5 text-slate-600">
                          {form.dataSourceSystem === "other"
                            ? "Use the guided BEE flat-file adapter to map one reviewed table at a time. Keep stable source IDs and do not email family exports or credentials."
                            : "Use the complete, unchanged school package. The guarded importer previews mappings and duplicate matches before writing records."}
                        </p>
                      </div>
                    ) : null}
                    {form.dataSetupPath === "start_clean" ? (
                      <label className="flex min-h-11 items-start gap-3 rounded-xl border bg-slate-50 p-4 text-sm">
                        <input
                          type="checkbox"
                          name="noCurrentFamiliesExpected"
                          checked={form.noCurrentFamiliesExpected}
                          onChange={(event) => update("noCurrentFamiliesExpected", event.target.checked)}
                          className="mt-0.5 size-5 shrink-0 accent-amber-500"
                        />
                        <span><span className="block font-medium">No current families or children are expected yet</span><span className="mt-1 block text-xs leading-5 text-slate-600">The workspace will stay empty until real enrollment begins; no sample or placeholder families are created.</span></span>
                      </label>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                        <div className="font-semibold text-emerald-950">BEE setup team prepares</div>
                        <p className="mt-1 text-xs leading-5 text-emerald-900/75">Business profile, configuration, forms, billing rules, integrations, templates, and technical checks from approved business information.</p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                        <div className="font-semibold text-amber-950">School confirms</div>
                        <p className="mt-1 text-xs leading-5 text-amber-900/75">Family and child facts, source exceptions, payout bank details on the secure provider page, invitation scope, and final launch approval.</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeStep === 3 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={controlId("softwarePlan")}>Software plan</Label>
                      <Select value={form.softwarePlan} onValueChange={(value) => update("softwarePlan", value ?? "")}>
                        <SelectTrigger id={controlId("softwarePlan")}>
                          <SelectValue placeholder="Choose plan model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Multi-location pilot - all features included">Multi-location plan - all features included</SelectItem>
                          <SelectItem value="Per-location monthly platform fee">Per-location monthly platform fee</SelectItem>
                          <SelectItem value="Enterprise franchise agreement">Enterprise franchise agreement</SelectItem>
                          <SelectItem value="Usage-based plus platform fee">Usage-based plus platform fee</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={controlId("addOnBundle")}>Add-on bundle</Label>
                      <Select value={form.addOnBundle} onValueChange={(value) => update("addOnBundle", value ?? "")}>
                        <SelectTrigger id={controlId("addOnBundle")}>
                          <SelectValue placeholder="Choose starting bundle" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CRM and enrollment only">CRM and enrollment only</SelectItem>
                          <SelectItem value="CRM + operations + parent engagement">CRM + operations + parent engagement</SelectItem>
                          <SelectItem value="Full platform with billing">Full platform with billing</SelectItem>
                          <SelectItem value="Enterprise pilot configuration">Enterprise launch configuration</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor={controlId("merchantFeeStrategy")}>Merchant fee strategy</Label>
                      <Select value={form.merchantFeeStrategy} onValueChange={(value) => update("merchantFeeStrategy", value ?? "")}>
                        <SelectTrigger id={controlId("merchantFeeStrategy")}>
                          <SelectValue placeholder="Choose fee handling" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Approved processing recovery shown to payer">Approved processing recovery shown to payer</SelectItem>
                          <SelectItem value="School absorbs processor costs; BEE Suite payment operations fee invoiced monthly">School absorbs processor costs; BEE Suite payment operations fee invoiced monthly</SelectItem>
                          <SelectItem value="Enterprise negotiated merchant services">Enterprise negotiated merchant services</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={controlId("payoutAdminName")}>Payout setup owner</Label>
                      <Input id={controlId("payoutAdminName")} name="payoutAdminName" autoComplete="name" value={form.payoutAdminName} onChange={(event) => update("payoutAdminName", event.target.value)} placeholder="Finance owner or franchise admin…" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={controlId("payoutAdminEmail")}>Payout setup email</Label>
                      <Input id={controlId("payoutAdminEmail")} name="payoutAdminEmail" autoComplete="email" spellCheck={false} value={form.payoutAdminEmail} onChange={(event) => update("payoutAdminEmail", event.target.value)} placeholder="finance@example.com" type="email" required />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor={controlId("payoutReadiness")}>Payout account readiness</Label>
                      <Select value={form.payoutReadiness} onValueChange={(value) => update("payoutReadiness", value ?? "")}>
                        <SelectTrigger id={controlId("payoutReadiness")}>
                          <SelectValue placeholder="Choose payout setup status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Ready to connect payout accounts">Ready to connect payout accounts</SelectItem>
                          <SelectItem value="Need school owner verification">Need school owner verification</SelectItem>
                          <SelectItem value="Need multi-location finance review">Need multi-location finance review</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-lg border border-amber-300/40 bg-amber-50 p-4 text-sm leading-6 text-slate-700 sm:col-span-2">
                      Each school must complete its own connected payout account before parent checkout can route funds to that location.
                    </div>
                  </div>
                ) : null}

                {activeStep === 4 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={controlId("timeline")}>Launch timeline</Label>
                      <Select value={form.timeline} onValueChange={(value) => update("timeline", value ?? "")}>
                        <SelectTrigger id={controlId("timeline")}>
                          <SelectValue placeholder="Choose timeline" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="This month">This month</SelectItem>
                          <SelectItem value="Next 60 days">Next 60 days</SelectItem>
                          <SelectItem value="This quarter">This quarter</SelectItem>
                          <SelectItem value="Planning ahead">Planning ahead</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={controlId("priority")}>First priority</Label>
                      <Select value={form.priority} onValueChange={(value) => update("priority", value ?? "")}>
                        <SelectTrigger id={controlId("priority")}>
                          <SelectValue placeholder="Choose priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Enrollment CRM">Enrollment CRM</SelectItem>
                          <SelectItem value="Parent portal">Parent portal</SelectItem>
                          <SelectItem value="Billing and payout accounts">Billing and payout accounts</SelectItem>
                          <SelectItem value="Operations dashboard">Operations dashboard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor={controlId("notes")}>Launch notes</Label>
                      <Textarea id={controlId("notes")} name="notes" autoComplete="off" value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Tell us about current systems, imports, or launch constraints…" />
                      <p className="text-xs leading-5 text-slate-600">Do not include family or child details, passwords, bank information, or verification codes.</p>
                    </div>
                  </div>
                ) : null}

                {activeStep === 5 ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ["Brand", form.brandName || "Missing"],
                        ["Email", form.workEmail || "Missing"],
                        ["Centers", form.centerCount || "Missing"],
                        ["School detail rows", form.locationRoster.trim() ? String(locationReview.locations.length) : "Primary profile to finish in School Setup"],
                        ["Region", form.state || "Missing"],
                        ["Payout owner", form.payoutAdminName || "Missing"],
                        ["Payout email", form.payoutAdminEmail || "Missing"],
                        ["Software plan", onboardingDisplayValue(form.softwarePlan) || "Missing"],
                        ["Add-ons", onboardingDisplayValue(form.addOnBundle) || "Missing"],
                        ["Merchant fees", form.merchantFeeStrategy || "Missing"],
                        ["Payout readiness", form.payoutReadiness || "Missing"],
                        ["Default data starting point", dataSetupPathLabel(form.dataSetupPath)],
                        ["Default previous source", form.dataSetupPath === "import_existing" ? sourceLabelForReview(form.dataSourceSystem) : "None"],
                        ["Timeline", form.timeline || "Missing"],
                        ["Priority", form.priority || "Missing"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border bg-slate-50 p-3">
                          <div className="text-xs text-slate-500">{label}</div>
                          <div className="mt-1 text-sm font-medium">{value}</div>
                        </div>
                      ))}
                    </div>
                    {locationReview.locations.length ? (
                      <div className="space-y-3">
                        <div>
                          <h3 className="text-sm font-semibold">School profiles to create</h3>
                          <p className="mt-1 text-xs leading-5 text-slate-600">Review each school and its starting-data path before finishing. You can go back to correct any row.</p>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-2">
                          {locationReview.locations.map((location, index) => (
                            <div key={`${location.name}-${index}`} className="rounded-lg border bg-white p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">School {index + 1}</div>
                                  <h4 className="mt-1 text-sm font-semibold text-slate-950">{location.name}</h4>
                                </div>
                                <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                  Capacity {location.licensedCapacity || "Not supplied"}
                                </div>
                              </div>
                              <p className="mt-3 text-sm leading-5 text-slate-700">
                                {location.address}, {location.city}, {location.state} {location.postalCode}
                              </p>
                              <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                                <div><span className="font-medium text-slate-800">Email:</span> {location.email}</div>
                                <div><span className="font-medium text-slate-800">Phone:</span> {location.phone || "Not supplied"}</div>
                                <div><span className="font-medium text-slate-800">Starting data:</span> {dataSetupPathLabel(location.dataSetupPath)}</div>
                                <div><span className="font-medium text-slate-800">Previous source:</span> {location.dataSetupPath === "import_existing" ? sourceLabelForReview(location.dataSourceSystem ?? "") : "None"}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="rounded-lg border border-amber-300/40 bg-amber-50 p-4 text-sm leading-6 text-slate-700">
                      Finishing onboarding creates your BEE Suite organization, owner account, every supplied school profile, and a school-scoped inquiry form record. Online payments remain unavailable until payout setup is complete and approved.
                    </div>
                  </div>
                ) : null}

                {submitError ? (
                  <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                    {submitError}
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center">
                  <Button type="button" disabled={!canContinue || isPending} onClick={nextStep} aria-busy={isPending}>
                    {isPending ? "Submitting…" : activeStep === steps.length - 1 ? "Finish intake" : "Continue"}
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                  {activeStep > 0 ? (
                    <Button type="button" variant="outline" disabled={isPending} onClick={() => setActiveStep((step) => step - 1)}>
                      Back
                    </Button>
                  ) : null}
                  <div className="flex items-center gap-2 text-xs text-slate-500 sm:ml-auto">
                    <LockKeyhole className="size-4" />
                    Account access reviewed before launch
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              [Mail, "Account setup", "Owners receive a password setup email and can complete their profile from the workspace."],
              [BadgeDollarSign, "Payout setup", "Schools complete payout setup before accepting online payments."],
              [ShieldCheck, "Launch review", "Online payments, family access, and sensitive actions remain unavailable until setup is reviewed."],
            ].map(([Icon, title, body]) => (
              <div key={title as string} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <Icon className="size-5 text-primary" />
                <div className="mt-3 text-sm font-semibold">{title as string}</div>
                <p className="mt-1 text-xs leading-5 text-slate-300">{body as string}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
