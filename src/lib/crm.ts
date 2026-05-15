import { EnrollmentStage } from "@prisma/client";

export const enrollmentStages = [
  EnrollmentStage.NEW_INQUIRY,
  EnrollmentStage.CONTACTED,
  EnrollmentStage.TOUR_SCHEDULED,
  EnrollmentStage.TOUR_COMPLETED,
  EnrollmentStage.APPLICATION_SENT,
  EnrollmentStage.APPLICATION_STARTED,
  EnrollmentStage.APPLICATION_SUBMITTED,
  EnrollmentStage.DOCUMENTS_PENDING,
  EnrollmentStage.DEPOSIT_PENDING,
  EnrollmentStage.ENROLLED,
  EnrollmentStage.WAITLISTED,
  EnrollmentStage.LOST_NOT_A_FIT,
] as const;

export const stageLabels: Record<EnrollmentStage, string> = {
  NEW_INQUIRY: "New Inquiry",
  CONTACTED: "Contacted",
  TOUR_SCHEDULED: "Tour Scheduled",
  TOUR_COMPLETED: "Tour Completed",
  APPLICATION_SENT: "Application Sent",
  APPLICATION_STARTED: "Application Started",
  APPLICATION_SUBMITTED: "Application Submitted",
  DOCUMENTS_PENDING: "Documents Pending",
  DEPOSIT_PENDING: "Deposit Pending",
  ENROLLED: "Enrolled",
  WAITLISTED: "Waitlisted",
  LOST_NOT_A_FIT: "Lost / Not a Fit",
};

export function isEnrollmentStage(value: string): value is EnrollmentStage {
  return enrollmentStages.includes(value as EnrollmentStage);
}

export function normalizeLeadStage(value: string) {
  return isEnrollmentStage(value) ? value : EnrollmentStage.NEW_INQUIRY;
}

export function leadScore({
  email,
  phone,
  program,
  locationId,
}: {
  email?: string;
  phone?: string;
  program?: string;
  locationId?: string;
}) {
  let score = 45;
  if (email) score += 15;
  if (phone) score += 15;
  if (program === "Daycare" || program === "Preschool") score += 10;
  if (locationId) score += 10;
  return Math.min(score, 95);
}
