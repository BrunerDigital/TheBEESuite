"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Download, Eye, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type CenterOption = {
  id: string;
  name: string;
};

type ImportPreview = {
  rows: number;
  readyRows: number;
  warningRows: number;
  unmappedRows: number;
  familyRows: number;
  staffRows: number;
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
  headerAnalysis?: Array<{ source: string; normalized: string; suggestedField: string; recognized: boolean }>;
  fieldOptions?: Array<{ key: string; label: string }>;
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
    message?: string;
  }>;
};

function previewRecordLabel(row: NonNullable<ImportPreview["rowResults"]>[number]) {
  return row.staffName ?? row.childName ?? row.familyName ?? row.message ?? row.entity;
}

function previewStatusVariant(status: "ready" | "warning") {
  return status === "ready" ? "default" : "destructive";
}

export function ProcareImportPanel({ centers, allowBulkImport = false }: { centers: CenterOption[]; allowBulkImport?: boolean }) {
  const [centerId, setCenterId] = useState(allowBulkImport ? "auto" : centers[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [duplicateMatchMode, setDuplicateMatchMode] = useState("review");
  const [duplicateReviewConfirmed, setDuplicateReviewConfirmed] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [lastBatchId, setLastBatchId] = useState("");
  const [disposedRowNumbers, setDisposedRowNumbers] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function clearPreview() {
    setPreview(null);
    setPreviewDialogOpen(false);
    setDuplicateReviewConfirmed(false);
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
    startTransition(async () => {
      setStatus("");
      setError("");
      setProgressMessage(dryRun ? "Preparing import review..." : "Committing ProCare import...");
      try {
        const formData = new FormData();
        formData.set("centerId", centerId);
        formData.set("dryRun", String(dryRun));
        formData.set("duplicateMatchMode", duplicateMatchMode);
        formData.set("duplicateReviewConfirmed", String(duplicateReviewConfirmed));
        formData.set("fieldMapping", JSON.stringify(fieldMapping));
        formData.set("disposedRowNumbers", disposedRowNumbers.join(","));
        if (csv.trim()) formData.set("csv", csv);
        const file = fileRef.current?.files?.[0];
        if (file) formData.set("file", file);
        const response = await fetch("/api/imports/procare", { method: "POST", body: formData });
        const json = await response.json().catch(() => null) as {
          dryRun?: boolean;
          error?: string;
          batchId?: string;
          summary?: ImportPreview & Record<string, number | string | unknown>;
        } | null;
        if (!response.ok) {
          setError(json?.error || "ProCare import could not be processed.");
          if (json?.summary) {
            setPreview(json.summary);
            setPreviewDialogOpen(true);
          }
          return;
        }
        if (json?.dryRun) {
          setPreview(json.summary ?? null);
          setPreviewDialogOpen(true);
          setDuplicateReviewConfirmed(false);
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
          if (fileRef.current) fileRef.current.value = "";
          setSelectedFileName("");
        } else {
          setPreview(summary ?? null);
          setPreviewDialogOpen(false);
        }
        setDuplicateReviewConfirmed(false);
        setLastBatchId(json?.batchId ?? "");
        setStatus(
          `Imported ${summary?.imported ?? 0} rows from ${summary?.sourceType ?? "ProCare"} across ${summary?.centersTouched ?? 1} center(s), created ${summary?.createdFamilies ?? 0} families, ${summary?.createdChildren ?? 0} children, ${summary?.createdClassrooms ?? 0} classrooms, ${summary?.createdStaff ?? 0} staff, ${summary?.createdStaffLogins ?? 0} staff logins, ${summary?.invoiceRows ?? 0} invoices, and ${summary?.checkLogRows ?? 0} check logs.${unresolved ? ` ${unresolved} row(s) were safely retained below for mapping or disposal.` : ""}`,
        );
      } catch {
        setError(dryRun ? "Import review could not be prepared. Check the file and try again." : "ProCare import could not be committed. Check the file and try again.");
      } finally {
        setProgressMessage("");
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
  const busy = isPending || Boolean(progressMessage);
  const duplicateScanSummary = `Complete duplicate analysis ran in ${preview?.duplicateReviewChunks ?? 1} relationship-preserving review chunk(s) and found ${preview?.duplicateMatches ?? 0} possible match groups across ${duplicateReviewRows} review row(s).`;
  const hasImportSource = Boolean(csv.trim() || selectedFileName);
  const noCentersAvailable = !centers.length;
  const canPreview = !busy && Boolean(centerId) && hasImportSource && !noCentersAvailable;
  const commitBlockedReason = noCentersAvailable
    ? "This account needs an active school assignment before importing."
    : !centerId
    ? "Choose a center before importing."
      : !hasImportSource
      ? "Choose a CSV export or paste CSV text before submitting."
      : "";
  const reviewRows = preview?.rowResults ?? [];
  const reviewRowsShown = reviewRows.length;
  const readyReviewRows = reviewRows.filter((row) => row.status === "ready").length;
  const warningReviewRows = reviewRows.filter((row) => row.status === "warning").length;
  const unknownHeaders = preview?.headerAnalysis?.filter((header) => !header.recognized && !fieldMapping[header.source]) ?? [];

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Import ProCare Family Accounts</CardTitle>
        <CardDescription>
          Upload a ProCare CSV or the standard multi-report ZIP export to create or update families, guardians, children, classrooms, staff, pickups, emergency contacts, medical notes, attendance, check logs, billing accounts, invoices, and starting ledger balances.
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
                <div className="grid gap-2 px-5 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    ["Rows", preview.rows],
                    ["Ready", preview.readyRows],
                    ["Warnings", preview.warningRows],
                    ["Families", preview.familyRows],
                    ["Staff", preview.staffRows],
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
                          <TableCell className="max-w-72 whitespace-normal text-muted-foreground">{row.message ?? ""}</TableCell>
                        </TableRow>
                      ))}
                      {!reviewRows.length ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-muted-foreground">No mapped rows were returned for this preview.</TableCell>
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
                    <div className="text-xs text-muted-foreground">Expected creates</div>
                    <div className="mt-1 font-semibold">{preview.newFamilies.toLocaleString()} families / {preview.newChildren.toLocaleString()} children</div>
                  </div>
                  <div className="rounded-lg border bg-background/60 p-3 text-sm">
                    <div className="text-xs text-muted-foreground">Classrooms and balances</div>
                    <div className="mt-1 font-semibold">{preview.classroomsReferenced.toLocaleString()} classrooms / {preview.balanceRows.toLocaleString()} balances</div>
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
                {progressMessage ? "Working..." : "Commit Import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {progressMessage ? (
          <Alert>
            <Upload className="size-4" />
            <AlertTitle>Working</AlertTitle>
            <AlertDescription>{progressMessage}</AlertDescription>
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
            <Label htmlFor="procare-file">CSV export</Label>
            <input
              ref={fileRef}
              id="procare-file"
              type="file"
              accept=".csv,.txt,.zip,text/csv,text/plain,application/zip"
              onChange={(event) => {
                setSelectedFileName(event.target.files?.[0]?.name ?? "");
                clearPreview();
              }}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {selectedFileName ? (
              <p className="text-xs text-muted-foreground">Selected: {selectedFileName}</p>
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
        {preview?.headerAnalysis?.length ? (
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div>
              <div className="text-sm font-medium">Match ProCare columns to BEE Suite fields</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Known ProCare headings are matched automatically. Use these controls when your export names a field differently, then submit the updated mapping for review. Leave report-only columns ignored.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {preview.headerAnalysis.map((header) => (
                <div key={header.source} className="grid gap-1 rounded-lg border bg-background p-3">
                  <Label className="text-xs">{header.source}</Label>
                  <Select
                    value={fieldMapping[header.source] || header.suggestedField || "ignore"}
                    onValueChange={(selected) => {
                      const mappedField = selected && selected !== "ignore" ? selected : "";
                      setFieldMapping((current) => ({ ...current, [header.source]: mappedField }));
                      setDuplicateReviewConfirmed(false);
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
                </div>
              ))}
            </div>
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
              {preview.readyRows} rows are ready, {preview.warningRows} need review, across {preview.centersTouched || 1} center(s). Expected diff: {preview.newFamilies} new families, {preview.matchedFamilies} family updates, {preview.newChildren} new children, {preview.newStaff} new staff, {preview.matchedStaff} staff updates, {preview.balanceRows} balance rows. {duplicateScanSummary}
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
            {progressMessage === "Preparing import review..." ? "Preparing Review..." : "Submit for Review"}
          </Button>
          {preview ? (
            <Button disabled={busy} onClick={() => setPreviewDialogOpen(true)} variant="outline">
              <Eye data-icon="inline-start" />
              View Review Table
            </Button>
          ) : null}
          <Button disabled={busy || Boolean(commitBlockedReason)} onClick={() => submit(false)}>
            <Upload data-icon="inline-start" />
            {progressMessage === "Committing ProCare import..." ? "Importing..." : "Import ProCare Data"}
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
