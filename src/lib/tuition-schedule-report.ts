import { normalizeBillingCadence, tuitionInvoiceWeekCount } from "@/lib/billing-workflows";
import { isCurrentlyEnrolledStatus } from "@/lib/enrollment-status";
import {
  normalizeTuitionAdditionalCharges, normalizeTuitionCredits,
  totalTuitionAdditionalChargesCents, totalTuitionCreditsCents,
} from "@/lib/tuition-credits";

export type TuitionScheduleRow = {
  childId: string;
  centerId: string;
  centerLabel: string;
  familyId: string;
  familyName: string;
  childName: string;
  classroomName: string;
  rateCents: number | null;
  rateUnit: "week" | "month" | null;
  frequency: string;
  invoiceCents: number | null;
  status: "Enabled" | "Disabled" | "Not assigned" | "Needs review" | "$0 family tuition";
};

export type TuitionScheduleChild = {
  id: string;
  fullName: string;
  enrollmentStatus: string;
  startDate: Date | null;
  customFields: unknown;
  family: { id: string; name: string; centerId: string | null };
  classroom: { name: string; centerId: string } | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cents(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function savedCadence(value: unknown) {
  const normalized = text(value).toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (!/^(weekly|monthly|biweekly|bi_weekly|every_2_weeks|2_weeks?|four_weeks?|4_weeks?|every_4_weeks)$/.test(normalized)) return null;
  return normalizeBillingCadence(normalized);
}

const frequencyLabels = { weekly: "Weekly", biweekly: "Biweekly (every 2 weeks)", four_week: "Every 4 weeks", monthly: "Monthly" };

/** A current roster snapshot, independent of invoices, balances and activity dates. */
export function buildTuitionScheduleRows(
  children: TuitionScheduleChild[],
  centers: Map<string, { label: string }>,
  now = new Date(),
): TuitionScheduleRow[] {
  return children.flatMap((child): TuitionScheduleRow[] => {
    const centerId = child.family.centerId;
    const center = centerId ? centers.get(centerId) : null;
    if (!centerId || !center || !isCurrentlyEnrolledStatus(child.enrollmentStatus)
      || (child.startDate && child.startDate > now)
      || (child.classroom && child.classroom.centerId !== centerId)) return [];
    const fields = child.customFields && typeof child.customFields === "object" && !Array.isArray(child.customFields)
      ? child.customFields as Record<string, unknown> : {};
    const gross = cents(fields.tuitionPlanAmountCents);
    const assigned = Boolean(text(fields.tuitionPlanId)) && gross !== null;
    const cadence = savedCadence(fields.tuitionBillingCadence ?? fields.tuitionPlanCadence);
    const calculatedNet = gross === null ? null : gross
      + totalTuitionAdditionalChargesCents(normalizeTuitionAdditionalCharges(fields.tuitionAdditionalCharges))
      - totalTuitionCreditsCents(normalizeTuitionCredits(fields.tuitionCredits));
    const savedNet = cents(fields.tuitionNetAmountCents);
    const rateCents = assigned ? savedNet ?? (calculatedNet !== null && calculatedNet >= 0 ? calculatedNet : null) : null;
    const inconsistentNet = savedNet !== null && calculatedNet !== null && savedNet !== calculatedNet;
    const needsReview = !child.classroom || !cadence || rateCents === null || inconsistentNet
      || (gross !== null && gross > 0 && rateCents === 0);
    const status = !assigned ? "Not assigned"
      : needsReview ? "Needs review"
      : fields.tuitionBillingEnabled !== true ? "Disabled"
      : rateCents === 0 ? "$0 family tuition" : "Enabled";
    return [{
      childId: child.id, centerId, centerLabel: center.label,
      familyId: child.family.id, familyName: child.family.name,
      childName: child.fullName, classroomName: child.classroom?.name || "Not assigned",
      rateCents, rateUnit: cadence ? cadence === "monthly" ? "month" : "week" : null,
      frequency: cadence ? frequencyLabels[cadence] : "Not assigned",
      invoiceCents: rateCents !== null && cadence && !needsReview ? rateCents * tuitionInvoiceWeekCount(cadence) : null,
      status,
    }];
  }).sort((a, b) => a.centerLabel.localeCompare(b.centerLabel)
    || a.familyName.localeCompare(b.familyName) || a.familyId.localeCompare(b.familyId)
    || a.childName.localeCompare(b.childName) || a.childId.localeCompare(b.childId));
}

export function filterTuitionScheduleRows(rows: TuitionScheduleRow[], query: string) {
  const needle = query.trim().toLowerCase();
  return rows.filter(row => !needle || [row.centerLabel, row.familyName, row.childName, row.classroomName, row.frequency, row.status]
    .some(value => value.toLowerCase().includes(needle)));
}

export function tuitionScheduleMoney(value: number | null) {
  return value === null ? "Not assigned" : `$${(value / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function tuitionScheduleRate(row: TuitionScheduleRow) {
  return `${tuitionScheduleMoney(row.rateCents)}${row.rateCents !== null && row.rateUnit ? `/${row.rateUnit}` : ""}`;
}

export const TUITION_SCHEDULE_HEADERS = ["School", "Family", "Child", "Classroom", "Saved net rate", "Billing frequency", "Tuition per cycle", "Assignment status"];

export function tuitionScheduleCells(row: TuitionScheduleRow) {
  return [row.centerLabel, row.familyName, row.childName, row.classroomName, tuitionScheduleRate(row), row.frequency,
    row.invoiceCents === null ? row.status === "Not assigned" ? "Not assigned" : "Needs review" : tuitionScheduleMoney(row.invoiceCents), row.status];
}
