export type StripeConnectMigrationStatus =
  | "not_needed"
  | "prepared"
  | "onboarding_opened"
  | "requirements_due"
  // Legacy stored value from the original migration flow. Software billing is
  // no longer a payment-readiness or cutover requirement.
  | "balance_authorization_required"
  | "ready_for_cutover"
  | "cutover_complete";

export type StripeConnectMigrationSnapshot = {
  sourceAccountId: string | null;
  targetAccountId: string | null;
  status: StripeConnectMigrationStatus;
  sourcePayoutsHeld: boolean;
  targetPayoutsHeld: boolean;
  targetChargesEnabled: boolean;
  targetPayoutsEnabled: boolean;
  targetDetailsSubmitted: boolean;
  targetRequirementFields: string[];
  targetFeesCollector: "stripe" | "application" | null;
  targetLossesCollector: "stripe" | "application" | null;
  targetPayoutBankLast4: string | null;
  balanceAuthorized: boolean;
  cutoverAt: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function accountId(value: unknown) {
  const id = clean(value);
  return id.startsWith("acct_") ? id : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function collector(value: unknown): "stripe" | "application" | null {
  const normalized = clean(value);
  return normalized === "stripe" || normalized === "application" ? normalized : null;
}

export function readStripeConnectMigration(customFields: unknown): StripeConnectMigrationSnapshot {
  const fields = record(customFields);
  const sourceAccountId = accountId(fields.stripeConnectMigrationSourceAccountId);
  const targetAccountId = accountId(fields.stripeConnectMigrationTargetAccountId);
  const cutoverAt = clean(fields.stripeConnectMigrationCutoverAt) || null;
  const targetChargesEnabled = fields.stripeConnectMigrationTargetChargesEnabled === true;
  const targetPayoutsEnabled = fields.stripeConnectMigrationTargetPayoutsEnabled === true;
  const targetDetailsSubmitted = fields.stripeConnectMigrationTargetDetailsSubmitted === true;
  const targetRequirementFields = stringArray(fields.stripeConnectMigrationTargetRequirementFields);
  const targetFeesCollector = collector(fields.stripeConnectMigrationTargetFeesCollector);
  const targetLossesCollector = collector(fields.stripeConnectMigrationTargetLossesCollector);
  const targetPayoutBankLast4 = clean(fields.stripeConnectMigrationTargetPayoutBankLast4) || null;
  const balanceAuthorized = Boolean(clean(fields.stripeConnectMigrationBalanceApprovalAt));
  const storedStatus = clean(fields.stripeConnectMigrationStatus) as StripeConnectMigrationStatus;

  let status: StripeConnectMigrationStatus = "not_needed";
  if (cutoverAt) status = "cutover_complete";
  else if (targetAccountId) {
    const targetReady =
      targetChargesEnabled &&
      targetPayoutsEnabled &&
      targetDetailsSubmitted &&
      targetRequirementFields.length === 0 &&
      targetFeesCollector === "stripe" &&
      targetLossesCollector === "stripe" &&
      Boolean(targetPayoutBankLast4);
    if (!targetReady) {
      status = storedStatus === "onboarding_opened" ? "onboarding_opened" : targetRequirementFields.length ? "requirements_due" : "prepared";
    } else status = "ready_for_cutover";
  }

  return {
    sourceAccountId,
    targetAccountId,
    status,
    sourcePayoutsHeld: fields.stripeConnectMigrationSourcePayoutHoldStatus === "manual_confirmed",
    targetPayoutsHeld: fields.stripeConnectMigrationTargetPayoutHoldStatus === "manual_confirmed",
    targetChargesEnabled,
    targetPayoutsEnabled,
    targetDetailsSubmitted,
    targetRequirementFields,
    targetFeesCollector,
    targetLossesCollector,
    targetPayoutBankLast4,
    balanceAuthorized,
    cutoverAt,
  };
}

export function stripeConnectMigrationTargetIsReady(input: {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementFields: string[];
  feesCollector?: string | null;
  lossesCollector?: string | null;
  payoutBankLast4?: string | null;
}) {
  return input.chargesEnabled &&
    input.payoutsEnabled &&
    input.detailsSubmitted &&
    input.requirementFields.length === 0 &&
    input.feesCollector === "stripe" &&
    input.lossesCollector === "stripe" &&
    Boolean(clean(input.payoutBankLast4));
}

export function maskStripeAccountId(value: string | null) {
  if (!value) return "Not prepared";
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}
