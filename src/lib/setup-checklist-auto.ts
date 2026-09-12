import { directorLaunchChecklistTasks } from "@/lib/setup-checklists";

export type DirectorLaunchAutoCompletionInput = {
  schoolProfileReady?: boolean;
  classroomsReady?: boolean;
  staffReady?: boolean;
  schoolDataReady?: boolean;
  documentsReady?: boolean;
  tuitionBillingReady?: boolean;
  payoutReady?: boolean;
  parentPortalReady?: boolean;
  attendanceReady?: boolean;
  communicationsReady?: boolean;
  calendarFteReady?: boolean;
  complianceReady?: boolean;
  enrollmentReady?: boolean;
  reportsReady?: boolean;
  launchSmokeTestReady?: boolean;
};

function knownTaskIds() {
  return new Set(directorLaunchChecklistTasks.map((task) => task.id));
}

export function deriveDirectorLaunchAutoCompletedIds(input: DirectorLaunchAutoCompletionInput) {
  const ids = new Set<string>();
  const add = (id: string, ready: boolean) => {
    if (ready) ids.add(id);
  };

  add("login-school-profile", Boolean(input.schoolProfileReady));
  add("classrooms-ratios", Boolean(input.classroomsReady));
  add("teachers-staff", Boolean(input.staffReady));
  add("procare-import", Boolean(input.schoolDataReady));
  add("required-documents", Boolean(input.documentsReady));
  add("tuition-billing-rules", Boolean(input.tuitionBillingReady));
  add("payout-bank-account", Boolean(input.payoutReady));
  add("parent-portal", Boolean(input.parentPortalReady));
  add("attendance-kiosk", Boolean(input.attendanceReady));
  add("messages-notifications", Boolean(input.communicationsReady));
  add("calendar-fte", Boolean(input.calendarFteReady));
  add("compliance-incidents", Boolean(input.complianceReady));
  add("enrollment-registration", Boolean(input.enrollmentReady));
  add("reports-dashboard", Boolean(input.reportsReady));
  add("launch-smoke-test", Boolean(input.launchSmokeTestReady));

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
