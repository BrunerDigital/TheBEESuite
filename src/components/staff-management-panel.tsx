"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Archive, CalendarClock, CheckCircle2, Save, Trash2, UserRoundCog } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CenterOption = { id: string; name: string };
type ClassroomOption = { id: string; centerId: string; name: string; ageGroup: string };
type TeacherRecord = {
  id: string;
  centerId: string;
  classroomId: string | null;
  title: string;
  phone: string | null;
  backgroundCheckStatus: string | null;
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

type Props = {
  centers: CenterOption[];
  classrooms: ClassroomOption[];
  staff: TeacherRecord[];
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

export function StaffManagementPanel({ centers, classrooms, staff, schedules }: Props) {
  const router = useRouter();
  const [selectedStaffId, setSelectedStaffId] = useState("new");
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  const [classroomId, setClassroomId] = useState("none");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("Teacher");
  const [backgroundCheckStatus, setBackgroundCheckStatus] = useState("pending");
  const [certStaffId, setCertStaffId] = useState(staff[0]?.id ?? "");
  const [certName, setCertName] = useState("");
  const [certStatus, setCertStatus] = useState("active");
  const [certExpiresAt, setCertExpiresAt] = useState("");
  const [scheduleId, setScheduleId] = useState("new");
  const [scheduleStaffId, setScheduleStaffId] = useState(staff[0]?.id ?? "");
  const [scheduleStartsAt, setScheduleStartsAt] = useState("");
  const [scheduleEndsAt, setScheduleEndsAt] = useState("");
  const [scheduleStatus, setScheduleStatus] = useState("scheduled");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const classroomOptions = useMemo(
    () => classrooms.filter((classroom) => classroom.centerId === centerId),
    [centerId, classrooms],
  );

  function resetTeacherForm() {
    setCenterId(centers[0]?.id ?? "");
    setClassroomId("none");
    setName("");
    setEmail("");
    setPhone("");
    setTitle("Teacher");
    setBackgroundCheckStatus("pending");
  }

  function loadTeacher(value: string) {
    setSelectedStaffId(value);
    const teacher = staff.find((item) => item.id === value);
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
      setScheduleStaffId(staff[0]?.id ?? "");
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
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; mode?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Teacher profile could not be saved.");
        return;
      }
      setStatusMessage(`Teacher profile ${json?.mode ?? "saved"}.`);
      setSelectedStaffId("new");
      router.refresh();
    });
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
    const confirmed = window.confirm("Deactivate this teacher account? Historical records stay intact, but the teacher is removed from active staff views.");
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
        setErrorMessage(json?.error || "Teacher account could not be deactivated.");
        return;
      }
      setStatusMessage(`Teacher ${json?.mode ?? "deactivated"}.`);
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
          <form className="space-y-4" onSubmit={saveTeacher}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Teacher</Label>
                <Select value={selectedStaffId} onValueChange={(value) => value && loadTeacher(value)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New teacher</SelectItem>
                    {staff.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>{teacher.user.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Label>Email</Label>
                <Input value={email} onChange={(event) => setEmail(event.target.value)} required type="email" autoComplete="email" />
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
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={isPending || !centerId}>
                <Save data-icon="inline-start" />
                Save teacher
              </Button>
              {selectedStaffId !== "new" ? (
                <Button type="button" variant="outline" disabled={isPending} onClick={deactivateTeacher}>
                  <Archive data-icon="inline-start" />
                  Deactivate teacher
                </Button>
              ) : null}
            </div>
          </form>
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
                  {staff.map((teacher) => (
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
            <Button disabled={isPending || !certStaffId}>
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
                  {staff.map((teacher) => (
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
                  <SelectItem value="called_out">Called out</SelectItem>
                  <SelectItem value="covered">Covered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2 lg:col-span-5">
              <Button disabled={isPending || !scheduleStaffId}>
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
