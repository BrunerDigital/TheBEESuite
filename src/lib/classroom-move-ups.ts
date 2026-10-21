export type MoveUpProgram = "six_month" | "year_long" | "other";

export function moveUpProgram(ageGroup: string): MoveUpProgram {
  const value = ageGroup.toLowerCase().replace(/[’']/g, "");
  if (/pre[\s-]?k|preschool|three|\b3(?:s|\b)|four|\b4(?:s|\b)/.test(value))
    return "year_long";
  if (/toddler|two|\b2(?:s|\b)|\b1(?:s|\b)/.test(value)) return "six_month";
  return "other";
}

function addMonthsClamped(date: Date, months: number) {
  const first = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 12),
  );
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), last));
  return first;
}

export type MoveUpChild = {
  id: string;
  fullName: string;
  dateOfBirth: Date;
  customFields?: unknown;
  classroomId: string | null;
  classroom: { name: string; ageGroup: string; centerId: string } | null;
};

export function buildMoveUpRows(children: MoveUpChild[], today: string) {
  const asOf = new Date(`${today}T12:00:00Z`);
  return children
    .map((child) => {
      const program = moveUpProgram(child.classroom?.ageGroup ?? "");
      const dob = child.dateOfBirth;
      const fields =
        child.customFields &&
        typeof child.customFields === "object" &&
        !Array.isArray(child.customFields)
          ? (child.customFields as Record<string, unknown>)
          : {};
      const validDob =
        Number.isFinite(dob.getTime()) &&
        dob <= asOf &&
        dob.getUTCFullYear() > 1900 &&
        fields.dateOfBirthMissing !== true;
      const calendarMonths =
        (asOf.getUTCFullYear() - dob.getUTCFullYear()) * 12 +
        asOf.getUTCMonth() -
        dob.getUTCMonth();
      const ageMonths = validDob
        ? Math.max(
            0,
            calendarMonths -
              Number(addMonthsClamped(dob, calendarMonths) > asOf),
          )
        : null;
      const twoYearRoom = /two|\b2(?:s|\b)/.test(
        (child.classroom?.ageGroup ?? "").toLowerCase().replace(/[’']/g, ""),
      );
      const milestones = twoYearRoom ? [30, 36] : [18, 24];
      const milestone =
        milestones.find((month) => addMonthsClamped(dob, month) >= asOf) ??
        milestones[milestones.length - 1];
      const due =
        program === "six_month" && validDob
          ? addMonthsClamped(dob, milestone)
          : null;
      const previousMilestone =
        validDob && program === "six_month"
          ? milestones
              .filter((month) => addMonthsClamped(dob, month) < asOf)
              .at(-1)
          : undefined;
      const daysUntil = due
        ? Math.round((due.getTime() - asOf.getTime()) / 86_400_000)
        : null;
      return {
        id: child.id,
        name: child.fullName,
        centerId: child.classroom?.centerId ?? "",
        classroomId: child.classroomId,
        classroom: child.classroom?.name ?? "Unassigned",
        ageGroup: child.classroom?.ageGroup ?? "",
        ageMonths,
        program,
        milestone: due ? milestone : null,
        previousMilestoneDate: previousMilestone
          ? addMonthsClamped(dob, previousMilestone).toISOString().slice(0, 10)
          : null,
        dueDate: due?.toISOString().slice(0, 10) ?? null,
        daysUntil,
        status: !validDob
          ? "Check birth date"
          : program === "year_long"
            ? "Year-long program"
            : program === "other"
              ? "Review program"
              : daysUntil! < 0
                ? "Overdue review"
                : daysUntil === 0
                  ? "Review today"
                  : daysUntil! <= 30
                    ? "Due within 30 days"
                    : "Upcoming",
      };
    })
    .sort(
      (a, b) =>
        (a.daysUntil ?? Infinity) - (b.daysUntil ?? Infinity) ||
        a.name.localeCompare(b.name),
    );
}

export type MoveUpRow = ReturnType<typeof buildMoveUpRows>[number];
