export type PaymentMethodManagementSummary = {
  autopayEnabled: boolean;
  autopayStatus: "enabled" | "disabled" | "pending";
  hasStripeCustomer: boolean;
  hasSavedPaymentMethod: boolean;
  stripeCustomerId: string | null;
  stripeDefaultPaymentMethodId: string | null;
  lastUpdatedAt: string | null;
};

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function paymentMethodManagementSummary(input: {
  autopayPlaceholder?: boolean | null;
  customFields: unknown;
}): PaymentMethodManagementSummary {
  const custom = fields(input.customFields);
  const stripeCustomerId = clean(custom.stripeCustomerId);
  const stripeDefaultPaymentMethodId = clean(custom.stripeDefaultPaymentMethodId);
  const savedAt = clean(custom.stripePaymentMethodSavedAt);
  const status = clean(custom.autopayStatus);
  const enabled = custom.autopayEnabled === true || input.autopayPlaceholder === true;
  const pending = status === "pending" || clean(custom.stripeSetupCheckoutSessionId) !== null;

  return {
    autopayEnabled: enabled,
    autopayStatus: enabled ? "enabled" : pending ? "pending" : "disabled",
    hasStripeCustomer: Boolean(stripeCustomerId),
    hasSavedPaymentMethod: Boolean(stripeDefaultPaymentMethodId),
    stripeCustomerId,
    stripeDefaultPaymentMethodId,
    lastUpdatedAt: savedAt ?? clean(custom.autopayUpdatedAt),
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
