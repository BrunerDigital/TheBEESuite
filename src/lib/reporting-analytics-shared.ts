export const REPORT_KINDS = ["enrollment_status", "lead_funnel", "attendance", "billing", "messages", "staff_hours"] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export function isReportKind(value: string): value is ReportKind {
  return REPORT_KINDS.includes(value as ReportKind);
}

export const REPORT_DEFINITIONS: Record<ReportKind, { source: string; definition: string }> = {
  enrollment_status: { source: "BEE Suite child and classroom records", definition: "Current enrolled children with an assigned classroom and a start date on or before the report end date. Age is calculated as of the report end date and limited to 0-120 months; records with a missing imported DOB remain visible for review. This is the current roster, not a historical reconstruction." },
  lead_funnel: { source: "BEE Suite CRM records", definition: "Leads created in the selected range; conversion is the share whose current stage is Enrolled." },
  attendance: { source: "Attendance records and check-in/out logs", definition: "Present and absent statuses dated in the selected range; check-in/out counts are event totals." },
  billing: { source: "BEE Suite invoices and payments", definition: "Invoice activity selected by creation or due date; paid totals are successful payments paid in range. Open and overdue are not an all-time as-of AR balance." },
  messages: { source: "BEE Suite family message threads", definition: "Parent messages created in range; response time uses the next non-parent reply in the same thread." },
  staff_hours: { source: "Teacher time-clock history", definition: "Closed shifts plus elapsed open-shift time intersecting the selected center-local service-day range." },
};
