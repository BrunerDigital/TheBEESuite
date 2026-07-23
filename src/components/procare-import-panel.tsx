"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Download, Eye, LoaderCircle, Upload, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type CenterOption = {
  id: string;
  name: string;
};

type ImportResponse = {
  dryRun?: boolean;
  partial?: boolean;
  error?: string;
  batchId?: string;
  nextRow?: number;
  totalRows?: number;
  summary?: ImportPreview & Record<string, number | string | unknown>;
};

function uploadImport(formData: FormData, onProgress: (percent: number, uploaded: boolean) => void) {
  return new Promise<{ ok: boolean; status: number; json: ImportResponse | null }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/imports/procare");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.max(1, Math.round((event.loaded / event.total) * 10)), false);
    });
    request.upload.addEventListener("load", () => onProgress(10, true));
    request.addEventListener("load", () => {
      let json: ImportResponse | null = null;
      try { json = JSON.parse(request.responseText) as ImportResponse; } catch { /* Use the standard fallback message. */ }
      resolve({ ok: request.status >= 200 && request.status < 300, status: request.status, json });
    });
    request.addEventListener("error", () => reject(new Error("The upload connection failed.")));
    request.addEventListener("abort", () => reject(new Error("The upload was cancelled.")));
    request.send(formData);
  });
}

type ImportPreview = {
  rows: number;
  totalRows?: number;
  readyRows: number;
  warningRows: number;
  unmappedRows: number;
  familyRows: number;
  staffRows: number;
  sourceFamilyGroups?: number;
  sourceChildGroups?: number;
  sourceGuardianGroups?: number;
  familyChildLinks?: number;
  familyGuardianLinks?: number;
  familiesWithCompleteProfileLinks?: number;
  sourceStaffGroups?: number;
  matchedFamilies: number;
  newFamilies: number;
  matchedChildren: number;
  newChildren: number;
  matchedStaff: number;
  newStaff: number;
  createdFamilies?: number;
  updatedFamilies?: number;
  createdChildren?: number;
  createdClassrooms?: number;
  createdStaff?: number;
  updatedStaff?: number;
  createdStaffLogins?: number;
  emergencyContacts?: number;
  authorizedPickups?: number;
  medicalRows?: number;
  invoiceRows?: number;
  ledgerRows?: number;
  imported?: number;
  unresolved?: number;
  disposed?: number;
  sourceType?: string;
  classroomsReferenced: number;
  balanceRows: number;
  attendanceRows: number;
  checkLogRows: number;
  centersTouched: number;
  duplicateMatches?: number;
  duplicateReviewRows?: number;
  duplicateScanSkipped?: boolean;
  duplicateScanRowLimit?: number;
  duplicateReviewChunks?: number;
  relationshipSafeReview?: boolean;
  existingMatchPreviewSkipped?: boolean;
  duplicateMatchesByEntity?: {
    families: number;
    children: number;
    guardians: number;
  };
  duplicateMatchMode?: string;
  duplicateMatchDetails?: Array<{
    rowNumber: number;
    entity: "family" | "child" | "guardian";
    importLabel: string;
    recommendedRecordId: string | null;
    resolution: "auto_match" | "needs_review" | "create_new";
    candidates: Array<{
      recordId: string;
      label: string;
      confidence: "high" | "medium" | "low";
      score: number;
      reasons: string[];
    }>;
  }>;
  sourceSha256?: string;
  reviewFingerprint?: string;
  warningRowNumbers?: number[];
  duplicateReviewRowNumbers?: number[];
  headerAnalysis?: Array<{ source: string; normalized: string; suggestedField: string; recognized: boolean }>;
  fieldOptions?: Array<{ key: string; label: string }>;
  correlationReview?: Array<{
    id: string;
    title: string;
    description: string;
    required: boolean;
    correlations: Array<{ source: string; destination: string; label: string; recognized: boolean }>;
  }>;
  datasetCoverage?: {
    sourceInventory?: Array<{
      sourceName: string;
      reportKind: string;
      rows: number;
      matchedHeaderAliases: number;
      note?: string;
    }>;
    sourceRows?: Record<string, number>;
    rawSourceRows?: Record<string, number>;
    duplicateSourceRowsRemoved?: Record<string, number>;
  };
  warnings?: Array<{ rowNumber: number; message: string }>;
  rowResults?: Array<{
    rowNumber: number;
    status: "ready" | "warning";
    entity: string;
    center: string;
    action: string;
    familyName?: string;
    childName?: string;
    staffName?: string;
    relationshipSummary?: string;
    message?: string;
  }>;
};

function previewRecordLabel(row: NonNullable<ImportPreview["rowResults"]>[number]) {
  return row.staffName ?? row.childName ?? row.familyName ?? row.message ?? row.entity;
}

function previewStatusVariant(status: "ready" | "warning") {
  return status === "ready" ? "default" : "destructive";
}

function selectedFileIdentity(file: File) {
  return `${file.webkitRelativePath || file.name}\0${file.size}\0${file.lastModified}`;
}

function selectedFileLabel(file: File) {
  return file.webkitRelativePath || file.name || "unnamed file";
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function sumCounts(...counts: Array<number | null | undefined>): number {
  return counts.reduce<number>((total, count) => total + Number(count ?? 0), 0);
}

function bestCount(...counts: Array<number | null | undefined>): number {
  return Math.max(0, ...counts.map((count) => Number(count ?? 0)));
}

type SetupReadinessStatus = "ready" | "needs_review" | "next" | "held";

function setupReadinessLabel(status: SetupReadinessStatus) {
  if (status === "ready") return "Ready";
  if (status === "needs_review") return "Needs review";
  if (status === "held") return "Held off";
  return "Next";
}

export function ProcareImportPanel({ centers, allowBulkImport = false }: { centers: CenterOption[]; allowBulkImport?: boolean }) {
  const router = useRouter();
  const [centerId, setCenterId] = useState(allowBulkImport ? "auto" : centers[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [duplicateMatchMode, setDuplicateMatchMode] = useState("review");
  const [duplicateReviewConfirmed, setDuplicateReviewConfirmed] = useState(false);
  const [sourceInventoryConfirmed, setSourceInventoryConfirmed] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [correlationConfirmations, setCorrelationConfirmations] = useState<string[]>([]);
  const [reviewStale, setReviewStale] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressPhase, setProgressPhase] = useState<"idle" | "uploading" | "processing" | "complete">("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [lastImportSummary, setLastImportSummary] = useState<ImportPreview | null>(null);
  const [lastBatchId, setLastBatchId] = useState("");
  const [disposedRowNumbers, setDisposedRowNumbers] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const submitLockedRef = useRef(false);

  function clearPreview() {
    setPreview(null);
    setLastImportSummary(null);
    setPreviewDialogOpen(false);
    setDuplicateReviewConfirmed(false);
    setSourceInventoryConfirmed(false);
    setCorrelationConfirmations([]);
    setReviewStale(false);
    setLastBatchId("");
    setStatus("");
    setProgressPhase("idle");
    setProgressPercent(0);
    setProgressMessage("");
  }

  function addSelectedFiles(files: FileList | null) {
    const addedFiles = Array.from(files ?? []);
    setSelectedFiles((current) => {
      const merged = new Map(current.map((file) => [selectedFileIdentity(file), file]));
      for (const file of addedFiles) merged.set(selectedFileIdentity(file), file);
      return [...merged.values()];
    });
    clearPreview();
  }

  function markReviewStale() {
    setDuplicateReviewConfirmed(false);
    setCorrelationConfirmations([]);
    setReviewStale(true);
  }

  function removeSelectedFile(identity: string) {
    setSelectedFiles((current) => current.filter((file) => selectedFileIdentity(file) !== identity));
    clearPreview();
  }

  function downloadBackup(batchId: string) {
    const params = new URLSearchParams();
    params.set("batchId", batchId);
    if (batchId === "latest") params.set("centerId", centerId);
    window.location.href = `/api/imports/procare?${params.toString()}`;
  }

  function downloadReconciliation(batchId: string) {
    const params = new URLSearchParams({ batchId, report: "reconciliation" });
    window.open(`/api/imports/procare?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  function submit(dryRun: boolean) {
    if (submitLockedRef.current) return;
    if (!dryRun && (
      !preview?.sourceSha256
      || !preview.reviewFingerprint
      || !Array.isArray(preview.warningRowNumbers)
      || !Array.isArray(preview.duplicateReviewRowNumbers)
    )) {
      setError("Submit this exact ProCare export for review before committing it.");
      return;
    }
    submitLockedRef.current = true;
    setStatus("");
    setError("");
    setProgressPhase("uploading");
    setProgressPercent(5);
    setProgressMessage(dryRun ? "Uploading ProCare data for analysis..." : "Uploading ProCare data...");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("centerId", centerId);
        formData.set("dryRun", String(dryRun));
        formData.set("duplicateMatchMode", duplicateMatchMode);
        formData.set("duplicateReviewConfirmed", String(duplicateReviewConfirmed));
        formData.set("sourceInventoryConfirmed", String(sourceInventoryConfirmed));
        formData.set("fieldMapping", JSON.stringify(fieldMapping));
        formData.set("correlationConfirmations", correlationConfirmations.join(","));
        formData.set("disposedRowNumbers", disposedRowNumbers.join(","));
        if (!dryRun && preview) {
          formData.set("sourceSha256", preview.sourceSha256 ?? "");
          formData.set("reviewFingerprint", preview.reviewFingerprint ?? "");
          formData.set("reviewWarningRowNumbers", (preview.warningRowNumbers ?? []).join(","));
          formData.set("reviewDuplicateWarningRowNumbers", (preview.duplicateReviewRowNumbers ?? []).join(","));
        }
        if (csv.trim()) formData.set("csv", csv);
        for (const file of selectedFiles) formData.append("file", file);
        let response: Awaited<ReturnType<typeof uploadImport>>;
        let json: ImportResponse | null;
        let resumeBatchId = "";
        let nextRow = 1;
        do {
          if (!dryRun) {
            formData.set("chunkStart", String(nextRow));
            formData.set("chunkSize", "20");
            if (resumeBatchId) formData.set("batchId", resumeBatchId);
          }
          response = await uploadImport(formData, (percent, uploaded) => {
            setProgressPercent((current) => Math.max(current, percent));
            if (uploaded) {
              setProgressPhase("processing");
              setProgressMessage(dryRun
                ? "Analyzing records and preparing the review..."
                : resumeBatchId
                  ? `Continuing the resumable import from row ${nextRow.toLocaleString()}...`
                  : "Upload complete. Matching and importing records...");
            }
          });
          json = response.json;
          if (!response.ok || !json?.partial) break;
          resumeBatchId = json.batchId ?? resumeBatchId;
          nextRow = json.nextRow ?? nextRow;
          const totalRows = Math.max(json.totalRows ?? 1, 1);
          const completedRows = Number(json.summary?.rows ?? Math.max(nextRow - 1, 0));
          setProgressPercent(Math.min(95, 10 + Math.round((completedRows / totalRows) * 85)));
          setProgressMessage(`Imported ${completedRows.toLocaleString()} of ${totalRows.toLocaleString()} records. Continuing automatically...`);
        } while (json?.partial);
        if (!response.ok) {
          setProgressPhase("idle");
          setProgressPercent(0);
          setError(response.status === 504
            ? "The import request timed out before completing. Keep this page open and retry with the same selected files; they are still selected."
            : json?.error || `ProCare import could not be processed${response.status ? ` (error ${response.status})` : ""}.`);
          if (dryRun && json?.summary) {
            setPreview(json.summary);
            setPreviewDialogOpen(true);
          }
          return;
        }
        if (json?.dryRun) {
          setProgressPhase("complete");
          setProgressPercent(100);
          setProgressMessage("Upload complete. Import review is ready.");
          setPreview(json.summary ?? null);
          setLastImportSummary(null);
          setPreviewDialogOpen(true);
          setDuplicateReviewConfirmed(false);
          setSourceInventoryConfirmed(false);
          setCorrelationConfirmations([]);
          setReviewStale(false);
          setLastBatchId("");
          return;
        }
        const summary = json?.summary;
        const completedSummary = preview && summary ? { ...preview, ...summary } : summary ?? preview ?? null;
        const unresolved = Number(summary?.unresolved ?? 0);
        if (!unresolved) {
          setCsv("");
          setPreview(null);
          setPreviewDialogOpen(false);
          setDisposedRowNumbers([]);
          setCorrelationConfirmations([]);
          setReviewStale(false);
          if (fileRef.current) fileRef.current.value = "";
          setSelectedFiles([]);
        } else {
          setPreview(completedSummary);
          setPreviewDialogOpen(false);
        }
        setLastImportSummary(completedSummary);
        setDuplicateReviewConfirmed(false);
        setSourceInventoryConfirmed(false);
        setLastBatchId(json?.batchId ?? "");
        setProgressPhase("complete");
        setProgressPercent(100);
        setProgressMessage("Upload and import complete.");
        setStatus(
          `Imported ${summary?.imported ?? 0} rows from ${summary?.sourceType ?? "ProCare"} across ${summary?.centersTouched ?? 1} center(s), created ${summary?.createdFamilies ?? 0} families, ${summary?.createdChildren ?? 0} children, ${summary?.createdClassrooms ?? 0} classrooms, ${summary?.createdStaff ?? 0} staff, ${summary?.createdStaffLogins ?? 0} staff logins, ${summary?.invoiceRows ?? 0} invoices, and ${summary?.checkLogRows ?? 0} check logs.${unresolved ? ` ${unresolved} row(s) were safely retained below for mapping or disposal.` : ""}`,
        );
        router.refresh();
      } catch {
        setProgressPhase("idle");
        setProgressPercent(0);
        setError(dryRun
          ? "Import review could not be prepared. Check the file and try again; the selected files remain attached."
          : "ProCare import could not be committed. Keep this page open and retry with the same selected files; they remain attached.");
      } finally {
        submitLockedRef.current = false;
      }
    });
  }

  function disposeRows(rowNumbers: number[], disposeAll = false) {
    if (!lastBatchId || (!disposeAll && !rowNumbers.length)) return;
    startTransition(async () => {
      setError("");
      const response = await fetch("/api/imports/procare", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: lastBatchId, rowNumbers, action: disposeAll ? "dispose_all" : "dispose" }),
      });
      const json = await response.json().catch(() => null) as { error?: string; disposed?: number } | null;
      if (!response.ok) {
        setError(json?.error || "The unresolved ProCare data could not be disposed.");
        return;
      }
      if (!disposeAll) setDisposedRowNumbers((current) => [...new Set([...current, ...rowNumbers])]);
      setPreview((current) => current ? {
        ...current,
        unresolved: Math.max((current.unresolved ?? 0) - (json?.disposed ?? rowNumbers.length), 0),
        warningRows: Math.max(current.warningRows - (json?.disposed ?? rowNumbers.length), 0),
        rowResults: disposeAll ? [] : current.rowResults?.filter((row) => !rowNumbers.includes(row.rowNumber)),
      } : current);
      setStatus(`${json?.disposed ?? rowNumbers.length} unresolved ProCare row(s) were disposed with an audit record.`);
    });
  }

  const duplicateReviewRows = preview?.duplicateReviewRows ?? 0;
  const blockingWarningRows = preview ? Math.max(preview.warningRows - duplicateReviewRows, 0) : 0;
  const importWorking = progressPhase === "uploading" || progressPhase === "processing";
  const busy = isPending || importWorking;
  const duplicateScanSummary = `Complete duplicate analysis ran in ${preview?.duplicateReviewChunks ?? 1} relationship-preserving review chunk(s) and found ${preview?.duplicateMatches ?? 0} possible match groups across ${duplicateReviewRows} review row(s).`;
  const pastedCsvPresent = Boolean(csv.trim());
  const selectedFilesTotalBytes = selectedFiles.reduce((total, file) => total + file.size, 0);
  const hasMixedSources = pastedCsvPresent && selectedFiles.length > 0;
  const hasImportSource = pastedCsvPresent || selectedFiles.length > 0;
  const noCentersAvailable = !centers.length;
  const hasCompletedPreview = Boolean(
    !reviewStale
    &&
    preview?.sourceSha256
    && preview.reviewFingerprint
    && Array.isArray(preview.warningRowNumbers)
    && Array.isArray(preview.duplicateReviewRowNumbers),
  );
  const canPreview = !busy && Boolean(centerId) && hasImportSource && !hasMixedSources && !noCentersAvailable;
  const requiredCorrelationSections = preview?.correlationReview?.filter((section) => section.required) ?? [];
  const missingCorrelationSections = requiredCorrelationSections.filter((section) => !correlationConfirmations.includes(section.id));
  const sourceInventory = preview?.datasetCoverage?.sourceInventory ?? [];
  const recognizedSourceFiles = sourceInventory.filter((source) => !["ignored", "evidence_only"].includes(source.reportKind));
  const evidenceOnlySourceFiles = sourceInventory.filter((source) => source.reportKind === "evidence_only");
  const ignoredSourceFiles = sourceInventory.filter((source) => source.reportKind === "ignored");
  const sourceRowsTotal = Object.values(preview?.datasetCoverage?.sourceRows ?? {}).reduce((total, count) => total + count, 0);
  const rawSourceRowsTotal = Object.values(preview?.datasetCoverage?.rawSourceRows ?? {}).reduce((total, count) => total + count, 0);
  const duplicateSourceRowsRemoved = preview?.datasetCoverage?.duplicateSourceRowsRemoved;
  const duplicateSourceRowsRemovedDetails = duplicateSourceRowsRemoved
    ? Object.entries(duplicateSourceRowsRemoved).filter(([, count]) => count > 0)
    : [];
  const duplicateSourceRowsRemovedTotal = duplicateSourceRowsRemoved
    ? duplicateSourceRowsRemovedDetails.reduce((total, [, count]) => total + count, 0)
    : 0;
  const importCommitted = progressPhase === "complete" && Boolean(lastBatchId);
  const needsSourceInventoryConfirmation = Boolean(preview?.datasetCoverage);
  const sourceInventoryReady = !needsSourceInventoryConfirmation || sourceInventoryConfirmed || importCommitted;
  const hasReviewedImport = hasCompletedPreview || importCommitted;
  const commitBlockedReason = noCentersAvailable
    ? "This account needs an active school assignment before importing."
    : !centerId
    ? "Choose a center before importing."
      : !hasImportSource
      ? "Choose a CSV export or paste CSV text before submitting."
      : hasMixedSources
      ? "Choose either uploaded files or pasted CSV text before submitting."
      : !hasCompletedPreview
      ? "Submit this exact ProCare export for review before committing it."
      : !sourceInventoryReady
      ? "Confirm the detected ProCare source inventory before importing."
      : missingCorrelationSections.length
      ? `Confirm each correlation step in order before importing: ${missingCorrelationSections.map((section) => section.title).join(", ")}.`
      : "";
  const reviewRows = preview?.rowResults ?? [];
  const reviewRowsShown = reviewRows.length;
  const readyReviewRows = reviewRows.filter((row) => row.status === "ready").length;
  const warningReviewRows = reviewRows.filter((row) => row.status === "warning").length;
  const unknownHeaders = preview?.headerAnalysis?.filter((header) => (
    !header.recognized
    && !fieldMapping[header.source]
    && !/^procare\s/.test(header.normalized)
    && !["row type", "import warning"].includes(header.normalized)
  )) ?? [];
  const workflowStages = [
    { label: "Select sources", complete: hasImportSource || Boolean(preview) || importCommitted },
    { label: "Detect reports", complete: Boolean(preview) || importCommitted },
    { label: "Normalize records", complete: Boolean(preview) || importCommitted },
    { label: "Review data", complete: hasCompletedPreview || importCommitted },
    {
      label: "Confirm sources and mappings",
      complete: (hasReviewedImport && sourceInventoryReady && (!requiredCorrelationSections.length || !missingCorrelationSections.length)) || importCommitted,
    },
    { label: "Resolve duplicates", complete: (hasReviewedImport && (!duplicateReviewRows || duplicateReviewConfirmed)) || importCommitted },
    { label: "Commit safely", complete: Boolean(lastBatchId) },
    { label: "Handoff ready", complete: importCommitted },
  ];
  const completedWorkflowSteps = workflowStages.filter((stage) => stage.complete).length;
  const workflowPercent = Math.round((completedWorkflowSteps / workflowStages.length) * 100);
  const setupSummary = preview ?? lastImportSummary;
  const setupRows = setupSummary ? bestCount(setupSummary.totalRows, setupSummary.rows, setupSummary.imported) : 0;
  const setupFamilyGroups = setupSummary ? bestCount(
    setupSummary.sourceFamilyGroups,
    sumCounts(setupSummary.newFamilies, setupSummary.matchedFamilies),
    sumCounts(setupSummary.createdFamilies, setupSummary.updatedFamilies),
  ) : 0;
  const setupChildGroups = setupSummary ? bestCount(
    setupSummary.sourceChildGroups,
    sumCounts(setupSummary.newChildren, setupSummary.matchedChildren),
    setupSummary.createdChildren,
  ) : 0;
  const setupGuardianLinks = setupSummary ? bestCount(
    setupSummary.sourceGuardianGroups,
    setupSummary.familyGuardianLinks,
    sumCounts(setupSummary.emergencyContacts, setupSummary.authorizedPickups),
  ) : 0;
  const setupClassroomCount = setupSummary ? bestCount(setupSummary.classroomsReferenced, setupSummary.createdClassrooms) : 0;
  const setupBillingRows = setupSummary ? sumCounts(setupSummary.balanceRows, setupSummary.invoiceRows, setupSummary.ledgerRows) : 0;
  const setupAttendanceRows = setupSummary ? sumCounts(setupSummary.attendanceRows, setupSummary.checkLogRows) : 0;
  const setupOpenIssueRows = setupSummary ? sumCounts(setupSummary.unresolved, setupSummary.warningRows) : 0;
  const setupSourceCount = setupSummary?.datasetCoverage?.sourceInventory?.filter((source) => source.reportKind !== "ignored").length ?? 0;
  const setupReadinessStages: Array<{ title: string; detail: string; status: SetupReadinessStatus; href?: string }> = setupSummary ? [
    {
      title: "Source package",
      detail: setupSourceCount
        ? `${setupSourceCount.toLocaleString()} recognized source file(s), ${setupRows.toLocaleString()} row(s) tracked in the import review.`
        : `${setupRows.toLocaleString()} ProCare row(s) tracked in the import review.`,
      status: setupRows ? "ready" : "needs_review",
    },
    {
      title: "Families",
      detail: `${setupFamilyGroups.toLocaleString()} family group(s) detected or written. Review household names, inactive/past records, and balances before inviting parents.`,
      status: setupFamilyGroups ? "ready" : "needs_review",
      href: "/family-detail",
    },
    {
      title: "Children and enrollment",
      detail: `${setupChildGroups.toLocaleString()} child record(s), ${(setupSummary.familyChildLinks ?? 0).toLocaleString()} family-child link(s), and ${setupClassroomCount.toLocaleString()} classroom reference(s).`,
      status: setupChildGroups && (setupSummary.familyChildLinks || setupClassroomCount) ? "ready" : "needs_review",
      href: "/family-detail?view=children",
    },
    {
      title: "Parents and pickups",
      detail: `${setupGuardianLinks.toLocaleString()} parent, guardian, emergency-contact, or pickup link(s). Confirm custody-sensitive relationships before parent portal activation.`,
      status: setupGuardianLinks ? "ready" : "needs_review",
      href: "/family-detail",
    },
    {
      title: "Optional operational rows",
      detail: setupBillingRows || setupAttendanceRows
        ? `${setupBillingRows.toLocaleString()} billing/ledger row(s) and ${setupAttendanceRows.toLocaleString()} attendance/check-log row(s) were detected. Verify these modules before use.`
        : "No optional billing, ledger, attendance, or check-log rows were detected in this export.",
      status: setupBillingRows || setupAttendanceRows ? "next" : "ready",
      href: setupBillingRows ? "/billing-settings" : "/classroom-dashboard",
    },
    {
      title: "Cleanup",
      detail: setupOpenIssueRows
        ? `${setupOpenIssueRows.toLocaleString()} row(s) still need mapping, duplicate review, or disposal before the school is transition-ready.`
        : "No unresolved cleanup rows remain in this review state.",
      status: setupOpenIssueRows ? "needs_review" : "ready",
    },
    {
      title: "School setup handoff",
      detail: "Use School setup to confirm hours, classrooms, capacity, ratios, documents, notifications, calendar closures, and director launch checklist items.",
      status: lastBatchId ? "next" : "held",
      href: "/billing-settings?view=setup",
    },
    {
      title: "Activation gates",
      detail: "Parent invitations, kiosk/PIN credentials, billing/payment activation, and ProCare retirement stay held off until separately approved.",
      status: "held",
    },
  ] : [];

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Import ProCare Family Accounts</CardTitle>
        <CardDescription>
          The four standard reports populate families, guardians, children, classrooms, enrollment details, allergies, emergency contacts, and pickups. Add staff, schedule, attendance, sign-in/out, health, and account-balance exports to the same upload or ZIP; supported rows are linked by ProCare IDs, while reports without a safe destination mapping are identified for migration follow-up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-xl border bg-muted/20 p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Onboarding import workflow</div>
              <p className="text-xs text-muted-foreground">Progress includes source selection, detection, normalization, review, confirmations, duplicate decisions, commit, and handoff.</p>
            </div>
            <Badge variant="outline">{completedWorkflowSteps} of {workflowStages.length} steps</Badge>
          </div>
          <Progress value={workflowPercent} aria-label="Overall ProCare onboarding import progress">
            <ProgressLabel>Overall readiness</ProgressLabel>
            <ProgressValue>{() => `${workflowPercent}%`}</ProgressValue>
          </Progress>
          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            {workflowStages.map((stage) => (
              <div key={stage.label} className={stage.complete ? "text-foreground" : ""}>{stage.complete ? "✓" : "○"} {stage.label}</div>
            ))}
          </div>
        </div>
        <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
          <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-[min(96vw,76rem)]">
            <DialogHeader className="px-5 pt-5">
              <DialogTitle>ProCare Import Review</DialogTitle>
              <DialogDescription>
                Review the mapped rows before committing. Directors can close this review and commit from the import panel when there are no blocking cleanup warnings.
              </DialogDescription>
            </DialogHeader>
            {preview ? (
              <div className="grid min-h-0 gap-4">
                <div className="grid gap-2 px-5 sm:grid-cols-2 lg:grid-cols-6">
                  {[
                    ["Rows", preview.rows],
                    ["Ready", preview.readyRows],
                    ["Warnings", preview.warningRows],
                    ["Families", preview.newFamilies + preview.matchedFamilies],
                    ["Children", preview.newChildren + preview.matchedChildren],
                    ["Parent profiles", preview.sourceGuardianGroups ?? 0],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border bg-background/60 p-3">
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className="mt-1 text-lg font-semibold">{Number(value).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
                <div className="px-5 text-xs leading-5 text-muted-foreground">
                  {duplicateScanSummary} Showing {reviewRowsShown.toLocaleString()} mapped row(s) in this table{preview.rows > reviewRowsShown ? `, capped from ${preview.rows.toLocaleString()} total rows for browser performance` : ""}.
                  {preview.sourceSha256 ? ` Source SHA-256: ${preview.sourceSha256}` : ""}
                </div>
                <div className="min-h-0 max-h-[48vh] overflow-auto border-y">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-popover">
                      <TableRow>
                        <TableHead className="w-20">Row</TableHead>
                        <TableHead className="w-28">Status</TableHead>
                        <TableHead>Center</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Record</TableHead>
                        <TableHead>Relationships</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviewRows.map((row) => (
                        <TableRow key={row.rowNumber}>
                          <TableCell>{row.rowNumber}</TableCell>
                          <TableCell>
                            <Badge variant={previewStatusVariant(row.status)}>
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-48 whitespace-normal">{row.center}</TableCell>
                          <TableCell className="max-w-52 whitespace-normal">{row.action}</TableCell>
                          <TableCell className="max-w-64 whitespace-normal font-medium">{previewRecordLabel(row)}</TableCell>
                          <TableCell className="max-w-52 whitespace-normal">{row.relationshipSummary ?? ""}</TableCell>
                          <TableCell className="max-w-72 whitespace-normal text-muted-foreground">{row.message ?? ""}</TableCell>
                        </TableRow>
                      ))}
                      {!reviewRows.length ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-muted-foreground">No mapped rows were returned for this preview.</TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
                <div className="grid gap-3 px-5 pb-2 sm:grid-cols-3">
                  <div className="rounded-lg border bg-background/60 p-3 text-sm">
                    <div className="text-xs text-muted-foreground">Displayed rows</div>
                    <div className="mt-1 font-semibold">{readyReviewRows.toLocaleString()} ready / {warningReviewRows.toLocaleString()} warnings</div>
                  </div>
                  <div className="rounded-lg border bg-background/60 p-3 text-sm">
                    <div className="text-xs text-muted-foreground">Family profile links</div>
                    <div className="mt-1 font-semibold">{(preview.familyChildLinks ?? 0).toLocaleString()} child / {(preview.familyGuardianLinks ?? 0).toLocaleString()} parent</div>
                  </div>
                  <div className="rounded-lg border bg-background/60 p-3 text-sm">
                    <div className="text-xs text-muted-foreground">Complete family groups</div>
                    <div className="mt-1 font-semibold">{(preview.familiesWithCompleteProfileLinks ?? 0).toLocaleString()} with child + parent links</div>
                  </div>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
                Close Review
              </Button>
              <Button disabled={busy || importCommitted || Boolean(commitBlockedReason)} onClick={() => submit(false)}>
                <Upload data-icon="inline-start" />
                {importCommitted ? "Import Complete" : importWorking ? "Working..." : "Commit Import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {progressPhase !== "idle" ? (
          <Alert aria-live="polite">
            {progressPhase === "complete" ? <CheckCircle2 className="size-4" /> : <LoaderCircle className="size-4 animate-spin" />}
            <AlertTitle>{progressPhase === "uploading" ? "Uploading" : progressPhase === "processing" ? "Processing import" : "Complete"}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{progressMessage}</p>
              <Progress value={progressPercent} aria-label="ProCare import progress">
                <ProgressLabel>{progressPhase === "uploading" ? "File upload" : progressPhase === "processing" ? "Matching and saving" : "Finished"}</ProgressLabel>
                <ProgressValue>{(_formattedValue, value) => `${value ?? 0}%`}</ProgressValue>
              </Progress>
              {progressPhase === "processing" ? <p className="text-xs">Keep this page open while BEE Suite connects families, children, guardians, and classroom records.</p> : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {status ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Import complete</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{status}</p>
              {lastBatchId ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => downloadBackup(lastBatchId)}>
                    <Download data-icon="inline-start" />
                    Download Import Backup
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadReconciliation(lastBatchId)}>
                    <Download data-icon="inline-start" />
                    Download Reconciliation Report
                  </Button>
                  <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Verify dashboard totals
                  </Link>
                  <Link href="/family-detail" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Review active families
                  </Link>
                  <Link href="/family-detail?showPast=1#past-enrollment-records" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Review past & other
                  </Link>
                </div>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {setupSummary ? (
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-medium">Post-import setup readiness</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Use this as the director handoff after review or import. It shows what BEE Suite can use now, what still needs cleanup, and which launch actions stay gated.
                </p>
              </div>
              <Badge variant={lastBatchId ? "outline" : "secondary"}>{lastBatchId ? "Imported batch" : "Preview only"}</Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {setupReadinessStages.map((stage) => (
                <div key={stage.title} className="rounded-lg border bg-background p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{stage.title}</div>
                    <Badge variant={stage.status === "needs_review" ? "destructive" : "outline"}>{setupReadinessLabel(stage.status)}</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{stage.detail}</p>
                  {stage.href ? (
                    <Link href={stage.href} className="mt-2 inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline">
                      Open related setup area
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
            <Alert>
              <AlertCircle className="size-4" />
              <AlertTitle>Import does not activate the school by itself</AlertTitle>
              <AlertDescription>
                Parent invitations, kiosk/PIN credentials, billing/payment activation, and ProCare retirement stay held off until the director completes setup review and receives separate approval for each gate.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Link href="/family-detail" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Review families
              </Link>
              <Link href="/family-detail?view=children" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Review children
              </Link>
              <Link href="/classroom-dashboard#classroom-editor" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Review classrooms
              </Link>
              <Link href="/billing-settings?view=setup" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Open school setup
              </Link>
              {lastBatchId ? (
                <Button size="sm" variant="outline" onClick={() => downloadReconciliation(lastBatchId)}>
                  <Download data-icon="inline-start" />
                  Reconciliation report
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {noCentersAvailable ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>No assigned school found</AlertTitle>
            <AlertDescription>
              This account needs an active school assignment before ProCare rows can be imported.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 md:grid-cols-[18rem_1fr]">
          <div className="space-y-1">
            <Label>Center</Label>
            <Select value={centerId} onValueChange={(value) => {
              if (value) setCenterId(value);
              clearPreview();
            }}>
              <SelectTrigger><SelectValue placeholder="Choose center" /></SelectTrigger>
              <SelectContent>
                {allowBulkImport ? (
                  <SelectItem value="auto">Auto-map by ProCare school/location column</SelectItem>
                ) : null}
                {centers.map((center) => (
                  <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {allowBulkImport ? (
              <p className="text-xs leading-5 text-muted-foreground">
                Executive import can auto-map rows when the CSV includes location ID, CRM location ID, school, center, or location columns.
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label>ProCare export folder or files</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => folderRef.current?.click()}>
                <Upload data-icon="inline-start" />
                Choose one folder
              </Button>
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload data-icon="inline-start" />
                Choose individual files
              </Button>
            </div>
            <input
              ref={(node) => {
                folderRef.current = node;
                if (node) {
                  node.setAttribute("webkitdirectory", "");
                  node.setAttribute("directory", "");
                }
              }}
              id="procare-folder"
              type="file"
              multiple
              onChange={(event) => {
                addSelectedFiles(event.target.files);
                event.target.value = "";
              }}
              className="sr-only"
              aria-label="Choose a folder containing ProCare export files"
            />
            <input
              ref={fileRef}
              id="procare-file"
              type="file"
              multiple
              onChange={(event) => {
                addSelectedFiles(event.target.files);
                event.target.value = "";
              }}
              className="sr-only"
              aria-label="Choose individual ProCare export files"
            />
            {selectedFiles.length ? (
              <div className="space-y-2 rounded-lg border bg-background p-3">
                <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>{selectedFiles.length.toLocaleString()} file(s) selected · {formatFileSize(selectedFilesTotalBytes)}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setSelectedFiles([]); clearPreview(); }}>
                    <X data-icon="inline-start" />
                    Clear files
                  </Button>
                </div>
                <div className="max-h-40 space-y-1 overflow-auto">
                  {selectedFiles.map((file) => {
                    const identity = selectedFileIdentity(file);
                    const label = selectedFileLabel(file);
                    return (
                      <div key={identity} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-2 py-1 text-xs">
                        <span className="min-w-0 break-all">{label} · {formatFileSize(file.size)}</span>
                        <Button type="button" size="sm" variant="ghost" onClick={() => removeSelectedFile(identity)} aria-label={`Remove ${label}`}>
                          <X className="size-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <p className="text-xs leading-5 text-muted-foreground">
              Choose one folder containing any number or combination of the recommended ProCare exports, choose individual files, or choose a ZIP. Folder and file names do not control detection—the importer identifies each report from its columns and shows exactly what will import, needs mapping follow-up, or is unrelated. Each reviewed batch may contain up to 500 files and 100 MB.
            </p>
            {hasMixedSources ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Choose one source type</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>Uploaded files and pasted CSV text are both present. Clear one source before submitting so the review matches exactly what will be imported.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => { setCsv(""); clearPreview(); }}>Clear pasted text</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setSelectedFiles([]); clearPreview(); }}>Clear uploaded files</Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-[18rem_1fr]">
          <div className="space-y-1">
            <Label>Duplicate matching</Label>
            <Select value={duplicateMatchMode} onValueChange={(value) => {
              setDuplicateMatchMode(value || "review");
              clearPreview();
            }}>
              <SelectTrigger><SelectValue placeholder="Choose matching mode" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="review">Balanced review</SelectItem>
                <SelectItem value="strict">Strict review</SelectItem>
                <SelectItem value="auto">Auto-match exact records</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 text-xs leading-5 text-muted-foreground">
            <p>
              Balanced review flags ambiguous family, child, and guardian matches. Strict review flags every likely duplicate. Auto-match still stops on ambiguous matches, but lets high-confidence exact matches proceed.
            </p>
            {duplicateReviewRows ? (
              <label className="flex items-start gap-2 rounded-lg border bg-background p-3 text-foreground">
                <input
                  type="checkbox"
                  checked={duplicateReviewConfirmed}
                  onChange={(event) => setDuplicateReviewConfirmed(event.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>
                  I reviewed the duplicate match candidates and approve committing the import with these match decisions.
                </span>
              </label>
            ) : null}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="procare-csv">Or paste CSV text</Label>
          <Textarea
            id="procare-csv"
            value={csv}
            onChange={(event) => {
              setCsv(event.target.value);
              clearPreview();
            }}
            placeholder="Family Name,Child Name,Guardian Name,Email,Phone,Balance..."
          />
        </div>
        {preview?.correlationReview?.length ? (
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div>
              <div className="text-sm font-medium">Confirm ProCare correlations in order</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Review every group from family identity through pickup relationships. You can change several field matches before submitting one updated review.
              </p>
            </div>
            <div className="space-y-3">
              {preview.correlationReview.map((section, sectionIndex) => {
                const previousRequiredSections = preview.correlationReview?.slice(0, sectionIndex).filter((item) => item.required) ?? [];
                const canConfirmSection = previousRequiredSections.every((item) => correlationConfirmations.includes(item.id));
                return (
                  <div key={section.id} className="space-y-3 rounded-lg border bg-background p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{sectionIndex + 1}</div>
                      <div>
                        <div className="text-sm font-medium">{section.title}</div>
                        <p className="text-xs leading-5 text-muted-foreground">{section.description}</p>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {section.correlations.map((correlation) => {
                        const editable = preview.fieldOptions?.some((option) => option.key === correlation.destination);
                        const header = preview.headerAnalysis?.find((item) => item.source === correlation.source);
                        return (
                          <div key={`${section.id}-${correlation.source}`} className="grid gap-1 rounded-md border bg-muted/20 p-2">
                            <Label className="text-xs">{correlation.source}</Label>
                            {editable ? (
                              <Select
                                value={fieldMapping[correlation.source] || header?.suggestedField || correlation.destination || "ignore"}
                                onValueChange={(selected) => {
                                  const mappedField = selected && selected !== "ignore" ? selected : "";
                                  setFieldMapping((current) => ({ ...current, [correlation.source]: mappedField }));
                                  markReviewStale();
                                }}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ignore">Ignore this column</SelectItem>
                                  {preview.fieldOptions?.map((option) => (
                                    <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="text-xs font-medium text-foreground">{correlation.label} · linked automatically</div>
                            )}
                          </div>
                        );
                      })}
                      {!section.correlations.length ? (
                        <div className="text-xs text-muted-foreground">The four standard ProCare reports supply this relationship automatically.</div>
                      ) : null}
                    </div>
                    {section.required ? (
                      <label className="flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={correlationConfirmations.includes(section.id)}
                          disabled={!canConfirmSection}
                          onChange={(event) => setCorrelationConfirmations((current) => event.target.checked
                            ? [...new Set([...current, section.id])]
                            : current.filter((id) => id !== section.id))}
                          className="mt-0.5 size-4"
                        />
                        <span>I confirm these {section.title.toLowerCase()} correlations.</span>
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {reviewStale ? (
              <Alert>
                <AlertCircle className="size-4" />
                <AlertTitle>Correlation changes need a fresh review</AlertTitle>
                <AlertDescription>Finish all field changes, then select Submit for Review once to refresh counts and confirmations.</AlertDescription>
              </Alert>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {unknownHeaders.length
                ? `${unknownHeaders.length} column(s) are currently ignored because they do not match a known BEE Suite field.`
                : "Every selected source column has a reviewed destination or is a recognized ProCare heading."}
            </p>
          </div>
        ) : null}
        {preview ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Preview ready - no records written yet</AlertTitle>
            <AlertDescription>
              {preview.readyRows} rows are ready, {preview.warningRows} need review, across {preview.centersTouched || 1} center(s). Expected diff: {preview.newFamilies} new families, {preview.matchedFamilies} family updates, {preview.newChildren} new children, {preview.sourceGuardianGroups ?? 0} parent profiles, {preview.familyChildLinks ?? 0} family-child links, {preview.familyGuardianLinks ?? 0} family-parent links, {preview.newStaff} new staff, {preview.matchedStaff} staff updates, {preview.balanceRows} balance rows. {duplicateScanSummary}
            </AlertDescription>
          </Alert>
        ) : null}
        {preview?.duplicateMatchDetails?.length ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-medium">Duplicate match review</div>
              <div className="text-xs text-muted-foreground">
                Families {preview.duplicateMatchesByEntity?.families ?? 0} / Children {preview.duplicateMatchesByEntity?.children ?? 0} / Guardians {preview.duplicateMatchesByEntity?.guardians ?? 0}
              </div>
            </div>
            <div className="space-y-3 text-xs">
              {preview.duplicateMatchDetails.slice(0, 10).map((match) => (
                <div key={`${match.rowNumber}-${match.entity}-${match.importLabel}`} className="rounded-lg border bg-background p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium">Row {match.rowNumber}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 uppercase text-muted-foreground">{match.entity}</span>
                    <span>{match.importLabel}</span>
                    <span className="text-muted-foreground">
                      {match.resolution === "auto_match" ? "High-confidence match" : "Needs review"}
                    </span>
                  </div>
                  <div className="space-y-1 text-muted-foreground">
                    {match.candidates.slice(0, 3).map((candidate) => (
                      <div key={candidate.recordId}>
                        {candidate.label} / {candidate.confidence} / score {candidate.score} / {candidate.reasons.join(", ")}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {preview?.warnings?.length ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="mb-2 text-sm font-medium">Rows needing cleanup before import</div>
            <div className="space-y-1 text-xs text-muted-foreground">
              {preview.warnings.slice(0, 8).map((warning) => (
                <div key={`${warning.rowNumber}-${warning.message}`}>Row {warning.rowNumber}: {warning.message}</div>
              ))}
            </div>
          </div>
        ) : null}
        {sourceInventory.length ? (
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div>
              <div className="text-sm font-medium">Detected source inventory</div>
              <p className="text-xs text-muted-foreground">Confirm that every intended export is listed. Files are classified by their columns, not their names.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline">{recognizedSourceFiles.length.toLocaleString()} recognized source(s)</Badge>
                <Badge variant={evidenceOnlySourceFiles.length ? "secondary" : "outline"}>{evidenceOnlySourceFiles.length.toLocaleString()} mapping follow-up source(s)</Badge>
                <Badge variant={ignoredSourceFiles.length ? "destructive" : "outline"}>{ignoredSourceFiles.length.toLocaleString()} ignored source(s)</Badge>
                <Badge variant="outline">{sourceRowsTotal.toLocaleString()} retained row(s)</Badge>
                {rawSourceRowsTotal > 0 && rawSourceRowsTotal !== sourceRowsTotal ? (
                  <Badge variant="outline">{rawSourceRowsTotal.toLocaleString()} raw row(s)</Badge>
                ) : null}
              </div>
            </div>
            {evidenceOnlySourceFiles.length ? (
              <Alert>
                <AlertCircle className="size-4" />
                <AlertTitle>{evidenceOnlySourceFiles.length} source file(s) need destination mapping</AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>These exports are listed in the reviewed inventory but are not written into operational records until a safe destination mapping is available.</p>
                  {evidenceOnlySourceFiles.slice(0, 12).map((source) => (
                    <div key={source.sourceName} className="break-all">{source.sourceName}: {source.note ?? "destination mapping required"}</div>
                  ))}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-2 md:grid-cols-2">
              {recognizedSourceFiles.map((source) => (
                <div key={source.sourceName} className="rounded-lg border bg-background p-3 text-xs">
                  <div className="font-medium break-all">{source.sourceName}</div>
                  <div className="mt-1 text-muted-foreground">{source.reportKind} · {source.rows.toLocaleString()} rows · {source.matchedHeaderAliases} normalized headings</div>
                </div>
              ))}
            </div>
            {duplicateSourceRowsRemovedTotal ? (
              <Alert>
                <CheckCircle2 className="size-4" />
                <AlertTitle>{duplicateSourceRowsRemovedTotal.toLocaleString()} duplicate source row(s) were removed</AlertTitle>
                <AlertDescription>
                  Exact repeated rows were removed before normalization: {duplicateSourceRowsRemovedDetails.map(([kind, count]) => `${kind} ${count}`).join(", ")}.
                </AlertDescription>
              </Alert>
            ) : null}
            {ignoredSourceFiles.length ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>{ignoredSourceFiles.length} source file(s) were not imported</AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>Remove or replace these files if they were meant to be part of the ProCare import.</p>
                  {ignoredSourceFiles.slice(0, 12).map((source) => (
                    <div key={source.sourceName} className="break-all">{source.sourceName}: {source.note ?? "unrecognized"}</div>
                  ))}
                  {ignoredSourceFiles.length > 12 ? (
                    <div>{ignoredSourceFiles.length - 12} more ignored source(s) are included in the import backup manifest.</div>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
            <label className="flex items-start gap-2 rounded-lg border bg-background p-3 text-xs text-foreground">
              <input
                type="checkbox"
                checked={sourceInventoryConfirmed}
                onChange={(event) => setSourceInventoryConfirmed(event.target.checked)}
                className="mt-0.5 size-4"
              />
              <span>
                I confirm the imported, mapping-follow-up, and ignored ProCare sources above are correct for this import.
              </span>
            </label>
          </div>
        ) : null}
        {preview?.unresolved ? (
          <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div>
              <div className="text-sm font-medium">Unresolved imported data</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                These rows are stored in the import batch but were not written into family, child, or staff records. Match differently named columns above and import again, or dispose of rows that should not enter The BEE Suite.
              </p>
            </div>
            <div className="space-y-2">
              {preview.rowResults?.map((row) => (
                <div key={`unresolved-${row.rowNumber}`} className="flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs"><span className="font-medium">Row {row.rowNumber}</span>: {row.message ?? previewRecordLabel(row)}</div>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => disposeRows([row.rowNumber])}>Dispose row</Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => disposeRows([], true)}>
              Dispose all unresolved rows
            </Button>
          </div>
        ) : null}
        {preview?.rowResults?.length ? (
          <div className="overflow-hidden rounded-xl border">
            <div className="grid grid-cols-[4rem_1fr_1fr_1fr] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Row</span>
              <span>Center</span>
              <span>Action</span>
              <span>Record</span>
            </div>
            <div className="max-h-72 overflow-auto">
              {preview.rowResults.slice(0, 25).map((row) => (
                <div key={row.rowNumber} className="grid grid-cols-[4rem_1fr_1fr_1fr] gap-2 border-b px-3 py-2 text-xs last:border-b-0">
                  <span>{row.rowNumber}</span>
                  <span>{row.center}</span>
                  <span>{row.action}</span>
                  <span>{row.staffName ?? row.childName ?? row.familyName ?? row.message ?? row.entity}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button disabled={!canPreview} onClick={() => submit(true)} variant="outline">
            <Eye data-icon="inline-start" />
            {importWorking ? "Preparing Review..." : "Submit for Review"}
          </Button>
          {preview ? (
            <Button disabled={busy} onClick={() => setPreviewDialogOpen(true)} variant="outline">
              <Eye data-icon="inline-start" />
              View Review Table
            </Button>
          ) : null}
          <Button disabled={busy || importCommitted || Boolean(commitBlockedReason)} onClick={() => submit(false)}>
            <Upload data-icon="inline-start" />
            {importCommitted ? "Import Complete" : importWorking ? "Importing..." : "Import ProCare Data"}
          </Button>
          <Button disabled={busy || !centerId} onClick={() => downloadBackup("latest")} variant="outline">
            <Download data-icon="inline-start" />
            Download Latest Backup
          </Button>
        </div>
        {!importCommitted && commitBlockedReason ? (
          <p className="text-xs text-muted-foreground">{commitBlockedReason}</p>
        ) : null}
        {preview?.warningRows ? (
          <p className="text-xs text-muted-foreground">
            {blockingWarningRows
              ? "Resolve or remove non-duplicate warning rows before committing. This prevents partially mapped ProCare data from being written to live school records."
              : duplicateReviewRows && !duplicateReviewConfirmed
                ? "Review and confirm the duplicate match candidates before committing this ProCare import."
                : "Duplicate-review rows are confirmed. The API will still block the import if the uploaded file changes and new cleanup warnings appear."}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
