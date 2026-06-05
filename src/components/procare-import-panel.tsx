"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Download, LockKeyhole, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  classroomsReferenced: number;
  balanceRows: number;
  attendanceRows: number;
  checkLogRows: number;
  centersTouched: number;
  duplicateMatches?: number;
  duplicateReviewRows?: number;
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

export function ProcareImportPanel({ centers, allowBulkImport = false }: { centers: CenterOption[]; allowBulkImport?: boolean }) {
  const [centerId, setCenterId] = useState(allowBulkImport ? "auto" : centers[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [v10Password, setV10Password] = useState("");
  const [duplicateMatchMode, setDuplicateMatchMode] = useState("review");
  const [duplicateReviewConfirmed, setDuplicateReviewConfirmed] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [lastBatchId, setLastBatchId] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function clearPreview() {
    setPreview(null);
    setDuplicateReviewConfirmed(false);
  }

  function downloadBackup(batchId: string) {
    const params = new URLSearchParams();
    params.set("batchId", batchId);
    if (batchId === "latest") params.set("centerId", centerId);
    window.location.href = `/api/imports/procare?${params.toString()}`;
  }

  function submit(dryRun: boolean) {
    startTransition(async () => {
      setStatus("");
      setError("");
      const formData = new FormData();
      formData.set("centerId", centerId);
      formData.set("dryRun", String(dryRun));
      formData.set("duplicateMatchMode", duplicateMatchMode);
      formData.set("duplicateReviewConfirmed", String(duplicateReviewConfirmed));
      if (v10Password.trim()) formData.set("v10Password", v10Password.trim());
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
        return;
      }
      if (json?.dryRun) {
        setPreview(json.summary ?? null);
        setDuplicateReviewConfirmed(false);
        setLastBatchId("");
        setStatus("");
        return;
      }
      setCsv("");
      setPreview(null);
      setDuplicateReviewConfirmed(false);
      setLastBatchId(json?.batchId ?? "");
      if (fileRef.current) fileRef.current.value = "";
      const summary = json?.summary;
      setStatus(
        `Imported ${summary?.imported ?? 0} rows from ${summary?.sourceType ?? "ProCare"} across ${summary?.centersTouched ?? 1} center(s), created ${summary?.createdFamilies ?? 0} families, ${summary?.createdChildren ?? 0} children, ${summary?.createdClassrooms ?? 0} classrooms, ${summary?.createdStaff ?? 0} staff, ${summary?.invoiceRows ?? 0} invoices, and ${summary?.checkLogRows ?? 0} check logs.`,
      );
    });
  }

  const duplicateReviewRows = preview?.duplicateReviewRows ?? 0;
  const blockingWarningRows = preview ? Math.max(preview.warningRows - duplicateReviewRows, 0) : 0;
  const commitNeedsDuplicateConfirmation = duplicateReviewRows > 0 && !duplicateReviewConfirmed;

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Import ProCare Family Accounts</CardTitle>
        <CardDescription>
          Upload a ProCare CSV export or encrypted .v10 export to create or update families, guardians, children, classrooms, staff, pickups, emergency contacts, medical notes, attendance, check logs, billing accounts, invoices, and starting ledger balances.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Import complete</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{status}</p>
              {lastBatchId ? (
                <Button size="sm" variant="outline" onClick={() => downloadBackup(lastBatchId)}>
                  <Download data-icon="inline-start" />
                  Download Import Backup
                </Button>
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
              accept=".csv,.txt,.v10,text/csv,text/plain,application/zip"
              onChange={clearPreview}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[18rem_1fr]">
          <div className="space-y-1">
            <Label htmlFor="procare-v10-password">.v10 export password</Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="procare-v10-password"
                type="password"
                value={v10Password}
                onChange={(event) => {
                  setV10Password(event.target.value);
                  clearPreview();
                }}
                className="pl-9"
                autoComplete="off"
              />
            </div>
          </div>
          <p className="self-end text-xs leading-5 text-muted-foreground">
            Only used server-side to unlock encrypted ProCare v10 exports. It is not saved to The BEE Suite.
          </p>
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
        {preview ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Preview ready</AlertTitle>
            <AlertDescription>
              {preview.readyRows} rows are ready, {preview.warningRows} need review, across {preview.centersTouched || 1} center(s). Expected diff: {preview.newFamilies} new families, {preview.matchedFamilies} family updates, {preview.newChildren} new children, {preview.newStaff} new staff, {preview.matchedStaff} staff updates, {preview.balanceRows} balance rows. Duplicate scan found {preview.duplicateMatches ?? 0} possible match groups across {duplicateReviewRows} review row(s).
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
          <Button disabled={isPending || !centerId} onClick={() => submit(true)} variant="outline">
            Preview Import
          </Button>
          <Button disabled={isPending || !centerId || !preview || blockingWarningRows > 0 || commitNeedsDuplicateConfirmation} onClick={() => submit(false)}>
            <Upload data-icon="inline-start" />
            Commit ProCare Import
          </Button>
          <Button disabled={isPending || !centerId} onClick={() => downloadBackup("latest")} variant="outline">
            <Download data-icon="inline-start" />
            Download Latest Backup
          </Button>
        </div>
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
