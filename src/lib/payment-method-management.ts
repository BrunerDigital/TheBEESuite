import { stripeConnectSavedMethodNeedsReauthorization } from "@/lib/stripe-connect-migration";

export type PaymentMethodManagementSummary = {
  autopayEnabled: boolean;
  autopayStatus: "enabled" | "disabled" | "pending";
  bankVerificationPending: boolean;
  paymentMethodReauthorizationRequired: boolean;
  hasStripeCustomer: boolean;
  hasSavedPaymentMethod: boolean;
  stripeCustomerId: string | null;
  stripeDefaultPaymentMethodId: string | null;
  paymentMethodType: string | null;
  paymentMethodLabel: string | null;
  lastUpdatedAt: string | null;
};

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function displayBrand(value: string | null) {
  if (!value) return null;
  if (value.toLowerCase() === "amex") return "American Express";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function paymentMethodLabel(input: {
  type: string | null;
  last4: string | null;
  brand: string | null;
  bankName: string | null;
}) {
  if (!input.last4) return null;
  if (input.type === "us_bank_account") {
    return `${input.bankName || "Bank account"} ending ${input.last4}`;
  }
  if (input.type === "card") {
    return `${displayBrand(input.brand) || "Card"} ending ${input.last4}`;
  }
  return `Saved method ending ${input.last4}`;
}

export function paymentMethodManagementSummary(input: {
  autopayPlaceholder?: boolean | null;
  customFields: unknown;
  activeConnectedAccountId?: string | null;
  centerCustomFields?: unknown;
}): PaymentMethodManagementSummary {
  const custom = fields(input.customFields);
  const stripeCustomerId = clean(custom.stripeCustomerId);
  const stripeDefaultPaymentMethodId = clean(custom.stripeDefaultPaymentMethodId);
  const paymentMethodType = clean(custom.stripePaymentMethodType);
  const paymentMethodLast4 = clean(custom.stripePaymentMethodLast4);
  const savedAt = clean(custom.stripePaymentMethodSavedAt);
  const status = clean(custom.autopayStatus);
  const paymentMethodReauthorizationRequired = stripeConnectSavedMethodNeedsReauthorization({
    activeAccountId: input.activeConnectedAccountId,
    savedMethodAccountId: clean(custom.stripeDefaultPaymentMethodConnectedAccountId),
    centerCustomFields: input.centerCustomFields,
  });
  const enabled = (custom.autopayEnabled === true || input.autopayPlaceholder === true)
    && !paymentMethodReauthorizationRequired;
  const setupExplicitlyExpired = clean(custom.paymentMethodManagementStatus) === "setup_session_expired";
  const pending = status === "pending" && !setupExplicitlyExpired;
  const bankVerificationPending = custom.stripeBankVerificationPending === true;

  return {
    autopayEnabled: enabled,
    autopayStatus: enabled ? "enabled" : pending ? "pending" : "disabled",
    bankVerificationPending,
    paymentMethodReauthorizationRequired,
    hasStripeCustomer: Boolean(stripeCustomerId),
    hasSavedPaymentMethod: Boolean(stripeDefaultPaymentMethodId),
    stripeCustomerId,
    stripeDefaultPaymentMethodId,
    paymentMethodType,
    paymentMethodLabel: paymentMethodLabel({
      type: paymentMethodType,
      last4: paymentMethodLast4,
      brand: clean(custom.stripePaymentMethodBrand),
      bankName: clean(custom.stripePaymentMethodBankName),
    }),
    lastUpdatedAt: savedAt ?? clean(custom.autopayUpdatedAt),
  };
}

export function paymentMethodSetupExpirationPatch(input: {
  currentFields: unknown;
  sessionId: string;
  stripeEventId: string;
}): { autopayPlaceholder: boolean; customFields: Record<string, unknown> } {
  const current = fields(input.currentFields);
  const savedPaymentMethodId = clean(current.stripeDefaultPaymentMethodId);
  const hasSavedPaymentMethod = Boolean(savedPaymentMethodId);
  const autopayEnabled = current.autopayEnabled === true;

  if (hasSavedPaymentMethod) {
    return {
      autopayPlaceholder: autopayEnabled,
      customFields: {
        ...current,
        stripeExpiredSetupCheckoutSessionId: input.sessionId,
        stripeEventId: input.stripeEventId,
        autopayEnabled,
        autopayStatus: autopayEnabled ? "enabled" : "disabled",
        paymentMethodManagementStatus: "payment_method_saved",
      },
    };
  }

  return {
    autopayPlaceholder: false,
    customFields: {
      ...current,
      stripeSetupCheckoutSessionId: input.sessionId,
      stripeEventId: input.stripeEventId,
      paymentMethodManagementStatus: "setup_session_expired",
      autopayEnabled: false,
      autopayStatus: "disabled",
    },
  };
}

export function paymentMethodAutopayCategory(summary: Pick<PaymentMethodManagementSummary, "paymentMethodType">) {
  if (summary.paymentMethodType === "card") return "card" as const;
  if (summary.paymentMethodType === "us_bank_account") return "ach" as const;
  return "default" as const;
}

export function canChargeSavedPaymentMethod(summary: Pick<PaymentMethodManagementSummary, "hasStripeCustomer" | "hasSavedPaymentMethod">) {
  return summary.hasStripeCustomer && summary.hasSavedPaymentMethod;
}

export function canRunAutopay(
  summary: Pick<PaymentMethodManagementSummary, "autopayStatus" | "hasStripeCustomer" | "hasSavedPaymentMethod">,
) {
  return summary.autopayStatus === "enabled" && canChargeSavedPaymentMethod(summary);
}

export function canPreserveAutopayConsentForPaymentMethodMigration(input: {
  autopayPlaceholder?: boolean | null;
  customFields: unknown;
  linkedGuardianUserIds: Array<string | null | undefined>;
  previousPaymentMethodId?: string | null;
}) {
  const custom = fields(input.customFields);
  const previousPaymentMethodId = clean(input.previousPaymentMethodId ?? custom.stripeDefaultPaymentMethodId);
  const enabledByUserId = clean(custom.autopayEnabledByUserId);
  return Boolean(
    (custom.autopayEnabled === true || input.autopayPlaceholder === true)
      && previousPaymentMethodId
      && clean(custom.autopayPaymentMethodId) === previousPaymentMethodId
      && enabledByUserId
      && input.linkedGuardianUserIds.some((userId) => clean(userId) === enabledByUserId),
  );
}

export function paymentMethodSetupAutopayOutcome(input: {
  autopayPlaceholder?: boolean | null;
  currentFields: unknown;
  previousPaymentMethodId?: string | null;
  paymentMethodId?: string | null;
  linkedGuardianUserIds: Array<string | null | undefined>;
  setupMode?: string | null;
}) {
  const previousPaymentMethodId = clean(input.previousPaymentMethodId);
  const paymentMethodId = clean(input.paymentMethodId);
  const setupMode = clean(input.setupMode);
  const replacedPaymentMethod = Boolean(
    paymentMethodId && paymentMethodId !== previousPaymentMethodId,
  );
  const explicitEnable = setupMode === "enable";
  const explicitDisable = setupMode === "disabled";
  const preserveExistingConsent = setupMode === "preserve_existing"
    && replacedPaymentMethod
    && canPreserveAutopayConsentForPaymentMethodMigration({
      autopayPlaceholder: input.autopayPlaceholder,
      customFields: input.currentFields,
      linkedGuardianUserIds: input.linkedGuardianUserIds,
      previousPaymentMethodId,
    });

  if (explicitEnable || preserveExistingConsent) {
    return {
      autopayEnabled: true,
      autopayStatus: "enabled" as const,
      autopayPlaceholder: true,
      autopayPaymentMethodId: paymentMethodId,
      preservedExistingConsent: preserveExistingConsent,
      replacementDisabledAutopay: false,
    };
  }
  if (explicitDisable || replacedPaymentMethod) {
    return {
      autopayEnabled: false,
      autopayStatus: "disabled" as const,
      autopayPlaceholder: false,
      autopayPaymentMethodId: null,
      preservedExistingConsent: false,
      replacementDisabledAutopay: replacedPaymentMethod,
    };
  }
  return null;
}

export function canFinalizePendingAutopayConsentMigration(input: {
  currentFields: unknown;
  pendingOutcome: unknown;
  linkedGuardianUserIds: Array<string | null | undefined>;
  currentCenterId?: string | null;
  currentTenantId?: string | null;
  activeConnectedAccountId?: string | null;
  centerCustomFields?: unknown;
  replacementPaymentMethodId?: string | null;
}) {
  const current = fields(input.currentFields);
  const pending = fields(input.pendingOutcome);
  const consentUserId = clean(current.stripePendingAutopayConsentUserId);
  const previousPaymentMethodId = clean(current.stripePendingAutopayPreviousPaymentMethodId);
  const replacementPaymentMethodId = clean(current.stripePendingPaymentMethodId);
  const confirmedReplacementPaymentMethodId = clean(input.replacementPaymentMethodId);
  const currentCenterId = clean(input.currentCenterId);
  const pendingCenterId = clean(current.stripePendingAutopayAuditCenterId);
  const currentTenantId = clean(input.currentTenantId);
  const pendingTenantId = clean(current.stripePendingAutopayAuditTenantId);
  const activeConnectedAccountId = clean(input.activeConnectedAccountId);
  const pendingConnectedAccountId = clean(current.stripePendingPaymentMethodConnectedAccountId);
  const savedPaymentMethodConnectedAccountId = clean(current.stripeDefaultPaymentMethodConnectedAccountId);

  return Boolean(
    pending.preservedExistingConsent === true
      && pending.autopayEnabled === true
      && consentUserId
      && consentUserId === clean(current.autopayEnabledByUserId)
      && input.linkedGuardianUserIds.some((userId) => clean(userId) === consentUserId)
      && previousPaymentMethodId
      && previousPaymentMethodId === clean(current.stripeDefaultPaymentMethodId)
      && replacementPaymentMethodId
      && replacementPaymentMethodId === clean(pending.autopayPaymentMethodId)
      && replacementPaymentMethodId === confirmedReplacementPaymentMethodId
      && currentCenterId
      && currentCenterId === pendingCenterId
      && currentTenantId
      && currentTenantId === pendingTenantId
      && activeConnectedAccountId
      && activeConnectedAccountId === pendingConnectedAccountId
      && stripeConnectSavedMethodNeedsReauthorization({
        activeAccountId: activeConnectedAccountId,
        savedMethodAccountId: savedPaymentMethodConnectedAccountId,
        centerCustomFields: input.centerCustomFields,
      }),
  );
}

export function canPreservePendingAutopayConsentForPaymentMethodMigration(input: {
  currentFields: unknown;
  linkedGuardianUserIds: Array<string | null | undefined>;
  currentCenterId?: string | null;
  currentTenantId?: string | null;
  activeConnectedAccountId?: string | null;
  centerCustomFields?: unknown;
}) {
  const current = fields(input.currentFields);
  if (current.stripeBankVerificationPending !== true) return false;
  return canFinalizePendingAutopayConsentMigration({
    ...input,
    pendingOutcome: current.stripePendingAutopayOutcome,
    replacementPaymentMethodId: clean(current.stripePendingPaymentMethodId),
  });
}

export function failedPendingPaymentMethodAutopayOutcome(input: {
  currentFields: unknown;
  pendingOutcome: unknown;
  linkedGuardianUserIds: Array<string | null | undefined>;
  currentCenterId?: string | null;
  currentTenantId?: string | null;
  activeConnectedAccountId?: string | null;
  centerCustomFields?: unknown;
  replacementPaymentMethodId?: string | null;
}) {
  const current = fields(input.currentFields);
  const retainedExistingConsent = canFinalizePendingAutopayConsentMigration(input);
  return {
    autopayEnabled: retainedExistingConsent,
    autopayStatus: retainedExistingConsent ? "enabled" as const : "disabled" as const,
    autopayPlaceholder: retainedExistingConsent,
    autopayPaymentMethodId: retainedExistingConsent
      ? clean(current.stripePendingAutopayPreviousPaymentMethodId)
      : null,
    retainedExistingConsent,
  };
}

export function canCreatePaymentMethodManagementSession(input: {
  isLinkedGuardian: boolean;
  hasCenterAccess: boolean;
}) {
  if (!input.isLinkedGuardian && !input.hasCenterAccess) {
    return {
      ok: false as const,
      status: 403,
      error: "You do not have access to this billing account.",
    };
  }
  return { ok: true as const };
}
