import type { Prisma } from "@prisma/client";

export const CURRENTLY_ENROLLED_STATUSES = ["enrolled", "active", "current"] as const;
export const ENROLLMENT_PIPELINE_STATUSES = ["pending", "waitlisted", "tour_scheduled"] as const;
export const TEMPORARY_BREAK_STATUSES = ["summer_break"] as const;
export const CLOSED_ENROLLMENT_STATUSES = [
  "withdrawn",
  "graduated",
  "inactive",
  "not_enrolled",
  "unenrolled",
  "terminated",
] as const;

const currentlyEnrolledStatusSet = new Set<string>(CURRENTLY_ENROLLED_STATUSES);
const enrollmentPipelineStatusSet = new Set<string>(ENROLLMENT_PIPELINE_STATUSES);
const temporaryBreakStatusSet = new Set<string>(TEMPORARY_BREAK_STATUSES);
const closedEnrollmentStatusSet = new Set<string>(CLOSED_ENROLLMENT_STATUSES);

export type EnrollmentLifecycleCategory =
  | "current"
  | "pending"
  | "waitlisted"
  | "tour_scheduled"
  | "summer_break"
  | "closed"
  | "needs_review";

export type EnrollmentLifecycleCounts = {
  total: number;
  current: number;
  pending: number;
  waitlisted: number;
  tourScheduled: number;
  summerBreak: number;
  closed: number;
  needsReview: number;
  other: number;
};

type EnrollmentStatusCountRow = {
  enrollmentStatus: string | null;
  _count: { _all: number };
};

export type CurrentEnrollmentChildRecord = {
  enrollmentStatus?: string | null;
  classroomId?: string | null;
};

export function normalizedEnrollmentStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

export function isCurrentlyEnrolledStatus(value: string | null | undefined) {
  return currentlyEnrolledStatusSet.has(normalizedEnrollmentStatus(value));
}

export function enrollmentLifecycleCategory(value: string | null | undefined): EnrollmentLifecycleCategory {
  const normalized = normalizedEnrollmentStatus(value);
  if (currentlyEnrolledStatusSet.has(normalized)) return "current";
  if (enrollmentPipelineStatusSet.has(normalized)) return normalized as "pending" | "waitlisted" | "tour_scheduled";
  if (temporaryBreakStatusSet.has(normalized)) return "summer_break";
  if (closedEnrollmentStatusSet.has(normalized)) return "closed";
  return "needs_review";
}

export function currentlyEnrolledStatusValues() {
  return [...CURRENTLY_ENROLLED_STATUSES];
}

export function closedEnrollmentStatusValues() {
  return [...CLOSED_ENROLLMENT_STATUSES];
}

export function hasAssignedClassroom(classroomId: string | null | undefined) {
  return Boolean(classroomId?.trim());
}

export function isCurrentlyEnrolledChildRecord(child: CurrentEnrollmentChildRecord) {
  return isCurrentlyEnrolledStatus(child.enrollmentStatus) && hasAssignedClassroom(child.classroomId);
}

export function currentlyEnrolledChildWhere(): Prisma.ChildWhereInput {
  return {
    enrollmentStatus: { in: currentlyEnrolledStatusValues() },
    classroomId: { not: null },
  };
}

export function closedEnrollmentChildWhere(): Prisma.ChildWhereInput {
  return { enrollmentStatus: { in: closedEnrollmentStatusValues() } };
}

export function summarizeEnrollmentLifecycleCounts(
  rows: readonly EnrollmentStatusCountRow[],
  currentlyEnrolledCount: number,
): EnrollmentLifecycleCounts {
  let pending = 0;
  let waitlisted = 0;
  let tourScheduled = 0;
  let summerBreak = 0;
  let closed = 0;
  let total = 0;

  for (const row of rows) {
    const count = Math.max(Number(row._count._all) || 0, 0);
    total += count;
    switch (enrollmentLifecycleCategory(row.enrollmentStatus)) {
      case "pending": pending += count; break;
      case "waitlisted": waitlisted += count; break;
      case "tour_scheduled": tourScheduled += count; break;
      case "summer_break": summerBreak += count; break;
      case "closed": closed += count; break;
      default: break;
    }
  }

  const current = Math.min(Math.max(currentlyEnrolledCount, 0), total);
  const other = Math.max(total - current, 0);
  const classifiedOther = pending + waitlisted + tourScheduled + summerBreak + closed;
  const needsReview = Math.max(other - classifiedOther, 0);

  return { total, current, pending, waitlisted, tourScheduled, summerBreak, closed, needsReview, other };
}
