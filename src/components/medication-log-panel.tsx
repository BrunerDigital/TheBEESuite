"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Pill, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/workspace-preferences";
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
    <CollapsibleCard
      id="compliance-medication-log"
      title="Medication log"
      description="Record administration details for director review and export."
      collapsedSummary={`${childrenOptions.length} ${childrenOptions.length === 1 ? "child" : "children"} available`}
      contentClassName="space-y-4"
      defaultCollapsed
    >
        {error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {saved ? (
          <Alert>
            <Pill aria-hidden="true" className="size-4" />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{saved}</AlertDescription>
          </Alert>
        ) : null}
        {childrenOptions.length ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="medication-log-child">Child</Label>
                <Select value={childId} onValueChange={(value) => value && setChildId(value)}>
                  <SelectTrigger id="medication-log-child"><SelectValue /></SelectTrigger>
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
                <Label htmlFor="medication-log-administered-at">Administered at</Label>
                <Input id="medication-log-administered-at" type="datetime-local" value={administeredAt} onChange={(event) => setAdministeredAt(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="medication-log-medication">Medication</Label>
                <Input id="medication-log-medication" value={medicationName} onChange={(event) => setMedicationName(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="medication-log-dosage">Dosage</Label>
                <Input id="medication-log-dosage" value={dosage} onChange={(event) => setDosage(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="medication-log-route">Route</Label>
                <Input id="medication-log-route" value={route} onChange={(event) => setRoute(event.target.value)} placeholder="Oral, topical, inhaler" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="medication-log-status">Status</Label>
                <Select value={status} onValueChange={(value) => value && setStatus(value)}>
                  <SelectTrigger id="medication-log-status"><SelectValue /></SelectTrigger>
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
              <Label htmlFor="medication-log-notes">Notes</Label>
              <Textarea id="medication-log-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20" />
            </div>
            <label htmlFor="medication-log-parent-notified" className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm text-muted-foreground">
              <input id="medication-log-parent-notified" type="checkbox" checked={parentNotified} onChange={(event) => setParentNotified(event.target.checked)} className="size-5 shrink-0 accent-primary" />
              Parent/guardian was notified
            </label>
            <Button disabled={isPending || !childId || !medicationName.trim() || !dosage.trim()} aria-busy={isPending} onClick={submit}>
              <Save aria-hidden="true" data-icon="inline-start" />
              {isPending ? "Saving medication log…" : "Save medication log"}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No child records are available in this compliance scope.</p>
        )}
    </CollapsibleCard>
  );
}
