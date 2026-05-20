"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type CenterOption = {
  id: string;
  name: string;
};

export function ProcareImportPanel({ centers }: { centers: CenterOption[] }) {
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function submit() {
    startTransition(async () => {
      setStatus("");
      setError("");
      const formData = new FormData();
      formData.set("centerId", centerId);
      if (csv.trim()) formData.set("csv", csv);
      const file = fileRef.current?.files?.[0];
      if (file) formData.set("file", file);
      const response = await fetch("/api/imports/procare", { method: "POST", body: formData });
      const json = await response.json().catch(() => null) as { error?: string; summary?: Record<string, number | string> } | null;
      if (!response.ok) {
        setError(json?.error || "ProCare import could not be processed.");
        return;
      }
      setCsv("");
      if (fileRef.current) fileRef.current.value = "";
      const summary = json?.summary;
      setStatus(`Imported ${summary?.imported ?? 0} rows, created ${summary?.createdFamilies ?? 0} families and ${summary?.createdChildren ?? 0} children.`);
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Import ProCare Family Accounts</CardTitle>
        <CardDescription>
          Upload a ProCare CSV export to create or update families, guardians, children, billing accounts, and starting ledger balances.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Import complete</AlertTitle>
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
            <Label>Center</Label>
            <Select value={centerId} onValueChange={(value) => value && setCenterId(value)}>
              <SelectTrigger><SelectValue placeholder="Choose center" /></SelectTrigger>
              <SelectContent>
                {centers.map((center) => (
                  <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="procare-file">CSV export</Label>
            <input
              ref={fileRef}
              id="procare-file"
              type="file"
              accept=".csv,text/csv"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="procare-csv">Or paste CSV text</Label>
          <Textarea
            id="procare-csv"
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            placeholder="Family Name,Child Name,Guardian Name,Email,Phone,Balance..."
          />
        </div>
        <Button disabled={isPending || !centerId} onClick={submit}>
          <Upload data-icon="inline-start" />
          Import ProCare Export
        </Button>
      </CardContent>
    </Card>
  );
}
