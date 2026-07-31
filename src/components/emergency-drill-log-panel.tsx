"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Flame, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedDateTime, zonedDateTimeLocalToUtc, zonedDateTimeLocalValue } from "@/lib/zoned-date-time";

export type EmergencyDrillCenterOption = {
  id: string;
  name: string;
  crmLocationId: string | null;
};

export type EmergencyDrillLogRow = {
  id: string;
  drillType: string;
  conductedAt: Date | string;
  durationMinutes: number | null;
  participants: string | null;
  outcome: string;
  notes: string | null;
  nextDueAt: Date | string | null;
  center: { name: string; crmLocationId: string | null };
  createdBy: { name: string; email: string } | null;
};

function dateTime(value: Date | string | null | undefined, timeZone: string) {
  return formatZonedDateTime(value, timeZone, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function centerLabel(center: Pick<EmergencyDrillCenterOption, "name" | "crmLocationId">) {
  return center.crmLocationId ?? center.name;
}

export function EmergencyDrillLogPanel({
  centers,
  drillLogs,
  canManage,
}: {
  centers: EmergencyDrillCenterOption[];
  drillLogs: EmergencyDrillLogRow[];
  canManage: boolean;
}) {
  const timeZone = useSchoolTimeZone();
  const router = useRouter();
  const [rows, setRows] = useState(drillLogs);
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  const [drillType, setDrillType] = useState("Fire drill");
  const [conductedAt, setConductedAt] = useState(() => zonedDateTimeLocalValue(new Date(), timeZone));
  const [durationMinutes, setDurationMinutes] = useState("");
  const [participants, setParticipants] = useState("");
  const [outcome, setOutcome] = useState("completed");
  const [nextDueAt, setNextDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!centerId || !canManage) return;
    startTransition(async () => {
      setError("");
      setSaved("");
      const response = await fetch("/api/compliance/emergency-drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId,
          drillType,
          conductedAt: zonedDateTimeLocalToUtc(conductedAt, timeZone)?.toISOString(),
          durationMinutes,
          participants,
          outcome,
          nextDueAt,
          notes,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; drillLog?: EmergencyDrillLogRow } | null;
      if (!response.ok || !json?.drillLog) {
        setError(json?.error ?? "Emergency drill log could not be saved.");
        return;
      }
      setRows((current) => [json.drillLog as EmergencyDrillLogRow, ...current].slice(0, 20));
      setSaved("Emergency drill log saved.");
      setDurationMinutes("");
      setParticipants("");
      setNotes("");
      router.refresh();
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Emergency Drill Logs</CardTitle>
        <CardDescription>Record school-level fire, lockdown, weather, evacuation, and shelter drill documentation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {saved ? (
          <Alert>
            <Flame className="size-4" />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{saved}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>School</Label>
            <Select value={centerId} onValueChange={(value) => value && setCenterId(value)} disabled={!canManage}>
              <SelectTrigger><SelectValue placeholder="Choose school" /></SelectTrigger>
              <SelectContent>
                {centers.map((center) => (
                  <SelectItem key={center.id} value={center.id}>{centerLabel(center)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Drill type</Label>
            <Select value={drillType} onValueChange={(value) => value && setDrillType(value)} disabled={!canManage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Fire drill">Fire drill</SelectItem>
                <SelectItem value="Lockdown drill">Lockdown drill</SelectItem>
                <SelectItem value="Weather drill">Weather drill</SelectItem>
                <SelectItem value="Evacuation drill">Evacuation drill</SelectItem>
                <SelectItem value="Shelter drill">Shelter drill</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Conducted at</Label>
            <Input type="datetime-local" value={conductedAt} disabled={!canManage} onChange={(event) => setConductedAt(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Duration minutes</Label>
            <Input inputMode="numeric" value={durationMinutes} disabled={!canManage} onChange={(event) => setDurationMinutes(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Participants</Label>
            <Input value={participants} disabled={!canManage} onChange={(event) => setParticipants(event.target.value)} placeholder="All classrooms, staff only" />
          </div>
          <div className="space-y-1">
            <Label>Outcome</Label>
            <Select value={outcome} onValueChange={(value) => value && setOutcome(value)} disabled={!canManage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="rescheduled">Rescheduled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Next due</Label>
            <Input type="date" value={nextDueAt} disabled={!canManage} onChange={(event) => setNextDueAt(event.target.value)} />
          </div>
          <div className="flex items-end">
            <Button disabled={isPending || !canManage || !centerId} onClick={submit}>
              <Save data-icon="inline-start" />
              Save Drill
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Notes</Label>
          <Textarea value={notes} disabled={!canManage} onChange={(event) => setNotes(event.target.value)} className="min-h-20" />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>School</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Participants</TableHead>
              <TableHead>Next due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{dateTime(row.conductedAt, timeZone)}</TableCell>
                <TableCell className="font-medium">{centerLabel(row.center)}</TableCell>
                <TableCell>{row.drillType}</TableCell>
                <TableCell><Badge variant={row.outcome === "completed" ? "default" : "outline"}>{row.outcome}</Badge></TableCell>
                <TableCell>{row.participants ?? "Not recorded"}</TableCell>
                <TableCell>{dateTime(row.nextDueAt, timeZone)}</TableCell>
              </TableRow>
            ))}
            {!rows.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">No emergency drill logs have been recorded for this scope.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
