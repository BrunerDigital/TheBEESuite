"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  FolderUp,
  LifeBuoy,
  Loader2,
  Save,
  School,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  assessSchoolDataSetup,
  schoolDataImportVerificationRevision,
  type SchoolDataReviewAssessment,
  type SchoolDataReviewEvidence,
  type SchoolDataSetup,
  type SchoolDataSetupPath,
  type SchoolDataSourceSystem,
} from "@/lib/school-data-setup";
import { cn } from "@/lib/utils";

export type SchoolDataSetupPanelData = {
  centerId: string | null;
  centerLabel: string;
  setup: SchoolDataSetup;
  evidence: SchoolDataReviewEvidence;
  assessment: SchoolDataReviewAssessment;
};

const pathOptions: Array<{
  value: SchoolDataSetupPath;
  title: string;
  description: string;
  icon: typeof FolderUp;
}> = [
  {
    value: "import_existing",
    title: "Move Existing Records",
    description: "For an operating school with families, children, balances, schedules, staff, or history in another system.",
    icon: FolderUp,
  },
  {
    value: "start_clean",
    title: "Start With a Clean Workspace",
    description: "For a new location that will add classrooms, families, and children directly in The BEE Suite.",
    icon: School,
  },
];

const importSteps = [
  "Choose the complete, unchanged source package for this school.",
  "Let The BEE Suite map fields, find duplicates, and preview every proposed record without writing data.",
  "Resolve only the exceptions the system cannot prove from stable source evidence.",
  "Run whole-school verification, spot-check the school-scoped records, and record final data confirmation.",
];

const cleanStartSteps = [
  "Finish the school profile, classrooms, capacity, ratios, and operating calendar.",
  "Add each family, child, guardian, pickup, safety detail, schedule, and classroom as enrollment begins.",
  "Correct any missing guardian contact or classroom assignment shown below.",
  "Review the current roster—or confirm that no families are expected yet—without creating placeholder records.",
];

function formatDate(value: string | null | undefined) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusVariant(status: SchoolDataReviewAssessment["status"]) {
  if (status === "confirmed") return "default" as const;
  if (status === "ready_to_confirm") return "secondary" as const;
  if (status === "choose_path") return "outline" as const;
  return "destructive" as const;
}

export function SchoolDataSetupPanel({ data }: { data: SchoolDataSetupPanelData }) {
  const router = useRouter();
  const [path, setPath] = useState<SchoolDataSetupPath | "">(data.setup.path ?? "");
  const [sourceSystem, setSourceSystem] = useState<SchoolDataSourceSystem | "">(data.setup.sourceSystem ?? "");
  const [noCurrentFamiliesExpected, setNoCurrentFamiliesExpected] = useState(data.setup.noCurrentFamiliesExpected);
  const [notes, setNotes] = useState(data.setup.notes);
  const [saved, setSaved] = useState(() => ({
    path: (data.setup.path ?? "") as SchoolDataSetupPath | "",
    sourceSystem: (data.setup.sourceSystem ?? "") as SchoolDataSourceSystem | "",
    noCurrentFamiliesExpected: data.setup.noCurrentFamiliesExpected,
    notes: data.setup.notes,
  }));
  const [attested, setAttested] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRequestingHelp, setIsRequestingHelp] = useState(false);
  const automaticVerificationBatchRef = useRef<string | null>(null);
  const hasUnsavedChanges = path !== saved.path
    || sourceSystem !== saved.sourceSystem
    || noCurrentFamiliesExpected !== saved.noCurrentFamiliesExpected
    || notes !== saved.notes;
  const selectedPath = path || null;
  const steps = selectedPath === "import_existing" ? importSteps : cleanStartSteps;
  const localAssessment = assessSchoolDataSetup({
    ...data.setup,
    path: selectedPath,
    sourceSystem: selectedPath === "import_existing" ? sourceSystem || null : null,
    noCurrentFamiliesExpected: selectedPath === "start_clean" && noCurrentFamiliesExpected,
    notes,
  }, data.evidence);
  const completeStepCount = localAssessment.confirmationCurrent
    ? 4
    : selectedPath
      ? localAssessment.canConfirm
        ? 3
        : data.evidence.relevantFamilyCount || data.evidence.latestImportBatch
          ? 2
          : 1
      : 0;
  const pathProgress = Math.round((completeStepCount / 4) * 100);
  const latestBatch = data.evidence.latestImportBatch;
  const latestFleetVerification = data.evidence.latestFleetVerification;
  const latestFleetVerificationIsCurrent = Boolean(
    latestBatch
    && data.evidence.importTargetFingerprint
    && latestFleetVerification?.batchId === latestBatch.id
    && latestFleetVerification.verificationRevision === schoolDataImportVerificationRevision(latestBatch)
    && latestFleetVerification.targetDataFingerprint === data.evidence.importTargetFingerprint,
  );
  const activeSteps = selectedPath ? steps : [];

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (
      saved.path !== "import_existing"
      || hasUnsavedChanges
      || !latestBatch
      || latestBatch.status === "processing"
      || latestBatch.unresolvedRows > 0
      || !latestBatch.sourceSha256
      || !latestBatch.reviewFingerprint
      || localAssessment.status !== "needs_verification"
      || latestFleetVerificationIsCurrent
      || automaticVerificationBatchRef.current === latestBatch.id
    ) return;
    automaticVerificationBatchRef.current = latestBatch.id;
    let cancelled = false;
    setIsVerifying(true);
    setMessage("Running the required whole-school verification automatically…");
    setError("");
    const params = new URLSearchParams({ batchId: latestBatch.id, report: "fleet-verification" });
    void fetch(`/api/imports/procare?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null) as { ok?: boolean; error?: string; report?: { blockers?: string[] } } | null;
        if (!response.ok || !json?.ok) throw new Error(json?.error || "Whole-school verification could not be completed.");
        if (cancelled) return;
        const blockers = json.report?.blockers?.length ?? 0;
        setMessage(blockers
          ? `Automatic verification found ${blockers.toLocaleString()} blocker${blockers === 1 ? "" : "s"}. Open Data Review for the exact evidence needed.`
          : "Automatic whole-school verification passed. Complete the final school review below.");
        router.refresh();
      })
      .catch((verificationError: unknown) => {
        if (!cancelled) setError(verificationError instanceof Error ? verificationError.message : "Whole-school verification could not be completed.");
      })
      .finally(() => {
        if (!cancelled) setIsVerifying(false);
      });
    return () => { cancelled = true; };
  }, [hasUnsavedChanges, latestBatch, latestFleetVerificationIsCurrent, localAssessment.status, router, saved.path]);

  function choosePath(nextPath: SchoolDataSetupPath) {
    setPath(nextPath);
    setAttested(false);
    if (nextPath === "start_clean") {
      setSourceSystem("");
    } else {
      setNoCurrentFamiliesExpected(false);
    }
  }

  function persist(confirmDataReview = false) {
    setMessage("");
    setError("");
    if (!path) {
      setError("Choose how this school is starting, then save the starting point.");
      return;
    }
    if (path === "import_existing" && !sourceSystem) {
      setError("Choose the previous source system before saving this import path.");
      return;
    }
    startTransition(async () => {
      try {
        const response = await fetch("/api/school-setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            centerId: data.centerId,
            dataSetup: {
              path,
              sourceSystem,
              noCurrentFamiliesExpected,
              notes,
            },
            confirmDataReview,
          }),
        });
        const json = await response.json().catch(() => null) as {
          ok?: boolean;
          error?: string;
          dataSetup?: SchoolDataSetup;
        } | null;
        if (!response.ok || !json?.ok || !json.dataSetup) {
          throw new Error(json?.error || "The school data starting point could not be saved.");
        }
        const canonical = json.dataSetup;
        const canonicalPath = canonical.path ?? "";
        const canonicalSource = canonical.sourceSystem ?? "";
        setPath(canonicalPath);
        setSourceSystem(canonicalSource);
        setNoCurrentFamiliesExpected(canonical.noCurrentFamiliesExpected);
        setNotes(canonical.notes);
        setSaved({
          path: canonicalPath,
          sourceSystem: canonicalSource,
          noCurrentFamiliesExpected: canonical.noCurrentFamiliesExpected,
          notes: canonical.notes,
        });
        setAttested(false);
        setMessage(confirmDataReview ? "School data review confirmed." : "School data starting point saved.");
        router.refresh();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "The school data starting point could not be saved.");
      }
    });
  }

  async function runWholeSchoolVerification() {
    if (!latestBatch) return;
    setMessage("");
    setError("");
    setIsVerifying(true);
    try {
      const params = new URLSearchParams({ batchId: latestBatch.id, report: "fleet-verification" });
      const response = await fetch(`/api/imports/procare?${params.toString()}`, { cache: "no-store" });
      const json = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        report?: { status?: string; blockers?: string[] };
      } | null;
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Whole-school verification could not be completed.");
      }
      const blockers = json.report?.blockers?.length ?? 0;
      setMessage(blockers
        ? `Whole-school verification found ${blockers.toLocaleString()} blocker${blockers === 1 ? "" : "s"}. Open Data Review for the exact evidence needed.`
        : "Whole-school verification is ready for director review.");
      router.refresh();
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "Whole-school verification could not be completed.");
    } finally {
      setIsVerifying(false);
    }
  }

  async function requestSetupHelp() {
    if (!data.centerId) return;
    setMessage("");
    setError("");
    setIsRequestingHelp(true);
    try {
      const response = await fetch("/api/school-setup/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId: data.centerId }),
      });
      const json = await response.json().catch(() => null) as { ok?: boolean; error?: string; message?: string } | null;
      if (!response.ok || !json?.ok) throw new Error(json?.error || "Setup help could not be requested.");
      setMessage(json.message || "Setup help requested.");
    } catch (supportError) {
      setError(supportError instanceof Error ? supportError.message : "Setup help could not be requested.");
    } finally {
      setIsRequestingHelp(false);
    }
  }

  return (
    <section id="school-data-setup" className="scroll-mt-24 rounded-xl border bg-card/80 p-5 shadow-sm" aria-labelledby="school-data-setup-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Data Starting Point</Badge>
            <Badge variant={statusVariant(localAssessment.status)}>{localAssessment.label}</Badge>
            {hasUnsavedChanges ? <Badge variant="outline">Unsaved Changes</Badge> : null}
          </div>
          <h2 id="school-data-setup-title" className="mt-3 text-pretty text-2xl font-semibold">Choose How {data.centerLabel} Starts</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            One choice gives the school the right workflow. Existing schools keep source evidence and review every proposed change; new schools add records directly without manufacturing an import or placeholder families.
          </p>
        </div>
        <div className="min-w-44 rounded-xl border bg-background/60 p-3">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Data Setup</span>
            <span className="tabular-nums">{pathProgress}%</span>
          </div>
          <Progress value={pathProgress} className="mt-2" aria-label="School data setup progress" />
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {pathOptions.map((option) => {
          const Icon = option.icon;
          const selected = path === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => choosePath(option.value)}
              disabled={isPending}
              className={cn(
                "min-h-28 rounded-xl border p-4 text-left transition-[border-color,background-color,color] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-primary bg-primary/10" : "bg-background/55 hover:border-primary/45 hover:bg-primary/5",
              )}
            >
              <span className="flex items-start gap-3">
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{option.title}</span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">{option.description}</span>
                </span>
                {selected ? <CheckCircle2 aria-hidden="true" className="ml-auto size-5 shrink-0 text-primary" /> : null}
              </span>
            </button>
          );
        })}
      </div>

      {selectedPath ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <div className="space-y-4">
            {selectedPath === "import_existing" ? (
              <div className="space-y-2">
                <label htmlFor="school-data-source" className="text-sm font-medium">Previous Source</label>
                <Select value={sourceSystem} onValueChange={(value) => { setSourceSystem((value ?? "") as SchoolDataSourceSystem | ""); setAttested(false); }}>
                  <SelectTrigger id="school-data-source" className="min-h-11"><SelectValue placeholder="Choose the previous system…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="procare">ProCare Export Package</SelectItem>
                    <SelectItem value="other">Another System or Spreadsheet</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs leading-5 text-muted-foreground">
                  {sourceSystem === "other"
                    ? "Use the guided BEE flat-file adapter for one reviewed CSV, TSV, spreadsheet, or pasted table. Map the columns, retain stable source IDs, and resolve every exception before confirming."
                    : "Use the full school package. The importer identifies reports by their columns, preserves source rows, and blocks ambiguous matches."}
                </p>
              </div>
            ) : (
              <label className="flex min-h-11 items-start gap-3 rounded-xl border bg-background/60 p-4 text-sm">
                <input
                  type="checkbox"
                  name="noCurrentFamiliesExpected"
                  checked={noCurrentFamiliesExpected}
                  onChange={(event) => { setNoCurrentFamiliesExpected(event.target.checked); setAttested(false); }}
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                />
                <span>
                  <span className="block font-medium">No current families or children are expected yet</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">Use this only for a new school before enrollment begins. The app will not create placeholder people.</span>
                </span>
              </label>
            )}

            <div className="rounded-xl border bg-background/45 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck aria-hidden="true" className="size-4 text-primary" /> Your 4-Step Path</div>
              <ol className="mt-3 grid gap-3">
                {activeSteps.map((step, index) => (
                  <li key={step} className="flex items-start gap-3 text-sm leading-5">
                    <span className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                      index < completeStepCount ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground",
                    )}>{index < completeStepCount ? "✓" : index + 1}</span>
                    <span className="pt-1 text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="space-y-2">
              <label htmlFor="school-data-setup-notes" className="text-sm font-medium">Setup Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Textarea
                id="school-data-setup-notes"
                name="schoolDataSetupNotes"
                autoComplete="off"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add source-package details, enrollment timing, or a setup-team handoff note…"
                maxLength={2_000}
              />
              <p className="text-xs leading-5 text-muted-foreground">Keep this to operational handoff details. Do not place family or child details, passwords, bank information, or verification codes in setup notes.</p>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border bg-background/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><FileSearch aria-hidden="true" className="size-4 text-primary" /> Current Evidence</div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Current Families</dt><dd className="mt-1 font-semibold tabular-nums">{data.evidence.familyCount.toLocaleString()}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Current Children</dt><dd className="mt-1 font-semibold tabular-nums">{data.evidence.childCount.toLocaleString()}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Prospective Families</dt><dd className="mt-1 font-semibold tabular-nums">{data.evidence.prospectiveFamilyCount.toLocaleString()}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Prospective Children</dt><dd className="mt-1 font-semibold tabular-nums">{data.evidence.prospectiveChildCount.toLocaleString()}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Relevant Guardians</dt><dd className="mt-1 font-semibold tabular-nums">{data.evidence.guardianCount.toLocaleString()}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Import Batches</dt><dd className="mt-1 font-semibold tabular-nums">{data.evidence.importBatchCount.toLocaleString()}</dd></div>
              </dl>
              {selectedPath === "start_clean" ? (
                <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                   <p>{data.evidence.familiesMissingGuardianCount.toLocaleString()} current or prospective families missing a guardian</p>
                   <p>{data.evidence.familiesMissingChildCount.toLocaleString()} family records missing a child</p>
                   <p>{data.evidence.childrenNeedingEnrollmentStatusReviewCount.toLocaleString()} children needing enrollment-status review</p>
                   <p>{data.evidence.guardiansMissingContactCount.toLocaleString()} guardians missing both email and phone</p>
                   <p>{data.evidence.childrenMissingClassroomCount.toLocaleString()} current children missing a classroom</p>
                   <p>{data.evidence.childrenMissingScheduleCount.toLocaleString()} current children missing a schedule</p>
                   <p>{data.evidence.familiesMissingEmergencyContactCount.toLocaleString()} current or prospective families missing an emergency contact</p>
                </div>
              ) : latestBatch ? (
                <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                  <p className="break-words"><span className="font-medium text-foreground">Latest:</span> {latestBatch.filename}</p>
                   <p>Status: {latestBatch.status.replaceAll("_", " ")} · {latestBatch.unresolvedRows.toLocaleString()} unresolved</p>
                   <p>Adapter: {latestBatch.sourceAdapter === "bee_flat_file_v1" ? "BEE mapped flat file" : "ProCare package"}</p>
                  <p>Imported {formatDate(latestBatch.createdAt)}</p>
                  <p>Whole-school check: {data.evidence.latestFleetVerification?.batchId === latestBatch.id ? data.evidence.latestFleetVerification.status.replaceAll("_", " ") : "Not run for latest batch"}</p>
                </div>
              ) : null}
            </div>

            <Alert variant={localAssessment.canConfirm || localAssessment.confirmationCurrent ? "default" : "destructive"}>
              {localAssessment.confirmationCurrent ? <ShieldCheck aria-hidden="true" className="size-4" /> : <Users aria-hidden="true" className="size-4" />}
              <AlertTitle>{localAssessment.label}</AlertTitle>
              <AlertDescription>{localAssessment.detail}</AlertDescription>
            </Alert>

            {localAssessment.baselineFrozen ? (
              <Alert>
                <ShieldCheck aria-hidden="true" className="size-4" />
                <AlertTitle>Approved launch baseline is frozen</AlertTitle>
                <AlertDescription>
                  {localAssessment.changedDomains.length
                    ? `Normal school operations have since changed ${localAssessment.changedDomains.join(", ")}. The launch approval and its source receipt remain preserved for audit history.`
                    : "The launch approval and its exact source evidence remain preserved for audit history."}
                  {localAssessment.changeDeltas.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {localAssessment.changeDeltas.map((delta) => <li key={delta}>{delta}</li>)}
                    </ul>
                  ) : null}
                  {data.setup.reviewConfirmation?.sourceEvidenceReceipt ? (
                    <Button className="mt-3" size="sm" variant="outline" nativeButton={false} render={<a href={`/api/imports/procare?batchId=${encodeURIComponent(data.setup.reviewConfirmation.sourceEvidenceReceipt.batchId)}`} />}>
                      Download Approved Source Backup
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            {localAssessment.canConfirm && !localAssessment.confirmationCurrent ? (
              <label className="flex min-h-11 items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
                <input
                  type="checkbox"
                  name="schoolDataReviewAttestation"
                  checked={attested}
                  onChange={(event) => setAttested(event.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                />
                <span>
                  <span className="block font-medium">I confirm this school’s current data starting point</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">I reviewed this school’s current and prospective family relationships, guardian contact details, emergency contacts, schedules, safety records, classroom assignments, and every unresolved source item—or confirmed that this new school has no families yet. This does not activate invitations, billing, payments, kiosk access, or cutover.</span>
                </span>
              </label>
            ) : null}

            {data.setup.reviewConfirmation ? (
              <p className="text-xs text-muted-foreground">Last data confirmation: {formatDate(data.setup.reviewConfirmation.confirmedAt)}</p>
            ) : null}
          </aside>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:flex-wrap">
        <Button type="button" onClick={() => persist(false)} disabled={isPending || !data.centerId || !hasUnsavedChanges}>
          {isPending ? <Loader2 aria-hidden="true" data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" data-icon="inline-start" />}
          Save Starting Point
        </Button>
        {selectedPath === "import_existing" ? (
          hasUnsavedChanges ? (
            <Button type="button" variant="outline" disabled>Save Before Opening Data Review</Button>
          ) : (
            <Button variant="outline" nativeButton={false} render={<Link href="/data-readiness?tab=procare" />}>
              <FolderUp aria-hidden="true" data-icon="inline-start" /> Open Guided Import & Review
            </Button>
          )
        ) : selectedPath === "start_clean" ? (
          hasUnsavedChanges ? (
            <Button type="button" variant="outline" disabled>Save Before Adding Records</Button>
          ) : (
            <>
              <Button variant="outline" nativeButton={false} render={<Link href="/classroom-dashboard#classroom-editor" />}>
                Set Up Classrooms <ArrowRight aria-hidden="true" data-icon="inline-end" />
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href="/family-detail" />}>
                Add or Review Families <ArrowRight aria-hidden="true" data-icon="inline-end" />
              </Button>
            </>
          )
        ) : null}
        {selectedPath === "import_existing" && latestBatch && !hasUnsavedChanges ? (
          <Button type="button" variant="outline" onClick={runWholeSchoolVerification} disabled={isVerifying || isPending || latestBatch.status === "processing"}>
            {isVerifying ? <Loader2 aria-hidden="true" data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <FileSearch aria-hidden="true" data-icon="inline-start" />}
            Run Whole-School Check
          </Button>
        ) : null}
        {localAssessment.canConfirm && !localAssessment.confirmationCurrent ? (
          <Button type="button" onClick={() => persist(true)} disabled={!attested || hasUnsavedChanges || isPending}>
            <ShieldCheck aria-hidden="true" data-icon="inline-start" /> Confirm Data Review
          </Button>
        ) : null}
        {!localAssessment.confirmationCurrent ? (
          <Button type="button" variant="ghost" onClick={requestSetupHelp} disabled={!data.centerId || isRequestingHelp || isPending}>
            {isRequestingHelp ? <Loader2 aria-hidden="true" data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <LifeBuoy aria-hidden="true" data-icon="inline-start" />}
            Request Setup Help
          </Button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border bg-emerald-500/5 p-4">
          <div className="text-sm font-semibold">BEE Setup Team Prepares</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">School profile, business configuration, forms, tuition and billing rules, integration preparation, templates, and technical QA can be completed from approved business information.</p>
        </div>
        <div className="rounded-xl border bg-amber-500/5 p-4">
          <div className="text-sm font-semibold">School Confirms</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Family and child facts, any source exceptions, the payout bank on the secure provider page, exact invitation scope, and the final school-specific launch decision.</p>
        </div>
      </div>

      {error ? <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      {message ? <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">{message}</div> : null}
    </section>
  );
}
