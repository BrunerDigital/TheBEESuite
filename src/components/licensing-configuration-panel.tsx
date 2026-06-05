"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  licensingConfigurationFieldLabels,
  type LicensingConfiguration,
  type LicensingConfigurationStatus,
} from "@/lib/licensing-config";

export type LicensingConfigurationCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  state: string | null;
  licensedCapacity: number;
  licensingConfiguration: LicensingConfiguration;
};

type DraftState = {
  state: string;
  licensingAgency: string;
  licenseNumber: string;
  licenseType: string;
  licensedCapacity: string;
  renewalDueDate: string;
  inspectionDueDate: string;
  ratioRules: string;
  childDocumentRules: string;
  staffCredentialRules: string;
  emergencyPreparednessRules: string;
  medicationRules: string;
  notes: string;
};

function statusLabel(status: LicensingConfigurationStatus) {
  return status === "ready_for_review" ? "Ready for review" : "Needs director input";
}

function statusVariant(status: LicensingConfigurationStatus) {
  return status === "ready_for_review" ? "default" : "outline";
}

function centerLabel(center: Pick<LicensingConfigurationCenter, "name" | "crmLocationId">) {
  return center.crmLocationId ?? center.name;
}

function missingLabels(config: LicensingConfiguration) {
  return config.missingFields.map((field) => licensingConfigurationFieldLabels[field] ?? field);
}

function draftFromCenter(center: LicensingConfigurationCenter | undefined): DraftState {
  const config = center?.licensingConfiguration;
  return {
    state: config?.state || center?.state || "",
    licensingAgency: config?.licensingAgency || "",
    licenseNumber: config?.licenseNumber || "",
    licenseType: config?.licenseType || "",
    licensedCapacity: String(config?.licensedCapacity ?? center?.licensedCapacity ?? ""),
    renewalDueDate: config?.renewalDueDate || "",
    inspectionDueDate: config?.inspectionDueDate || "",
    ratioRules: config?.ratioRules.value || "",
    childDocumentRules: config?.childDocumentRules.value || "",
    staffCredentialRules: config?.staffCredentialRules.value || "",
    emergencyPreparednessRules: config?.emergencyPreparednessRules.value || "",
    medicationRules: config?.medicationRules.value || "",
    notes: config?.notes || "",
  };
}

export function LicensingConfigurationPanel({
  centers,
  canManage,
}: {
  centers: LicensingConfigurationCenter[];
  canManage: boolean;
}) {
  const [rows, setRows] = useState(centers);
  const [selectedCenterId, setSelectedCenterId] = useState(centers[0]?.id ?? "");
  const selectedCenter = useMemo(
    () => rows.find((center) => center.id === selectedCenterId) ?? rows[0],
    [rows, selectedCenterId],
  );
  const [draft, setDraft] = useState<DraftState>(() => draftFromCenter(selectedCenter));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const readyCount = rows.filter((center) => center.licensingConfiguration.status === "ready_for_review").length;
  const needsInputCount = rows.length - readyCount;

  function update<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectCenter(centerId: string) {
    setSelectedCenterId(centerId);
    setDraft(draftFromCenter(rows.find((center) => center.id === centerId) ?? rows[0]));
    setError("");
    setMessage("");
  }

  function save() {
    if (!selectedCenter || !canManage) return;
    setError("");
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/compliance/licensing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId: selectedCenter.id,
          ...draft,
        }),
      });
      const json = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        center?: LicensingConfigurationCenter;
      } | null;

      if (!response.ok || !json?.center) {
        setError(json?.error || "Licensing configuration could not be saved.");
        return;
      }

      setRows((current) => current.map((center) => center.id === json.center?.id ? json.center : center));
      setDraft(draftFromCenter(json.center));
      setMessage("Licensing configuration saved.");
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>State Licensing Configuration</CardTitle>
        <CardDescription>School-level licensing agency, license, capacity, ratio, inspection, drill, document, and medication rules.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Configured</div>
            <div className="mt-1 text-2xl font-semibold">{readyCount}</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Needs input</div>
            <div className="mt-1 text-2xl font-semibold">{needsInputCount}</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Visible schools</div>
            <div className="mt-1 text-2xl font-semibold">{rows.length}</div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>School</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>License</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Renewal</TableHead>
              <TableHead>Missing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((center) => {
              const config = center.licensingConfiguration;
              const missing = missingLabels(config);
              return (
                <TableRow key={center.id}>
                  <TableCell className="font-medium">{centerLabel(center)}</TableCell>
                  <TableCell>{config.state || center.state || "Not set"}</TableCell>
                  <TableCell><Badge variant={statusVariant(config.status)}>{statusLabel(config.status)}</Badge></TableCell>
                  <TableCell>{config.licenseNumber || "Not set"}</TableCell>
                  <TableCell>{config.licensedCapacity ?? center.licensedCapacity}</TableCell>
                  <TableCell>{config.renewalDueDate || "Not set"}</TableCell>
                  <TableCell className="max-w-md whitespace-normal text-xs text-muted-foreground">
                    {missing.length ? missing.slice(0, 4).join(", ") : "Complete"}
                    {missing.length > 4 ? ` +${missing.length - 4}` : ""}
                  </TableCell>
                </TableRow>
              );
            })}
            {!rows.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">No schools are visible for this scope.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

        {selectedCenter ? (
          <div className="grid gap-4 rounded-lg border bg-background/40 p-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-3">
                <Label>School</Label>
                <Select value={selectedCenter.id} onValueChange={(value) => selectCenter(value ?? "")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {rows.map((center) => (
                      <SelectItem key={center.id} value={center.id}>{centerLabel(center)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="licensing-state">State</Label>
                <Input id="licensing-state" value={draft.state} onChange={(event) => update("state", event.target.value)} disabled={!canManage} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="licensing-agency">Licensing agency</Label>
                <Input id="licensing-agency" value={draft.licensingAgency} onChange={(event) => update("licensingAgency", event.target.value)} disabled={!canManage} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="license-type">License type</Label>
                <Input id="license-type" value={draft.licenseType} onChange={(event) => update("licenseType", event.target.value)} disabled={!canManage} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="license-number">License number</Label>
                <Input id="license-number" value={draft.licenseNumber} onChange={(event) => update("licenseNumber", event.target.value)} disabled={!canManage} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="licensed-capacity">Licensed capacity</Label>
                <Input id="licensed-capacity" value={draft.licensedCapacity} onChange={(event) => update("licensedCapacity", event.target.value)} inputMode="numeric" disabled={!canManage} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="renewal-due-date">Renewal due date</Label>
                <Input id="renewal-due-date" value={draft.renewalDueDate} onChange={(event) => update("renewalDueDate", event.target.value)} type="date" disabled={!canManage} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inspection-due-date">Inspection due date</Label>
                <Input id="inspection-due-date" value={draft.inspectionDueDate} onChange={(event) => update("inspectionDueDate", event.target.value)} type="date" disabled={!canManage} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ratio-rules">Ratio rules</Label>
                <Textarea id="ratio-rules" value={draft.ratioRules} onChange={(event) => update("ratioRules", event.target.value)} disabled={!canManage} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="child-doc-rules">Required child documents</Label>
                <Textarea id="child-doc-rules" value={draft.childDocumentRules} onChange={(event) => update("childDocumentRules", event.target.value)} disabled={!canManage} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-credential-rules">Required staff credentials</Label>
                <Textarea id="staff-credential-rules" value={draft.staffCredentialRules} onChange={(event) => update("staffCredentialRules", event.target.value)} disabled={!canManage} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergency-rules">Emergency preparedness</Label>
                <Textarea id="emergency-rules" value={draft.emergencyPreparednessRules} onChange={(event) => update("emergencyPreparednessRules", event.target.value)} disabled={!canManage} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medication-rules">Medication administration</Label>
                <Textarea id="medication-rules" value={draft.medicationRules} onChange={(event) => update("medicationRules", event.target.value)} disabled={!canManage} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="licensing-notes">Notes</Label>
                <Textarea id="licensing-notes" value={draft.notes} onChange={(event) => update("notes", event.target.value)} disabled={!canManage} />
              </div>
            </div>

            {error ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="size-4" />
                {error}
              </div>
            ) : null}
            {message ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">{message}</div> : null}

            <Button onClick={save} disabled={!canManage || isPending}>
              <Save data-icon="inline-start" />
              {isPending ? "Saving..." : "Save Licensing Configuration"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
