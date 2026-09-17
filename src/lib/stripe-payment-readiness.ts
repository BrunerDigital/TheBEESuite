import {
  stripeCheckoutReadiness,
  type StripeCheckoutReadiness,
} from "@/lib/stripe-connect-readiness";
import { stripeSchoolReadinessFlowFromFields } from "@/lib/stripe-school-readiness-flow";

/**
 * The UI and payment APIs must agree on whether a school can accept a payment.
 * Connect/env readiness alone is not enough: the school must also have a
 * confirmed payout bank and an explicit billing activation.
 */
export function stripePaymentReadiness(input: {
  customFields: unknown;
  centerName?: string | null;
  stripeConfigured: boolean;
  webhookConfigured: boolean;
  allowPlatformOnlyPayments?: boolean;
}): StripeCheckoutReadiness {
  const checkout = stripeCheckoutReadiness(input);
  const school = stripeSchoolReadinessFlowFromFields({
    customFields: input.customFields,
    centerName: input.centerName,
  });
  const canAcceptParentPayments = checkout.canAcceptParentPayments && school.canAcceptParentPayments;

  return {
    ...checkout,
    label: checkout.canAcceptParentPayments ? school.label : checkout.label,
    canAcceptParentPayments,
    blockingReason: checkout.canAcceptParentPayments
      ? school.canAcceptParentPayments ? null : school.explanation
      : checkout.blockingReason,
  };
}
