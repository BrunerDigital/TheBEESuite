export type PaymentMethodManagementSummary = {
  autopayEnabled: boolean;
  autopayStatus: "enabled" | "disabled" | "pending";
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
}): PaymentMethodManagementSummary {
  const custom = fields(input.customFields);
  const stripeCustomerId = clean(custom.stripeCustomerId);
  const stripeDefaultPaymentMethodId = clean(custom.stripeDefaultPaymentMethodId);
  const paymentMethodType = clean(custom.stripePaymentMethodType);
  const paymentMethodLast4 = clean(custom.stripePaymentMethodLast4);
  const savedAt = clean(custom.stripePaymentMethodSavedAt);
  const status = clean(custom.autopayStatus);
  const managementStatus = clean(custom.paymentMethodManagementStatus);
  const enabled = custom.autopayEnabled === true || input.autopayPlaceholder === true;
  const pending =
    status === "pending" ||
    managementStatus === "setup_session_created" ||
    managementStatus === "setup_pending" ||
    managementStatus === "payment_method_setup_pending";

  return {
    autopayEnabled: enabled,
    autopayStatus: enabled ? "enabled" : pending ? "pending" : "disabled",
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
  const userDisabledAt = clean(current.autopayDisabledAt);
  const userDisabledBy = clean(current.autopayDisabledByUserId);
  const hasSavedPaymentMethod = Boolean(savedPaymentMethodId);
  const userDisabledAfterSave = Boolean(userDisabledAt || userDisabledBy);

  if (hasSavedPaymentMethod && !userDisabledAfterSave) {
    return {
      autopayPlaceholder: true,
      customFields: {
        ...current,
        stripeExpiredSetupCheckoutSessionId: input.sessionId,
        stripeEventId: input.stripeEventId,
        autopayEnabled: true,
        autopayStatus: "enabled",
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
