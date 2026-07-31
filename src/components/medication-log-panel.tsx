"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Pill, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { zonedDateTimeLocalToUtc, zonedDateTimeLocalValue } from "@/lib/zoned-date-time";

export type MedicationLogChildOption = {
  id: string;
  fullName: string;
  familyName: string;
  centerLabel: string | null;
};

export function MedicationLogPanel({ childrenOptions }: { childrenOptions: MedicationLogChildOption[] }) {
  const timeZone = useSchoolTimeZone();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [childId, setChildId] = useState(childrenOptions[0]?.id ?? "");
  const [medicationName, setMedicationName] = useState("");
  const [dosage, setDosage] = useState("");
  const [route, setRoute] = useState("");
  const [administeredAt, setAdministeredAt] = useState(() => zonedDateTimeLocalValue(new Date(), timeZone));
  const [status, setStatus] = useState("administered");
  const [notes, setNotes] = useState("");
  const [parentNotified, setParentNotified] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  function submit() {
    if (!childId || !medicationName.trim() || !dosage.trim()) return;
    startTransition(async () => {
      setError("");
      setSaved("");
      const response = await fetch("/api/compliance/medication-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId,
          medicationName,
          dosage,
          route,
          administeredAt: zonedDateTimeLocalToUtc(administeredAt, timeZone)?.toISOString(),
          status,
          notes,
          parentNotified,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(json?.error ?? "Medication log could not be saved.");
        return;
      }
      setSaved("Medication log saved.");
      setMedicationName("");
      setDosage("");
      setRoute("");
      setNotes("");
      setParentNotified(false);
      router.refresh();
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Medication Log</CardTitle>
        <CardDescription>Record administration details for director review and export.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {saved ? (
          <Alert>
            <Pill className="size-4" />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{saved}</AlertDescription>
          </Alert>
        ) : null}
        {childrenOptions.length ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Child</Label>
                <Select value={childId} onValueChange={(value) => value && setChildId(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {childrenOptions.map((child) => (
                      <SelectItem key={child.id} value={child.id}>
                        {child.fullName} - {child.familyName}{child.centerLabel ? ` - ${child.centerLabel}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Administered at</Label>
                <Input type="datetime-local" value={administeredAt} onChange={(event) => setAdministeredAt(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Medication</Label>
                <Input value={medicationName} onChange={(event) => setMedicationName(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Dosage</Label>
                <Input value={dosage} onChange={(event) => setDosage(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Route</Label>
                <Input value={route} onChange={(event) => setRoute(event.target.value)} placeholder="Oral, topical, inhaler" />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={status} onValueChange={(value) => value && setStatus(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="administered">Administered</SelectItem>
                    <SelectItem value="missed">Missed</SelectItem>
                    <SelectItem value="refused">Refused</SelectItem>
                    <SelectItem value="held">Held</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20" />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={parentNotified} onChange={(event) => setParentNotified(event.target.checked)} />
              Parent/guardian was notified
            </label>
            <Button disabled={isPending || !childId || !medicationName.trim() || !dosage.trim()} onClick={submit}>
              <Save data-icon="inline-start" />
              Save Medication Log
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No child records are available in this compliance scope.</p>
        )}
      </CardContent>
    </Card>
  );
}
