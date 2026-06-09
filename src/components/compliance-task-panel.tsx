"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Bell, ClipboardCheck, Save } from "lucide-react";
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

export type ComplianceTaskCenterOption = {
  id: string;
  name: string;
  crmLocationId: string | null;
};

export type ComplianceTaskStaffOption = {
  id: string;
  name: string;
  email: string;
  centerId?: string | null;
};

export type ComplianceTaskRow = {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  dueAt: Date | string | null;
  reminderAt: Date | string | null;
  notes: string | null;
  completedAt: Date | string | null;
  center: { name: string; crmLocationId: string | null };
  assignedTo: { name: string; email: string } | null;
  createdBy: { name: string; email: string } | null;
};

function dateLabel(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function centerLabel(center: Pick<ComplianceTaskCenterOption, "name" | "crmLocationId">) {
  return center.crmLocationId ?? center.name;
}

function taskOpen(status: string) {
  return status !== "completed" && status !== "canceled";
}

function priorityVariant(priority: string) {
  return priority === "urgent" || priority === "high" ? "destructive" : "outline";
}

export function ComplianceTaskPanel({
  centers,
  staffOptions,
  tasks,
  canManage,
}: {
  centers: ComplianceTaskCenterOption[];
  staffOptions: ComplianceTaskStaffOption[];
  tasks: ComplianceTaskRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(tasks);
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("licensing");
  const [priority, setPriority] = useState("normal");
  const [assignedToId, setAssignedToId] = useState("unassigned");
  const [dueAt, setDueAt] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [nowMs] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const [isUpdating, startUpdateTransition] = useTransition();

  const visibleStaffOptions = useMemo(() => staffOptions.filter((staff) => !staff.centerId || !centerId || staff.centerId === centerId), [centerId, staffOptions]);
  const openTasks = rows.filter((row) => taskOpen(row.status)).length;
  const remindersDue = rows.filter((row) => {
    if (!taskOpen(row.status)) return false;
    const reminder = row.reminderAt ? new Date(row.reminderAt) : null;
    const due = row.dueAt ? new Date(row.dueAt) : null;
    return Boolean((reminder && reminder.getTime() <= nowMs) || (due && due.getTime() - nowMs <= 86_400_000));
  }).length;

  function createTask() {
    if (!centerId || !title.trim() || !canManage) return;
    startTransition(async () => {
      setError("");
      setSaved("");
      const response = await fetch("/api/compliance/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId,
          title,
          category,
          priority,
          assignedToId: assignedToId === "unassigned" ? null : assignedToId,
          dueAt,
          reminderAt,
          notes,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; task?: ComplianceTaskRow } | null;
      if (!response.ok || !json?.task) {
        setError(json?.error ?? "Compliance task could not be saved.");
        return;
      }
      setRows((current) => [json.task as ComplianceTaskRow, ...current].slice(0, 50));
      setSaved("Compliance task assigned.");
      setTitle("");
      setNotes("");
      router.refresh();
    });
  }

  function updateStatus(taskId: string, status: string) {
    startUpdateTransition(async () => {
      setError("");
      const response = await fetch(`/api/compliance/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await response.json().catch(() => null) as { error?: string; task?: ComplianceTaskRow } | null;
      if (!response.ok || !json?.task) {
        setError(json?.error ?? "Compliance task could not be updated.");
        return;
      }
      setRows((current) => current.map((row) => row.id === taskId ? json.task as ComplianceTaskRow : row));
      router.refresh();
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Compliance Tasks And Reminders</CardTitle>
        <CardDescription>Assign licensing, drill, document, medication, and incident follow-up tasks with due dates and reminders.</CardDescription>
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
            <ClipboardCheck className="size-4" />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{saved}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Open tasks</div>
            <div className="mt-1 text-2xl font-semibold">{openTasks}</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Reminder attention</div>
            <div className="mt-1 text-2xl font-semibold">{remindersDue}</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Assigned rows</div>
            <div className="mt-1 text-2xl font-semibold">{rows.filter((row) => row.assignedTo).length}</div>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>School</Label>
            <Select value={centerId} onValueChange={(value) => value && setCenterId(value)} disabled={!canManage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {centers.map((center) => (
                  <SelectItem key={center.id} value={center.id}>{centerLabel(center)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 lg:col-span-2">
            <Label>Task</Label>
            <Input value={title} disabled={!canManage} onChange={(event) => setTitle(event.target.value)} placeholder="Review emergency drill binder" />
          </div>
          <div className="space-y-1">
            <Label>Assigned to</Label>
            <Select value={assignedToId} onValueChange={(value) => value && setAssignedToId(value)} disabled={!canManage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {visibleStaffOptions.map((staff) => (
                  <SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={category} onValueChange={(value) => value && setCategory(value)} disabled={!canManage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="licensing">Licensing</SelectItem>
                <SelectItem value="drill">Drill</SelectItem>
                <SelectItem value="document">Document</SelectItem>
                <SelectItem value="medication">Medication</SelectItem>
                <SelectItem value="incident">Incident</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(value) => value && setPriority(value)} disabled={!canManage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Due date</Label>
            <Input type="date" value={dueAt} disabled={!canManage} onChange={(event) => setDueAt(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Reminder date</Label>
            <Input type="date" value={reminderAt} disabled={!canManage} onChange={(event) => setReminderAt(event.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} disabled={!canManage} onChange={(event) => setNotes(event.target.value)} className="min-h-20" />
          </div>
          <div className="flex items-end">
            <Button disabled={isPending || !canManage || !centerId || !title.trim()} onClick={createTask}>
              <Save data-icon="inline-start" />
              Assign Task
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>School</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Reminder</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((task) => (
              <TableRow key={task.id}>
                <TableCell>
                  <div className="font-medium">{task.title}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline">{task.category}</Badge>
                    <Badge variant={priorityVariant(task.priority)}>{task.priority}</Badge>
                  </div>
                  {task.notes ? <div className="mt-1 max-w-xl whitespace-normal text-xs text-muted-foreground">{task.notes}</div> : null}
                </TableCell>
                <TableCell>{centerLabel(task.center)}</TableCell>
                <TableCell>{task.assignedTo?.name ?? "Unassigned"}</TableCell>
                <TableCell>{dateLabel(task.dueAt)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Bell className="size-4 text-muted-foreground" />
                    {dateLabel(task.reminderAt)}
                  </div>
                </TableCell>
                <TableCell>
                  <Select value={task.status} onValueChange={(value) => value && updateStatus(task.id, value)} disabled={!canManage || isUpdating}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="waiting">Waiting</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="canceled">Canceled</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">No compliance tasks are assigned for this scope yet.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
