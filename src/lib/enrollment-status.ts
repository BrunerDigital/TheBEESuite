const inactiveEnrollmentTokens = ["inactive", "withdrawn", "graduated", "lost", "not enrolled", "unenrolled"];

export function effectiveEnrollmentStatus(value: string | null | undefined, classroomId?: string | null) {
  if (classroomId) return "enrolled";
  return typeof value === "string" && value.trim() ? value.trim() : "enrolled";
}

export function activeEnrollmentStatus(value: string | null | undefined, classroomId?: string | null) {
  if (classroomId) return true;
  const status = String(value ?? "").toLowerCase();
  return !inactiveEnrollmentTokens.some((blocked) => status.includes(blocked));
}

export function activeEnrollmentWhere() {
  return {
    OR: [
      { classroomId: { not: null } },
      { enrollmentStatus: { notIn: ["withdrawn", "graduated", "inactive"] } },
    ],
  };
}
