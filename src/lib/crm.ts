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

export function parseLeadStage(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return isEnrollmentStage(normalized) ? normalized : null;
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

export function stageNurtureTask(stage: EnrollmentStage, familyName: string) {
  const family = familyName.trim() || "family";
  const tasks: Partial<Record<EnrollmentStage, string>> = {
    [EnrollmentStage.NEW_INQUIRY]: `Call ${family} within 1 business day`,
    [EnrollmentStage.CONTACTED]: `Confirm program fit and preferred tour windows for ${family}`,
    [EnrollmentStage.TOUR_SCHEDULED]: `Prepare tour packet and classroom availability for ${family}`,
    [EnrollmentStage.TOUR_COMPLETED]: `Send post-tour follow-up to ${family}`,
    [EnrollmentStage.APPLICATION_SENT]: `Check application progress for ${family}`,
    [EnrollmentStage.APPLICATION_STARTED]: `Offer application help to ${family}`,
    [EnrollmentStage.APPLICATION_SUBMITTED]: `Review submitted application for ${family}`,
    [EnrollmentStage.DOCUMENTS_PENDING]: `Request missing documents from ${family}`,
    [EnrollmentStage.DEPOSIT_PENDING]: `Confirm deposit next step with ${family}`,
    [EnrollmentStage.ENROLLED]: `Prepare welcome and first-day checklist for ${family}`,
    [EnrollmentStage.WAITLISTED]: `Send waitlist status update to ${family}`,
    [EnrollmentStage.LOST_NOT_A_FIT]: `Archive reason and close loop for ${family}`,
  };

  return tasks[stage] ?? null;
}
