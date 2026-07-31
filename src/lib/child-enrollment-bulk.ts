import { isCurrentlyEnrolledStatus, normalizedEnrollmentStatus } from "@/lib/enrollment-status";

export const BULK_ENROLLMENT_STATUSES = [
  "enrolled",
  "pending",
  "waitlisted",
  "tour_scheduled",
  "summer_break",
  "withdrawn",
  "graduated",
  "inactive",
] as const;

const allowedStatusSet = new Set<string>(BULK_ENROLLMENT_STATUSES);

export type BulkEnrollmentChange = {
  childIds: string[];
  enrollmentStatus: (typeof BULK_ENROLLMENT_STATUSES)[number];
  classroomId: string | null;
};

export function buildBulkEnrollmentChange(input: {
  childIds: unknown;
  enrollmentStatus: unknown;
  classroomId?: unknown;
}): { ok: true; value: BulkEnrollmentChange } | { ok: false; error: string } {
  const childIds = Array.isArray(input.childIds)
    ? [...new Set(input.childIds.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
    : [];
  if (!childIds.length) return { ok: false, error: "Select at least one child." };
  if (childIds.length > 500) return { ok: false, error: "Update no more than 500 children at a time." };

  const enrollmentStatus = normalizedEnrollmentStatus(
    typeof input.enrollmentStatus === "string" ? input.enrollmentStatus : "",
  );
  if (!allowedStatusSet.has(enrollmentStatus)) {
    return { ok: false, error: "Choose a supported enrollment status." };
  }

  const classroomId = typeof input.classroomId === "string" && input.classroomId.trim()
    ? input.classroomId.trim()
    : null;
  if (isCurrentlyEnrolledStatus(enrollmentStatus) && !classroomId) {
    return { ok: false, error: "Choose a classroom before moving children to enrolled." };
  }

  return {
    ok: true,
    value: {
      childIds,
      enrollmentStatus: enrollmentStatus as BulkEnrollmentChange["enrollmentStatus"],
      classroomId: isCurrentlyEnrolledStatus(enrollmentStatus) ? classroomId : null,
    },
  };
}
