"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, LockKeyhole, Upload } from "lucide-react";
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

export function ProcareImportPanel({ centers, allowBulkImport = false }: { centers: CenterOption[]; allowBulkImport?: boolean }) {
  const [centerId, setCenterId] = useState(allowBulkImport ? "auto" : centers[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [v10Password, setV10Password] = useState("");
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
      if (v10Password.trim()) formData.set("v10Password", v10Password.trim());
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
      setStatus(
        `Imported ${summary?.imported ?? 0} rows from ${summary?.sourceType ?? "ProCare"} across ${summary?.centersTouched ?? 1} center(s), created ${summary?.createdFamilies ?? 0} families, ${summary?.createdChildren ?? 0} children, and ${summary?.createdClassrooms ?? 0} classrooms.`,
      );
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Import ProCare Family Accounts</CardTitle>
        <CardDescription>
          Upload a ProCare CSV export or encrypted .v10 export to create or update families, guardians, children, classrooms, billing accounts, and starting ledger balances.
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
                onChange={(event) => setV10Password(event.target.value)}
                className="pl-9"
                autoComplete="off"
              />
            </div>
          </div>
          <p className="self-end text-xs leading-5 text-muted-foreground">
            Only used server-side to unlock encrypted ProCare v10 exports. It is not saved to The Bee Suite.
          </p>
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
