"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ExternalLink, Link2, RefreshCw, Save, ShieldAlert, Unplug } from "lucide-react";
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
  oauth: {
    supported: boolean;
    appConfigured: boolean;
    connectHref: string | null;
    requestedScopes: string[];
    connected: boolean;
    expiresAt: string | null;
    accountSelectionRequired: boolean;
    discoveryError: string;
  };
  availableAccounts: Array<{ id: string; label: string; kind: string }>;
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

function integrationControlId(provider: IntegrationProvider, section: string, key: string) {
  return `integration-${provider}-${section}-${key}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function IntegrationSetupPanel({ integrations, canManage, manageableProviders }: Props) {
  const timeZone = useSchoolTimeZone();
  const router = useRouter();
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
  const [message, setMessage] = useState(() => {
    const oauth = searchParams.get("oauth");
    if (oauth === "connected") return "Provider login connected successfully.";
    if (oauth === "choose_account") return "Provider login connected. Choose the school account or profile below.";
    if (oauth === "error") return searchParams.get("oauth_error") || "Provider login could not be completed.";
    return "";
  });
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<"save" | "check" | "select-account" | "disconnect" | null>(null);
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
      setPendingAction(action);
      setMessage("");
      try {
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
      } finally {
        setPendingAction(null);
      }
    });
  }

  function selectOAuthAccount() {
    if (!active) return;
    const accountId = selectedAccounts[active.provider] || "";
    if (!accountId) {
      setMessage("Choose an account first.");
      return;
    }
    startTransition(async () => {
      setPendingAction("select-account");
      setMessage("");
      try {
        const response = await fetch(`/api/integrations/oauth/${active.provider}/select-account`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId }),
        });
        const json = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
        if (!response.ok || !json?.ok) {
          setMessage(json?.error || "The provider account could not be selected.");
          return;
        }
        setMessage("School account selected.");
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function disconnectOAuth() {
    if (!active || !window.confirm(`Disconnect ${active.name} from this school? Saved provider tokens and account selection will be removed.`)) return;
    startTransition(async () => {
      setPendingAction("disconnect");
      setMessage("");
      try {
        const response = await fetch(`/api/integrations/oauth/${active.provider}/disconnect`, {
          method: "POST",
        });
        const json = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
        if (!response.ok || !json?.ok) {
          setMessage(json?.error || "The provider could not be disconnected.");
          return;
        }
        setMessage(`${active.name} disconnected. Revoke The BEE Suite in the provider account too if you want to withdraw its authorization there.`);
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  if (!active) return null;

  const accountSelectionId = integrationControlId(active.provider, "oauth", "account");
  const setupStatusId = integrationControlId(active.provider, "setup", "status");

  return (
    <Card aria-busy={isPending}>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle as="h2">Integration Setup</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              Setup records show who owns each connection, its public identifiers, review status, saved connection details, and server readiness.
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
              aria-pressed={integration.provider === active.provider}
              aria-label={`${integration.name}: ${setupStatusLabel(integration.setupStatus)}, ${integration.status}`}
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
            <div className="rounded-lg border bg-background p-4">
              <div className="text-sm text-muted-foreground">Runtime status</div>
              <div className="mt-1 font-semibold">{active.status}</div>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <div className="text-sm text-muted-foreground">Setup status</div>
              <div className="mt-1 font-semibold">{setupStatusLabel(active.setupStatus)}</div>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <div className="text-sm text-muted-foreground">Last checked</div>
              <div className="mt-1 font-semibold">{formatDateTime(active.lastSyncAt, timeZone)}</div>
            </div>
          </div>

          <div className="rounded-lg border bg-background p-4">
            <div className="flex items-start gap-3">
              {active.env.configured ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
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

          {active.oauth.supported ? (
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    <Link2 className="size-4 text-primary" aria-hidden="true" />
                    Provider login
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    The director signs in with the provider and approves access. Access and refresh tokens stay encrypted on the server for this school.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant={active.oauth.connected ? "default" : "outline"}>
                      {active.oauth.connected ? "Login connected" : "Not connected"}
                    </Badge>
                    <Badge variant={active.oauth.appConfigured ? "secondary" : "outline"}>
                      {active.oauth.appConfigured ? "BEE Suite app configured" : "Platform app setup required"}
                    </Badge>
                    {active.oauth.accountSelectionRequired ? <Badge variant="outline">Choose account</Badge> : null}
                  </div>
                  {active.oauth.discoveryError ? (
                    <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                      Login succeeded, but automatic account discovery reported: {active.oauth.discoveryError}
                    </p>
                  ) : null}
                </div>
                {activeCanManage ? (
                  <div className="flex flex-wrap gap-2">
                    {active.oauth.connectHref ? (
                      <Button
                        nativeButton={false}
                        variant={active.oauth.connected ? "outline" : "default"}
                        render={<a href={active.oauth.connectHref} />}
                        aria-label={`${active.oauth.connected ? "Reconnect" : "Connect"} ${active.name} provider login`}
                      >
                        <ExternalLink data-icon="inline-start" aria-hidden="true" />
                        {active.oauth.connected ? "Reconnect" : `Connect ${active.name}`}
                      </Button>
                    ) : null}
                    {active.oauth.connected ? (
                      <Button type="button" variant="outline" onClick={disconnectOAuth} disabled={isPending} aria-busy={pendingAction === "disconnect"} aria-label={`Disconnect ${active.name} provider login`}>
                        <Unplug data-icon="inline-start" aria-hidden="true" />
                        {pendingAction === "disconnect" ? "Disconnecting…" : "Disconnect"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {active.oauth.accountSelectionRequired && active.availableAccounts.length ? (
                <div className="mt-4 grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div className="space-y-1">
                    <Label htmlFor={accountSelectionId}>School account or profile</Label>
                    <select
                      id={accountSelectionId}
                      className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={selectedAccounts[active.provider] || ""}
                      onChange={(event) => setSelectedAccounts((current) => ({ ...current, [active.provider]: event.target.value }))}
                      disabled={isPending}
                    >
                      <option value="">Choose an account</option>
                      {active.availableAccounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.label} · {account.kind}</option>
                      ))}
                    </select>
                  </div>
                  <Button type="button" onClick={selectOAuthAccount} disabled={isPending || !selectedAccounts[active.provider]} aria-busy={pendingAction === "select-account"}>
                    {pendingAction === "select-account" ? "Selecting account…" : "Use this account"}
                  </Button>
                </div>
              ) : null}

              {!active.oauth.appConfigured ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  A platform administrator must register The BEE Suite with this provider, approve the callback URL, and add the app client credentials before directors can connect.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={setupStatusId}>Setup status</Label>
              <select
                id={setupStatusId}
                className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={setupStatus}
                onChange={(event) => updateSetupStatus(event.target.value as IntegrationSetupStatus)}
                disabled={!activeCanManage || isPending}
              >
                {setupStatuses.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>
            {active.fields.map((field) => {
              const fieldId = integrationControlId(active.provider, "field", field.key);
              return (
              <div key={field.key} className={field.type === "textarea" ? "space-y-1 md:col-span-2" : "space-y-1"}>
                {field.type === "checkbox" ? (
                  <label htmlFor={fieldId} className="flex min-h-16 items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm">
                    <input
                      id={fieldId}
                      type="checkbox"
                      className="size-5 shrink-0 accent-primary"
                      checked={draft[field.key] === true}
                      onChange={(event) => updateDraft(field.key, event.target.checked)}
                      disabled={!activeCanManage || isPending}
                    />
                    <span>{field.label}</span>
                  </label>
                ) : field.type === "textarea" ? (
                  <>
                    <Label htmlFor={fieldId}>{field.label}</Label>
                    <Textarea
                      id={fieldId}
                      value={fieldValue(draft[field.key])}
                      onChange={(event) => updateDraft(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      disabled={!activeCanManage || isPending}
                    />
                  </>
                ) : field.type === "select" ? (
                  <>
                    <Label htmlFor={fieldId}>{field.label}</Label>
                    <select
                      id={fieldId}
                      className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
                    <Label htmlFor={fieldId}>{field.label}</Label>
                    <Input
                      id={fieldId}
                      type={field.type}
                      value={fieldValue(draft[field.key])}
                      onChange={(event) => updateDraft(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      disabled={!activeCanManage || isPending}
                    />
                  </>
                )}
              </div>
              );
            })}
          </div>

          {active.credentialFields.length && !active.oauth.supported ? (
            <div className="rounded-lg border bg-background p-4">
              <div className="flex flex-col gap-1">
                <div className="font-medium">Secure connection details</div>
                <p className="text-sm text-muted-foreground">
                  Saved connection details are encrypted on the server and hidden after save. Leave a field blank to keep the existing value.
                </p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {active.credentialFields.map((field) => {
                  const presence = active.credentials.find((credential) => credential.key === field.key);
                  const credentialId = integrationControlId(active.provider, "credential", field.key);
                  return (
                    <div key={field.key} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor={credentialId}>{field.label}</Label>
                        {presence?.configured ? (
                          <Badge variant="outline">Saved{presence.lastFour ? ` ••••${presence.lastFour}` : ""}</Badge>
                        ) : (
                          <Badge variant="secondary">Not saved</Badge>
                        )}
                      </div>
                      <Input
                        id={credentialId}
                        type="password"
                        value={credentialDraft[field.key] ?? ""}
                        onChange={(event) => updateCredentialDraft(field.key, event.target.value)}
                        placeholder={field.placeholder ?? (presence?.configured ? "Leave blank to keep saved value" : "Enter secure value")}
                        disabled={!activeCanManage || isPending}
                        autoComplete="off"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {message ? <div role="status" aria-live="polite" className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">{message}</div> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => submit("save")} disabled={!activeCanManage || isPending} aria-busy={pendingAction === "save"}>
              <Save data-icon="inline-start" aria-hidden="true" />
              {pendingAction === "save" ? "Saving setup…" : "Save setup"}
            </Button>
            <Button type="button" variant="outline" onClick={() => submit("check")} disabled={!activeCanManage || isPending} aria-busy={pendingAction === "check"}>
              <RefreshCw data-icon="inline-start" aria-hidden="true" />
              {pendingAction === "check" ? "Checking server config…" : "Check server config"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
