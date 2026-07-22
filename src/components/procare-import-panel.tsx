"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Download, Eye, LoaderCircle, Upload } from "lucide-react";
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
  readyRows: number;
  warningRows: number;
  unmappedRows: number;
  familyRows: number;
  staffRows: number;
  sourceGuardianGroups?: number;
  familyChildLinks?: number;
  familyGuardianLinks?: number;
  familiesWithCompleteProfileLinks?: number;
  matchedFamilies: number;
  newFamilies: number;
  matchedChildren: number;
  newChildren: number;
  matchedStaff: number;
  newStaff: number;
  createdFamilies?: number;
  createdChildren?: number;
  createdClassrooms?: number;
  createdStaff?: number;
  createdStaffLogins?: number;
  invoiceRows?: number;
  imported?: number;
  unresolved?: number;
  disposed?: number;
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

function normalizedSelectedFileName(filename: string) {
  return filename.toLowerCase().replace(/\s+\(\d+\)(?=\.[^.]+$)/, "");
}

export function ProcareImportPanel({ centers, allowBulkImport = false }: { centers: CenterOption[]; allowBulkImport?: boolean }) {
  const router = useRouter();
  const [centerId, setCenterId] = useState(allowBulkImport ? "auto" : centers[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [duplicateMatchMode, setDuplicateMatchMode] = useState("review");
  const [duplicateReviewConfirmed, setDuplicateReviewConfirmed] = useState(false);
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
  const [lastBatchId, setLastBatchId] = useState("");
  const [disposedRowNumbers, setDisposedRowNumbers] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const submitLockedRef = useRef(false);

  function clearPreview() {
    setPreview(null);
    setPreviewDialogOpen(false);
    setDuplicateReviewConfirmed(false);
    setCorrelationConfirmations([]);
    setReviewStale(false);
  }

  function markReviewStale() {
    setDuplicateReviewConfirmed(false);
    setCorrelationConfirmations([]);
    setReviewStale(true);
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
          setPreviewDialogOpen(true);
          setDuplicateReviewConfirmed(false);
          setCorrelationConfirmations([]);
          setReviewStale(false);
          setLastBatchId("");
          return;
        }
        const summary = json?.summary;
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
          setPreview(summary ?? null);
          setPreviewDialogOpen(false);
        }
        setDuplicateReviewConfirmed(false);
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
  const hasImportSource = Boolean(csv.trim() || selectedFiles.length);
  const noCentersAvailable = !centers.length;
  const hasCompletedPreview = Boolean(
    !reviewStale
    &&
    preview?.sourceSha256
    && preview.reviewFingerprint
    && Array.isArray(preview.warningRowNumbers)
    && Array.isArray(preview.duplicateReviewRowNumbers),
  );
  const canPreview = !busy && Boolean(centerId) && hasImportSource && !noCentersAvailable;
  const requiredCorrelationSections = preview?.correlationReview?.filter((section) => section.required) ?? [];
  const missingCorrelationSections = requiredCorrelationSections.filter((section) => !correlationConfirmations.includes(section.id));
  const commitBlockedReason = noCentersAvailable
    ? "This account needs an active school assignment before importing."
    : !centerId
    ? "Choose a center before importing."
      : !hasImportSource
      ? "Choose a CSV export or paste CSV text before submitting."
      : !hasCompletedPreview
      ? "Submit this exact ProCare export for review before committing it."
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

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Import ProCare Family Accounts</CardTitle>
        <CardDescription>
          The four standard reports populate families, guardians, children, classrooms, enrollment details, allergies, emergency contacts, and pickups. A consolidated ProCare CSV can also populate supported staff, attendance, check-log, medical, and opening-balance fields when those columns are present.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
              <Button disabled={busy || Boolean(commitBlockedReason)} onClick={() => submit(false)}>
                <Upload data-icon="inline-start" />
                {importWorking ? "Working..." : "Commit Import"}
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
            <Label htmlFor="procare-file">ProCare export files</Label>
            <input
              ref={fileRef}
              id="procare-file"
              type="file"
              multiple
              accept=".csv,.txt,.zip,text/csv,text/plain,application/zip"
              onChange={(event) => {
                const addedFiles = Array.from(event.target.files ?? []);
                setSelectedFiles((current) => {
                  const merged = new Map(current.map((file) => [normalizedSelectedFileName(file.name), file]));
                  for (const file of addedFiles) merged.set(normalizedSelectedFileName(file.name), file);
                  return [...merged.values()];
                });
                event.target.value = "";
                clearPreview();
              }}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {selectedFiles.length ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Selected: {selectedFiles.map((file) => file.name).join(", ")}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setSelectedFiles([]); clearPreview(); }}>Clear files</Button>
              </div>
            ) : null}
            <p className="text-xs leading-5 text-muted-foreground">
              You may add the four standard reports one at a time or select them together. The importer waits for enrollment.csv, parentinfo.csv, relationships.csv, and childinfo.csv before processing. You can also choose the ZIP containing them.
            </p>
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
            <AlertTitle>Preview ready</AlertTitle>
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
          <Button disabled={busy || Boolean(commitBlockedReason)} onClick={() => submit(false)}>
            <Upload data-icon="inline-start" />
            {importWorking ? "Importing..." : "Import ProCare Data"}
          </Button>
          <Button disabled={busy || !centerId} onClick={() => downloadBackup("latest")} variant="outline">
            <Download data-icon="inline-start" />
            Download Latest Backup
          </Button>
        </div>
        {commitBlockedReason ? (
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
