"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Archive, CalendarClock, CheckCircle2, Clock, Copy, FileSpreadsheet, KeyRound, Pencil, Printer, Save, Trash2, UserRoundCog } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/user-avatar";
import {
  centsToDollarInput,
  estimatedHourlyGrossPayCents,
  formatMoneyCents,
  formatStaffPayRate,
  formatStaffPayrollStatus,
  readStaffCompensation,
  STAFF_PAYROLL_STATUSES,
  type StaffPayrollStatus,
  type StaffPayType,
} from "@/lib/staff-compensation";
import { summarizeClassroomCoverage } from "@/lib/staff-scheduling";
import { formatStaffDecimalHours, readStaffClockState, readStaffClockSummary, type StaffClockAction, type StaffClockEvent, type StaffClockShift } from "@/lib/staff-kiosk";

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
  user: { name: string; email: string; isActive: boolean; profilePhotoUrl?: string | null };
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
  timeClockSummaryGeneratedAt: string;
  canManageCompensation: boolean;
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

const nativeSelectClassName =
  "flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";
const overtimeWeeklyThresholdMinutes = 40 * 60;

type PayrollShiftRow = StaffClockShift & {
  dateLabel: string;
  weekLabel: string;
  clockInLabel: string;
  clockOutLabel: string;
  regularMinutes: number;
  overtimeMinutes: number;
};

type ClockEditRow = {
  id: string;
  action: StaffClockAction;
  occurredAt: string;
  notes: string;
};

type PayCodeSummaryRow = {
  payCode: string;
  department: string;
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
};

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

function addLocalDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDateInput(value: string, endOfDay = false) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return null;
  const [, year, month, day] = parts;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

function defaultPayrollStartDate(value: string) {
  const date = new Date(value);
  return dateInputValue(addLocalDays(Number.isNaN(date.getTime()) ? new Date() : date, -13));
}

function defaultPayrollEndDate(value: string) {
  const date = new Date(value);
  return dateInputValue(Number.isNaN(date.getTime()) ? new Date() : date);
}

function formatShortDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not set"
    : new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).format(date);
}

function formatShortTime(value: Date | string | null) {
  if (!value) return "Open";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "Open"
    : new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDateTime(value: Date | string | null) {
  if (!value) return "No history";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "No history"
    : new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function clockEditRowId() {
  return `clock-row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sortClockEditRows(rows: ClockEditRow[]) {
  return [...rows].sort((left, right) => {
    const leftTime = new Date(left.occurredAt).getTime();
    const rightTime = new Date(right.occurredAt).getTime();
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
  });
}

function clockEditRowsFromEvents(events: StaffClockEvent[]): ClockEditRow[] {
  return [...events]
    .sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime())
    .map((event, index) => ({
      id: `clock-event-${index}-${event.occurredAt}`,
      action: event.action,
      occurredAt: toDateTimeLocal(event.occurredAt),
      notes: event.notes ?? "",
    }));
}

function nextClockEditAction(rows: ClockEditRow[]): StaffClockAction {
  const sorted = sortClockEditRows(rows).filter((row) => row.occurredAt);
  const last = sorted[sorted.length - 1];
  return last?.action === "clock_in" ? "clock_out" : "clock_in";
}

function payrollWeekStart(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
}

function payrollWeekLabel(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown week";
  const start = payrollWeekStart(date);
  const end = addLocalDays(start, 6);
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function buildPayrollShiftRows(shifts: StaffClockShift[]): PayrollShiftRow[] {
  const weeklyMinutes = new Map<string, number>();
  return [...shifts]
    .sort((left, right) => new Date(left.clockInAt).getTime() - new Date(right.clockInAt).getTime())
    .map((shift) => {
      const clockIn = new Date(shift.clockInAt);
      const weekLabel = payrollWeekLabel(clockIn);
      const usedMinutes = weeklyMinutes.get(weekLabel) ?? 0;
      const regularMinutes = Math.max(0, Math.min(shift.minutes, overtimeWeeklyThresholdMinutes - usedMinutes));
      const overtimeMinutes = Math.max(0, shift.minutes - regularMinutes);
      weeklyMinutes.set(weekLabel, usedMinutes + shift.minutes);
      return {
        ...shift,
        dateLabel: formatShortDate(clockIn),
        weekLabel,
        clockInLabel: formatShortTime(shift.clockInAt),
        clockOutLabel: shift.clockOutAt ? formatShortTime(shift.clockOutAt) : "Open",
        regularMinutes,
        overtimeMinutes,
      };
    });
}

function buildPayCodeSummaries(input: {
  shifts: PayrollShiftRow[];
  payCode: string;
  department: string;
}) {
  const summary: PayCodeSummaryRow = {
    payCode: input.payCode || "Teacher",
    department: input.department || "Unassigned",
    totalMinutes: 0,
    regularMinutes: 0,
    overtimeMinutes: 0,
  };
  input.shifts.forEach((shift) => {
    summary.totalMinutes += shift.minutes;
    summary.regularMinutes += shift.regularMinutes;
    summary.overtimeMinutes += shift.overtimeMinutes;
  });
  return [summary];
}

export function StaffManagementPanel({
  centers,
  classrooms,
  staff,
  previousStaff = [],
  schedules,
  timeClockSummaryGeneratedAt,
  canManageCompensation,
}: Props) {
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
  const [staffPayType, setStaffPayType] = useState<StaffPayType>("hourly");
  const [hourlyRate, setHourlyRate] = useState("");
  const [annualSalary, setAnnualSalary] = useState("");
  const [payrollId, setPayrollId] = useState("");
  const [payrollStatus, setPayrollStatus] = useState<StaffPayrollStatus>("active");
  const [payCode, setPayCode] = useState("");
  const [payDepartment, setPayDepartment] = useState("");
  const [overtimeEligible, setOvertimeEligible] = useState(true);
  const [payEffectiveDate, setPayEffectiveDate] = useState("");
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
  const [clockStaffId, setClockStaffId] = useState(allTeacherRows[0]?.id ?? "");
  const [clockNotes, setClockNotes] = useState("");
  const [clockEditRows, setClockEditRows] = useState<ClockEditRow[]>(() =>
    clockEditRowsFromEvents(readStaffClockState(allTeacherRows[0]?.customFields).events),
  );
  const [payrollStartDate, setPayrollStartDate] = useState(() => defaultPayrollStartDate(timeClockSummaryGeneratedAt));
  const [payrollEndDate, setPayrollEndDate] = useState(() => defaultPayrollEndDate(timeClockSummaryGeneratedAt));
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
  const clockTeacher = allTeacherRows.find((teacher) => teacher.id === clockStaffId) ?? allTeacherRows[0] ?? null;
  const clockState = readStaffClockState(clockTeacher?.customFields);
  const clockAction = clockState.status === "clocked_in" ? "clock_out" : "clock_in";
  const selectedTeacher = allTeacherRows.find((teacher) => teacher.id === selectedStaffId) ?? null;
  const selectedPreviousTeacher = selectedTeacher?.user.isActive === false ? selectedTeacher : null;
  const centerNameById = useMemo(() => new Map(centers.map((center) => [center.id, center.name])), [centers]);
  const summaryNow = useMemo(() => new Date(timeClockSummaryGeneratedAt), [timeClockSummaryGeneratedAt]);
  const payrollStart = useMemo(() => parseDateInput(payrollStartDate), [payrollStartDate]);
  const payrollEnd = useMemo(() => parseDateInput(payrollEndDate, true), [payrollEndDate]);
  const payrollRangeIsValid = Boolean(payrollStart && payrollEnd && payrollStart.getTime() <= payrollEnd.getTime());
  const payrollPeriodLabel = payrollRangeIsValid && payrollStart && payrollEnd
    ? `${formatShortDate(payrollStart)} to ${formatShortDate(payrollEnd)}`
    : "Select a valid pay period";
  const staffHoursRows = useMemo(() => {
    return allTeacherRows
      .map((teacher) => {
        const clock = readStaffClockState(teacher.customFields);
        const summary = readStaffClockSummary(teacher.customFields, {
          now: summaryNow,
          startDate: payrollStart,
          endDate: payrollEnd,
        });
        const shiftRows = buildPayrollShiftRows(summary.shifts);
        const regularMinutes = shiftRows.reduce((sum, shift) => sum + shift.regularMinutes, 0);
        const overtimeMinutes = shiftRows.reduce((sum, shift) => sum + shift.overtimeMinutes, 0);
        const compensation = readStaffCompensation(teacher.customFields);
        const payrollPayCode = compensation.payCode ?? teacher.title ?? "Teacher";
        const payrollDepartment = compensation.department ?? teacher.classroom?.name ?? "Unassigned";
        const payCodeSummaries = buildPayCodeSummaries({
          shifts: shiftRows,
          payCode: payrollPayCode,
          department: payrollDepartment,
        });
        const estimatedGrossPayCents = estimatedHourlyGrossPayCents({
          compensation,
          regularMinutes,
          overtimeMinutes,
        });
        return {
          id: teacher.id,
          name: teacher.user.name,
          email: teacher.user.email,
          title: teacher.title || "Teacher",
          centerName: centerNameById.get(teacher.centerId) ?? "Unknown center",
          classroomName: teacher.classroom?.name ?? "Unassigned",
          active: teacher.user.isActive,
          clock,
          summary,
          shiftRows,
          payCodeSummaries,
          payrollPayCode,
          payrollDepartment,
          regularMinutes,
          overtimeMinutes,
          compensation,
          estimatedGrossPayCents,
        };
      })
      .sort((left, right) => left.centerName.localeCompare(right.centerName) || left.name.localeCompare(right.name));
  }, [allTeacherRows, centerNameById, payrollEnd, payrollStart, summaryNow]);
  const staffHoursTotalMinutes = staffHoursRows.reduce((sum, row) => sum + row.summary.totalMinutes, 0);
  const staffHoursRegularMinutes = staffHoursRows.reduce((sum, row) => sum + row.regularMinutes, 0);
  const staffHoursOvertimeMinutes = staffHoursRows.reduce((sum, row) => sum + row.overtimeMinutes, 0);
  const staffHoursOpenMinutes = staffHoursRows.reduce((sum, row) => sum + row.summary.openShiftMinutes, 0);
  const staffHoursEstimatedGrossCents = staffHoursRows.reduce((sum, row) => sum + (row.estimatedGrossPayCents ?? 0), 0);
  const staffClockedInCount = staffHoursRows.filter((row) => row.clock.status === "clocked_in").length;

  function resetTeacherForm() {
    setCenterId(centers[0]?.id ?? "");
    setClassroomId("none");
    setName("");
    setEmail("");
    setPhone("");
    setTitle("Teacher");
    setBackgroundCheckStatus("pending");
    setStaffKioskPin("");
    setStaffPayType("hourly");
    setHourlyRate("");
    setAnnualSalary("");
    setPayrollId("");
    setPayrollStatus("active");
    setPayCode("");
    setPayDepartment("");
    setOvertimeEligible(true);
    setPayEffectiveDate("");
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
    const compensation = readStaffCompensation(teacher.customFields);
    setStaffPayType(compensation.payType);
    setHourlyRate(centsToDollarInput(compensation.hourlyRateCents));
    setAnnualSalary(centsToDollarInput(compensation.annualSalaryCents));
    setPayrollId(compensation.payrollId ?? "");
    setPayrollStatus(compensation.payrollStatus);
    setPayCode(compensation.payCode ?? "");
    setPayDepartment(compensation.department ?? "");
    setOvertimeEligible(compensation.overtimeEligible);
    setPayEffectiveDate(compensation.effectiveDate ?? "");
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
    if (!clockTeacher || !clockTeacher.user.isActive) return;
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
      const json = await response.json().catch(() => null) as { error?: string; record?: { customFields?: unknown } } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Staff clock action could not be saved.");
        return;
      }
      setStatusMessage(`${clockTeacher.user.name} ${clockAction === "clock_in" ? "clocked in" : "clocked out"}.`);
      setClockNotes("");
      if (json?.record?.customFields !== undefined) {
        setClockEditRows(clockEditRowsFromEvents(readStaffClockState(json.record.customFields).events));
      }
      router.refresh();
    });
  }

  function updateClockEditRow(rowId: string, patch: Partial<ClockEditRow>) {
    setClockEditRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  }

  function addClockEditRow() {
    setClockEditRows((current) => [
      ...current,
      {
        id: clockEditRowId(),
        action: nextClockEditAction(current),
        occurredAt: toDateTimeLocal(new Date()),
        notes: "",
      },
    ]);
  }

  function removeClockEditRow(rowId: string) {
    setClockEditRows((current) => current.filter((row) => row.id !== rowId));
  }

  function selectClockStaffForEdit(staffId: string) {
    setClockStaffId(staffId);
    const teacher = allTeacherRows.find((row) => row.id === staffId);
    setClockEditRows(clockEditRowsFromEvents(readStaffClockState(teacher?.customFields).events));
  }

  function saveTimeCardEdits() {
    if (!clockTeacher) return;
    if (!clockEditRows.length && clockState.events.length && !window.confirm(`Clear all time-card punches for ${clockTeacher.user.name}?`)) {
      return;
    }

    const events: { action: StaffClockAction; occurredAt: string; notes: string | null }[] = [];
    for (const row of clockEditRows) {
      const occurredAt = new Date(row.occurredAt);
      if (!row.occurredAt || Number.isNaN(occurredAt.getTime())) {
        setErrorMessage("Every punch needs a valid date and time.");
        return;
      }
      events.push({
        action: row.action,
        occurredAt: occurredAt.toISOString(),
        notes: row.notes.trim() || null,
      });
    }

    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "staffTimeClock",
          staffId: clockTeacher.id,
          events,
          editReason: "Director time card edit",
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; record?: { customFields?: unknown } } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Time card edits could not be saved.");
        return;
      }
      setStatusMessage(`${clockTeacher.user.name}'s time card was saved.`);
      if (json?.record?.customFields !== undefined) {
        setClockEditRows(clockEditRowsFromEvents(readStaffClockState(json.record.customFields).events));
      } else {
        setClockEditRows(sortClockEditRows(clockEditRows));
      }
      router.refresh();
    });
  }

  function printTimeCards() {
    window.print();
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
          ...(canManageCompensation
            ? {
                staffPayType,
                hourlyRate,
                annualSalary,
                payrollId,
                payrollStatus,
                payCode,
                payDepartment,
                overtimeEligible,
                payEffectiveDate,
              }
            : {}),
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
            Classroom Assignment Tool
          </CardTitle>
          <CardDescription>Assign active teachers to classrooms and update the contact details needed for classroom coverage.</CardDescription>
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
                  <select
                    className={nativeSelectClassName}
                    value={assignmentStaffId}
                    onChange={(event) => setAssignmentStaffId(event.target.value)}
                  >
                    {activeStaff.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>{teacher.user.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Classroom</Label>
                  <select
                    className={nativeSelectClassName}
                    value={assignmentClassroomId}
                    onChange={(event) => setAssignmentClassroomId(event.target.value)}
                  >
                    <option value="none">Unassigned</option>
                    {assignmentClassrooms.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>{classroom.name} - {classroom.ageGroup}</option>
                    ))}
                  </select>
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
                  <select
                    className={nativeSelectClassName}
                    value={weeklyClassroomId}
                    onChange={(event) => setWeeklyClassroomId(event.target.value)}
                  >
                    {classrooms.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.name} - {classroom.ageGroup}
                      </option>
                    ))}
                  </select>
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
                  <select
                    className={nativeSelectClassName}
                    value={weeklyStatus}
                    onChange={(event) => setWeeklyStatus(event.target.value)}
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="confirmed">Confirmed</option>
                  </select>
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
                <select
                  className={nativeSelectClassName}
                  value={clockTeacher?.id ?? ""}
                  onChange={(event) => selectClockStaffForEdit(event.target.value)}
                >
                  {allTeacherRows.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.user.name}{teacher.user.isActive ? "" : " (previous staff)"}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Last action: {clockState.lastActionAt ? new Date(clockState.lastActionAt).toLocaleString() : "No clock history"}
                </p>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input value={clockNotes} onChange={(event) => setClockNotes(event.target.value)} placeholder="Optional director note" />
              </div>
              <Button type="button" className="self-end" disabled={isPending || !clockTeacher || !clockTeacher.user.isActive} onClick={saveClockAction}>
                <Clock data-icon="inline-start" />
                {clockAction === "clock_in" ? "Clock in" : "Clock out"}
              </Button>
            </div>
            <div className="mt-4 rounded-lg border bg-card/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Pencil className="size-4" />
                    Time card punches
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Manual payroll corrections for saved clock history.</p>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={isPending || !clockTeacher} onClick={addClockEditRow}>
                  <Clock data-icon="inline-start" />
                  Add punch
                </Button>
              </div>

              <div className="mt-3 overflow-x-auto rounded-md border bg-background/60">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Action</th>
                      <th className="px-3 py-2 text-left font-medium">Date and time</th>
                      <th className="px-3 py-2 text-left font-medium">Notes</th>
                      <th className="px-3 py-2 text-right font-medium">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortClockEditRows(clockEditRows).map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2">
                          <select
                            className={nativeSelectClassName}
                            value={row.action}
                            onChange={(event) => updateClockEditRow(row.id, { action: event.target.value as StaffClockAction })}
                          >
                            <option value="clock_in">Clock in</option>
                            <option value="clock_out">Clock out</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="datetime-local"
                            value={row.occurredAt}
                            onChange={(event) => updateClockEditRow(row.id, { occurredAt: event.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={row.notes}
                            onChange={(event) => updateClockEditRow(row.id, { notes: event.target.value })}
                            placeholder="Optional note"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button type="button" variant="ghost" size="icon-sm" disabled={isPending} onClick={() => removeClockEditRow(row.id)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!clockEditRows.length ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-sm text-muted-foreground">No punches saved for this staff member.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">{clockEditRows.length} punch{clockEditRows.length === 1 ? "" : "es"} ready to save</div>
                <Button type="button" disabled={isPending || !clockTeacher} onClick={saveTimeCardEdits}>
                  <Save data-icon="inline-start" />
                  Save time card
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-background/40 p-4">
            <style>{`
              @media print {
                body:has(.staff-payroll-print-area) * {
                  visibility: hidden !important;
                }

                body:has(.staff-payroll-print-area) .staff-payroll-print-area,
                body:has(.staff-payroll-print-area) .staff-payroll-print-area * {
                  visibility: visible !important;
                }

                body:has(.staff-payroll-print-area) .staff-payroll-print-area {
                  position: absolute !important;
                  inset: 0 auto auto 0 !important;
                  width: 100% !important;
                  min-height: 100% !important;
                  padding: 0.25in !important;
                  background: #ffffff !important;
                  color: #111827 !important;
                }

                body:has(.staff-payroll-print-area) .staff-payroll-print-area table {
                  border-collapse: collapse !important;
                }

                body:has(.staff-payroll-print-area) .staff-time-card {
                  break-after: page;
                  page-break-after: always;
                }

                body:has(.staff-payroll-print-area) .staff-time-card:last-child {
                  break-after: auto;
                  page-break-after: auto;
                }
              }
            `}</style>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Payroll time cards</div>
                <p className="text-xs text-muted-foreground">
                  Printable employee time cards, decimal-hour totals, pay-code summaries, and approval signatures.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{formatStaffDecimalHours(staffHoursTotalMinutes)} total decimal</Badge>
                <Badge variant="outline">{formatStaffDecimalHours(staffHoursRegularMinutes)} regular</Badge>
                <Badge variant={staffHoursOvertimeMinutes ? "default" : "outline"}>{formatStaffDecimalHours(staffHoursOvertimeMinutes)} OT</Badge>
                {canManageCompensation ? <Badge variant="outline">{formatMoneyCents(staffHoursEstimatedGrossCents)} hourly gross</Badge> : null}
                <Badge variant={staffClockedInCount ? "default" : "outline"}>{staffClockedInCount} clocked in</Badge>
              </div>
            </div>

            <div className="grid gap-3 rounded-lg border bg-card/40 p-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] md:items-end">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileSpreadsheet className="size-4" />
                  {payrollPeriodLabel}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Regular and OT columns are decimal hours. OT is calculated after 40.00 hours in each Monday-Sunday payroll week.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Start</Label>
                <Input type="date" value={payrollStartDate} onChange={(event) => setPayrollStartDate(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>End</Label>
                <Input type="date" value={payrollEndDate} onChange={(event) => setPayrollEndDate(event.target.value)} />
              </div>
              <Button type="button" variant="outline" disabled={!payrollRangeIsValid || !staffHoursRows.length} onClick={printTimeCards}>
                <Printer data-icon="inline-start" />
                Print time cards
              </Button>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border bg-card/40">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Employee</th>
                    <th className="px-3 py-2 text-left font-medium">Center / Department</th>
                    {canManageCompensation ? <th className="px-3 py-2 text-left font-medium">Pay basis</th> : null}
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Total decimal</th>
                    <th className="px-3 py-2 text-right font-medium">Regular</th>
                    <th className="px-3 py-2 text-right font-medium">OT</th>
                    {canManageCompensation ? <th className="px-3 py-2 text-right font-medium">Hourly gross</th> : null}
                    <th className="px-3 py-2 text-right font-medium">Open</th>
                    <th className="px-3 py-2 text-left font-medium">Last action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {staffHoursRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-muted-foreground">{row.email}</div>
                        {!row.active ? <div className="text-xs text-muted-foreground">Previous staff</div> : null}
                        <Button type="button" variant="outline" size="xs" className="mt-2" onClick={() => selectClockStaffForEdit(row.id)}>
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
                      </td>
                      <td className="px-3 py-2">
                        <div>{row.centerName}</div>
                        <div className="text-xs text-muted-foreground">{row.classroomName}</div>
                      </td>
                      {canManageCompensation ? (
                        <td className="px-3 py-2">
                          <div className="font-medium">{formatStaffPayRate(row.compensation)}</div>
                          <div className="text-xs capitalize text-muted-foreground">
                            {formatStaffPayrollStatus(row.compensation.payrollStatus)}
                            {row.compensation.payrollId ? ` - ${row.compensation.payrollId}` : ""}
                          </div>
                        </td>
                      ) : null}
                      <td className="px-3 py-2">
                        <Badge variant={row.clock.status === "clocked_in" ? "default" : "outline"}>
                          {row.clock.status === "clocked_in" ? "Clocked in" : "Clocked out"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatStaffDecimalHours(row.summary.totalMinutes)}</td>
                      <td className="px-3 py-2 text-right">{formatStaffDecimalHours(row.regularMinutes)}</td>
                      <td className="px-3 py-2 text-right">{formatStaffDecimalHours(row.overtimeMinutes)}</td>
                      {canManageCompensation ? <td className="px-3 py-2 text-right">{formatMoneyCents(row.estimatedGrossPayCents)}</td> : null}
                      <td className="px-3 py-2 text-right">{formatStaffDecimalHours(row.summary.openShiftMinutes)}</td>
                      <td className="px-3 py-2">{formatDateTime(row.clock.lastActionAt)}</td>
                    </tr>
                  ))}
                  {!staffHoursRows.length ? (
                    <tr>
                      <td colSpan={canManageCompensation ? 10 : 8} className="px-3 py-4 text-sm text-muted-foreground">No staff profiles are visible in this scope.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="staff-payroll-print-area mt-4 max-h-[70vh] space-y-4 overflow-y-auto rounded-lg border bg-card/30 p-4 text-sm print:mt-0 print:max-h-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:p-0 print:text-black">
              <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-3 print:border-black">
                <div>
                  <div className="text-lg font-semibold">Employee Time Card Summary</div>
                  <div className="text-sm">Pay period: {payrollPeriodLabel}</div>
                  <div className="text-xs text-muted-foreground print:text-black">Generated: {formatDateTime(timeClockSummaryGeneratedAt)}</div>
                </div>
                <div className="text-right text-xs">
                  <div>The BEE Suite</div>
                  <div>{centers.length} visible center{centers.length === 1 ? "" : "s"}</div>
                  <div>Payroll hours shown as decimals</div>
                </div>
              </header>

              <section>
                <div className="mb-2 text-sm font-semibold">Period Summary</div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-xs">
                    <thead>
                      <tr className="border-y bg-muted/40 print:border-black print:bg-white">
                        <th className="px-2 py-1 text-left font-medium">Employee</th>
                        <th className="px-2 py-1 text-left font-medium">Center</th>
                        <th className="px-2 py-1 text-left font-medium">Department</th>
                        {canManageCompensation ? <th className="px-2 py-1 text-left font-medium">Pay basis</th> : null}
                        <th className="px-2 py-1 text-right font-medium">Total decimal</th>
                        <th className="px-2 py-1 text-right font-medium">Regular</th>
                        <th className="px-2 py-1 text-right font-medium">OT</th>
                        {canManageCompensation ? <th className="px-2 py-1 text-right font-medium">Hourly gross</th> : null}
                        <th className="px-2 py-1 text-right font-medium">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffHoursRows.map((row) => (
                        <tr key={`${row.id}-print-summary`} className="border-b print:border-black">
                          <td className="px-2 py-1">{row.name}</td>
                          <td className="px-2 py-1">{row.centerName}</td>
                          <td className="px-2 py-1">{row.classroomName}</td>
                          {canManageCompensation ? <td className="px-2 py-1">{formatStaffPayRate(row.compensation)}</td> : null}
                          <td className="px-2 py-1 text-right font-medium">{formatStaffDecimalHours(row.summary.totalMinutes)}</td>
                          <td className="px-2 py-1 text-right">{formatStaffDecimalHours(row.regularMinutes)}</td>
                          <td className="px-2 py-1 text-right">{formatStaffDecimalHours(row.overtimeMinutes)}</td>
                          {canManageCompensation ? <td className="px-2 py-1 text-right">{formatMoneyCents(row.estimatedGrossPayCents)}</td> : null}
                          <td className="px-2 py-1 text-right">{formatStaffDecimalHours(row.summary.openShiftMinutes)}</td>
                        </tr>
                      ))}
                      <tr className="border-t font-semibold print:border-black">
                        <td className="px-2 py-1" colSpan={canManageCompensation ? 4 : 3}>Period total</td>
                        <td className="px-2 py-1 text-right">{formatStaffDecimalHours(staffHoursTotalMinutes)}</td>
                        <td className="px-2 py-1 text-right">{formatStaffDecimalHours(staffHoursRegularMinutes)}</td>
                        <td className="px-2 py-1 text-right">{formatStaffDecimalHours(staffHoursOvertimeMinutes)}</td>
                        {canManageCompensation ? <td className="px-2 py-1 text-right">{formatMoneyCents(staffHoursEstimatedGrossCents)}</td> : null}
                        <td className="px-2 py-1 text-right">{formatStaffDecimalHours(staffHoursOpenMinutes)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {staffHoursRows.map((row) => (
                <article key={`${row.id}-time-card`} className="staff-time-card rounded-lg border bg-background p-4 print:rounded-none print:border-black print:bg-white print:p-3">
                  <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3 print:border-black">
                    <div>
                      <h3 className="text-base font-semibold">{row.name}</h3>
                      <div className="text-xs text-muted-foreground print:text-black">{row.email}</div>
                      <div className="text-xs text-muted-foreground print:text-black">{row.title} - {row.classroomName}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div>{row.centerName}</div>
                      <div>Pay period: {payrollPeriodLabel}</div>
                      {canManageCompensation ? <div>Pay basis: {formatStaffPayRate(row.compensation)}</div> : null}
                      {canManageCompensation && row.compensation.payrollId ? <div>Payroll ID: {row.compensation.payrollId}</div> : null}
                      <div>Clock status: {row.clock.status === "clocked_in" ? "Clocked in" : "Clocked out"}</div>
                    </div>
                  </header>

                  <div className="my-3 grid gap-2 sm:grid-cols-6 print:grid-cols-6">
                    {[
                      ["Total decimal", staffHoursRows.length ? formatStaffDecimalHours(row.summary.totalMinutes) : "0.00"],
                      ["Regular", formatStaffDecimalHours(row.regularMinutes)],
                      ["OT", formatStaffDecimalHours(row.overtimeMinutes)],
                      ["Open", formatStaffDecimalHours(row.summary.openShiftMinutes)],
                      ["Closed shifts", String(row.summary.closedShiftCount)],
                      ...(canManageCompensation ? [["Hourly gross", formatMoneyCents(row.estimatedGrossPayCents)]] : []),
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md border bg-card/40 p-2 print:border-black print:bg-white">
                        <div className="text-[10px] uppercase text-muted-foreground print:text-black">{label}</div>
                        <div className="mt-1 font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-xs">
                      <thead>
                        <tr className="border-y bg-muted/40 print:border-black print:bg-white">
                          <th className="px-2 py-1 text-left font-medium">Date</th>
                          <th className="px-2 py-1 text-left font-medium">Week</th>
                          <th className="px-2 py-1 text-left font-medium">Pay code</th>
                          <th className="px-2 py-1 text-left font-medium">Department</th>
                          <th className="px-2 py-1 text-left font-medium">Clock in</th>
                          <th className="px-2 py-1 text-left font-medium">Clock out</th>
                          <th className="px-2 py-1 text-left font-medium">Status</th>
                          <th className="px-2 py-1 text-right font-medium">Regular</th>
                          <th className="px-2 py-1 text-right font-medium">OT</th>
                          <th className="px-2 py-1 text-right font-medium">Total decimal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.shiftRows.map((shift, index) => (
                          <tr key={`${shift.clockInAt}-${shift.clockOutAt ?? "open"}-${index}`} className="border-b print:border-black">
                            <td className="px-2 py-1">{shift.dateLabel}</td>
                            <td className="px-2 py-1">{shift.weekLabel}</td>
                            <td className="px-2 py-1">{row.payrollPayCode}</td>
                            <td className="px-2 py-1">{row.payrollDepartment}</td>
                            <td className="px-2 py-1">{shift.clockInLabel}</td>
                            <td className="px-2 py-1">{shift.clockOutLabel}</td>
                            <td className="px-2 py-1">{shift.status === "open" ? "Open - review before payroll" : "Closed"}</td>
                            <td className="px-2 py-1 text-right">{formatStaffDecimalHours(shift.regularMinutes)}</td>
                            <td className="px-2 py-1 text-right">{formatStaffDecimalHours(shift.overtimeMinutes)}</td>
                            <td className="px-2 py-1 text-right font-medium">{formatStaffDecimalHours(shift.minutes)}</td>
                          </tr>
                        ))}
                        {!row.shiftRows.length ? (
                          <tr>
                            <td colSpan={10} className="px-2 py-3 text-muted-foreground print:text-black">
                              No clocked shifts recorded in this pay period.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]">
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase">Pay Code Summary</div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-y bg-muted/40 print:border-black print:bg-white">
                            <th className="px-2 py-1 text-left font-medium">Pay code</th>
                            <th className="px-2 py-1 text-left font-medium">Department</th>
                            <th className="px-2 py-1 text-right font-medium">Regular</th>
                            <th className="px-2 py-1 text-right font-medium">OT</th>
                            <th className="px-2 py-1 text-right font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.payCodeSummaries.map((summary) => (
                            <tr key={`${summary.payCode}-${summary.department}`} className="border-b print:border-black">
                              <td className="px-2 py-1">{summary.payCode}</td>
                              <td className="px-2 py-1">{summary.department}</td>
                              <td className="px-2 py-1 text-right">{formatStaffDecimalHours(summary.regularMinutes)}</td>
                              <td className="px-2 py-1 text-right">{formatStaffDecimalHours(summary.overtimeMinutes)}</td>
                              <td className="px-2 py-1 text-right font-medium">{formatStaffDecimalHours(summary.totalMinutes)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs leading-5">
                      I declare under penalty of perjury that I have reviewed the times listed on this time card and they are correct.
                    </div>
                  </div>

                  <div className="mt-8 grid gap-6 sm:grid-cols-3 print:grid-cols-3">
                    <div>
                      <div className="h-8 border-b border-foreground/60 print:border-black" />
                      <div className="mt-1 text-xs">Employee signature</div>
                    </div>
                    <div>
                      <div className="h-8 border-b border-foreground/60 print:border-black" />
                      <div className="mt-1 text-xs">Director / executive approval</div>
                    </div>
                    <div>
                      <div className="h-8 border-b border-foreground/60 print:border-black" />
                      <div className="mt-1 text-xs">Date</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <form className="space-y-4" onSubmit={saveTeacher}>
            {selectedTeacher ? (
              <div className="flex items-center gap-3 rounded-xl border bg-background/40 p-3">
                <UserAvatar name={selectedTeacher.user.name} src={selectedTeacher.user.profilePhotoUrl} size="lg" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{selectedTeacher.user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{selectedTeacher.user.email}</div>
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Teacher</Label>
                <select
                  className={nativeSelectClassName}
                  value={selectedStaffId}
                  onChange={(event) => loadTeacher(event.target.value)}
                >
                  <option value="new">New teacher</option>
                  {activeStaff.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.user.name}</option>
                  ))}
                  {selectedPreviousTeacher ? (
                    <option value={selectedPreviousTeacher.id}>{selectedPreviousTeacher.user.name} (previous staff)</option>
                  ) : null}
                </select>
                {selectedPreviousTeacher ? (
                  <p className="text-xs text-muted-foreground">
                    This profile is currently in Previous staff. Saving it will restore active access.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label>Center</Label>
                <select
                  className={nativeSelectClassName}
                  value={centerId}
                  onChange={(event) => updateCenter(event.target.value)}
                >
                  {centers.map((center) => (
                    <option key={center.id} value={center.id}>{center.name}</option>
                  ))}
                </select>
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
                <select
                  className={nativeSelectClassName}
                  value={classroomId}
                  onChange={(event) => setClassroomId(event.target.value)}
                >
                  <option value="none">Unassigned</option>
                  {classroomOptions.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name} - {classroom.ageGroup}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Background status</Label>
                <select
                  className={nativeSelectClassName}
                  value={backgroundCheckStatus}
                  onChange={(event) => setBackgroundCheckStatus(event.target.value)}
                >
                  {backgroundStatuses.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
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
            {canManageCompensation ? (
              <section className="rounded-xl border bg-background/40 p-4">
                <div className="mb-3 text-sm font-medium">Payroll & compensation</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Pay type</Label>
                    <select
                      className={nativeSelectClassName}
                      value={staffPayType}
                      onChange={(event) => setStaffPayType(event.target.value as StaffPayType)}
                    >
                      <option value="hourly">Hourly</option>
                      <option value="salary">Salary</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>{staffPayType === "salary" ? "Yearly salary" : "Hourly rate"}</Label>
                    <Input
                      value={staffPayType === "salary" ? annualSalary : hourlyRate}
                      onChange={(event) => {
                        if (staffPayType === "salary") {
                          setAnnualSalary(event.target.value);
                        } else {
                          setHourlyRate(event.target.value);
                        }
                      }}
                      inputMode="decimal"
                      placeholder={staffPayType === "salary" ? "52000.00" : "18.50"}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Payroll ID</Label>
                    <Input value={payrollId} onChange={(event) => setPayrollId(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Payroll status</Label>
                    <select
                      className={nativeSelectClassName}
                      value={payrollStatus}
                      onChange={(event) => setPayrollStatus(event.target.value as StaffPayrollStatus)}
                    >
                      {STAFF_PAYROLL_STATUSES.map((status) => (
                        <option key={status} value={status}>{formatStaffPayrollStatus(status)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Pay code</Label>
                    <Input value={payCode} onChange={(event) => setPayCode(event.target.value)} placeholder="Teacher" />
                  </div>
                  <div className="space-y-1">
                    <Label>Payroll department</Label>
                    <Input value={payDepartment} onChange={(event) => setPayDepartment(event.target.value)} placeholder="Classroom or center" />
                  </div>
                  <div className="space-y-1">
                    <Label>Effective date</Label>
                    <Input type="date" value={payEffectiveDate} onChange={(event) => setPayEffectiveDate(event.target.value)} />
                  </div>
                  <label className="flex items-center gap-2 self-end rounded-lg border bg-card/50 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={overtimeEligible}
                      onChange={(event) => setOvertimeEligible(event.target.checked)}
                    />
                    <span>Overtime eligible</span>
                  </label>
                </div>
              </section>
            ) : null}
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
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={teacher.user.name} src={teacher.user.profilePhotoUrl} size="md" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{teacher.user.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{teacher.user.email}</div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{teacher.title || "Teacher"}</span>
                          <span>{teacher.classroom?.name ?? "No active classroom"}</span>
                        </div>
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
              <select
                className={nativeSelectClassName}
                value={certStaffId}
                onChange={(event) => setCertStaffId(event.target.value)}
              >
                {activeStaff.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{teacher.user.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Certification name</Label>
              <Input value={certName} onChange={(event) => setCertName(event.target.value)} placeholder="CPR / First Aid" required />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <select
                className={nativeSelectClassName}
                value={certStatus}
                onChange={(event) => setCertStatus(event.target.value)}
              >
                {certificationStatuses.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
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
              <select
                className={nativeSelectClassName}
                value={scheduleId}
                onChange={(event) => loadSchedule(event.target.value)}
              >
                <option value="new">New schedule</option>
                {schedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.staff.user.name} - {new Date(schedule.startsAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Teacher</Label>
              <select
                className={nativeSelectClassName}
                value={scheduleStaffId}
                onChange={(event) => setScheduleStaffId(event.target.value)}
              >
                {activeStaff.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{teacher.user.name}</option>
                ))}
              </select>
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
              <select
                className={nativeSelectClassName}
                value={scheduleStatus}
                onChange={(event) => setScheduleStatus(event.target.value)}
              >
                <option value="scheduled">Scheduled</option>
                <option value="confirmed">Confirmed</option>
                <option value="pto">PTO</option>
                <option value="unavailable">Unavailable</option>
                <option value="called_out">Called out</option>
                <option value="covered">Covered</option>
              </select>
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
