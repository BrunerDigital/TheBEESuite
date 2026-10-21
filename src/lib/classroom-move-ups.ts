export type MoveUpProgram = "six_month" | "year_long" | "other" | "unmapped";

const sixMonthGroups = new Set([
  "toddler",
  "toddlers",
  "one",
  "ones",
  "oneyearold",
  "oneyearolds",
  "1",
  "1s",
  "1yo",
  "1yearold",
  "1yearolds",
  "two",
  "twos",
  "twoyearold",
  "twoyearolds",
  "2",
  "2s",
  "2yo",
  "2yr",
  "2yrs",
  "2year",
  "2years",
  "2yrold",
  "2yrolds",
  "2yearold",
  "2yearolds",
]);
const yearLongGroups = new Set([
  "preschool",
  "prek",
  "prekindergarten",
  "three",
  "threes",
  "threeyearold",
  "threeyearolds",
  "3",
  "3s",
  "3yo",
  "3yr",
  "3yrs",
  "3year",
  "3years",
  "3yrold",
  "3yrolds",
  "3yearold",
  "3yearolds",
  "four",
  "fours",
  "fouryearold",
  "fouryearolds",
  "4",
  "4s",
  "4yo",
  "4yearold",
  "4yearolds",
]);
const otherGroups = new Set([
  "infant",
  "infants",
  "baby",
  "babies",
  "schoolage",
  "schoolaged",
  "schoolagedchildren",
  "afterschool",
]);

export function moveUpProgram(ageGroup: string): MoveUpProgram {
  // Age group served is the persisted program mapping, independent of room name.
  // Unknown imported labels stay visible for setup instead of guessing from a
  // themed name, a room number, or the current ages of its students.
  const value = ageGroup.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (yearLongGroups.has(value)) return "year_long";
  if (sixMonthGroups.has(value)) return "six_month";
  if (otherGroups.has(value)) return "other";
  return "unmapped";
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
            : program === "unmapped"
              ? "Set classroom age group"
              : program === "other"
                ? "Outside six-month program"
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
