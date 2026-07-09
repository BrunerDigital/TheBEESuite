"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SchoolReceiptDetailsCard({
  centerId,
  schoolEin,
}: {
  centerId: string;
  schoolEin: string | null;
}) {
  const [draftEin, setDraftEin] = useState(schoolEin ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveEin() {
    setMessage("");
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/school-setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ centerId, schoolEin: draftEin }),
        });
        const json = await response.json().catch(() => null) as { ok?: boolean; error?: string; schoolEin?: string | null } | null;
        if (!response.ok || !json?.ok) throw new Error(json?.error || "School EIN could not be saved.");
        setDraftEin(json.schoolEin ?? "");
        setMessage("School EIN saved for receipts.");
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "School EIN could not be saved.");
      }
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Receipt Details</CardTitle>
        <CardDescription>School EIN printed on customer payment receipts and ledger reports.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="center-dashboard-school-ein">School EIN</Label>
            <Input
              id="center-dashboard-school-ein"
              inputMode="numeric"
              value={draftEin}
              onChange={(event) => setDraftEin(event.target.value)}
              placeholder="12-3456789"
            />
          </div>
          <Button type="button" onClick={saveEin} disabled={isPending}>
            {isPending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
            Save EIN
          </Button>
        </div>
        {message ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">{message}</div> : null}
        {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      </CardContent>
    </Card>
  );
}
