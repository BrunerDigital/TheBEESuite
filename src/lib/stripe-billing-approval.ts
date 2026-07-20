export const STRIPE_BILLING_APPROVAL_VERSION = "2026-07-school-billing-v1";

export type StripeSchoolBillingApproval = {
  approved: boolean;
  source: "explicit" | "legacy_production" | "not_approved";
  approvedAt: string | null;
  approvedBy: string | null;
  billingPreviewApprovedAt: string | null;
  accountingApprovedAt: string | null;
  cutoverApprovedAt: string | null;
  version: string | null;
  blockingReason: string | null;
};

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validIsoDate(value: unknown) {
  const text = clean(value);
  return text && !Number.isNaN(Date.parse(text)) ? text : null;
}

function normalizedNames(value: string | undefined) {
  return (value || "Kid City USA - Kokomo")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function stripeSchoolBillingApproval(input: {
  customFields: unknown;
  centerName?: string | null;
  legacyApprovedCenterNames?: string;
}): StripeSchoolBillingApproval {
  const custom = fields(input.customFields);
  const approvedAt = validIsoDate(custom.stripeBillingApprovedAt);
  const approvedBy = clean(custom.stripeBillingApprovedBy) || null;
  const billingPreviewApprovedAt = validIsoDate(custom.stripeBillingPreviewApprovedAt);
  const accountingApprovedAt = validIsoDate(custom.stripeBillingAccountingApprovedAt);
  const cutoverApprovedAt = validIsoDate(custom.stripeBillingCutoverApprovedAt);
  const version = clean(custom.stripeBillingApprovalVersion) || null;
  const explicitlyApproved = custom.stripeBillingApproved === true && Boolean(
    approvedAt && approvedBy && billingPreviewApprovedAt && accountingApprovedAt && cutoverApprovedAt && version,
  );

  if (explicitlyApproved) {
    return {
      approved: true,
      source: "explicit",
      approvedAt,
      approvedBy,
      billingPreviewApprovedAt,
      accountingApprovedAt,
      cutoverApprovedAt,
      version,
      blockingReason: null,
    };
  }

  const centerName = clean(input.centerName).toLowerCase();
  const legacyNames = normalizedNames(input.legacyApprovedCenterNames ?? process.env.STRIPE_BILLING_LEGACY_APPROVED_CENTER_NAMES);
  if (centerName && legacyNames.includes(centerName)) {
    return {
      approved: true,
      source: "legacy_production",
      approvedAt: null,
      approvedBy: null,
      billingPreviewApprovedAt: null,
      accountingApprovedAt: null,
      cutoverApprovedAt: null,
      version: null,
      blockingReason: null,
    };
  }

  return {
    approved: false,
    source: "not_approved",
    approvedAt,
    approvedBy,
    billingPreviewApprovedAt,
    accountingApprovedAt,
    cutoverApprovedAt,
    version,
    blockingReason: "Live parent billing is off for this school until the billing preview, accounting review, and cutover are separately approved.",
  };
}

export function stripeBillingApprovalCustomFieldPatch(input: {
  approved: boolean;
  approvedAt: string;
  approvedBy: string;
  billingPreviewApprovedAt: string;
  accountingApprovedAt: string;
  cutoverApprovedAt: string;
}) {
  return {
    stripeBillingApproved: input.approved,
    stripeBillingApprovedAt: input.approvedAt,
    stripeBillingApprovedBy: input.approvedBy.trim(),
    stripeBillingPreviewApprovedAt: input.billingPreviewApprovedAt,
    stripeBillingAccountingApprovedAt: input.accountingApprovedAt,
    stripeBillingCutoverApprovedAt: input.cutoverApprovedAt,
    stripeBillingApprovalVersion: STRIPE_BILLING_APPROVAL_VERSION,
  };
}
