export type StaffCoverageClassroom = {
  id: string;
  centerId: string;
  name: string;
  ageGroup: string;
};

export type StaffCoverageTeacher = {
  id: string;
  centerId: string;
  classroomId: string | null;
  user: { name: string; isActive?: boolean };
};

export type StaffCoverageSchedule = {
  id: string;
  startsAt: Date | string;
  status: string;
  staff: { id: string };
};

export type ClassroomCoverageSummary = {
  classroomId: string;
  classroomName: string;
  ageGroup: string;
  assignedTeachers: number;
  upcomingSchedules: number;
  activeSchedules: number;
  warning: "none" | "no_teacher_assigned" | "no_upcoming_coverage";
};

export type WeeklyScheduleRequest = {
  staffId: string;
  startsAt: Date;
  endsAt: Date;
};

const weekdayIndexes = new Set([0, 1, 2, 3, 4, 5, 6]);

function dateOnly(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function combineDateAndTime(date: Date, time: string) {
  return new Date(`${dateOnly(date)}T${time}`);
}

export function normalizeWeekdayIndexes(values: unknown) {
  const raw = Array.isArray(values) ? values : [];
  const normalized = raw
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && weekdayIndexes.has(value));
  return [...new Set(normalized)].sort((left, right) => left - right);
}

export function weekDateForDay(weekStartsAt: Date, weekday: number) {
  const start = new Date(weekStartsAt);
  start.setHours(0, 0, 0, 0);
  const delta = weekday - start.getDay();
  start.setDate(start.getDate() + delta);
  return start;
}

export function buildWeeklyStaffScheduleRequests(input: {
  staffIds: string[];
  weekStartsAt: Date;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
}) {
  const staffIds = [...new Set(input.staffIds.filter(Boolean))];
  const daysOfWeek = normalizeWeekdayIndexes(input.daysOfWeek);
  const requests: WeeklyScheduleRequest[] = [];

  if (!staffIds.length || !daysOfWeek.length || !input.startTime || !input.endTime) return requests;

  for (const staffId of staffIds) {
    for (const weekday of daysOfWeek) {
      const day = weekDateForDay(input.weekStartsAt, weekday);
      const startsAt = combineDateAndTime(day, input.startTime);
      const endsAt = combineDateAndTime(day, input.endTime);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) continue;
      requests.push({ staffId, startsAt, endsAt });
    }
  }

  return requests;
}

export function summarizeClassroomCoverage(input: {
  classrooms: StaffCoverageClassroom[];
  staff: StaffCoverageTeacher[];
  schedules: StaffCoverageSchedule[];
}): ClassroomCoverageSummary[] {
  return input.classrooms.map((classroom) => {
    const assignedStaffIds = new Set(
      input.staff
        .filter((teacher) => teacher.centerId === classroom.centerId && teacher.classroomId === classroom.id && teacher.user.isActive !== false)
        .map((teacher) => teacher.id),
    );
    const upcomingSchedules = input.schedules.filter((schedule) => assignedStaffIds.has(schedule.staff.id));
    const activeSchedules = upcomingSchedules.filter((schedule) => !["pto", "unavailable", "called_out"].includes(schedule.status)).length;
    const warning = assignedStaffIds.size === 0
      ? "no_teacher_assigned"
      : activeSchedules === 0
        ? "no_upcoming_coverage"
        : "none";

    return {
      classroomId: classroom.id,
      classroomName: classroom.name,
      ageGroup: classroom.ageGroup,
      assignedTeachers: assignedStaffIds.size,
      upcomingSchedules: upcomingSchedules.length,
      activeSchedules,
      warning,
    };
  });
}
