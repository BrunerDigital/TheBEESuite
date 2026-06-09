export type StripeConnectRequirementStatus =
  | "not_started"
  | "requirements_due"
  | "charges_pending"
  | "payouts_pending"
  | "ready";

export type StripeConnectReadiness = {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementFields: string[];
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
}): StripeConnectRequirementStatus {
  if (!input.accountId) return "not_started";
  if (input.chargesEnabled === true && input.payoutsEnabled === true) return "ready";
  if (input.requirementFields?.length) return "requirements_due";
  if (input.chargesEnabled !== true) return "charges_pending";
  if (input.payoutsEnabled !== true) return "payouts_pending";
  if (input.detailsSubmitted !== true) return "requirements_due";
  return "requirements_due";
}

export function stripeConnectStatusLabel(status: StripeConnectRequirementStatus) {
  if (status === "ready") return "Ready";
  if (status === "not_started") return "Needs setup";
  if (status === "charges_pending") return "Charges pending";
  if (status === "payouts_pending") return "Payouts pending";
  return "Requirements due";
}

export function stripeConnectReadinessFromFields(customFields: unknown): StripeConnectReadiness {
  const custom = fields(customFields);
  const accountId = readStripeConnectAccountId(custom);
  const requirementFields = uniqueStrings([
    ...stringArray(custom.stripePayoutRequirementFields),
    ...stringArray(custom.stripeRequirementFields),
  ]);
  const chargesEnabled = custom.stripeChargesEnabled === true;
  const payoutsEnabled = custom.stripePayoutsEnabled === true;
  const detailsSubmitted = custom.stripeDetailsSubmitted === true || (chargesEnabled && payoutsEnabled && requirementFields.length === 0);
  const status = deriveStripeConnectStatus({
    accountId,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementFields,
  });
  const label = stripeConnectStatusLabel(status);
  const blockingReason =
    status === "ready"
      ? null
      : status === "not_started"
        ? "This school needs Stripe payout onboarding before parent checkout can open."
        : requirementFields.length
          ? "Stripe still needs required payout account information."
          : status === "charges_pending"
            ? "Stripe has not enabled charges for this school account yet."
            : "Stripe has not enabled payouts for this school account yet.";

  return {
    accountId,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementFields,
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
}): StripeConnectReadiness {
  return stripeConnectReadinessFromFields({
    stripeConnectAccountId: account.id,
    stripeChargesEnabled: account.chargesEnabled,
    stripePayoutsEnabled: account.payoutsEnabled,
    stripeDetailsSubmitted: account.detailsSubmitted,
    stripePayoutRequirementFields: account.requirementFields,
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
    blockingReason = "Stripe platform keys are missing, so parent checkout is disabled.";
  } else if (!input.webhookConfigured) {
    canAcceptParentPayments = false;
    blockingReason = "Stripe webhook signing secret is missing, so payment reconciliation is disabled.";
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
    stripePayoutStatus: readiness.status,
    stripeConnectLastSyncedAt: new Date().toISOString(),
  };
}
