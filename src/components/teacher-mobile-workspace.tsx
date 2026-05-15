"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, BookOpen, CheckCircle2, ClipboardCheck, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ChildOption = {
  id: string;
  fullName: string;
  ageGroup: string;
  enrollmentStatus: string;
  classroom: { id: string; name: string } | null;
};

type Props = {
  roster: ChildOption[];
  teacherName: string;
};

export function TeacherMobileWorkspace({ roster, teacherName }: Props) {
  const firstChild = roster[0]?.id ?? "";
  const [selectedChildId, setSelectedChildId] = useState(firstChild);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState("present");
  const [logType, setLogType] = useState("check_in");
  const [mood, setMood] = useState("Happy");
  const [teacherNote, setTeacherNote] = useState("");
  const [meal, setMeal] = useState("");
  const [activity, setActivity] = useState("");
  const [suppliesNeeded, setSuppliesNeeded] = useState("");
  const [incidentType, setIncidentType] = useState("Minor injury");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedChild = useMemo(() => roster.find((child) => child.id === selectedChildId) ?? roster[0], [roster, selectedChildId]);
  const byClassroom = useMemo(() => {
    return roster.reduce<Record<string, ChildOption[]>>((acc, child) => {
      const key = child.classroom?.name ?? "Unassigned";
      (acc[key] ||= []).push(child);
      return acc;
    }, {});
  }, [roster]);

  function showStatus(next: string) {
    setError("");
    setStatus(next);
  }

  function showError(next: string) {
    setStatus("");
    setError(next);
  }

  function submitAttendance() {
    startTransition(async () => {
      const response = await fetch("/api/teacher/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: selectedChild?.id, status: attendanceStatus, logType, date: new Date().toISOString() }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Attendance could not be saved.");
      showStatus("Attendance saved and audit logged.");
    });
  }

  function submitDailyReport() {
    startTransition(async () => {
      const response = await fetch("/api/teacher/daily-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: selectedChild?.id,
          mood,
          teacherNote,
          meal,
          activity,
          suppliesNeeded,
          sendToParent: true,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Daily report could not be saved.");
      setTeacherNote("");
      setMeal("");
      setActivity("");
      setSuppliesNeeded("");
      showStatus("Daily report saved for parent view.");
    });
  }

  function submitIncident() {
    startTransition(async () => {
      const response = await fetch("/api/teacher/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: selectedChild?.id,
          type: incidentType,
          description: incidentDescription,
          actionTaken,
          parentNotified: false,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Incident could not be created.");
      setIncidentDescription("");
      setActionTaken("");
      showStatus("Incident report created and queued for director review.");
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <section className="rounded-2xl border bg-card/80 p-5 shadow-2xl shadow-black/15">
        <Badge className="mb-3">
          <ClipboardCheck data-icon="inline-start" />
          Teacher mobile
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight">Hi {teacherName}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Fast classroom task entry for attendance, parent daily reports, and incident documentation.
        </p>
      </section>

      {status ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>{roster.length} children visible to your role</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {Object.entries(byClassroom).map(([classroom, roster]) => (
            <div key={classroom} className="rounded-xl border bg-background/40 p-3">
              <div className="mb-2 font-medium">{classroom}</div>
              <div className="grid gap-2">
                {roster.slice(0, 12).map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition ${selectedChild?.id === child.id ? "border-primary bg-primary/10" : "bg-card/40"}`}
                    onClick={() => setSelectedChildId(child.id)}
                  >
                    <span className="font-medium">{child.fullName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{child.ageGroup}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
            <CardDescription>{selectedChild?.fullName ?? "Choose a child"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={attendanceStatus} onValueChange={(value) => value && setAttendanceStatus(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="vacation">Vacation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Log type</Label>
              <Select value={logType} onValueChange={(value) => setLogType(value ?? "")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="check_in">Check in</SelectItem>
                  <SelectItem value="check_out">Check out</SelectItem>
                  <SelectItem value="">Attendance only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button disabled={isPending || !selectedChild} className="w-full" onClick={submitAttendance}>
              <ClipboardCheck data-icon="inline-start" />
              Save Attendance
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Daily Report</CardTitle>
            <CardDescription>Sendable parent summary</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={mood} onChange={(event) => setMood(event.target.value)} placeholder="Mood" />
            <Input value={meal} onChange={(event) => setMeal(event.target.value)} placeholder="Meal or bottle" />
            <Input value={activity} onChange={(event) => setActivity(event.target.value)} placeholder="Activity" />
            <Input value={suppliesNeeded} onChange={(event) => setSuppliesNeeded(event.target.value)} placeholder="Supplies needed" />
            <Textarea value={teacherNote} onChange={(event) => setTeacherNote(event.target.value)} placeholder="Teacher note" />
            <Button disabled={isPending || !selectedChild} className="w-full" onClick={submitDailyReport}>
              <BookOpen data-icon="inline-start" />
              Save Report
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Incident</CardTitle>
            <CardDescription>Director review required</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={incidentType} onChange={(event) => setIncidentType(event.target.value)} placeholder="Incident type" />
            <Textarea value={incidentDescription} onChange={(event) => setIncidentDescription(event.target.value)} placeholder="Objective description" />
            <Textarea value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} placeholder="Action taken" />
            <Button disabled={isPending || !selectedChild || !incidentDescription || !actionTaken} className="w-full" onClick={submitIncident}>
              <ShieldAlert data-icon="inline-start" />
              Create Incident
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
