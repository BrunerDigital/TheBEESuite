"use client";

import { useMemo, useState } from "react";
import { BellRing, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  normalizeTuitionPaymentReminderSettings,
  tuitionPaymentReminderSettingsFromCustomFields,
  TUITION_PAYMENT_REMINDER_SETTINGS_KEY,
  type TuitionPaymentReminderSettings,
} from "@/lib/tuition-payment-reminders";

export type TuitionPaymentReminderCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  customFields: unknown;
};

type TuitionPaymentReminderSettingsPanelProps = {
  centers: TuitionPaymentReminderCenter[];
};

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function centerSettings(center: TuitionPaymentReminderCenter) {
  return tuitionPaymentReminderSettingsFromCustomFields(center.customFields);
}

function settingSummary(settings: TuitionPaymentReminderSettings) {
  if (!settings.enabled) return "Paused";
  const parts = [
    settings.invoiceReadyEnabled ? "Friday billing notice for non-autopay families" : null,
    settings.pastDueEnabled
      ? `Past due starts after ${settings.pastDueFirstDaysAfter} day${settings.pastDueFirstDaysAfter === 1 ? "" : "s"}, repeats every ${settings.pastDueRepeatEveryDays} day${settings.pastDueRepeatEveryDays === 1 ? "" : "s"} through day ${settings.pastDueMaxDaysAfter}`
      : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : "No reminder points enabled";
}

export function TuitionPaymentReminderSettingsPanel({ centers }: TuitionPaymentReminderSettingsPanelProps) {
  const [localCenters, setLocalCenters] = useState(centers);
  const [selectedCenterId, setSelectedCenterId] = useState(centers[0]?.id ?? "");
  const [draftByCenter, setDraftByCenter] = useState<Record<string, TuitionPaymentReminderSettings>>(() => (
    Object.fromEntries(centers.map((center) => [center.id, centerSettings(center)]))
  ));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedCenter = useMemo(
    () => localCenters.find((center) => center.id === selectedCenterId) ?? localCenters[0] ?? null,
    [localCenters, selectedCenterId],
  );
  const settings = selectedCenter
    ? draftByCenter[selectedCenter.id] ?? centerSettings(selectedCenter)
    : normalizeTuitionPaymentReminderSettings(null);

  function updateSettings(patch: Partial<TuitionPaymentReminderSettings>) {
    if (!selectedCenter) return;
    setDraftByCenter((current) => ({
      ...current,
      [selectedCenter.id]: normalizeTuitionPaymentReminderSettings({
        ...(current[selectedCenter.id] ?? centerSettings(selectedCenter)),
        ...patch,
      }),
    }));
    setMessage(null);
  }

  async function saveSettings() {
    if (!selectedCenter) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/payment-reminder-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId: selectedCenter.id, settings }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Reminder settings could not be saved.");
      }
      const nextSettings = normalizeTuitionPaymentReminderSettings(json.settings);
      setDraftByCenter((current) => ({ ...current, [selectedCenter.id]: nextSettings }));
      setLocalCenters((current) => current.map((center) => {
        if (center.id !== selectedCenter.id) return center;
        return {
          ...center,
          customFields: {
            ...fields(center.customFields),
            [TUITION_PAYMENT_REMINDER_SETTINGS_KEY]: nextSettings,
          },
        };
      }));
      setMessage("Tuition reminder settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reminder settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function numberValue(key: keyof TuitionPaymentReminderSettings) {
    const value = settings[key];
    return typeof value === "number" ? value : 0;
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge className="mb-3">
              <BellRing data-icon="inline-start" />
              Tuition reminders
            </Badge>
            <CardTitle>Parent tuition payment reminders</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              Configure Friday billing notifications for non-autopay families and past-due balance notices that ask parents to pay before or at drop-off.
            </CardDescription>
          </div>
          <div className="rounded-xl border bg-background/50 p-3 text-sm">
            <div className="font-medium">Current cadence</div>
            <div className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{settingSummary(settings)}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,360px)_1fr]">
          <div className="space-y-2">
            <Label htmlFor="tuition-reminder-center">School</Label>
            <Select
              value={selectedCenter?.id ?? ""}
              onValueChange={(value) => setSelectedCenterId(value ?? "")}
              disabled={!localCenters.length}
            >
              <SelectTrigger id="tuition-reminder-center" className="w-full">
                <SelectValue placeholder="Choose school" />
              </SelectTrigger>
              <SelectContent>
                {localCenters.map((center) => (
                  <SelectItem key={center.id} value={center.id}>
                    {center.crmLocationId ? `${center.crmLocationId} - ${center.name}` : center.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border bg-background/40 p-4">
            <div>
              <div className="text-sm font-medium">Send tuition payment notifications</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">Applies to open recurring tuition invoices for the selected school.</div>
            </div>
            <Switch checked={settings.enabled} onCheckedChange={(checked) => updateSettings({ enabled: Boolean(checked) })} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-background/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Friday billing ready notice</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  Non-autopay families are notified when the next tuition invoice is ready to view and pay.
                </div>
              </div>
              <Switch checked={settings.invoiceReadyEnabled} onCheckedChange={(checked) => updateSettings({ invoiceReadyEnabled: Boolean(checked) })} />
            </div>
            <div className="mt-4 rounded-lg border bg-background/50 p-3 text-xs leading-5 text-muted-foreground">
              Families with active autopay are skipped for this notice because their saved method should process the invoice.
            </div>
          </div>

          <div className="rounded-xl border bg-background/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Past due drop-off notice</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">Escalation after the tuition due date.</div>
              </div>
              <Switch checked={settings.pastDueEnabled} onCheckedChange={(checked) => updateSettings({ pastDueEnabled: Boolean(checked) })} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="tuition-past-due-first">First notice</Label>
                <Input
                  id="tuition-past-due-first"
                  type="number"
                  min={1}
                  max={30}
                  value={numberValue("pastDueFirstDaysAfter")}
                  onChange={(event) => updateSettings({ pastDueFirstDaysAfter: Number.parseInt(event.target.value, 10) })}
                  disabled={!settings.pastDueEnabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tuition-past-due-repeat">Repeat every</Label>
                <Input
                  id="tuition-past-due-repeat"
                  type="number"
                  min={1}
                  max={30}
                  value={numberValue("pastDueRepeatEveryDays")}
                  onChange={(event) => updateSettings({ pastDueRepeatEveryDays: Number.parseInt(event.target.value, 10) })}
                  disabled={!settings.pastDueEnabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tuition-past-due-stop">Stop after</Label>
                <Input
                  id="tuition-past-due-stop"
                  type="number"
                  min={1}
                  max={90}
                  value={numberValue("pastDueMaxDaysAfter")}
                  onChange={(event) => updateSettings({ pastDueMaxDaysAfter: Number.parseInt(event.target.value, 10) })}
                  disabled={!settings.pastDueEnabled}
                />
              </div>
            </div>
          </div>
        </div>

        {message ? <div className="rounded-xl border bg-background/50 p-3 text-sm text-muted-foreground">{message}</div> : null}

        <div className="flex justify-end">
          <Button type="button" onClick={saveSettings} disabled={!selectedCenter || saving}>
            <Save data-icon="inline-start" />
            {saving ? "Saving" : "Save reminders"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
