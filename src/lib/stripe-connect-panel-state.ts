import type { StripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { stripeSchoolReadinessFlowFromFields, type StripeSchoolReadinessFlow } from "@/lib/stripe-school-readiness-flow";

type PanelCenterState = {
  id: string;
  name: string;
  customFields: unknown;
  payoutFlow?: StripeSchoolReadinessFlow;
};

type PanelResponse = {
  centerId: string;
  status?: string;
  account?: {
    id: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    merchantCapabilityStatus?: string | null;
    merchantPayoutCapabilityStatus?: string | null;
    requirementFields: string[];
    pendingVerificationFields: string[];
  } | null;
  payoutBank?: {
    bankName?: string | null;
    last4?: string | null;
    status?: string | null;
    currency?: string | null;
    defaultForCurrency: boolean;
  } | null;
  payoutBankCount?: number;
  payoutBankError?: string | null;
  billingApproval?: StripeSchoolBillingApproval;
  flow?: StripeSchoolReadinessFlow;
};

export function stripeConnectPanelCenterAfterResponse<T extends PanelCenterState>(
  center: T,
  response: PanelResponse,
  syncedAt = new Date().toISOString(),
): T & { customFields: Record<string, unknown>; payoutFlow: StripeSchoolReadinessFlow } {
  if (response.centerId !== center.id) {
    throw new Error("Payout status returned the wrong school. Refresh and try again.");
  }
  const custom = center.customFields && typeof center.customFields === "object" && !Array.isArray(center.customFields)
    ? center.customFields as Record<string, unknown> : {};
  const account = response.account;
  const bank = response.payoutBankError ? null : response.payoutBank;
  const approval = response.billingApproval;
  const customFields = {
    ...custom,
    ...(account ? {
      stripeConnectAccountId: account.id,
      stripeChargesEnabled: account.chargesEnabled,
      stripePayoutsEnabled: account.payoutsEnabled,
      stripeDetailsSubmitted: account.detailsSubmitted,
      stripeMerchantCapabilityStatus: account.merchantCapabilityStatus,
      stripeMerchantPayoutCapabilityStatus: account.merchantPayoutCapabilityStatus,
      stripePayoutRequirementFields: account.requirementFields,
      stripeCurrentlyDueRequirementFields: account.requirementFields,
      stripeRequirementFields: account.requirementFields,
      stripePendingVerificationFields: account.pendingVerificationFields,
      stripePayoutStatus: response.flow?.connect.status || response.status,
      stripeConnectLastSyncedAt: syncedAt,
    } : account === null ? {
      stripeConnectAccountId: null,
      stripeConnectedAccountId: null,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripePayoutBankName: null,
      stripePayoutBankLast4: null,
      stripePayoutBankDefaultConfirmed: false,
    } : {}),
    ...("payoutBank" in response || response.payoutBankError ? {
      stripePayoutBankName: bank?.bankName ?? null,
      stripePayoutBankLast4: bank?.last4 ?? null,
      stripePayoutBankStatus: bank?.status ?? null,
      stripePayoutBankCurrency: bank?.currency ?? null,
      stripePayoutBankDefaultConfirmed: bank?.defaultForCurrency === true,
      stripePayoutBankCount: response.payoutBankCount ?? 0,
      stripePayoutBankLastSyncedAt: syncedAt,
    } : {}),
    ...(approval ? {
      stripeBillingApproved: approval.approved,
      stripeBillingApprovedAt: approval.approvedAt,
      stripeBillingApprovedBy: approval.approvedBy,
      stripeBillingPreviewApprovedAt: approval.billingPreviewApprovedAt,
      stripeBillingAccountingApprovedAt: approval.accountingApprovedAt,
      stripeBillingCutoverApprovedAt: approval.cutoverApprovedAt,
      stripeBillingApprovalVersion: approval.version,
    } : {}),
    ...(response.flow ? {
      livePaymentsEnabled: response.flow.livePaymentsEnabled,
      tuitionBillingEnabled: response.flow.tuitionBillingEnabled,
    } : {}),
  };
  return {
    ...center,
    customFields,
    payoutFlow: response.payoutBankError
      ? stripeSchoolReadinessFlowFromFields({ customFields, centerName: center.name })
      : response.flow ?? stripeSchoolReadinessFlowFromFields({ customFields, centerName: center.name }),
  };
}
