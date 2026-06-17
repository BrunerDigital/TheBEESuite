import type { Prisma } from "@prisma/client";

export const CURRENTLY_ENROLLED_STATUSES = ["enrolled", "active", "current"] as const;

const currentlyEnrolledStatusSet = new Set<string>(CURRENTLY_ENROLLED_STATUSES);

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

export function currentlyEnrolledStatusValues() {
  return [...CURRENTLY_ENROLLED_STATUSES];
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
