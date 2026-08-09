"use client";

import { useMemo, useState, useTransition } from "react";
import { ExternalLink, Link2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  MAX_EXECUTIVE_MARKETING_ASSIGNMENTS,
  suggestMarketingCenter,
  type MarketingPortfolioCenter,
} from "@/lib/executive-marketing";
import type { IntegrationProvider, IntegrationSetupView } from "@/lib/integration-setup";

export type ExecutiveMarketingConnection = {
  provider: IntegrationProvider;
  configured: boolean;
  accountId: string;
  accountLabel: string;
  setupStatus: string;
  lastSyncAt: string | null;
};

export type ExecutiveMarketingCenter = MarketingPortfolioCenter & {
  connections: ExecutiveMarketingConnection[];
};

type Props = {
  centers: ExecutiveMarketingCenter[];
  managerConnections: IntegrationSetupView[];
};

type MappingChoice = {
  selected: boolean;
  centerId: string;
};

function locationLabel(center: ExecutiveMarketingCenter) {
  return center.crmLocationId || [center.city, center.state].filter(Boolean).join(", ") || "Location details not set";
}

export function ExecutiveMarketingPortfolio({ centers, managerConnections }: Props) {
  const [rows, setRows] = useState(centers);
  const [managers, setManagers] = useState(managerConnections);
  const [activeProvider, setActiveProvider] = useState<IntegrationProvider>(
    managerConnections.find((item) => item.provider === "meta_social")?.provider
      ?? managerConnections[0]?.provider
      ?? "meta_social",
  );
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<Record<string, MappingChoice>>({});
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const manager = managers.find((item) => item.provider === activeProvider) ?? managers[0];
  const connectedCount = rows.filter((center) =>
    center.connections.some((connection) => connection.provider === activeProvider && connection.configured),
  ).length;

  const connectedCenterByAccount = useMemo(() => {
    const result = new Map<string, ExecutiveMarketingCenter>();
    for (const center of rows) {
      const connection = center.connections.find((item) => item.provider === activeProvider);
      if (connection?.accountId) result.set(connection.accountId, center);
    }
    return result;
  }, [activeProvider, rows]);

  function choiceKey(accountId: string) {
    return `${activeProvider}:${accountId}`;
  }

  function defaultCenterId(accountId: string) {
    const connected = connectedCenterByAccount.get(accountId);
    if (connected) return connected.id;
    const account = manager?.availableAccounts.find((candidate) => candidate.id === accountId);
    return account ? suggestMarketingCenter(account, rows)?.id ?? "" : "";
  }

  function resolvedCenterId(accountId: string) {
    return choices[choiceKey(accountId)]?.centerId ?? defaultCenterId(accountId);
  }

  const visibleAccounts = useMemo(() => {
    if (!manager) return [];
    const search = query.trim().toLocaleLowerCase("en-US");
    if (!search) return manager.availableAccounts;
    return manager.availableAccounts.filter((account) => {
      const linkedCenter = connectedCenterByAccount.get(account.id);
      const suggestedCenter = suggestMarketingCenter(account, rows);
      return [account.label, account.kind, linkedCenter?.name, suggestedCenter?.name]
        .some((value) => value?.toLocaleLowerCase("en-US").includes(search));
    });
  }, [connectedCenterByAccount, manager, query, rows]);

  const selectedAssignments = manager?.availableAccounts.flatMap((account) => {
    const choice = choices[choiceKey(account.id)];
    return choice?.selected
      ? [{ accountId: account.id, centerId: choice.centerId || defaultCenterId(account.id) }]
      : [];
  }) ?? [];
  const selectedCenterIds = selectedAssignments.map((assignment) => assignment.centerId).filter(Boolean);
  const hasDuplicateSchool = new Set(selectedCenterIds).size !== selectedCenterIds.length;
  const hasMissingSchool = selectedAssignments.some((assignment) => !assignment.centerId);

  function updateManagerAccounts(accounts: IntegrationSetupView["availableAccounts"]) {
    setManagers((current) => current.map((item) =>
      item.provider === activeProvider ? { ...item, availableAccounts: accounts } : item
    ));
  }

  function updateChoice(accountId: string, patch: Partial<MappingChoice>) {
    const key = choiceKey(accountId);
    setChoices((current) => ({
      ...current,
      [key]: {
        selected: current[key]?.selected ?? false,
        centerId: current[key]?.centerId ?? defaultCenterId(accountId),
        ...patch,
      },
    }));
    setMessage("");
  }

  function selectSuggested() {
    if (!manager) return;
    const suggested = manager.availableAccounts.flatMap((account) => {
      if (connectedCenterByAccount.has(account.id)) return [];
      const centerId = defaultCenterId(account.id);
      return centerId ? [{ accountId: account.id, centerId }] : [];
    }).slice(0, MAX_EXECUTIVE_MARKETING_ASSIGNMENTS);
    setChoices((current) => {
      const next = { ...current };
      for (const mapping of suggested) {
        next[choiceKey(mapping.accountId)] = { selected: true, centerId: mapping.centerId };
      }
      return next;
    });
    setMessage(suggested.length
      ? `${suggested.length} profile mapping${suggested.length === 1 ? "" : "s"} selected for review.`
      : "No confident school matches were found. Choose each school manually.");
  }

  function clearSelections() {
    if (!manager) return;
    setChoices((current) => {
      const next = { ...current };
      for (const account of manager.availableAccounts) {
        const key = choiceKey(account.id);
        if (next[key]) next[key] = { ...next[key], selected: false };
      }
      return next;
    });
    setMessage("");
  }

  function refreshAccounts() {
    if (!manager) return;
    startTransition(async () => {
      setMessage("");
      const response = await fetch("/api/integrations/executive-marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh", provider: manager.provider }),
      });
      const json = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        accounts?: IntegrationSetupView["availableAccounts"];
      } | null;
      if (!response.ok || !json?.ok || !json.accounts) {
        setMessage(json?.error || "Manager profiles could not be refreshed.");
        return;
      }
      updateManagerAccounts(json.accounts);
      setMessage(`${json.accounts.length} available profile${json.accounts.length === 1 ? "" : "s"} refreshed.`);
    });
  }

  function importSelectedProfiles() {
    if (!manager || !selectedAssignments.length) return;
    if (selectedAssignments.length > MAX_EXECUTIVE_MARKETING_ASSIGNMENTS) {
      setMessage(`Import up to ${MAX_EXECUTIVE_MARKETING_ASSIGNMENTS} profiles at a time.`);
      return;
    }
    if (hasMissingSchool) {
      setMessage("Choose an active school for every selected profile.");
      return;
    }
    if (hasDuplicateSchool) {
      setMessage("Choose only one profile per school for this platform.");
      return;
    }
    startTransition(async () => {
      setMessage("");
      const response = await fetch("/api/integrations/executive-marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign_many",
          provider: manager.provider,
          assignments: selectedAssignments,
        }),
      });
      const json = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        connections?: Array<ExecutiveMarketingConnection & { centerId: string }>;
        accounts?: IntegrationSetupView["availableAccounts"];
      } | null;
      if (!response.ok || !json?.ok || !json.connections) {
        setMessage(json?.error || "The selected profiles could not be imported.");
        return;
      }
      const connectionsByCenter = new Map(json.connections.map((connection) => [connection.centerId, connection]));
      setRows((current) => current.map((center) => {
        const connection = connectionsByCenter.get(center.id);
        if (!connection) return center;
        return {
          ...center,
          connections: [
            ...center.connections.filter((item) => item.provider !== connection.provider),
            connection,
          ],
        };
      }));
      if (json.accounts) updateManagerAccounts(json.accounts);
      setChoices((current) => {
        const next = { ...current };
        for (const connection of json.connections!) {
          next[choiceKey(connection.accountId)] = { selected: false, centerId: connection.centerId };
        }
        return next;
      });
      setMessage(`${json.connections.length} profile${json.connections.length === 1 ? "" : "s"} imported and linked to ${json.connections.length === 1 ? "its school" : "their schools"}.`);
    });
  }

  if (!manager) return null;

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle>School social profile portfolio</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              Sign in once with an executive business manager or ad manager, select multiple available profiles, and map each one to the correct active school. Directors can still connect or reconnect their own school when they have provider access.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {manager.oauth.connectHref ? (
              <Button
                nativeButton={false}
                render={<a href={manager.oauth.connectHref} />}
                variant={manager.oauth.connected ? "outline" : "default"}
              >
                <ExternalLink data-icon="inline-start" />
                {manager.oauth.connected ? "Reconnect manager login" : "Connect manager login"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={refreshAccounts}
              disabled={isPending || !manager.oauth.connected}
            >
              <RefreshCw className={isPending ? "animate-spin motion-reduce:animate-none" : ""} data-icon="inline-start" />
              Refresh profiles
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-3 lg:grid-cols-[18rem_1fr_auto] lg:items-end">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="executive-marketing-provider">Platform</label>
            <select
              id="executive-marketing-provider"
              name="executive-marketing-provider"
              autoComplete="off"
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={activeProvider}
              onChange={(event) => {
                setActiveProvider(event.target.value as IntegrationProvider);
                setMessage("");
              }}
            >
              {managers.map((item) => <option key={item.provider} value={item.provider}>{item.name}</option>)}
            </select>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search profiles or schools"
              name="executive-marketing-search"
              autoComplete="off"
              className="pl-9"
              placeholder="Search profiles or schools…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={manager.oauth.connected ? "default" : "outline"}>
              {manager.oauth.connected ? "Manager login connected" : "Manager login needed"}
            </Badge>
            <Badge className="tabular-nums" variant="outline">{connectedCount} of {rows.length} schools ready</Badge>
          </div>
        </div>

        <div className="rounded-xl border bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <p>
              The manager login only discovers profiles it can access. Import rechecks every profile and active school, then creates separate encrypted school-scoped connections in one audited batch. It does not change provider ownership or a director&apos;s ability to authorize that school directly.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border bg-background/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium">Import profiles</div>
            <div className="mt-1 text-sm text-muted-foreground">
              <span className="tabular-nums">{selectedAssignments.length} selected · up to {MAX_EXECUTIVE_MARKETING_ASSIGNMENTS} per import</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={selectSuggested} disabled={isPending || !manager.availableAccounts.length}>
              Select suggested
            </Button>
            <Button type="button" variant="ghost" onClick={clearSelections} disabled={isPending || !selectedAssignments.length}>
              Clear
            </Button>
            <Button
              type="button"
              onClick={importSelectedProfiles}
              disabled={isPending || !manager.oauth.connected || !selectedAssignments.length}
            >
              <Link2 data-icon="inline-start" />
              {isPending ? "Importing…" : `Import ${selectedAssignments.length || "selected"}`}
            </Button>
          </div>
        </div>

        {hasDuplicateSchool ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            A school is selected more than once. Each platform supports one active profile connection per school.
          </div>
        ) : null}
        {hasMissingSchool ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-950 dark:text-amber-100">
            Choose an active school for every selected profile before importing.
          </div>
        ) : null}
        {message ? <div aria-live="polite" className="rounded-xl border bg-background/60 p-3 text-sm text-muted-foreground">{message}</div> : null}

        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Import</TableHead>
                <TableHead>Available profile</TableHead>
                <TableHead>Current school</TableHead>
                <TableHead className="min-w-72">School mapping</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleAccounts.map((account, index) => {
                const key = choiceKey(account.id);
                const connectedCenter = connectedCenterByAccount.get(account.id);
                const suggestedCenter = connectedCenter ?? suggestMarketingCenter(account, rows);
                const selected = choices[key]?.selected ?? false;
                const centerId = resolvedCenterId(account.id);
                const checkboxId = `executive-profile-${index}`;
                return (
                  <TableRow key={account.id}>
                    <TableCell>
                      <label className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md hover:bg-muted" htmlFor={checkboxId}>
                        <input
                          id={checkboxId}
                          name={`import-${account.id}`}
                          type="checkbox"
                          className="size-4 rounded border-input accent-primary"
                          checked={selected}
                          onChange={(event) => updateChoice(account.id, { selected: event.target.checked })}
                          disabled={isPending || !manager.oauth.connected}
                        />
                        <span className="sr-only">Import {account.label}</span>
                      </label>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-lg break-words font-medium">{account.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{account.kind}</div>
                    </TableCell>
                    <TableCell>
                      {connectedCenter ? (
                        <div>
                          <div>{connectedCenter.name}</div>
                          <Badge className="mt-1" variant="outline">Currently linked</Badge>
                        </div>
                      ) : suggestedCenter ? (
                        <div>
                          <div>{suggestedCenter.name}</div>
                          <Badge className="mt-1" variant="outline">Suggested</Badge>
                        </div>
                      ) : "Not linked"}
                    </TableCell>
                    <TableCell>
                      <select
                        aria-label={`School for ${account.label}`}
                        name={`school-${account.id}`}
                        autoComplete="off"
                        className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={centerId}
                        onChange={(event) => updateChoice(account.id, {
                          selected: true,
                          centerId: event.target.value,
                        })}
                        disabled={isPending || !manager.oauth.connected}
                      >
                        <option value="">Choose an active school</option>
                        {rows.map((center) => (
                          <option key={center.id} value={center.id}>
                            {center.name}{suggestedCenter?.id === center.id ? connectedCenter ? " · Current" : " · Suggested" : ""}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!visibleAccounts.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    {manager.oauth.connected
                      ? "No available profiles match this search. Refresh the manager login if access changed."
                      : "Connect the executive manager login to discover available profiles."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <details className="rounded-xl border bg-background/40">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Review school connection coverage</summary>
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Active school</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((center) => {
                  const connection = center.connections.find((item) => item.provider === manager.provider);
                  return (
                    <TableRow key={center.id}>
                      <TableCell>
                        <div className="font-medium">{center.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{locationLabel(center)}</div>
                      </TableCell>
                      <TableCell>{connection?.accountLabel || "Not linked"}</TableCell>
                      <TableCell>
                        <Badge variant={connection?.configured ? "default" : "outline"}>
                          {connection?.configured ? "Ready" : connection ? "Needs attention" : "Not linked"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
