"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  notificationPreferenceKey,
  resolveNotificationPreferenceChannels,
  roleLabel,
  type NotificationPreferenceChannelSettings,
  type NotificationPreferenceTarget,
} from "@/lib/notification-preferences";

export type NotificationPreferenceType = {
  type: string;
  label: string;
};

export type NotificationPreferenceRow = {
  id: string;
  userId: string | null;
  role: string | null;
  type: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
};

export type NotificationPreferenceUserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type NotificationPreferenceRoleOption = {
  role: string;
  label: string;
};

export function NotificationPreferencesPanel({
  types,
  preferences,
  userOptions,
  roleOptions,
  currentUserId,
  currentRole,
  canManageRoleDefaults,
}: {
  types: NotificationPreferenceType[];
  preferences: NotificationPreferenceRow[];
  userOptions: NotificationPreferenceUserOption[];
  roleOptions: NotificationPreferenceRoleOption[];
  currentUserId: string;
  currentRole: string;
  canManageRoleDefaults: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const normalizedUsers = useMemo(
    () => userOptions.length ? userOptions : [{ id: currentUserId, name: "My account", email: "", role: currentRole }],
    [currentRole, currentUserId, userOptions],
  );
  const normalizedRoles = useMemo(
    () => roleOptions.length ? roleOptions : [{ role: currentRole, label: roleLabel(currentRole) }],
    [currentRole, roleOptions],
  );
  const [targetMode, setTargetMode] = useState<"user" | "role">("user");
  const [targetUserId, setTargetUserId] = useState(currentUserId);
  const [targetRole, setTargetRole] = useState(currentRole);
  const [draftOverrides, setDraftOverrides] = useState<Record<string, Record<string, NotificationPreferenceChannelSettings>>>({});

  const typeLabel = useMemo(
    () => new Map(types.map((item) => [item.type, item.label])),
    [types],
  );
  const selectedUser = useMemo(
    () => normalizedUsers.find((item) => item.id === targetUserId) ?? normalizedUsers[0],
    [normalizedUsers, targetUserId],
  );
  const target = useMemo<NotificationPreferenceTarget>(
    () => targetMode === "role"
      ? { mode: "role", role: targetRole }
      : { mode: "user", userId: selectedUser.id, role: selectedUser.role },
    [selectedUser.id, selectedUser.role, targetMode, targetRole],
  );
  const targetKey = notificationPreferenceKey(target, "matrix");

  const resolvedRows = useMemo(
    () => types.map((type) => ({
      ...type,
      ...resolveNotificationPreferenceChannels({ type: type.type, target, preferences }),
    })),
    [preferences, target, types],
  );
  const targetDrafts = draftOverrides[targetKey] ?? {};
  const draftRows = types.map((type) => ({
    ...type,
    ...(targetDrafts[type.type] ?? resolvedRows.find((row) => row.type === type.type) ?? {
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
    }),
    source: resolvedRows.find((row) => row.type === type.type)?.source ?? "default",
  }));
  const hasChanges = draftRows.some((row) => {
    const resolved = resolvedRows.find((item) => item.type === row.type);
    return Boolean(
      resolved &&
      (resolved.emailEnabled !== row.emailEnabled ||
        resolved.smsEnabled !== row.smsEnabled ||
        resolved.pushEnabled !== row.pushEnabled),
    );
  });

  function setDraftChannel(type: string, channel: keyof NotificationPreferenceChannelSettings, value: boolean) {
    setDraftOverrides((current) => ({
      ...current,
      [targetKey]: {
        ...(current[targetKey] ?? {}),
        [type]: {
          ...(current[targetKey]?.[type] ?? resolvedRows.find((row) => row.type === type) ?? {
            emailEnabled: true,
            smsEnabled: false,
            pushEnabled: true,
          }),
          [channel]: value,
        },
      },
    }));
  }

  function resetDrafts() {
    setDraftOverrides((current) => {
      const next = { ...current };
      delete next[targetKey];
      return next;
    });
  }

  function setChannelForAll(channel: keyof NotificationPreferenceChannelSettings, value: boolean) {
    setDraftOverrides((current) => ({
      ...current,
      [targetKey]: Object.fromEntries(types.map((type) => [
        type.type,
        {
          ...(current[targetKey]?.[type.type] ?? resolvedRows.find((row) => row.type === type.type) ?? {
            emailEnabled: true,
            smsEnabled: false,
            pushEnabled: true,
          }),
          [channel]: value,
        },
      ])),
    }));
  }

  function save() {
    if (targetMode === "role" && !canManageRoleDefaults) {
      setError("Only school leadership can update role defaults.");
      return;
    }

    startTransition(async () => {
      setStatus("");
      setError("");
      for (const row of draftRows) {
        const response = await fetch("/api/notifications/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: targetMode,
            userId: targetMode === "user" ? selectedUser.id : undefined,
            role: targetMode === "role" ? targetRole : undefined,
            type: row.type,
            emailEnabled: row.emailEnabled,
            smsEnabled: row.smsEnabled,
            pushEnabled: row.pushEnabled,
          }),
        });
        const json = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok) {
          setError(json?.error ?? `Preferences for ${typeLabel.get(row.type) ?? row.type} could not be saved.`);
          return;
        }
      }
      setStatus(targetMode === "role"
        ? `${roleLabel(targetRole)} role defaults saved.`
        : `${selectedUser.name} notification settings saved.`);
      router.refresh();
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>Email, SMS, and push defaults by role plus user-specific overrides.</CardDescription>
          </div>
          <Badge variant="outline">
            <Bell data-icon="inline-start" />
            {canManageRoleDefaults ? "Role + user matrix" : "My settings"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status ? (
          <Alert>
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
          <Select value={targetMode} onValueChange={(value) => setTargetMode(value === "role" ? "role" : "user")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="user">{canManageRoleDefaults ? "User override" : "My user settings"}</SelectItem>
              {canManageRoleDefaults ? <SelectItem value="role">Role default</SelectItem> : null}
            </SelectContent>
          </Select>
          {targetMode === "role" ? (
            <Select value={targetRole} onValueChange={(value) => setTargetRole(value ?? currentRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {normalizedRoles.map((item) => (
                  <SelectItem key={item.role} value={item.role}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={selectedUser.id} onValueChange={(value) => setTargetUserId(value ?? currentUserId)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {normalizedUsers.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name} · {roleLabel(item.role)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={resetDrafts}>
              <RotateCcw data-icon="inline-start" />
              Reset
            </Button>
            <Button type="button" disabled={isPending || !hasChanges} onClick={save}>
              <Save data-icon="inline-start" />
              Save Matrix
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background/40 p-3 text-xs text-muted-foreground">
          <SlidersHorizontal className="size-4 text-primary" />
          <span className="font-medium text-foreground">Bulk channel:</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setChannelForAll("emailEnabled", true)}>Email on</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setChannelForAll("smsEnabled", true)}>SMS on</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setChannelForAll("pushEnabled", true)}>Push on</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setChannelForAll("smsEnabled", false)}>SMS off</Button>
          <span>
            {targetMode === "role"
              ? "Role defaults apply tenant-wide unless a user has an override."
              : "User overrides win over role defaults for the selected person."}
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Preference</TableHead>
              <TableHead>Resolved from</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>SMS</TableHead>
              <TableHead>Push</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {draftRows.map((preference) => (
              <TableRow key={preference.type}>
                <TableCell className="font-medium">{typeLabel.get(preference.type) ?? preference.type}</TableCell>
                <TableCell>
                  <Badge variant={preference.source === "user" ? "default" : "outline"}>
                    {preference.source === "user"
                      ? "User override"
                      : preference.source === "role"
                        ? "Role default"
                        : "System default"}
                  </Badge>
                </TableCell>
                {(["emailEnabled", "smsEnabled", "pushEnabled"] as const).map((channel) => (
                  <TableCell key={channel}>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={preference[channel]}
                        onChange={(event) => setDraftChannel(preference.type, channel, event.target.checked)}
                      />
                      {preference[channel] ? "On" : "Off"}
                    </label>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
