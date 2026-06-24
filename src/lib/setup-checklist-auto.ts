import { directorLaunchChecklistTasks } from "@/lib/setup-checklists";

export type DirectorLaunchAutoCompletionInput = {
  centerCount?: number;
  schoolProfileReady?: boolean;
  classroomCount?: number;
  teacherStaffCount?: number;
  importedFamilyCount?: number;
  importedChildCount?: number;
  documentCount?: number;
  tuitionPlanCount?: number;
  productCount?: number;
  billingAccountCount?: number;
  invoiceCount?: number;
  payoutReady?: boolean;
  guardianLoginCount?: number;
  attendanceRecordCount?: number;
  staffClockRecordCount?: number;
  messageTemplateCount?: number;
  parentMessageCount?: number;
  calendarEventCount?: number;
  fteReportCount?: number;
  licensingReady?: boolean;
  complianceTaskCount?: number;
  incidentReviewCount?: number;
  leadCount?: number;
  dashboardConfigured?: boolean;
};

function positive(value: number | undefined) {
  return (value ?? 0) > 0;
}

function knownTaskIds() {
  return new Set(directorLaunchChecklistTasks.map((task) => task.id));
}

export function deriveDirectorLaunchAutoCompletedIds(input: DirectorLaunchAutoCompletionInput) {
  const ids = new Set<string>();
  const add = (id: string, ready: boolean) => {
    if (ready) ids.add(id);
  };

  add("login-school-profile", Boolean(input.schoolProfileReady) || positive(input.centerCount));
  add("classrooms-ratios", positive(input.classroomCount));
  add("teachers-staff", positive(input.teacherStaffCount));
  add("procare-import", positive(input.importedFamilyCount) && positive(input.importedChildCount));
  add("required-documents", positive(input.documentCount));
  add("tuition-billing-rules", positive(input.tuitionPlanCount) || positive(input.productCount) || positive(input.billingAccountCount) || positive(input.invoiceCount));
  add("payout-bank-account", Boolean(input.payoutReady));
  add("parent-portal", positive(input.guardianLoginCount));
  add("attendance-kiosk", positive(input.attendanceRecordCount) || positive(input.staffClockRecordCount));
  add("messages-notifications", positive(input.messageTemplateCount) || positive(input.parentMessageCount));
  add("calendar-fte", positive(input.calendarEventCount) || positive(input.fteReportCount));
  add("compliance-incidents", Boolean(input.licensingReady) || positive(input.complianceTaskCount) || positive(input.incidentReviewCount));
  add("enrollment-registration", positive(input.leadCount));
  add("reports-dashboard", Boolean(input.dashboardConfigured));

  const allowedIds = knownTaskIds();
  return Array.from(ids).filter((id) => allowedIds.has(id));
}

export function mergeSetupChecklistCompletedIds({
  manualCompletedIds,
  automaticCompletedIds,
}: {
  manualCompletedIds: string[];
  automaticCompletedIds: string[];
}) {
  return Array.from(new Set([...manualCompletedIds, ...automaticCompletedIds]));
}
