import { type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser, isParentGuardian } from "@/lib/auth";
import { appReviewReservedIdentityKind } from "@/lib/app-review-targeting";
import { getParentPortalPaymentFamilyScope } from "@/lib/parent-portal-family-scope";
import { readAuthorizedFamilyPaymentTarget } from "@/lib/family-payment-preflight";
import { readFamilyPaymentSnapshot } from "@/lib/family-payment-snapshot";
import { isPaymentObservationId } from "@/lib/parent-payment-observation";
import { parentCheckoutResumeCandidate, resumeParentCheckout } from "@/lib/parent-checkout-resume";
import { readStripeConnectedAccountId, retrieveStripeCheckoutSession, retrieveStripeConnectedAccount, getStripeWebhookSecret,
  stripeConnectedAccountPaysFeesDirectly, getStripeCheckoutAmounts, shouldWaiveStripePaymentOperationsFee } from "@/lib/integrations";
import { stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { jsonRecord } from "@/lib/billing-guardrails";
import { PAYMENT_PROCESSING_RECOVERY_VERSION } from "@/lib/payment-disclosures";
import { stripeCustomerIdForAccount } from "@/lib/stripe-customer-scope";
import { paymentMethodManagementSummary } from "@/lib/payment-method-management";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { stripeSchoolReadinessFlowFromFields } from "@/lib/stripe-school-readiness-flow";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const held = () => reply({ ok: false, error: "This checkout cannot be safely reopened. Keep the payment paused and contact your school if its status does not update." }, 409);
async function POSTHandler(request: NextRequest) {
  if (!hasTrustedMutationOrigin(request)) return reply({ ok: false, error: "This request is not allowed." }, 403);
  const user = await getCurrentUser();
  if (!user) return reply({ ok: false, error: "Sign in again to check this checkout." }, 401);
  if (!isParentGuardian(user) || appReviewReservedIdentityKind(user.email)) return reply({ ok: false, error: "Parent access is required." }, 403);
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["familyId", "requestNonce"].includes(key))
    || !isPaymentObservationId((body as { familyId?: unknown }).familyId) || !isPaymentObservationId((body as { requestNonce?: unknown }).requestNonce)) return reply({ ok: false, error: "Choose a family." }, 400);
  const { familyId, requestNonce } = body as { familyId: string; requestNonce: string };
  let expectedDirectFees: boolean | null = null;
  const result = await resumeParentCheckout({
    read: async () => {
      const fresh = await getCurrentUser();
      if (!fresh || !isParentGuardian(fresh) || fresh.id !== user.id || fresh.email !== user.email || fresh.role !== user.role || fresh.tenantId !== user.tenantId
        || fresh.identityTenantId !== user.identityTenantId || fresh.sessionVersion !== user.sessionVersion || fresh.deviceSessionId !== user.deviceSessionId
        || appReviewReservedIdentityKind(fresh.email) || fresh.workspace?.mode !== user.workspace?.mode
        || fresh.workspace?.activeCenterId !== user.workspace?.activeCenterId) return null;
      const scope = await getParentPortalPaymentFamilyScope(fresh.id, fresh.tenantId, familyId);
      if (!scope.ok || scope.familyId !== familyId) return null;
      return prisma.$transaction(async tx => {
        const target = await readAuthorizedFamilyPaymentTarget(tx, fresh, { familyId, billingAccountId: null });
        if (!target) return null;
        const snapshot = await readFamilyPaymentSnapshot(tx, target);
        if (!snapshot) return null;
        const { center, billingAccount } = snapshot;
        const connectedAccountId = readStripeConnectedAccountId(center.customFields);
        const savedMethod = paymentMethodManagementSummary({ autopayPlaceholder: billingAccount.autopayPlaceholder,
          customFields: billingAccount.customFields, activeConnectedAccountId: connectedAccountId, centerCustomFields: center.customFields });
        const result = { topology: { ...target, connectedAccountId }, payments: snapshot.draftStripePayments,
          customerId: stripeCustomerIdForAccount(billingAccount.customFields, connectedAccountId), familyName: billingAccount.family.name,
          collectableCents: snapshot.collectableCents,
          canAcceptPayments: !snapshot.responsibilityReviewRequired
            && !(billingAccount.family._count.children > 0 && savedMethod.paymentMethodReauthorizationRequired)
            && stripeSchoolBillingApproval({ customFields: center.customFields, centerName: center.name }).approved
            && stripeSchoolReadinessFlowFromFields({ customFields: center.customFields, centerName: center.name }).canAcceptParentPayments };
        const candidate = parentCheckoutResumeCandidate(result);
        if (!candidate) return null;
        const fields = jsonRecord(candidate.payment.customFields);
        const category = fields.requestedPaymentMethodCategory;
        if (category !== "ach" && category !== "card" && category !== "link") return null;
        const schoolPaysStripeFeesDirectly = jsonRecord(center.customFields).stripeFeesCollector === "stripe";
        if (expectedDirectFees !== null && expectedDirectFees !== schoolPaysStripeFeesDirectly) return null;
        expectedDirectFees = schoolPaysStripeFeesDirectly;
        const amounts = getStripeCheckoutAmounts(candidate.payment.amountCents, { paymentMethodCategory: category, schoolPaysStripeFeesDirectly,
          waiveBeeSuitePaymentOperationsFee: shouldWaiveStripePaymentOperationsFee({ tenantSlug: center.organization.tenant.slug,
            tenantName: center.organization.tenant.name, brandSlug: center.organization.brand?.slug, brandName: center.organization.brand?.name }) });
        if (fields.feeDisclosureVersion !== PAYMENT_PROCESSING_RECOVERY_VERSION
          || Number(fields.checkoutTotalCents) !== amounts.checkoutTotalCents
          || Number(fields.parentSurchargeAmountCents) !== amounts.parentSurchargeAmountCents
          || Number(fields.applicationFeeAmountCents) !== amounts.applicationFeeAmountCents) return null;
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    }, retrieve: async input => {
      // Match the normal checkout gates without starting or expiring anything.
      if (process.env.STRIPE_REQUIRE_WEBHOOK_FOR_CHECKOUT !== "false" && !await getStripeWebhookSecret({ tenantId: input.tenantId })) return { ok: false };
      if (!input.connectedAccountId) return { ok: false };
      const account = await retrieveStripeConnectedAccount(input.connectedAccountId, { tenantId: input.tenantId });
      if (!account.ok || !account.account || !stripeConnectReadinessFromSnapshot(account.account).canAcceptParentPayments
        || stripeConnectedAccountPaysFeesDirectly(account.account) !== expectedDirectFees) return { ok: false };
      return retrieveStripeCheckoutSession(input);
    },
  });
  return result ? reply({ ...result, familyId, requestNonce }) : held();
}
// Checkout URLs and provider receipts must never enter logs.
export const POST = withApiLogging("POST", async (request: NextRequest) => {
  try { return await POSTHandler(request); } catch { return held(); }
}, { omitRequestBody: true, omitResponseBody: true });
