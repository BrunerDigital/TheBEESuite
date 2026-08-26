import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import {
  stripeConnectReadinessFromFields,
  type StripeConnectReadiness,
} from "@/lib/stripe-connect-readiness";

export type StripeSchoolReadinessStage =
  | "not_started"
  | "requirements_due"
  | "verification_pending"
  | "charges_pending"
  | "payouts_pending"
  | "payout_bank_required"
  | "activation_required"
  | "ready";

export type StripeSchoolReadinessFlow = {
  stage: StripeSchoolReadinessStage;
  label: string;
  actionLabel: string;
  explanation: string;
  connect: StripeConnectReadiness;
  payoutBankConfirmed: boolean;
  billingApproved: boolean;
  livePaymentsEnabled: boolean;
  tuitionBillingEnabled: boolean;
  canAcceptParentPayments: boolean;
};

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function stripeSchoolReadinessFlowFromFields(input: {
  customFields: unknown;
  centerName?: string | null;
}): StripeSchoolReadinessFlow {
  const custom = fields(input.customFields);
  const connect = stripeConnectReadinessFromFields(custom);
  const payoutBankConfirmed = Boolean(
    clean(custom.stripePayoutBankLast4) && custom.stripePayoutBankDefaultConfirmed === true,
  );
  const billingApproved = stripeSchoolBillingApproval({
    customFields: custom,
    centerName: input.centerName,
  }).approved;
  const livePaymentsEnabled = custom.livePaymentsEnabled === true;
  const tuitionBillingEnabled = custom.tuitionBillingEnabled === true;

  let stage: StripeSchoolReadinessStage = connect.status;
  let label = connect.label;
  let actionLabel = connect.accountId ? "Continue Stripe setup" : "Start Stripe setup";
  let explanation = connect.blockingReason || "Stripe setup is ready.";

  if (connect.status === "ready" && !payoutBankConfirmed) {
    stage = "payout_bank_required";
    label = "Payout bank needed";
    actionLabel = "Connect payout bank";
    explanation = "Choose and confirm this school's default payout bank before live parent billing can open.";
  } else if (
    connect.status === "ready" &&
    payoutBankConfirmed &&
    (!billingApproved || !livePaymentsEnabled || !tuitionBillingEnabled)
  ) {
    stage = "activation_required";
    label = "Activation needed";
    actionLabel = "Activate parent payments";
    explanation = "Stripe and the payout bank are ready. An authorized billing administrator must complete the final BEE Suite activation.";
  } else if (
    connect.status === "ready" &&
    payoutBankConfirmed &&
    billingApproved &&
    livePaymentsEnabled &&
    tuitionBillingEnabled
  ) {
    stage = "ready";
    label = "Payments live";
    actionLabel = "Review Stripe status";
    explanation = "Parents can pay tuition and this school's proceeds are routed to its confirmed payout account.";
  }

  return {
    stage,
    label,
    actionLabel,
    explanation,
    connect,
    payoutBankConfirmed,
    billingApproved,
    livePaymentsEnabled,
    tuitionBillingEnabled,
    canAcceptParentPayments: stage === "ready",
  };
}
