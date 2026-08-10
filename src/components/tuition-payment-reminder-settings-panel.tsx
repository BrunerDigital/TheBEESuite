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
  return `Current-family balance reminder every ${settings.repeatEveryDays} day${settings.repeatEveryDays === 1 ? "" : "s"}`;
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
              Send one friendly family-level reminder only when a current family has a positive, parent-payable balance and the school&apos;s secure checkout is ready.
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
              <div className="mt-1 text-xs leading-5 text-muted-foreground">Withdrawn families, zero or credit balances, pending payments, active autopay, and subsidy responsibility reviews are excluded.</div>
            </div>
            <Switch checked={settings.enabled} onCheckedChange={(checked) => updateSettings({ enabled: Boolean(checked) })} />
          </div>
        </div>

        <div className="rounded-xl border bg-background/40 p-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(220px,320px)_1fr] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="tuition-reminder-repeat">Reminder cadence</Label>
              <Input
                id="tuition-reminder-repeat"
                type="number"
                min={1}
                max={30}
                value={numberValue("repeatEveryDays")}
                onChange={(event) => updateSettings({ repeatEveryDays: Number.parseInt(event.target.value, 10) })}
                disabled={!settings.enabled}
              />
            </div>
            <div className="rounded-lg border bg-background/50 p-3 text-xs leading-5 text-muted-foreground">
              The default is every seven days. Each family receives at most one reminder in a cadence window, even when several invoices are open. Email links remain on <span className="font-medium text-foreground">https://thebeesuite.io</span> without tracking redirects.
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
