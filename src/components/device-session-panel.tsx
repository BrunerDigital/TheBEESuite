"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deviceAppModeLabel, isRecentDeviceSession } from "@/lib/device-sessions";

export type DeviceSessionPanelRow = {
  id: string;
  label: string;
  deviceType: string;
  appMode: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastSeenAt: string;
  revokedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  revokedBy: {
    name: string;
    email: string;
  } | null;
};

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
  currentDeviceSessionId,
  canManage,
}: {
  sessions: DeviceSessionPanelRow[];
  currentDeviceSessionId: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
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
  const activeRows = rows.filter((row) => !row.revokedAt);
  const recentRows = activeRows.filter((row) => isRecentDeviceSession(new Date(row.lastSeenAt)));
  const staleRows = activeRows.length - recentRows.length;
  const classroomRows = activeRows.filter((row) => row.appMode === "teacher").length;
  const parentRows = activeRows.filter((row) => row.appMode === "parent").length;
  const kioskRows = activeRows.filter((row) => row.appMode === "kiosk").length;

  function revokeSession(sessionId: string) {
    setError("");
    setPendingSessionId(sessionId);
    startTransition(async () => {
      const response = await fetch("/api/device-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", sessionId }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setPendingSessionId(null);
      if (!response.ok) {
        setError(data?.error ?? "Unable to revoke this device session.");
        return;
      }
      setRevokedSessionIds((current) => new Set([...current, sessionId]));
      router.refresh();
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>App and Device Sessions</CardTitle>
        <CardDescription>Installed app, tablet kiosk, classroom, family, and browser sessions using this tenant account data.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border bg-background/60 p-3">
            <div className="text-2xl font-semibold">{activeRows.length}</div>
            <div className="text-xs text-muted-foreground">Signed-in devices</div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <div className="text-2xl font-semibold">{kioskRows}</div>
            <div className="text-xs text-muted-foreground">Kiosk sessions</div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <div className="text-2xl font-semibold">{classroomRows + parentRows}</div>
            <div className="text-xs text-muted-foreground">Teacher and parent apps</div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <div className="text-2xl font-semibold">{staleRows}</div>
            <div className="text-xs text-muted-foreground">Idle over 15 minutes</div>
          </div>
        </div>
        {error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
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
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => revokeSession(row.id)}
                        aria-label={`Revoke ${row.label}`}
                      >
                        {pendingSessionId === row.id ? <RefreshCw className="animate-spin" data-icon="inline-start" /> : <Ban data-icon="inline-start" />}
                        Revoke
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
      </CardContent>
    </Card>
  );
}
