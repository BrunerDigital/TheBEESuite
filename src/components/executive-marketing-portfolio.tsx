"use client";

import { useMemo, useState, useTransition } from "react";
import { ExternalLink, Link2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  suggestMarketingAccount,
  type MarketingPortfolioCenter,
} from "@/lib/executive-marketing";
import type { IntegrationProvider, IntegrationSetupView } from "@/lib/integration-setup";

export type ExecutiveMarketingConnection = {
  provider: IntegrationProvider;
  configured: boolean;
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
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const manager = managers.find((item) => item.provider === activeProvider) ?? managers[0];
  const visibleRows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("en-US");
    if (!search) return rows;
    return rows.filter((center) => [
      center.name,
      center.crmLocationId,
      center.city,
      center.state,
    ].some((value) => value?.toLocaleLowerCase("en-US").includes(search)));
  }, [query, rows]);
  const connectedCount = rows.filter((center) =>
    center.connections.some((connection) => connection.provider === activeProvider && connection.configured),
  ).length;

  function updateManagerAccounts(accounts: IntegrationSetupView["availableAccounts"]) {
    setManagers((current) => current.map((item) =>
      item.provider === activeProvider ? { ...item, availableAccounts: accounts } : item
    ));
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

  function assignAccount(center: ExecutiveMarketingCenter, accountId: string) {
    if (!manager || !accountId) return;
    startTransition(async () => {
      setMessage("");
      const response = await fetch("/api/integrations/executive-marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          provider: manager.provider,
          centerId: center.id,
          accountId,
        }),
      });
      const json = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        connection?: ExecutiveMarketingConnection;
        accounts?: IntegrationSetupView["availableAccounts"];
      } | null;
      if (!response.ok || !json?.ok || !json.connection) {
        setMessage(json?.error || "The profile could not be linked to this school.");
        return;
      }
      const connection = json.connection;
      setRows((current) => current.map((item) => item.id === center.id
        ? {
            ...item,
            connections: [
              ...item.connections.filter((row) => row.provider !== connection.provider),
              connection,
            ],
          }
        : item));
      if (json.accounts) updateManagerAccounts(json.accounts);
      setSelectedAccounts((current) => ({ ...current, [`${center.id}:${manager.provider}`]: "" }));
      setMessage(`${connection.accountLabel || manager.name} is now linked to ${center.name}.`);
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
              Connect one executive manager login, then assign each available Page, business location, ad account, or profile to its active BEE Suite school. Directors continue to see and manage only their assigned school.
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
              <RefreshCw data-icon="inline-start" />
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
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
              aria-label="Search active schools"
              className="pl-9"
              placeholder="Search active schools"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={manager.oauth.connected ? "default" : "outline"}>
              {manager.oauth.connected ? "Manager login connected" : "Manager login needed"}
            </Badge>
            <Badge variant="outline">{connectedCount} of {rows.length} schools linked</Badge>
          </div>
        </div>

        <div className="rounded-xl border bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <p>
              Manager authorization is used only to discover profiles the executive controls. Saving a link creates a separate encrypted, center-scoped connection for that school, and the chosen profile is revalidated with the provider before it is saved.
            </p>
          </div>
        </div>

        {message ? <div className="rounded-xl border bg-background/60 p-3 text-sm text-muted-foreground">{message}</div> : null}

        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Active school</TableHead>
                <TableHead>Current profile</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-72">Manager profile</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((center) => {
                const connection = center.connections.find((item) => item.provider === manager.provider);
                const suggestion = suggestMarketingAccount(center, rows, manager.availableAccounts);
                const selectionKey = `${center.id}:${manager.provider}`;
                const selectedId = selectedAccounts[selectionKey] || suggestion?.id || "";
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
                    <TableCell>
                      <select
                        aria-label={`Manager profile for ${center.name}`}
                        className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={selectedId}
                        onChange={(event) => setSelectedAccounts((current) => ({
                          ...current,
                          [selectionKey]: event.target.value,
                        }))}
                        disabled={isPending || !manager.oauth.connected || !manager.availableAccounts.length}
                      >
                        <option value="">Choose a profile</option>
                        {manager.availableAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.label} · {account.kind}{suggestion?.id === account.id ? " · Suggested" : ""}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => assignAccount(center, selectedId)}
                        disabled={isPending || !selectedId || !manager.oauth.connected}
                      >
                        <Link2 data-icon="inline-start" />
                        {connection ? "Update link" : "Link profile"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!visibleRows.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No active schools match this search.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
