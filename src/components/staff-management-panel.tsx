"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Archive, CalendarClock, CheckCircle2, Clock, Copy, KeyRound, Pencil, Save, Trash2, UserRoundCog } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { summarizeClassroomCoverage } from "@/lib/staff-scheduling";
import { readStaffClockState } from "@/lib/staff-kiosk";

type CenterOption = { id: string; name: string };
type ClassroomOption = { id: string; centerId: string; name: string; ageGroup: string };
type TeacherRecord = {
  id: string;
  centerId: string;
  classroomId: string | null;
  title: string;
  phone: string | null;
  backgroundCheckStatus: string | null;
  customFields?: unknown;
  user: { name: string; email: string; isActive: boolean };
  classroom: { id: string; name: string } | null;
};
type ScheduleRecord = {
  id: string;
  startsAt: Date | string;
  endsAt: Date | string;
  status: string;
  staff: { id: string; user: { name: string } };
};
type TeacherLoginResponse = {
  email: string;
  temporary_password: string;
};

type Props = {
  centers: CenterOption[];
  classrooms: ClassroomOption[];
  staff: TeacherRecord[];
  previousStaff?: TeacherRecord[];
  schedules: ScheduleRecord[];
};

const backgroundStatuses = [
  ["pending", "Pending"],
  ["placeholder_clear", "Clear"],
  ["needs_review", "Needs review"],
  ["expired", "Expired"],
  ["not_required", "Not required"],
] as const;

const certificationStatuses = [
  ["active", "Active"],
  ["pending", "Pending"],
  ["expired", "Expired"],
  ["waived", "Waived"],
] as const;

function toDateTimeLocal(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function dateInputValue(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function StaffManagementPanel({ centers, classrooms, staff, previousStaff = [], schedules }: Props) {
  const router = useRouter();
  const activeStaff = useMemo(() => staff.filter((teacher) => teacher.user.isActive), [staff]);
  const previousStaffRows = useMemo(() => previousStaff.filter((teacher) => !teacher.user.isActive), [previousStaff]);
  const allTeacherRows = useMemo(() => [...activeStaff, ...previousStaffRows], [activeStaff, previousStaffRows]);
  const [selectedStaffId, setSelectedStaffId] = useState("new");
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  const [classroomId, setClassroomId] = useState("none");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("Teacher");
  const [backgroundCheckStatus, setBackgroundCheckStatus] = useState("pending");
  const [staffKioskPin, setStaffKioskPin] = useState("");
  const [generatedLogin, setGeneratedLogin] = useState<TeacherLoginResponse | null>(null);
  const [certStaffId, setCertStaffId] = useState(activeStaff[0]?.id ?? "");
  const [certName, setCertName] = useState("");
  const [certStatus, setCertStatus] = useState("active");
  const [certExpiresAt, setCertExpiresAt] = useState("");
  const [scheduleId, setScheduleId] = useState("new");
  const [scheduleStaffId, setScheduleStaffId] = useState(activeStaff[0]?.id ?? "");
  const [scheduleStartsAt, setScheduleStartsAt] = useState("");
  const [scheduleEndsAt, setScheduleEndsAt] = useState("");
  const [scheduleStatus, setScheduleStatus] = useState("scheduled");
  const [assignmentStaffId, setAssignmentStaffId] = useState(activeStaff[0]?.id ?? "");
  const [assignmentClassroomId, setAssignmentClassroomId] = useState(classrooms[0]?.id ?? "none");
  const [weeklyClassroomId, setWeeklyClassroomId] = useState(classrooms[0]?.id ?? "");
  const [weeklyStartsAt, setWeeklyStartsAt] = useState(() => dateInputValue());
  const [weeklyStartTime, setWeeklyStartTime] = useState("08:00");
  const [weeklyEndTime, setWeeklyEndTime] = useState("16:30");
  const [weeklyDays, setWeeklyDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [weeklyStatus, setWeeklyStatus] = useState("scheduled");
  const [clockStaffId, setClockStaffId] = useState(activeStaff[0]?.id ?? "");
  const [clockNotes, setClockNotes] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const classroomOptions = useMemo(
    () => classrooms.filter((classroom) => classroom.centerId === centerId),
    [centerId, classrooms],
  );
  const coverageSummaries = useMemo(
    () => summarizeClassroomCoverage({ classrooms, staff: activeStaff, schedules }),
    [classrooms, activeStaff, schedules],
  );
  const assignmentTeacher = activeStaff.find((teacher) => teacher.id === assignmentStaffId);
  const assignmentClassrooms = useMemo(
    () => classrooms.filter((classroom) => !assignmentTeacher || classroom.centerId === assignmentTeacher.centerId),
    [assignmentTeacher, classrooms],
  );
  const weeklyClassroomTeachers = useMemo(
    () => activeStaff.filter((teacher) => teacher.classroomId === weeklyClassroomId),
    [activeStaff, weeklyClassroomId],
  );
  const clockTeacher = activeStaff.find((teacher) => teacher.id === clockStaffId) ?? activeStaff[0] ?? null;
  const clockState = readStaffClockState(clockTeacher?.customFields);
  const clockAction = clockState.status === "clocked_in" ? "clock_out" : "clock_in";
  const selectedTeacher = allTeacherRows.find((teacher) => teacher.id === selectedStaffId) ?? null;
  const selectedPreviousTeacher = selectedTeacher?.user.isActive === false ? selectedTeacher : null;

  function resetTeacherForm() {
    setCenterId(centers[0]?.id ?? "");
    setClassroomId("none");
    setName("");
    setEmail("");
    setPhone("");
    setTitle("Teacher");
    setBackgroundCheckStatus("pending");
    setStaffKioskPin("");
    setGeneratedLogin(null);
  }

  function loadTeacher(value: string) {
    setSelectedStaffId(value);
    const teacher = allTeacherRows.find((item) => item.id === value);
    if (!teacher) {
      resetTeacherForm();
      return;
    }
    setCenterId(teacher.centerId);
    setClassroomId(teacher.classroomId ?? "none");
    setName(teacher.user.name);
    setEmail(teacher.user.email);
    setPhone(teacher.phone ?? "");
    setTitle(teacher.title || "Teacher");
    setBackgroundCheckStatus(teacher.backgroundCheckStatus ?? "pending");
    setStaffKioskPin("");
    setGeneratedLogin(null);
  }

  function updateCenter(value: string) {
    setCenterId(value);
    if (classroomId !== "none" && !classrooms.some((classroom) => classroom.centerId === value && classroom.id === classroomId)) {
      setClassroomId("none");
    }
  }

  function loadSchedule(value: string) {
    setScheduleId(value);
    const schedule = schedules.find((item) => item.id === value);
    if (!schedule) {
      setScheduleStaffId(activeStaff[0]?.id ?? "");
      setScheduleStartsAt("");
      setScheduleEndsAt("");
      setScheduleStatus("scheduled");
      return;
    }
    setScheduleStaffId(schedule.staff.id);
    setScheduleStartsAt(toDateTimeLocal(schedule.startsAt));
    setScheduleEndsAt(toDateTimeLocal(schedule.endsAt));
    setScheduleStatus(schedule.status || "scheduled");
  }

  function toggleWeeklyDay(day: number) {
    setWeeklyDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((left, right) => left - right),
    );
  }

  function assignTeacherToClassroom() {
    if (!assignmentStaffId) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      setGeneratedLogin(null);
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "staffAssignment",
          staffId: assignmentStaffId,
          classroomId: assignmentClassroomId === "none" ? "" : assignmentClassroomId,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; mode?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Teacher classroom assignment could not be saved.");
        return;
      }
      setStatusMessage("Teacher classroom assignment updated.");
      router.refresh();
    });
  }

  function generateWeeklySchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "staffScheduleBatch",
          classroomId: weeklyClassroomId,
          weekStartsAt: weeklyStartsAt,
          daysOfWeek: weeklyDays,
          startTime: weeklyStartTime,
          endTime: weeklyEndTime,
          status: weeklyStatus,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; createdSchedules?: number } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Weekly classroom schedule could not be generated.");
        return;
      }
      setStatusMessage(`Weekly classroom coverage generated for ${json?.createdSchedules ?? 0} schedule rows.`);
      router.refresh();
    });
  }

  function saveClockAction() {
    if (!clockTeacher) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "staffTimeClock",
          staffId: clockTeacher.id,
          action: clockAction,
          notes: clockNotes,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Staff clock action could not be saved.");
        return;
      }
      setStatusMessage(`${clockTeacher.user.name} ${clockAction === "clock_in" ? "clocked in" : "clocked out"}.`);
      setClockNotes("");
      router.refresh();
    });
  }

  function saveTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "staff",
          id: selectedStaffId === "new" ? undefined : selectedStaffId,
          centerId,
          classroomId: classroomId === "none" ? undefined : classroomId,
          name,
          email,
          phone,
          title,
          backgroundCheckStatus,
          staffKioskPin: staffKioskPin || undefined,
        }),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        mode?: string;
        auth?: { skipped?: boolean; passwordResetSent?: boolean };
        login?: TeacherLoginResponse;
      } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Teacher profile could not be saved.");
        return;
      }
      if (json?.login) setGeneratedLogin(json.login);
      const loginStatus = json?.login ? " Bee Suite login was generated." : "";
      const kioskStatus = staffKioskPin ? " Staff kiosk code was set." : "";
      const restoreStatus = selectedPreviousTeacher ? " Previous staff member was restored to active staff." : "";
      setStatusMessage(`Teacher profile ${json?.mode ?? "saved"}.${loginStatus}${kioskStatus}${restoreStatus}`);
      setSelectedStaffId("new");
      setStaffKioskPin("");
      router.refresh();
    });
  }

  function copyGeneratedLogin() {
    if (!generatedLogin || !navigator.clipboard) return;
    void navigator.clipboard.writeText(`Username: ${generatedLogin.email}\nPassword: ${generatedLogin.temporary_password}`);
  }

  function saveCertification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "certification",
          staffId: certStaffId,
          name: certName,
          status: certStatus,
          expiresAt: certExpiresAt || undefined,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; mode?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Certification could not be saved.");
        return;
      }
      setStatusMessage(`Certification ${json?.mode ?? "saved"}.`);
      setCertName("");
      setCertExpiresAt("");
      router.refresh();
    });
  }

  function deactivateTeacher() {
    if (selectedStaffId === "new") return;
    const confirmed = window.confirm("Move this teacher to previous staff? Their records stay available, but they will be hidden from active teacher lists and cannot log in.");
    if (!confirmed) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "staff", id: selectedStaffId }),
      });
      const json = await response.json().catch(() => null) as { error?: string; mode?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Teacher account could not be moved to previous staff.");
        return;
      }
      setStatusMessage("Teacher moved to previous staff.");
      setSelectedStaffId("new");
      resetTeacherForm();
      router.refresh();
    });
  }

  function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "staffSchedule",
          id: scheduleId === "new" ? undefined : scheduleId,
          staffId: scheduleStaffId,
          startsAt: scheduleStartsAt,
          endsAt: scheduleEndsAt,
          status: scheduleStatus,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; mode?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Staff schedule could not be saved.");
        return;
      }
      setStatusMessage(`Staff schedule ${json?.mode ?? "saved"}.`);
      setScheduleId("new");
      setScheduleStartsAt("");
      setScheduleEndsAt("");
      router.refresh();
    });
  }

  function deleteSchedule() {
    if (scheduleId === "new") return;
    const confirmed = window.confirm("Delete this staff schedule entry?");
    if (!confirmed) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "staffSchedule", id: scheduleId }),
      });
      const json = await response.json().catch(() => null) as { error?: string; mode?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Staff schedule could not be deleted.");
        return;
      }
      setStatusMessage(`Staff schedule ${json?.mode ?? "deleted"}.`);
      setScheduleId("new");
      setScheduleStartsAt("");
      setScheduleEndsAt("");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>
            <UserRoundCog data-icon="inline-start" />
            Teacher Profile Editor
          </CardTitle>
          <CardDescription>Add teachers or update their classroom assignment, contact info, and background-check status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusMessage ? (
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertTitle>Saved</AlertTitle>
              <AlertDescription>{statusMessage}</AlertDescription>
            </Alert>
          ) : null}
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Needs attention</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          {generatedLogin ? (
            <Alert>
              <KeyRound className="size-4" />
              <AlertTitle>Teacher login</AlertTitle>
              <AlertDescription>
                <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium uppercase text-muted-foreground">Username</div>
                      <div className="break-all font-mono">{generatedLogin.email}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase text-muted-foreground">Password</div>
                      <div className="font-mono">{generatedLogin.temporary_password}</div>
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={copyGeneratedLogin}>
                    <Copy data-icon="inline-start" />
                    Copy
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
          <section className="grid gap-3 xl:grid-cols-3">
            {coverageSummaries.slice(0, 9).map((summary) => (
              <div key={summary.classroomId} className="rounded-xl border bg-background/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{summary.classroomName}</div>
                    <div className="text-xs text-muted-foreground">{summary.ageGroup}</div>
                  </div>
                  <Badge variant={summary.warning === "none" ? "default" : "destructive"}>
                    {summary.warning === "none"
                      ? "Covered"
                      : summary.warning === "no_teacher_assigned"
                        ? "Assign teacher"
                        : "Needs schedule"}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg border bg-card/50 p-2">
                    <div className="text-lg font-semibold">{summary.assignedTeachers}</div>
                    <div className="text-muted-foreground">Assigned</div>
                  </div>
                  <div className="rounded-lg border bg-card/50 p-2">
                    <div className="text-lg font-semibold">{summary.activeSchedules}</div>
                    <div className="text-muted-foreground">Active</div>
                  </div>
                  <div className="rounded-lg border bg-card/50 p-2">
                    <div className="text-lg font-semibold">{summary.upcomingSchedules}</div>
                    <div className="text-muted-foreground">Rows</div>
                  </div>
                </div>
              </div>
            ))}
            {!coverageSummaries.length ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground xl:col-span-3">
                <span>Add classrooms before assigning teacher coverage.</span>
                <Button nativeButton={false} size="sm" variant="outline" render={<Link href="/classroom-dashboard#classroom-editor" />}>
                  <Pencil data-icon="inline-start" />
                  Open classroom setup
                </Button>
              </div>
            ) : null}
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="mb-3">
                <div className="text-sm font-medium">Quick classroom assignment</div>
                <p className="text-xs text-muted-foreground">Move an existing teacher into a classroom without editing the full profile.</p>
              </div>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>Teacher</Label>
                  <Select value={assignmentStaffId} onValueChange={(value) => value && setAssignmentStaffId(value)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Choose teacher" /></SelectTrigger>
                    <SelectContent>
                      {activeStaff.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>{teacher.user.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Classroom</Label>
                  <Select value={assignmentClassroomId} onValueChange={(value) => value && setAssignmentClassroomId(value)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Choose classroom" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {assignmentClassrooms.map((classroom) => (
                        <SelectItem key={classroom.id} value={classroom.id}>{classroom.name} · {classroom.ageGroup}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" disabled={isPending || !assignmentStaffId} onClick={assignTeacherToClassroom}>
                  <Save data-icon="inline-start" />
                  Save assignment
                </Button>
              </div>
            </div>

            <form className="rounded-xl border bg-background/40 p-4" onSubmit={generateWeeklySchedule}>
              <div className="mb-3">
                <div className="text-sm font-medium">Generate weekly classroom coverage</div>
                <p className="text-xs text-muted-foreground">
                  Creates schedule rows for every active teacher assigned to the selected classroom.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Classroom</Label>
                  <Select value={weeklyClassroomId} onValueChange={(value) => value && setWeeklyClassroomId(value)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Choose classroom" /></SelectTrigger>
                    <SelectContent>
                      {classrooms.map((classroom) => (
                        <SelectItem key={classroom.id} value={classroom.id}>
                          {classroom.name} · {classroom.ageGroup}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {weeklyClassroomTeachers.length} assigned teacher{weeklyClassroomTeachers.length === 1 ? "" : "s"} will receive rows.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Week starts</Label>
                  <Input type="date" value={weeklyStartsAt} onChange={(event) => setWeeklyStartsAt(event.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Start time</Label>
                  <Input type="time" value={weeklyStartTime} onChange={(event) => setWeeklyStartTime(event.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>End time</Label>
                  <Input type="time" value={weeklyEndTime} onChange={(event) => setWeeklyEndTime(event.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={weeklyStatus} onValueChange={(value) => value && setWeeklyStatus(value)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      [1, "Mon"],
                      [2, "Tue"],
                      [3, "Wed"],
                      [4, "Thu"],
                      [5, "Fri"],
                      [6, "Sat"],
                    ].map(([day, label]) => (
                      <label key={day} className="flex items-center gap-1 rounded-lg border bg-card/50 px-2 py-1 text-xs">
                        <input
                          type="checkbox"
                          checked={weeklyDays.includes(Number(day))}
                          onChange={() => toggleWeeklyDay(Number(day))}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <Button type="submit" className="mt-4" disabled={isPending || !weeklyClassroomId || !weeklyClassroomTeachers.length || !weeklyDays.length}>
                <CalendarClock data-icon="inline-start" />
                Generate coverage
              </Button>
            </form>
          </section>

          <section className="rounded-xl border bg-background/40 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Staff time clock</div>
                <p className="text-xs text-muted-foreground">Director override for classroom staff clock-in and clock-out history.</p>
              </div>
              <Badge variant={clockState.status === "clocked_in" ? "default" : "outline"}>
                {clockState.status === "clocked_in" ? "Clocked in" : "Clocked out"}
              </Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
              <div className="space-y-1">
                <Label>Teacher</Label>
                <Select value={clockTeacher?.id ?? ""} onValueChange={(value) => value && setClockStaffId(value)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Choose teacher" /></SelectTrigger>
                  <SelectContent>
                    {activeStaff.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>{teacher.user.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Last action: {clockState.lastActionAt ? new Date(clockState.lastActionAt).toLocaleString() : "No clock history"}
                </p>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input value={clockNotes} onChange={(event) => setClockNotes(event.target.value)} placeholder="Optional director note" />
              </div>
              <Button type="button" className="self-end" disabled={isPending || !clockTeacher} onClick={saveClockAction}>
                <Clock data-icon="inline-start" />
                {clockAction === "clock_in" ? "Clock in" : "Clock out"}
              </Button>
            </div>
          </section>

          <form className="space-y-4" onSubmit={saveTeacher}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Teacher</Label>
                <Select value={selectedStaffId} onValueChange={(value) => value && loadTeacher(value)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New teacher</SelectItem>
                    {activeStaff.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>{teacher.user.name}</SelectItem>
                    ))}
                    {selectedPreviousTeacher ? (
                      <SelectItem value={selectedPreviousTeacher.id}>{selectedPreviousTeacher.user.name} (previous staff)</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
                {selectedPreviousTeacher ? (
                  <p className="text-xs text-muted-foreground">
                    This profile is currently in Previous staff. Saving it will restore active access.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label>Center</Label>
                <Select value={centerId} onValueChange={(value) => value && updateCenter(value)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Choose center" /></SelectTrigger>
                  <SelectContent>
                    {centers.map((center) => (
                      <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Full name</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
              </div>
              <div className="space-y-1">
                <Label>Contact email</Label>
                <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" autoComplete="tel" />
              </div>
              <div className="space-y-1">
                <Label>Title</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Lead Teacher" />
              </div>
              <div className="space-y-1">
                <Label>Classroom</Label>
                <Select value={classroomId} onValueChange={(value) => value && setClassroomId(value)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {classroomOptions.map((classroom) => (
                      <SelectItem key={classroom.id} value={classroom.id}>
                        {classroom.name} · {classroom.ageGroup}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Background status</Label>
                <Select value={backgroundCheckStatus} onValueChange={(value) => value && setBackgroundCheckStatus(value)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {backgroundStatuses.map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Staff kiosk code</Label>
                <Input
                  value={staffKioskPin}
                  onChange={(event) => setStaffKioskPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="Optional 4 digit code"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isPending || !centerId}>
                {staffKioskPin ? <KeyRound data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                {selectedPreviousTeacher ? "Restore teacher" : "Save teacher"}
              </Button>
              {selectedStaffId !== "new" && !selectedPreviousTeacher ? (
                <Button type="button" variant="outline" disabled={isPending} onClick={deactivateTeacher}>
                  <Archive data-icon="inline-start" />
                  Move to previous staff
                </Button>
              ) : null}
            </div>
          </form>
          <section className="rounded-xl border bg-background/40 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Previous staff</div>
                <p className="text-xs text-muted-foreground">
                  Archived teachers are hidden from active assignment, clock, certification, and schedule workflows.
                </p>
              </div>
              <Badge variant="outline">{previousStaffRows.length} archived</Badge>
            </div>
            {previousStaffRows.length ? (
              <div className="divide-y rounded-lg border bg-card/40">
                {previousStaffRows.map((teacher) => (
                  <div key={teacher.id} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{teacher.user.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{teacher.user.email}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{teacher.title || "Teacher"}</span>
                        <span>{teacher.classroom?.name ?? "No active classroom"}</span>
                      </div>
                    </div>
                    <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => loadTeacher(teacher.id)}>
                      <Pencil data-icon="inline-start" />
                      Review / restore
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-card/30 p-4 text-sm text-muted-foreground">
                No previous staff records for this school scope.
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Certification</CardTitle>
          <CardDescription>Add CPR, first aid, background, training, or licensing documentation reminders.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={saveCertification}>
            <div className="space-y-1">
              <Label>Teacher</Label>
              <Select value={certStaffId} onValueChange={(value) => value && setCertStaffId(value)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose teacher" /></SelectTrigger>
                <SelectContent>
                  {activeStaff.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>{teacher.user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Certification name</Label>
              <Input value={certName} onChange={(event) => setCertName(event.target.value)} placeholder="CPR / First Aid" required />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={certStatus} onValueChange={(value) => value && setCertStatus(value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {certificationStatuses.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Expiration</Label>
              <Input value={certExpiresAt} onChange={(event) => setCertExpiresAt(event.target.value)} type="date" />
            </div>
            <Button type="submit" disabled={isPending || !certStaffId}>
              <Save data-icon="inline-start" />
              Save certification
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass-panel lg:col-span-2">
        <CardHeader>
          <CardTitle>
            <CalendarClock data-icon="inline-start" />
            Staff Schedule
          </CardTitle>
          <CardDescription>Create, edit, or remove upcoming teacher coverage for this school.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2 lg:grid-cols-5" onSubmit={saveSchedule}>
            <div className="space-y-1">
              <Label>Schedule row</Label>
              <Select value={scheduleId} onValueChange={(value) => value && loadSchedule(value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New schedule</SelectItem>
                  {schedules.map((schedule) => (
                    <SelectItem key={schedule.id} value={schedule.id}>
                      {schedule.staff.user.name} · {new Date(schedule.startsAt).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Teacher</Label>
              <Select value={scheduleStaffId} onValueChange={(value) => value && setScheduleStaffId(value)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose teacher" /></SelectTrigger>
                <SelectContent>
                  {activeStaff.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>{teacher.user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Starts</Label>
              <Input value={scheduleStartsAt} onChange={(event) => setScheduleStartsAt(event.target.value)} type="datetime-local" required />
            </div>
            <div className="space-y-1">
              <Label>Ends</Label>
              <Input value={scheduleEndsAt} onChange={(event) => setScheduleEndsAt(event.target.value)} type="datetime-local" required />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={scheduleStatus} onValueChange={(value) => value && setScheduleStatus(value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="pto">PTO</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem>
                  <SelectItem value="called_out">Called out</SelectItem>
                  <SelectItem value="covered">Covered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2 lg:col-span-5">
              <Button type="submit" disabled={isPending || !scheduleStaffId}>
                <Save data-icon="inline-start" />
                Save schedule
              </Button>
              {scheduleId !== "new" ? (
                <Button type="button" variant="outline" disabled={isPending} onClick={deleteSchedule}>
                  <Trash2 data-icon="inline-start" />
                  Delete schedule
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
