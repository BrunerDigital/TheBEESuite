"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, FileDown, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type BulkImportResult = {
  error?: string;
  summary?: {
    parsedRows: number;
    validatedRows: number;
    created: number;
    updated: number;
    skipped: number;
    centersTouched: number;
    errorCount: number;
  };
  errors?: Array<{ rowNumber: number; message: string }>;
};

const sampleCsv = [
  "CRM Location ID,Week Start,Week End,Enrolled,Full Time,Part Time,FTE,Infants,Toddlers,Twos,Preschool,Pre-K,School Age,Status,Notes",
  "CO | Longmont,2026-05-25,2026-05-31,92,80,12,86,10,14,16,20,18,14,corrected,Corporate adjustment",
].join("\n");

export function FteBulkImportPanel() {
  const [csvText, setCsvText] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<Array<{ rowNumber: number; message: string }>>([]);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function readFile() {
    const file = fileRef.current?.files?.[0];
    if (!file) return csvText;
    return file.text();
  }

  function submit(dryRun: boolean) {
    startTransition(async () => {
      setStatus("");
      setError("");
      setRowErrors([]);
      const text = (await readFile()) || csvText;
      const response = await fetch("/api/fte-reports/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText: text, dryRun }),
      });
      const json = (await response.json().catch(() => null)) as BulkImportResult | null;
      if (!response.ok) {
        setError(json?.error || "FTE import could not be processed.");
        setRowErrors(json?.errors ?? []);
        return;
      }

      const summary = json?.summary;
      setRowErrors(json?.errors ?? []);
      setStatus(
        dryRun
          ? `Validated ${summary?.validatedRows ?? 0} of ${summary?.parsedRows ?? 0} rows across ${summary?.centersTouched ?? 0} school(s).`
          : `Imported ${summary?.created ?? 0} new report(s) and updated ${summary?.updated ?? 0} report(s) across ${summary?.centersTouched ?? 0} school(s).`,
      );
      if (!dryRun) window.setTimeout(() => window.location.reload(), 900);
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Executive Bulk FTE Import</CardTitle>
        <CardDescription>
          Upload or paste a CSV to create or correct weekly FTE reports across visible schools. Existing school/week rows are updated.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>{status.startsWith("Validated") ? "Validation complete" : "Import complete"}</AlertTitle>
            <AlertDescription>{status}</AlertDescription>
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
            <Label htmlFor="fte-bulk-file">CSV file</Label>
            <input
              ref={fileRef}
              id="fte-bulk-file"
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fte-bulk-csv">Or paste CSV text</Label>
            <Textarea
              id="fte-bulk-csv"
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              placeholder={sampleCsv}
            />
          </div>
        </div>

        {rowErrors.length ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <div className="font-semibold text-amber-200">Rows needing review</div>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {rowErrors.slice(0, 8).map((item) => (
                <li key={`${item.rowNumber}-${item.message}`}>Row {item.rowNumber}: {item.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={isPending} onClick={() => setCsvText(sampleCsv)}>
            <FileDown data-icon="inline-start" />
            Use Sample Format
          </Button>
          <Button variant="outline" disabled={isPending} onClick={() => submit(true)}>
            Validate CSV
          </Button>
          <Button disabled={isPending} onClick={() => submit(false)}>
            <Upload data-icon="inline-start" />
            Import Corrections
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
