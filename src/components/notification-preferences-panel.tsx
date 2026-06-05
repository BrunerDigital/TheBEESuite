"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

type PreferenceDraft = {
  target: "user" | "role";
  role: string;
  type: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
};

export function NotificationPreferencesPanel({
  types,
  preferences,
  currentRole,
  canManageRoleDefaults,
}: {
  types: NotificationPreferenceType[];
  preferences: NotificationPreferenceRow[];
  currentRole: string;
  canManageRoleDefaults: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<PreferenceDraft>({
    target: "user",
    role: currentRole,
    type: types[0]?.type ?? "messages",
    emailEnabled: true,
    smsEnabled: false,
    pushEnabled: true,
  });

  const typeLabel = useMemo(
    () => new Map(types.map((item) => [item.type, item.label])),
    [types],
  );
  const visiblePreferences = preferences.length ? preferences : types.map((item) => ({
    id: `default-${item.type}`,
    userId: null,
    role: currentRole,
    type: item.type,
    emailEnabled: true,
    smsEnabled: false,
    pushEnabled: true,
  }));

  function save() {
    startTransition(async () => {
      setStatus("");
      setError("");
      const response = await fetch("/api/notifications/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(json?.error ?? "Preferences could not be saved.");
        return;
      }
      setStatus("Notification preference saved.");
      router.refresh();
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>Email, SMS, and push defaults by user or role.</CardDescription>
          </div>
          <Badge variant="outline">
            <Bell data-icon="inline-start" />
            {canManageRoleDefaults ? "User + role" : "My settings"}
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
        <div className="grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_repeat(3,minmax(0,0.55fr))_auto]">
          <Select
            value={draft.target}
            onValueChange={(value) => setDraft((current) => ({ ...current, target: value === "role" ? "role" : "user" }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="user">My user settings</SelectItem>
              {canManageRoleDefaults ? <SelectItem value="role">Role defaults</SelectItem> : null}
            </SelectContent>
          </Select>
          <Select value={draft.type} onValueChange={(value) => setDraft((current) => ({ ...current, type: value ?? current.type }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {types.map((item) => (
                <SelectItem key={item.type} value={item.type}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.emailEnabled} onChange={(event) => setDraft((current) => ({ ...current, emailEnabled: event.target.checked }))} />
            Email
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.smsEnabled} onChange={(event) => setDraft((current) => ({ ...current, smsEnabled: event.target.checked }))} />
            SMS
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.pushEnabled} onChange={(event) => setDraft((current) => ({ ...current, pushEnabled: event.target.checked }))} />
            Push
          </label>
          <Button disabled={isPending} onClick={save}>
            <Save data-icon="inline-start" />
            Save
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Preference</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>SMS</TableHead>
              <TableHead>Push</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiblePreferences.map((preference) => (
              <TableRow key={preference.id}>
                <TableCell className="font-medium">{typeLabel.get(preference.type) ?? preference.type}</TableCell>
                <TableCell>{preference.userId ? "User override" : preference.role ? `${preference.role.replaceAll("_", " ")} default` : "Default"}</TableCell>
                <TableCell>{preference.emailEnabled ? "On" : "Off"}</TableCell>
                <TableCell>{preference.smsEnabled ? "On" : "Off"}</TableCell>
                <TableCell>{preference.pushEnabled ? "On" : "Off"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
