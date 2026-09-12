"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deviceAppModeLabel, isRecentDeviceSession } from "@/lib/device-sessions";
import { RecordPaginationNav } from "@/components/record-pagination";
import type { LinkedRecordPagination } from "@/lib/record-pagination";
import { requestWithNetworkRecovery } from "@/lib/client-request-recovery";

export type DeviceSessionPanelRow = {
  id: string;
  label: string;
  deviceType: string;
  appMode: string;
  lastSeenAt: string;
  revokedAt: string | null;
  user: {
    name: string;
    email: string;
  };
};

export type DeviceSessionSummary = { signedIn: number; kiosk: number; teacherAndParent: number; idle: number };

function DeviceIcon({ deviceType }: { deviceType: string }) {
  if (deviceType === "tablet") return <Tablet data-icon="inline-start" />;
  if (deviceType === "phone") return <Smartphone data-icon="inline-start" />;
  return <Monitor data-icon="inline-start" />;
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 8) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function statusFor(row: DeviceSessionPanelRow) {
  if (row.revokedAt) return { label: "Revoked", variant: "outline" as const };
  if (isRecentDeviceSession(new Date(row.lastSeenAt))) return { label: "Active", variant: "default" as const };
  return { label: "Idle", variant: "secondary" as const };
}

export function DeviceSessionPanel({
  sessions,
  summary,
  pagination,
  currentDeviceSessionId,
  canManage,
}: {
  sessions: DeviceSessionPanelRow[];
  summary: DeviceSessionSummary;
  pagination: LinkedRecordPagination;
  currentDeviceSessionId: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [revokedSessionIds, setRevokedSessionIds] = useState<Set<string>>(() => new Set());
  const [isPending, startTransition] = useTransition();
  const rows = useMemo(
    () =>
      [...sessions]
        .map((session) => ({
          ...session,
          revokedAt: revokedSessionIds.has(session.id) ? new Date().toISOString() : session.revokedAt,
        }))
        .sort((a, b) => {
          if (Boolean(a.revokedAt) !== Boolean(b.revokedAt)) return a.revokedAt ? 1 : -1;
          return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
        }),
    [revokedSessionIds, sessions],
  );
  const locallyRevoked = sessions.filter((row) => !row.revokedAt && revokedSessionIds.has(row.id));
  const totals = {
    signedIn: Math.max(0, summary.signedIn - locallyRevoked.length),
    kiosk: Math.max(0, summary.kiosk - locallyRevoked.filter((row) => row.appMode === "kiosk").length),
    teacherAndParent: Math.max(0, summary.teacherAndParent - locallyRevoked.filter((row) => ["teacher", "parent"].includes(row.appMode)).length),
    idle: Math.max(0, summary.idle - locallyRevoked.filter((row) => !isRecentDeviceSession(new Date(row.lastSeenAt))).length),
  };

  function revokeSession(sessionId: string) {
    if (isPending || !canManage || !window.confirm("End this device session? The user will need to sign in again on that device. Their account and other devices will remain available.")) return;
    setError("");
    setStatus("Ending device session…");
    setPendingSessionId(sessionId);
    startTransition(async () => {
      const response = await requestWithNetworkRecovery("/api/device-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", sessionId }),
      }, "We could not confirm whether this session ended. Refresh the list to check before trying again.");
      const data = (await response.json().catch(() => null)) as { ok?: boolean; revokedAt?: string; error?: string } | null;
      setPendingSessionId(null);
      if (!response.ok) {
        setStatus("");
        setError(data?.error ?? "Unable to revoke this device session.");
        return;
      }
      if (data?.ok !== true || typeof data.revokedAt !== "string" || !Number.isFinite(Date.parse(data.revokedAt))) {
        setStatus("");
        setError("We could not confirm whether this session ended. Refresh the list to check before trying again.");
        return;
      }
      setRevokedSessionIds((current) => new Set([...current, sessionId]));
      setStatus("Device session ended. The user will need to sign in again on that device.");
      router.refresh();
    });
  }

  return (
    <Card id="device-sessions" className="glass-panel scroll-mt-24">
      <CardHeader>
        <CardTitle as="h2">App and Device Sessions</CardTitle>
        <CardDescription>Sessions for accounts included in this directory, independent of its search filter. Includes signed-in devices and sessions seen in the past 30 days.{!canManage ? " Your access is read only." : " Use Sign out to end your current device session."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2">
          <div className="rounded-lg border bg-background/60 p-3">
            <div className="text-2xl font-semibold">{totals.signedIn}</div>
            <div className="text-xs text-muted-foreground">Signed-in devices</div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <div className="text-2xl font-semibold">{totals.kiosk}</div>
            <div className="text-xs text-muted-foreground">Kiosk sessions</div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <div className="text-2xl font-semibold">{totals.teacherAndParent}</div>
            <div className="text-xs text-muted-foreground">Teacher and parent apps</div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <div className="text-2xl font-semibold">{totals.idle}</div>
            <div className="text-xs text-muted-foreground">Idle over 15 minutes</div>
          </div>
        </div>
        {error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <div role="status" aria-live="polite" className={status ? "rounded-lg border p-3 text-sm" : "sr-only"}>{status}</div>
        <RecordPaginationNav pagination={pagination} label="Sessions" />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>User</TableHead>
              <TableHead>App</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const status = statusFor(row);
              const isCurrent = row.id === currentDeviceSessionId;
              const disabled = !canManage || Boolean(row.revokedAt) || isCurrent || pendingSessionId === row.id || isPending;
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      <DeviceIcon deviceType={row.deviceType} />
                      <span>{row.label}</span>
                    </div>
                    <div className="mt-1 text-xs capitalize text-muted-foreground">{row.deviceType}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{row.user.name}</div>
                    <div className="text-xs text-muted-foreground">{row.user.email}</div>
                  </TableCell>
                  <TableCell>{deviceAppModeLabel(row.appMode)}</TableCell>
                  <TableCell>{formatRelativeDate(row.lastSeenAt)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {isCurrent ? <Badge variant="outline">This device</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.revokedAt ? (
                      <span className="text-xs text-muted-foreground">Ended</span>
                    ) : !canManage ? (
                      <span className="text-xs text-muted-foreground">Read only</span>
                    ) : isCurrent ? (
                      <span className="text-xs text-muted-foreground">Use Sign out</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => revokeSession(row.id)}
                        aria-label={`Revoke ${row.label}`}
                      >
                        {pendingSessionId === row.id ? <RefreshCw className="animate-spin" data-icon="inline-start" /> : <Ban data-icon="inline-start" />}
                        {pendingSessionId === row.id ? "Ending…" : "Revoke"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!rows.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Device sessions will appear after users sign in on the web app or installed app.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {pagination.totalPages > 1 ? <RecordPaginationNav pagination={pagination} label="Sessions" /> : null}
      </CardContent>
    </Card>
  );
}
