export type StripeConnectRequirementStatus =
  | "not_started"
  | "requirements_due"
  | "verification_pending"
  | "charges_pending"
  | "payouts_pending"
  | "ready";

export type StripeConnectReadiness = {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementFields: string[];
  pendingVerificationFields: string[];
  merchantCapabilityStatus: string | null;
  merchantPayoutCapabilityStatus: string | null;
  status: StripeConnectRequirementStatus;
  label: string;
  canAcceptParentPayments: boolean;
  lastSyncedAt: string | null;
  blockingReason: string | null;
};

export type StripeCheckoutReadiness = StripeConnectReadiness & {
  stripeConfigured: boolean;
  webhookConfigured: boolean;
  allowPlatformOnlyPayments: boolean;
};

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function readStripeConnectAccountId(customFields: unknown) {
  const custom = fields(customFields);
  const accountId = clean(custom.stripeConnectAccountId || custom.stripeConnectedAccountId);
  return accountId.startsWith("acct_") ? accountId : null;
}

export function deriveStripeConnectStatus(input: {
  accountId?: string | null;
  chargesEnabled?: boolean | null;
  payoutsEnabled?: boolean | null;
  detailsSubmitted?: boolean | null;
  requirementFields?: string[] | null;
  pendingVerificationFields?: string[] | null;
  merchantCapabilityStatus?: string | null;
  merchantPayoutCapabilityStatus?: string | null;
}): StripeConnectRequirementStatus {
  if (!input.accountId) return "not_started";
  if (input.requirementFields?.length) return "requirements_due";
  if (
    input.pendingVerificationFields?.length ||
    input.merchantCapabilityStatus === "pending" ||
    input.merchantPayoutCapabilityStatus === "pending"
  ) return "verification_pending";
  if (
    input.detailsSubmitted !== true &&
    input.merchantCapabilityStatus !== "active" &&
    input.merchantPayoutCapabilityStatus !== "active"
  ) return "requirements_due";
  if (input.chargesEnabled !== true) return "charges_pending";
  if (input.payoutsEnabled !== true) return "payouts_pending";
  return "ready";
}

export function stripeConnectStatusLabel(status: StripeConnectRequirementStatus) {
  if (status === "ready") return "Ready";
  if (status === "not_started") return "Needs setup";
  if (status === "verification_pending") return "Stripe review";
  if (status === "charges_pending") return "Charges pending";
  if (status === "payouts_pending") return "Payouts pending";
  return "Requirements due";
}

export function stripeConnectReadinessFromFields(customFields: unknown): StripeConnectReadiness {
  const custom = fields(customFields);
  const accountId = readStripeConnectAccountId(custom);
  const requirementFields = uniqueStrings([
    ...stringArray(custom.stripeCurrentlyDueRequirementFields),
    ...stringArray(custom.stripePayoutRequirementFields),
    ...stringArray(custom.stripeRequirementFields),
  ]);
  const pendingVerificationFields = uniqueStrings(stringArray(custom.stripePendingVerificationFields));
  const chargesEnabled = custom.stripeChargesEnabled === true;
  const payoutsEnabled = custom.stripePayoutsEnabled === true;
  const merchantCapabilityStatus = clean(custom.stripeMerchantCapabilityStatus) || null;
  const merchantPayoutCapabilityStatus = clean(custom.stripeMerchantPayoutCapabilityStatus) || null;
  const detailsSubmitted = custom.stripeDetailsSubmitted === true || (chargesEnabled && payoutsEnabled && requirementFields.length === 0);
  const status = deriveStripeConnectStatus({
    accountId,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementFields,
    pendingVerificationFields,
    merchantCapabilityStatus,
    merchantPayoutCapabilityStatus,
  });
  const label = stripeConnectStatusLabel(status);
  const blockingReason =
    status === "ready"
      ? null
      : status === "not_started"
        ? "This school needs secure payout onboarding before parent checkout can open."
        : requirementFields.length
          ? "The payment processor still needs required payout account information."
          : status === "verification_pending"
            ? "Stripe is reviewing the school's submitted information. No additional action is required unless Stripe requests it."
          : status === "charges_pending"
            ? "The payment processor has not enabled charges for this school account yet."
            : "The payment processor has not enabled payouts for this school account yet.";

  return {
    accountId,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementFields,
    pendingVerificationFields,
    merchantCapabilityStatus,
    merchantPayoutCapabilityStatus,
    status,
    label,
    canAcceptParentPayments: status === "ready",
    lastSyncedAt: clean(custom.stripeConnectLastSyncedAt) || null,
    blockingReason,
  };
}

export function stripeConnectReadinessFromSnapshot(account: {
  id: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementFields: string[];
  currentlyDueRequirementFields?: string[];
  pendingVerificationFields?: string[];
  merchantCapabilityStatus?: string | null;
  merchantPayoutCapabilityStatus?: string | null;
}): StripeConnectReadiness {
  return stripeConnectReadinessFromFields({
    stripeConnectAccountId: account.id,
    stripeChargesEnabled: account.chargesEnabled,
    stripePayoutsEnabled: account.payoutsEnabled,
    stripeDetailsSubmitted: account.detailsSubmitted,
    stripePayoutRequirementFields: account.currentlyDueRequirementFields ?? account.requirementFields,
    stripeCurrentlyDueRequirementFields: account.currentlyDueRequirementFields ?? account.requirementFields,
    stripePendingVerificationFields: account.pendingVerificationFields ?? [],
    stripeMerchantCapabilityStatus: account.merchantCapabilityStatus,
    stripeMerchantPayoutCapabilityStatus: account.merchantPayoutCapabilityStatus,
  });
}

export function stripeCheckoutReadiness(input: {
  customFields: unknown;
  stripeConfigured: boolean;
  webhookConfigured: boolean;
  allowPlatformOnlyPayments?: boolean;
}): StripeCheckoutReadiness {
  const connect = stripeConnectReadinessFromFields(input.customFields);
  const allowPlatformOnlyPayments = input.allowPlatformOnlyPayments === true;
  let canAcceptParentPayments = connect.canAcceptParentPayments;
  let blockingReason = connect.blockingReason;

  if (!input.stripeConfigured) {
    canAcceptParentPayments = false;
    blockingReason = "Payment processor keys are missing, so parent checkout is disabled.";
  } else if (!input.webhookConfigured) {
    canAcceptParentPayments = false;
    blockingReason = "The payment processor webhook signing secret is missing, so payment reconciliation is disabled.";
  } else if (allowPlatformOnlyPayments && !connect.accountId) {
    canAcceptParentPayments = true;
    blockingReason = null;
  }

  return {
    ...connect,
    stripeConfigured: input.stripeConfigured,
    webhookConfigured: input.webhookConfigured,
    allowPlatformOnlyPayments,
    canAcceptParentPayments,
    blockingReason,
  };
}

export function stripeConnectCustomFieldPatch(readiness: StripeConnectReadiness) {
  return {
    stripeConnectAccountId: readiness.accountId,
    stripeChargesEnabled: readiness.chargesEnabled,
    stripePayoutsEnabled: readiness.payoutsEnabled,
    stripeDetailsSubmitted: readiness.detailsSubmitted,
    stripePayoutRequirementFields: readiness.requirementFields,
    stripeCurrentlyDueRequirementFields: readiness.requirementFields,
    stripePendingVerificationFields: readiness.pendingVerificationFields,
    stripeMerchantCapabilityStatus: readiness.merchantCapabilityStatus,
    stripeMerchantPayoutCapabilityStatus: readiness.merchantPayoutCapabilityStatus,
    stripePayoutStatus: readiness.status,
    stripeConnectLastSyncedAt: new Date().toISOString(),
  };
}
