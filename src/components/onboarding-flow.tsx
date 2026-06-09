"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
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
import { schoolOnboardingSetupSections, type SchoolOnboardingSetupField } from "@/lib/onboarding-setup";
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
    title: "School setup",
    icon: ClipboardList,
    fields: schoolOnboardingSetupSections.map((section) => section.field),
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
  timeline: string;
  priority: string;
  payoutAdminName: string;
  payoutAdminEmail: string;
  payoutReadiness: string;
  softwarePlan: string;
  addOnBundle: string;
  merchantFeeStrategy: string;
  notes: string;
} & Record<SchoolOnboardingSetupField, string>;

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
  schoolSetupStatus?: string;
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

const initialSetupFields = Object.fromEntries(
  schoolOnboardingSetupSections.map((section) => [section.field, ""]),
) as Record<SchoolOnboardingSetupField, string>;

const initialForm: FormState = {
  brandName: "",
  workEmail: "",
  centerCount: "",
  state: "",
  timeline: "",
  priority: "",
  payoutAdminName: "",
  payoutAdminEmail: "",
  payoutReadiness: "",
  softwarePlan: "",
  addOnBundle: "",
  merchantFeeStrategy: "",
  notes: "",
  ...initialSetupFields,
};

function hasValue(value: string) {
  return value.trim().length > 0;
}

export function OnboardingFlow() {
  const [activeStep, setActiveStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceSetup | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [isPending, startTransition] = useTransition();

  const completedFields = useMemo(
    () => Object.entries(form).filter(([key, value]) => key !== "notes" && hasValue(value)).length,
    [form],
  );
  const requiredTotal = Object.keys(initialForm).filter((key) => key !== "notes").length;
  const progress = Math.round((completedFields / requiredTotal) * 100);
  const currentStep = steps[activeStep];
  const canContinue = currentStep.fields.every((field) => hasValue(form[field as keyof FormState]));
  const completedSteps = steps.map((step) =>
    step.fields.length > 0 && step.fields.every((field) => hasValue(form[field as keyof FormState])),
  );
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
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <BrandLogo href="/" size="sm" compact priority />
          <Button className="ml-auto border-white/20 bg-white/5 text-white hover:bg-white/10" variant="outline" nativeButton={false} render={<Link href="/login" />}>
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
            This creates a gated BEE Suite trial workspace for your childcare brand, then walks you through profile setup,
            inquiry form install, center imports, user invitations, and payout readiness before any live payment workflows are enabled.
          </p>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Onboarding progress</span>
              <span className="text-primary">{progress}%</span>
            </div>
            <Progress value={progress} className="mt-3" />
            <div className="mt-5 grid gap-2">
              {steps.map((step, index) => (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition",
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
                <CardTitle className="text-3xl">
                  {workspace?.existingWorkspace ? "Workspace access is ready" : "Trial workspace is ready"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 text-slate-200">
                <p className="leading-7">
                  {workspace?.existingWorkspace
                    ? `${form.workEmail} already has BEE Suite access. We sent an account recovery email when Supabase Auth accepted the request.`
                    : `${form.brandName || "Your brand"} now has a trial workspace with an ownership container, primary center profile, brand settings, setup integrations, and an owner account.`}
                  {" "}Use the dashboard to finish center profiles, invite staff, install the inquiry form, and prepare payout onboarding.
                </p>
                {!workspace?.auth?.passwordReset?.ok ? (
                  <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                    The workspace record was created, but the password setup email may still need review. Admins can send a reset from Supabase Auth if the user does not receive it.
                  </div>
                ) : null}
                <div className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
                  <div className="text-sm font-semibold text-white">Inquiry form embed setup</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    This code is linked to the primary center profile created for the workspace. Additional center-specific codes are available inside each center dashboard as profiles are added.
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
                    ["Owner group", workspace?.ownerGroupName || "Ownership container"],
                    ["Workspace", workspace?.tenantSlug || "Trial setup"],
                    ["Primary center", workspace?.centerName || "Primary Center"],
                    ["Centers requested", form.centerCount],
                    ["School setup", workspace?.schoolSetupStatus || `${schoolOnboardingSetupSections.length} sections captured`],
                    ["Payout owner", form.payoutAdminName],
                    ["Software plan", form.softwarePlan],
                    ["Priority", form.priority],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                      <div className="text-xs text-slate-400">{label}</div>
                      <div className="mt-1 text-sm font-medium text-white">{value || "To confirm"}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button nativeButton={false} render={<Link href={workspace?.loginUrl || "/login"} />}>
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
            <Card className="rounded-2xl border-white/10 bg-white text-slate-950 shadow-2xl shadow-black/30">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-slate-950 text-primary">
                    <currentStep.icon />
                  </span>
                  <div>
                    <div className="text-sm text-slate-500">Step {activeStep + 1} of {steps.length}</div>
                    <CardTitle className="text-2xl">{currentStep.title}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {activeStep === 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="brandName">Brand name</Label>
                      <Input id="brandName" value={form.brandName} onChange={(event) => update("brandName", event.target.value)} placeholder="Your childcare brand" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workEmail">Work email</Label>
                      <Input id="workEmail" value={form.workEmail} onChange={(event) => update("workEmail", event.target.value)} placeholder="owner@example.com" type="email" required />
                    </div>
                  </div>
                ) : null}

                {activeStep === 1 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="centerCount">Number of centers</Label>
                      <Input id="centerCount" value={form.centerCount} onChange={(event) => update("centerCount", event.target.value)} placeholder="12" inputMode="numeric" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">Primary state or region</Label>
                      <Input id="state" value={form.state} onChange={(event) => update("state", event.target.value)} placeholder="Florida" required />
                    </div>
                  </div>
                ) : null}

                {activeStep === 2 ? (
                  <div className="grid gap-4">
                    {schoolOnboardingSetupSections.map((section) => (
                      <div key={section.field} className="space-y-2">
                        <Label htmlFor={section.field}>{section.label}</Label>
                        <Textarea
                          id={section.field}
                          value={form[section.field]}
                          onChange={(event) => update(section.field as SchoolOnboardingSetupField, event.target.value)}
                          placeholder={section.placeholder}
                          required
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {activeStep === 3 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Software plan</Label>
                      <Select value={form.softwarePlan} onValueChange={(value) => update("softwarePlan", value ?? "")}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose plan model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Kid City USA pilot - all features included">Kid City USA pilot - all features included</SelectItem>
                          <SelectItem value="Per-location monthly platform fee">Per-location monthly platform fee</SelectItem>
                          <SelectItem value="Enterprise franchise agreement">Enterprise franchise agreement</SelectItem>
                          <SelectItem value="Usage-based plus platform fee">Usage-based plus platform fee</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Add-on bundle</Label>
                      <Select value={form.addOnBundle} onValueChange={(value) => update("addOnBundle", value ?? "")}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose starting bundle" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CRM and enrollment only">CRM and enrollment only</SelectItem>
                          <SelectItem value="CRM + operations + parent engagement">CRM + operations + parent engagement</SelectItem>
                          <SelectItem value="Full platform with billing">Full platform with billing</SelectItem>
                          <SelectItem value="Enterprise pilot configuration">Enterprise pilot configuration</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Merchant fee strategy</Label>
                      <Select value={form.merchantFeeStrategy} onValueChange={(value) => update("merchantFeeStrategy", value ?? "")}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose fee handling" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Processor costs plus BEE Suite surcharge passed to payer">Processor costs plus BEE Suite surcharge passed to payer</SelectItem>
                          <SelectItem value="School absorbs processor costs; BEE Suite surcharge invoiced monthly">School absorbs processor costs; BEE Suite surcharge invoiced monthly</SelectItem>
                          <SelectItem value="Enterprise negotiated merchant services">Enterprise negotiated merchant services</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payoutAdminName">Payout setup owner</Label>
                      <Input id="payoutAdminName" value={form.payoutAdminName} onChange={(event) => update("payoutAdminName", event.target.value)} placeholder="Finance owner or franchise admin" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payoutAdminEmail">Payout setup email</Label>
                      <Input id="payoutAdminEmail" value={form.payoutAdminEmail} onChange={(event) => update("payoutAdminEmail", event.target.value)} placeholder="finance@example.com" type="email" required />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Payout account readiness</Label>
                      <Select value={form.payoutReadiness} onValueChange={(value) => update("payoutReadiness", value ?? "")}>
                        <SelectTrigger>
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
                      <Label>Launch timeline</Label>
                      <Select value={form.timeline} onValueChange={(value) => update("timeline", value ?? "")}>
                        <SelectTrigger>
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
                      <Label>First priority</Label>
                      <Select value={form.priority} onValueChange={(value) => update("priority", value ?? "")}>
                        <SelectTrigger>
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
                      <Label htmlFor="notes">Launch notes</Label>
                      <Textarea id="notes" value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Tell us about current systems, imports, or launch constraints." />
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
                        ["Region", form.state || "Missing"],
                        ["Payout owner", form.payoutAdminName || "Missing"],
                        ["Payout email", form.payoutAdminEmail || "Missing"],
                        ["Software plan", form.softwarePlan || "Missing"],
                        ["Add-ons", form.addOnBundle || "Missing"],
                        ["Merchant fees", form.merchantFeeStrategy || "Missing"],
                        ["Payout readiness", form.payoutReadiness || "Missing"],
                        ["Classroom setup", form.classroomSetup ? "Provided" : "Missing"],
                        ["Tuition/rates", form.tuitionRateSetup ? "Provided" : "Missing"],
                        ["Subsidy rules", form.subsidyRules ? "Provided" : "Missing"],
                        ["Balance rules", form.balanceRules ? "Provided" : "Missing"],
                        ["Invoice rules", form.invoiceRules ? "Provided" : "Missing"],
                        ["Licensing setup", form.licensingSetup ? "Provided" : "Missing"],
                        ["Timeline", form.timeline || "Missing"],
                        ["Priority", form.priority || "Missing"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border bg-slate-50 p-3">
                          <div className="text-xs text-slate-500">{label}</div>
                          <div className="mt-1 text-sm font-medium">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-amber-300/40 bg-amber-50 p-4 text-sm leading-6 text-slate-700">
                      Finishing onboarding creates a gated trial workspace, owner account, primary center profile, and inquiry form embed. Live checkout remains disabled until payout onboarding is complete and reviewed.
                    </div>
                  </div>
                ) : null}

                {submitError ? (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                    {submitError}
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center">
                  <Button type="button" disabled={!canContinue || isPending} onClick={nextStep}>
                    {isPending ? "Submitting..." : activeStep === steps.length - 1 ? "Finish intake" : "Continue"}
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                  {activeStep > 0 ? (
                    <Button type="button" variant="outline" onClick={() => setActiveStep((step) => step - 1)}>
                      Back
                    </Button>
                  ) : null}
                  <div className="flex items-center gap-2 text-xs text-slate-500 sm:ml-auto">
                    <LockKeyhole className="size-4" />
                    Role and data scope reviewed before launch
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              [Mail, "Account setup", "Owners receive a password setup email and can complete their profile from the workspace."],
              [BadgeDollarSign, "Payout onboarding", "Schools complete connected payout setup before live checkout."],
              [ShieldCheck, "Trial safeguards", "Live payments, parent engagement, and sensitive workflows stay gated until reviewed."],
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
