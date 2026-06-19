"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dashboardOptionsFromCustomFields, defaultAgeGroupOptions, normalizeDashboardOptions, type DashboardOptions } from "@/lib/dashboard-options";

type DashboardOptionsCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  customFields: unknown;
};

type Props = {
  centers: DashboardOptionsCenter[];
};

function centerLabel(center: DashboardOptionsCenter) {
  return [center.crmLocationId, center.name].filter(Boolean).join(" · ");
}

function centerOptions(center: DashboardOptionsCenter | null): DashboardOptions {
  return normalizeDashboardOptions(center ? dashboardOptionsFromCustomFields(center.customFields) : null);
}

export function DashboardOptionsSettingsPanel({ centers }: Props) {
  const router = useRouter();
  const [selectedCenterId, setSelectedCenterId] = useState(centers[0]?.id ?? "");
  const selectedCenter = centers.find((center) => center.id === selectedCenterId) ?? centers[0] ?? null;
  const [draftByCenter, setDraftByCenter] = useState<Record<string, DashboardOptions>>(() => (
    Object.fromEntries(centers.map((center) => [center.id, centerOptions(center)]))
  ));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const options = selectedCenter
    ? draftByCenter[selectedCenter.id] ?? centerOptions(selectedCenter)
    : normalizeDashboardOptions(null);

  function updateAgeGroup(index: number, value: string) {
    if (!selectedCenter) return;
    setDraftByCenter((current) => {
      const next = normalizeDashboardOptions(current[selectedCenter.id] ?? options);
      const ageGroups = [...next.ageGroups];
      ageGroups[index] = value;
      return { ...current, [selectedCenter.id]: { ...next, ageGroups } };
    });
  }

  function addAgeGroup() {
    if (!selectedCenter) return;
    setDraftByCenter((current) => {
      const next = normalizeDashboardOptions(current[selectedCenter.id] ?? options);
      return { ...current, [selectedCenter.id]: { ...next, ageGroups: [...next.ageGroups, ""] } };
    });
  }

  function removeAgeGroup(index: number) {
    if (!selectedCenter) return;
    setDraftByCenter((current) => {
      const next = normalizeDashboardOptions(current[selectedCenter.id] ?? options);
      const ageGroups = next.ageGroups.filter((_, itemIndex) => itemIndex !== index);
      return { ...current, [selectedCenter.id]: { ...next, ageGroups: ageGroups.length ? ageGroups : [defaultAgeGroupOptions[0]] } };
    });
  }

  async function saveOptions() {
    if (!selectedCenter) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/dashboard-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId: selectedCenter.id, options }),
      });
      const json = await response.json().catch(() => null) as { error?: string; options?: DashboardOptions } | null;
      if (!response.ok) throw new Error(json?.error || "Dashboard options could not be saved.");
      const savedOptions = normalizeDashboardOptions(json?.options);
      setDraftByCenter((current) => ({ ...current, [selectedCenter.id]: savedOptions }));
      setMessage("Dashboard dropdown options saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dashboard options could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Dashboard Dropdown Options</CardTitle>
        <CardDescription>
          Manage the school-specific menu values directors use when setting tuition rates, classrooms, and child profiles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? (
          <Alert>
            <AlertTitle>Settings</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-1">
            <Label>School</Label>
            <Select value={selectedCenter?.id ?? ""} onValueChange={(value) => value && setSelectedCenterId(value)}>
              <SelectTrigger><SelectValue placeholder="Choose school" /></SelectTrigger>
              <SelectContent>
                {centers.map((center) => (
                  <SelectItem key={center.id} value={center.id}>{centerLabel(center)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" disabled={!selectedCenter || saving} onClick={saveOptions}>
            <Save data-icon="inline-start" />
            Save options
          </Button>
        </div>
        <section className="rounded-xl border bg-background/40 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Age groups</div>
              <p className="text-xs text-muted-foreground">Used by tuition rates, batch billing, classroom setup, and child profiles.</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={addAgeGroup} disabled={!selectedCenter || saving}>
              <Plus data-icon="inline-start" />
              Add
            </Button>
          </div>
          <div className="grid gap-2">
            {options.ageGroups.map((group, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input value={group} onChange={(event) => updateAgeGroup(index, event.target.value)} placeholder="Age group" />
                <Button type="button" size="icon" variant="outline" aria-label={`Remove ${group || "age group"}`} onClick={() => removeAgeGroup(index)} disabled={saving}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
