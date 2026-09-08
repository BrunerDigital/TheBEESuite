import {
  isCurrentlyEnrolledChildRecord,
  isEnrollmentPipelineStatus,
  type CurrentEnrollmentChildRecord,
} from "@/lib/enrollment-status";

export type BillingFamilyAccountCategory = "current" | "prospective" | "past";
export type SingleInvoiceChargeSource = "tuitionPlan" | "product" | "custom";

export function billingFamilyAccountCategory(
  children: readonly CurrentEnrollmentChildRecord[],
): BillingFamilyAccountCategory {
  if (children.some(isCurrentlyEnrolledChildRecord)) return "current";
  if (children.some((child) => isEnrollmentPipelineStatus(child.enrollmentStatus))) return "prospective";
  return "past";
}

export function singleInvoiceFamilyEligibilityError(
  category: BillingFamilyAccountCategory,
  chargeSource: SingleInvoiceChargeSource,
) {
  if (category === "past") {
    return "New invoices are unavailable for a past family account. Existing balances and invoices remain available for payment.";
  }
  if (category === "prospective" && chargeSource === "tuitionPlan") {
    return "Recurring tuition is unavailable while every child is pending or waitlisted. Use a one-time product/fee or custom enrollment charge instead.";
  }
  return null;
}

export function childTuitionEligibilityError(child: CurrentEnrollmentChildRecord) {
  return isCurrentlyEnrolledChildRecord(child)
    ? null
    : "Recurring tuition requires a current enrollment and an assigned classroom. Keep prospective children pending or waitlisted and use a one-time enrollment fee invoice instead.";
}
