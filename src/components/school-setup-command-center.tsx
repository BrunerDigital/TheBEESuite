"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  Save,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EditableDisplayField } from "@/components/ui/editable-display-field";
import { SchoolDataSetupPanel, type SchoolDataSetupPanelData } from "@/components/school-data-setup-panel";
import { SetupChecklistPanel } from "@/components/setup-checklist-panel";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import { CollapsibleCard } from "@/components/workspace-preferences";
import { directorLaunchChecklistTasks, type SetupChecklistTask } from "@/lib/setup-checklists";
import { cn } from "@/lib/utils";

export type SchoolSetupStatus = "complete" | "in_progress" | "missing";

export type SchoolSetupCommandSection = {
  id: string;
  field: string;
  group: string;
  label: string;
  owner: string;
  href: string;
  description: string;
  placeholder: string;
  value: string;
  status: SchoolSetupStatus;
  evidence: string;
  metrics: string[];
  requiredActions: string[];
  actionLabel: string;
  secondaryAction?: {
    href: string;
    label: string;
  };
};

export type SchoolSetupCommandCenterData = {
  centerId: string | null;
  centerLabel: string;
  setupStatus: string;
  progress: number;
  completedSections: number;
  totalSections: number;
  blockingSections: number;
  lastCapturedAt: string | null;
  schoolEin: string | null;
  businessProfile: {
    name: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    phone: string;
    email: string;
    timezone: string;
    licensedCapacity: string;
  };
  businessProfileConfirmation: {
    complete: boolean;
    confirmationCurrent: boolean;
    missingFields: string[];
    confirmedAt: string | null;
    confirmedByEmail: string | null;
  };
  stats: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  dataSetup: SchoolDataSetupPanelData;
  sections: SchoolSetupCommandSection[];
  externalNeeds: string[];
  directorChecklistCompletedIds: string[];
  directorChecklistAutomaticCompletedIds?: string[];
  directorChecklistTasks?: SetupChecklistTask[];
};

const emptySections: SchoolSetupCommandSection[] = [];
const businessProfileFields = ["name", "address", "city", "state", "postalCode", "phone", "email", "timezone", "licensedCapacity"] as const;
const businessProfileFieldLabels: Record<(typeof businessProfileFields)[number], string> = {
  name: "school name",
  address: "street address",
  city: "city",
  state: "state or region",
  postalCode: "postal code",
  phone: "main phone",
  email: "school email",
  timezone: "timezone",
  licensedCapacity: "licensed capacity",
};

function statusLabel(status: SchoolSetupStatus) {
  if (status === "complete") return "Ready";
  if (status === "in_progress") return "In progress";
  return "Needs setup";
}

function statusTone(status: SchoolSetupStatus) {
  if (status === "complete") return "default";
  if (status === "in_progress") return "secondary";
  return "destructive";
}

function statusIcon(status: SchoolSetupStatus) {
  if (status === "complete") return CheckCircle2;
  if (status === "in_progress") return ClipboardCheck;
  return AlertTriangle;
}

export function SchoolSetupCommandCenter({ data }: { data: SchoolSetupCommandCenterData }) {
  const router = useRouter();
  const sections = data.sections ?? emptySections;
  const firstActionNeeded = sections.find((section) => section.status !== "complete");
  const detailedSections = useMemo(
    () => sections.filter((section) => !["schoolProfileSetup", "familyImportSetup"].includes(section.field)),
    [sections],
  );
  const firstDetailedActionNeeded = detailedSections.find((section) => section.status !== "complete") ?? detailedSections[0];
  const [activeId, setActiveId] = useState(firstDetailedActionNeeded?.id ?? "");
  const [values, setValues] = useState(() =>
    Object.fromEntries(sections.map((section) => [section.field, section.value])),
  );
  const [schoolEin, setSchoolEin] = useState(data.schoolEin ?? "");
  const [businessProfile, setBusinessProfile] = useState(data.businessProfile);
  const [savedValues, setSavedValues] = useState(() =>
    Object.fromEntries(sections.map((section) => [section.field, section.value])),
  );
  const [savedSchoolEin, setSavedSchoolEin] = useState(data.schoolEin ?? "");
  const [savedBusinessProfile, setSavedBusinessProfile] = useState(data.businessProfile);
  const [businessProfileConfirmation, setBusinessProfileConfirmation] = useState(data.businessProfileConfirmation);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const activeSection = detailedSections.find((section) => section.id === activeId) ?? detailedSections[0];
  const groups = useMemo(() => Array.from(new Set(detailedSections.map((section) => section.group))), [detailedSections]);
  const businessProfileChanged = businessProfileFields.some((field) => businessProfile[field] !== savedBusinessProfile[field]);
  const localMissingBusinessProfileFields = businessProfileFields.filter((field) => {
    if (field === "licensedCapacity") {
      const capacity = Number(businessProfile.licensedCapacity);
      return !Number.isInteger(capacity) || capacity <= 0 || capacity > 10_000;
    }
    return !businessProfile[field].trim();
  });
  const localBusinessProfileComplete = localMissingBusinessProfileFields.length === 0;
  const businessProfileConfirmationCurrent = businessProfileConfirmation.confirmationCurrent && !businessProfileChanged;
  const businessProfileConfirmedAtLabel = useMemo(() => {
    if (!businessProfileConfirmation.confirmedAt) return null;
    const confirmedAt = new Date(businessProfileConfirmation.confirmedAt);
    if (Number.isNaN(confirmedAt.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(confirmedAt);
  }, [businessProfileConfirmation.confirmedAt]);
  const hasUnsavedChanges = schoolEin !== savedSchoolEin
    || businessProfileChanged
    || sections.some((section) => (values[section.field] ?? "") !== (savedValues[section.field] ?? ""));
  useUnsavedChangesGuard(hasUnsavedChanges, "This school setup page has unsaved changes. Discard them and leave this page?");

  function displayedStatus(section: SchoolSetupCommandSection): SchoolSetupStatus {
    if (section.status === "complete") return "complete";
    return values[section.field]?.trim() ? "in_progress" : "missing";
  }

  function updateValue(field: string, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function updateBusinessProfile(field: (typeof businessProfileFields)[number], value: string) {
    setBusinessProfile((current) => ({ ...current, [field]: value }));
  }

  function focusNextAction() {
    if (!firstActionNeeded) return;
    const targetId = firstActionNeeded.field === "schoolProfileSetup"
      ? "school-business-profile"
      : firstActionNeeded.field === "familyImportSetup"
        ? "school-data-setup"
        : "school-setup-active-section";
    if (targetId === "school-setup-active-section") setActiveId(firstActionNeeded.id);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus({ preventScroll: true });
    });
  }

  function saveSetup(options: { confirmBusinessProfile?: boolean } = {}) {
    setMessage("");
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/school-setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            centerId: data.centerId,
            sections: values,
            schoolEin,
            businessProfile,
            confirmBusinessProfile: options.confirmBusinessProfile === true,
          }),
        });
        const json = await response.json().catch(() => null) as {
          ok?: boolean;
          error?: string;
          sections?: Record<string, string>;
          schoolEin?: string | null;
          businessProfile?: SchoolSetupCommandCenterData["businessProfile"] & { licensedCapacity?: string | number };
          businessProfileConfirmation?: SchoolSetupCommandCenterData["businessProfileConfirmation"];
          savedAt?: string;
        } | null;
        if (!response.ok || !json?.ok) {
          throw new Error(json?.error || "School setup could not be saved.");
        }
        const canonicalValues = json.sections ?? values;
        const canonicalEin = json.schoolEin ?? "";
        const canonicalBusinessProfile = json.businessProfile
          ? { ...json.businessProfile, licensedCapacity: String(json.businessProfile.licensedCapacity ?? "") }
          : businessProfile;
        setValues(canonicalValues);
        setSavedValues(canonicalValues);
        setSchoolEin(canonicalEin);
        setSavedSchoolEin(canonicalEin);
        setBusinessProfile(canonicalBusinessProfile);
        setSavedBusinessProfile(canonicalBusinessProfile);
        if (json.businessProfileConfirmation) setBusinessProfileConfirmation(json.businessProfileConfirmation);
        setMessage(options.confirmBusinessProfile
          ? "School profile saved and confirmed."
          : "School profile and setup details saved.");
        router.refresh();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "School setup could not be saved.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="school-setup-title" className="flex flex-col gap-4 rounded-xl border bg-card/80 p-5 shadow-sm">
        <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm">
          <Building2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <div className="font-medium">Existing school workspace</div>
            <p className="mt-1 leading-5 text-muted-foreground">
              {data.centerLabel} is already created. This page finishes that location’s setup and never creates a duplicate school.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 id="school-setup-title" className="text-3xl font-semibold tracking-tight">School setup</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              BEE prepares everything available from authorized business information. The school reviews the prepared work,
              supplies only facts BEE cannot safely infer, and separately approves protected launch actions.
            </p>
          </div>
          <div className="rounded-lg border bg-background/60 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 font-medium">
              {statusLabel(data.blockingSections ? "missing" : "complete")}
              {hasUnsavedChanges ? <Badge variant="secondary">Unsaved changes</Badge> : null}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {data.lastCapturedAt ? `Last saved ${data.lastCapturedAt}` : "No setup notes saved yet"}
            </div>
          </div>
        </div>
        <Progress value={data.progress} aria-label={`School setup progress: ${data.progress}%`} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground">Launch readiness</div>
            <div className="mt-1 text-2xl font-semibold">{data.progress}%</div>
          </div>
          <div className="rounded-lg border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground">Ready areas</div>
            <div className="mt-1 text-2xl font-semibold">{data.completedSections}/{data.totalSections}</div>
          </div>
          <div className="rounded-lg border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground">Remaining areas</div>
            <div className="mt-1 text-2xl font-semibold">{data.blockingSections}</div>
          </div>
          <div className="rounded-lg border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground">Inputs still needed</div>
            <div className="mt-1 text-2xl font-semibold">{data.externalNeeds.length}</div>
          </div>
        </div>
        {firstActionNeeded ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next setup action</div>
              <div className="mt-1 font-medium">{firstActionNeeded.label}</div>
            </div>
            <Button
              type="button"
              onClick={focusNextAction}
              aria-controls={firstActionNeeded.field === "schoolProfileSetup"
                ? "school-business-profile"
                : firstActionNeeded.field === "familyImportSetup"
                  ? "school-data-setup"
                  : "school-setup-active-section"}
            >
              Continue setup
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
            <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
            Every setup area is ready for final launch review.
          </div>
        )}
      </section>

      <section aria-labelledby="setup-responsibilities-title" className="rounded-xl border bg-card/70 p-5 shadow-sm">
        <h2 id="setup-responsibilities-title" className="text-lg font-semibold">Who handles what</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">The goal is one review path with the fewest possible school-owned steps.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border bg-background/50 p-4">
            <ClipboardCheck aria-hidden="true" className="size-5 text-primary" />
            <div className="mt-3 font-medium">BEE setup team prepares</div>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">Business profile, standard configuration, templates, forms, mappings, and technical verification available from authorized information.</p>
          </div>
          <div className="rounded-lg border bg-background/50 p-4">
            <CheckCircle2 aria-hidden="true" className="size-5 text-primary" />
            <div className="mt-3 font-medium">School reviews and confirms</div>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">Location facts, classroom and staff specifics, tuition policies, source exceptions, and the exact operational launch plan.</p>
          </div>
          <div className="rounded-lg border bg-background/50 p-4">
            <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
            <div className="mt-3 font-medium">Separate secure approvals</div>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">Payout bank entry, family and child source truth, invitations, live billing, access, messaging, and final activation stay separately controlled.</p>
          </div>
        </div>
      </section>

      <CollapsibleCard
        id="school-business-profile"
        className="glass-panel"
        contentClassName="space-y-4"
        eyebrow={(
          <Badge variant={businessProfileConfirmationCurrent ? "default" : localBusinessProfileComplete ? "secondary" : "destructive"}>
            {businessProfileConfirmationCurrent ? "Confirmed" : localBusinessProfileComplete ? "Ready to confirm" : `${localMissingBusinessProfileFields.length} missing`}
          </Badge>
        )}
        title="School business profile"
        description="Review the prepared record, correct anything needed, then confirm it once. A later edit clearly requires reconfirmation."
      >
        <div className={cn(
          "rounded-lg border p-3 text-sm",
          businessProfileConfirmationCurrent
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
            : "bg-background/50 text-muted-foreground",
        )}>
          {businessProfileConfirmationCurrent
            ? `Current profile confirmed${businessProfileConfirmedAtLabel ? ` ${businessProfileConfirmedAtLabel}` : ""}${businessProfileConfirmation.confirmedByEmail ? ` by ${businessProfileConfirmation.confirmedByEmail}` : ""}.`
            : localBusinessProfileComplete
              ? "All required business fields are present. Review them and use Save & confirm school profile."
              : `Add ${localMissingBusinessProfileFields.map((field) => businessProfileFieldLabels[field]).join(", ")} before confirming.`}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <EditableDisplayField id="school-profile-name" name="organization" autoComplete="organization" label="School name" value={businessProfile.name} onChange={(value) => updateBusinessProfile("name", value)} emptyLabel="Required" />
          <EditableDisplayField id="school-profile-address" name="street-address" autoComplete="street-address" label="Street address" value={businessProfile.address} onChange={(value) => updateBusinessProfile("address", value)} emptyLabel="Required before launch" />
          <EditableDisplayField id="school-profile-city" name="address-level2" autoComplete="address-level2" label="City" value={businessProfile.city} onChange={(value) => updateBusinessProfile("city", value)} emptyLabel="Required before launch" />
          <EditableDisplayField id="school-profile-state" name="address-level1" autoComplete="address-level1" label="State or region" value={businessProfile.state} onChange={(value) => updateBusinessProfile("state", value)} emptyLabel="Required before launch" />
          <EditableDisplayField id="school-profile-postal-code" name="postal-code" autoComplete="postal-code" label="Postal code" value={businessProfile.postalCode} onChange={(value) => updateBusinessProfile("postalCode", value)} emptyLabel="Required before launch" />
          <EditableDisplayField id="school-profile-phone" name="tel" autoComplete="tel" type="tel" label="Main phone" inputMode="tel" value={businessProfile.phone} onChange={(value) => updateBusinessProfile("phone", value)} emptyLabel="Required before launch" />
          <EditableDisplayField id="school-profile-email" name="email" autoComplete="email" type="email" spellCheck={false} label="School email" inputMode="email" value={businessProfile.email} onChange={(value) => updateBusinessProfile("email", value)} emptyLabel="Required before launch" />
          <EditableDisplayField id="school-profile-timezone" name="timezone" autoComplete="off" spellCheck={false} label="Timezone" value={businessProfile.timezone} onChange={(value) => updateBusinessProfile("timezone", value)} placeholder="America/New_York" emptyLabel="Required before launch" />
          <EditableDisplayField id="school-profile-capacity" name="licensed-capacity" autoComplete="off" label="Licensed capacity" inputMode="numeric" value={businessProfile.licensedCapacity} onChange={(value) => updateBusinessProfile("licensedCapacity", value)} emptyLabel="Required before launch" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            onClick={() => saveSetup({ confirmBusinessProfile: true })}
            disabled={isPending || !data.centerId || !localBusinessProfileComplete || businessProfileConfirmationCurrent}
          >
            {isPending ? <Loader2 aria-hidden="true" data-icon="inline-start" className="animate-spin" /> : <CheckCircle2 aria-hidden="true" data-icon="inline-start" />}
            {businessProfileConfirmationCurrent ? "School profile confirmed" : "Save & confirm school profile"}
          </Button>
          <Button type="button" variant="outline" onClick={() => saveSetup()} disabled={isPending || !data.centerId || !businessProfileChanged}>
            <Save aria-hidden="true" data-icon="inline-start" />
            Save draft
          </Button>
          <p className="basis-full text-xs leading-5 text-muted-foreground">Location IDs, access, invitations, payment activation, and payout bank details are not changed here.</p>
        </div>
      </CollapsibleCard>

      {message ? <div role="status" aria-live="polite" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      <SchoolDataSetupPanel key={data.dataSetup.assessment.revision} data={data.dataSetup} />

      <SetupChecklistPanel
        checklistKey="director_launch"
        centerId={data.centerId}
        title="School setup checklist"
        description="Verified items complete automatically. Only mark steps that require the school’s confirmation."
        tasks={data.directorChecklistTasks ?? directorLaunchChecklistTasks}
        initialCompletedIds={data.directorChecklistCompletedIds}
        automaticCompletedIds={data.directorChecklistAutomaticCompletedIds}
        graphicHref="/brand/the-bee-suite/explainers/current/school-launch-gates.png"
        defaultCollapsed
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="flex flex-col gap-5">
          <div className="grid gap-3 md:grid-cols-3">
            {data.stats.map((stat) => (
              <div key={stat.label} className="rounded-lg border bg-background/50 p-3">
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className="mt-1 text-lg font-semibold">{stat.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{stat.detail}</div>
              </div>
            ))}
          </div>

          {groups.map((group) => (
            <CollapsibleCard
              key={group}
              id={`school-setup-group-${group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              className="glass-panel"
              contentClassName="grid gap-3"
              title={group}
              description="BEE prepares available setup records; the school confirms only the facts and decisions that require its authority."
            >
                {detailedSections.filter((section) => section.group === group).map((section) => {
                  const status = displayedStatus(section);
                  const Icon = statusIcon(status);
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveId(section.id)}
                      aria-pressed={activeId === section.id}
                      aria-controls="school-setup-active-section"
                      className={cn(
                        "rounded-lg border bg-background/50 p-4 text-left transition hover:border-primary/50",
                        activeId === section.id && "border-primary bg-primary/10",
                      )}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Icon aria-hidden="true" className="size-4 text-primary" />
                            <span className="font-semibold">{section.label}</span>
                            <Badge variant={statusTone(status)}>{statusLabel(status)}</Badge>
                          </div>
                          <p className="mt-2 text-sm leading-5 text-muted-foreground">{section.description}</p>
                          <div className="mt-3 break-words text-xs text-muted-foreground">{section.evidence}</div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Badge variant="outline">{section.owner}</Badge>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </CollapsibleCard>
          ))}
        </div>

        <aside className="flex flex-col gap-4">
          <CollapsibleCard
            id="school-setup-receipt-details"
            className="glass-panel"
            contentClassName="space-y-3"
            title="School receipt details"
            description="Shown on payment receipts and ledger printouts for this school."
          >
              <EditableDisplayField id="school-ein" label="School EIN" inputMode="numeric" value={schoolEin} onChange={setSchoolEin} placeholder="12-3456789" emptyLabel="Add the school EIN" />
              <p className="text-xs text-muted-foreground">
                Enter 9 digits. The app formats it for printed receipts.
              </p>
          </CollapsibleCard>

          {activeSection ? (
            <CollapsibleCard
              id="school-setup-active-section"
              className="glass-panel"
              contentClassName="space-y-4"
              title={activeSection.label}
              description={activeSection.description}
            >
                <div className="grid gap-2">
                  {activeSection.metrics.map((metric) => (
                    <div key={metric} className="break-words rounded-lg border bg-background/50 p-3 text-sm">{metric}</div>
                  ))}
                </div>
                <EditableDisplayField id="setup-notes" label="Setup team / school handoff notes" multiline value={values[activeSection.field] ?? ""} onChange={(value) => updateValue(activeSection.field, value)} placeholder={activeSection.placeholder} emptyLabel="Add a handoff note" />
                <div className="rounded-lg border bg-background/50 p-3">
                  <div className="text-sm font-medium">Required actions</div>
                  <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                    {activeSection.requiredActions.map((action) => <li key={action}>{action}</li>)}
                  </ul>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button onClick={() => saveSetup()} disabled={isPending || !data.centerId || !hasUnsavedChanges}>
                    {isPending ? <Loader2 aria-hidden="true" data-icon="inline-start" className="animate-spin" /> : <Save aria-hidden="true" data-icon="inline-start" />}
                    Save setup note
                  </Button>
                  <Button variant="outline" nativeButton={false} render={<Link href={activeSection.href} />}>
                    <ExternalLink aria-hidden="true" data-icon="inline-start" />
                    {activeSection.actionLabel}
                  </Button>
                  {activeSection.secondaryAction ? (
                    <Button variant="outline" nativeButton={false} render={<Link href={activeSection.secondaryAction.href} />}>
                      <ExternalLink aria-hidden="true" data-icon="inline-start" />
                      {activeSection.secondaryAction.label}
                    </Button>
                  ) : null}
                </div>
            </CollapsibleCard>
          ) : null}

          <CollapsibleCard
            id="school-setup-external-needs"
            className="glass-panel"
            title="Setup team inputs & follow-ups"
            description="Use approved business information for these items. Family/child data, payout bank details, invitations, and activation remain separate school-controlled steps."
          >
              {data.externalNeeds.length ? (
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  {data.externalNeeds.map((need) => <li key={need}>{need}</li>)}
                </ul>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  No additional setup-team inputs are currently missing.
                </div>
              )}
          </CollapsibleCard>
        </aside>
      </div>
    </div>
  );
}
