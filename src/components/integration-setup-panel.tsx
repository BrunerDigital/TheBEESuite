"use client";

import { useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, RefreshCw, Save, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { IntegrationProvider, IntegrationSetupField, IntegrationSetupStatus } from "@/lib/integration-setup";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedDateTime } from "@/lib/zoned-date-time";

type IntegrationSetupRow = {
  id: string | null;
  provider: IntegrationProvider;
  name: string;
  purpose: string;
  detail: string;
  status: "Connected" | "Configured" | "Missing" | "Placeholder";
  setupStatus: IntegrationSetupStatus;
  config: Record<string, string | boolean>;
  fields: IntegrationSetupField[];
  credentialFields: Array<{ key: string; label: string; placeholder?: string }>;
  credentials: Array<{ key: string; configured: boolean; lastFour: string | null }>;
  env: {
    configured: boolean;
    configuredRequirements: string[];
    missingRequirements: string[];
  };
  lastSyncAt: Date | string | null;
};

type Props = {
  integrations: IntegrationSetupRow[];
  canManage: boolean;
  manageableProviders?: IntegrationProvider[];
};

const setupStatuses: Array<{ value: IntegrationSetupStatus; label: string }> = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "needs_credentials", label: "Needs credentials" },
  { value: "ready_for_test", label: "Ready for test" },
  { value: "verified", label: "Verified" },
];

function formatDateTime(value: Date | string | null, timeZone: string) {
  return formatZonedDateTime(value, timeZone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }, "Not checked");
}

function setupStatusLabel(value: IntegrationSetupStatus) {
  return setupStatuses.find((status) => status.value === value)?.label ?? "In progress";
}

function badgeVariant(status: IntegrationSetupRow["status"]): "default" | "outline" | "secondary" {
  if (status === "Connected" || status === "Configured") return "default";
  if (status === "Placeholder") return "secondary";
  return "outline";
}

function fieldValue(value: string | boolean | undefined) {
  return typeof value === "string" ? value : "";
}

function draftMap(integrations: IntegrationSetupRow[]) {
  return Object.fromEntries(integrations.map((integration) => [integration.provider, integration.config])) as Record<IntegrationProvider, Record<string, string | boolean>>;
}

function statusMap(integrations: IntegrationSetupRow[]) {
  return Object.fromEntries(integrations.map((integration) => [integration.provider, integration.setupStatus])) as Record<IntegrationProvider, IntegrationSetupStatus>;
}

function credentialMap(integrations: IntegrationSetupRow[]) {
  return Object.fromEntries(integrations.map((integration) => [
    integration.provider,
    Object.fromEntries(integration.credentialFields.map((field) => [field.key, ""])),
  ])) as Record<IntegrationProvider, Record<string, string>>;
}

export function IntegrationSetupPanel({ integrations, canManage, manageableProviders }: Props) {
  const timeZone = useSchoolTimeZone();
  const searchParams = useSearchParams();
  const requestedProvider = searchParams.get("provider") as IntegrationProvider | null;
  const initialProvider = integrations.some((integration) => integration.provider === requestedProvider)
    ? requestedProvider!
    : integrations[0]?.provider ?? "supabase";
  const [rows, setRows] = useState(integrations);
  const [activeProvider, setActiveProvider] = useState<IntegrationProvider>(initialProvider);
  const active = useMemo(
    () => rows.find((integration) => integration.provider === activeProvider) ?? rows[0],
    [activeProvider, rows],
  );
  const [drafts, setDrafts] = useState(() => draftMap(integrations));
  const [credentialDrafts, setCredentialDrafts] = useState(() => credentialMap(integrations));
  const [setupStatusesByProvider, setSetupStatusesByProvider] = useState(() => statusMap(integrations));
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const draft = active ? drafts[active.provider] ?? active.config : {};
  const credentialDraft = active ? credentialDrafts[active.provider] ?? {} : {};
  const setupStatus = active ? setupStatusesByProvider[active.provider] ?? active.setupStatus : "not_started";
  const activeCanManage = canManage && (!manageableProviders || manageableProviders.includes(active.provider));

  function updateDraft(key: string, value: string | boolean) {
    if (!active) return;
    setDrafts((current) => ({
      ...current,
      [active.provider]: {
        ...(current[active.provider] ?? active.config),
        [key]: value,
      },
    }));
  }

  function updateSetupStatus(value: IntegrationSetupStatus) {
    if (!active) return;
    setSetupStatusesByProvider((current) => ({ ...current, [active.provider]: value }));
  }

  function updateCredentialDraft(key: string, value: string) {
    if (!active) return;
    setCredentialDrafts((current) => ({
      ...current,
      [active.provider]: {
        ...(current[active.provider] ?? {}),
        [key]: value,
      },
    }));
  }

  function submit(action: "save" | "check") {
    if (!active) return;
    startTransition(async () => {
      setMessage("");
      const response = await fetch("/api/integrations/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: active.provider,
          action,
          setupStatus,
          config: draft,
          credentials: credentialDraft,
        }),
      });
      const json = await response.json().catch(() => null) as { ok?: boolean; error?: string; integration?: IntegrationSetupRow } | null;
      if (!response.ok || !json?.ok || !json.integration) {
        setMessage(json?.error || "Integration setup could not be saved.");
        return;
      }
      const savedIntegration = json.integration;
      setRows((current) => current.map((row) => row.provider === savedIntegration.provider ? savedIntegration : row));
      setDrafts((current) => ({ ...current, [savedIntegration.provider]: savedIntegration.config }));
      setCredentialDrafts((current) => ({
        ...current,
        [savedIntegration.provider]: Object.fromEntries(savedIntegration.credentialFields.map((field) => [field.key, ""])),
      }));
      setSetupStatusesByProvider((current) => ({ ...current, [savedIntegration.provider]: savedIntegration.setupStatus }));
      setMessage(action === "check" ? "Server configuration checked." : "Integration setup saved.");
    });
  }

  if (!active) return null;

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Integration Setup</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              Setup records track owners, public identifiers, review status, tenant-specific encrypted credentials, and server environment readiness.
            </CardDescription>
          </div>
          <Badge variant={activeCanManage ? "default" : "outline"}>
            {activeCanManage ? "Editable" : "Read only"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[18rem_1fr]">
        <div className="grid content-start gap-2">
          {rows.map((integration) => (
            <Button
              key={integration.provider}
              type="button"
              variant={integration.provider === active.provider ? "default" : "outline"}
              className="h-auto justify-between gap-3 px-3 py-3"
              onClick={() => {
                setActiveProvider(integration.provider);
                setMessage("");
              }}
            >
              <span className="text-left">
                <span className="block font-medium">{integration.name}</span>
                <span className="block text-xs opacity-80">{setupStatusLabel(integration.setupStatus)}</span>
              </span>
              <Badge variant={badgeVariant(integration.status)}>{integration.status}</Badge>
            </Button>
          ))}
        </div>

        <div className="grid gap-5">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="text-sm text-muted-foreground">Runtime status</div>
              <div className="mt-1 font-semibold">{active.status}</div>
            </div>
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="text-sm text-muted-foreground">Setup status</div>
              <div className="mt-1 font-semibold">{setupStatusLabel(active.setupStatus)}</div>
            </div>
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="text-sm text-muted-foreground">Last checked</div>
              <div className="mt-1 font-semibold">{formatDateTime(active.lastSyncAt, timeZone)}</div>
            </div>
          </div>

          <div className="rounded-xl border bg-background/40 p-4">
            <div className="flex items-start gap-3">
              {active.env.configured ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
              ) : (
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium">{active.name}</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{active.detail}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {active.env.configuredRequirements.map((requirement) => (
                    <Badge key={requirement}>{requirement}</Badge>
                  ))}
                  {active.env.missingRequirements.map((requirement) => (
                    <Badge key={requirement} variant="outline">{requirement} missing</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Setup status</Label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={setupStatus}
                onChange={(event) => updateSetupStatus(event.target.value as IntegrationSetupStatus)}
                disabled={!activeCanManage || isPending}
              >
                {setupStatuses.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>
            {active.fields.map((field) => (
              <div key={field.key} className={field.type === "textarea" ? "space-y-1 md:col-span-2" : "space-y-1"}>
                {field.type === "checkbox" ? (
                  <label className="flex min-h-16 items-center gap-3 rounded-xl border bg-background/40 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft[field.key] === true}
                      onChange={(event) => updateDraft(field.key, event.target.checked)}
                      disabled={!activeCanManage || isPending}
                    />
                    <span>{field.label}</span>
                  </label>
                ) : field.type === "textarea" ? (
                  <>
                    <Label>{field.label}</Label>
                    <Textarea
                      value={fieldValue(draft[field.key])}
                      onChange={(event) => updateDraft(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      disabled={!activeCanManage || isPending}
                    />
                  </>
                ) : field.type === "select" ? (
                  <>
                    <Label>{field.label}</Label>
                    <select
                      className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={fieldValue(draft[field.key]) || field.options?.[0]?.value || ""}
                      onChange={(event) => updateDraft(field.key, event.target.value)}
                      disabled={!activeCanManage || isPending}
                    >
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <Label>{field.label}</Label>
                    <Input
                      type={field.type}
                      value={fieldValue(draft[field.key])}
                      onChange={(event) => updateDraft(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      disabled={!activeCanManage || isPending}
                    />
                  </>
                )}
              </div>
            ))}
          </div>

          {active.credentialFields.length ? (
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="flex flex-col gap-1">
                <div className="font-medium">Tenant Credentials</div>
                <p className="text-sm text-muted-foreground">
                  Saved credentials are encrypted server-side and hidden after save. Leave a field blank to keep the existing value.
                </p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {active.credentialFields.map((field) => {
                  const presence = active.credentials.find((credential) => credential.key === field.key);
                  return (
                    <div key={field.key} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <Label>{field.label}</Label>
                        {presence?.configured ? (
                          <Badge variant="outline">Saved{presence.lastFour ? ` ••••${presence.lastFour}` : ""}</Badge>
                        ) : (
                          <Badge variant="secondary">Not saved</Badge>
                        )}
                      </div>
                      <Input
                        type="password"
                        value={credentialDraft[field.key] ?? ""}
                        onChange={(event) => updateCredentialDraft(field.key, event.target.value)}
                        placeholder={field.placeholder ?? (presence?.configured ? "Leave blank to keep saved value" : "Enter tenant credential")}
                        disabled={!activeCanManage || isPending}
                        autoComplete="off"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {message ? <div className="rounded-xl border bg-background/50 p-3 text-sm text-muted-foreground">{message}</div> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => submit("save")} disabled={!activeCanManage || isPending}>
              <Save data-icon="inline-start" />
              Save setup
            </Button>
            <Button type="button" variant="outline" onClick={() => submit("check")} disabled={!activeCanManage || isPending}>
              <RefreshCw data-icon="inline-start" />
              Check server config
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
