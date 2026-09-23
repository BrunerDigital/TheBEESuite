import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { appReviewReservedIdentityKind } from "@/lib/app-review-targeting";
import { canManageBilling, getCurrentUser, isParentGuardian } from "@/lib/auth";
import { jsonRecord } from "@/lib/billing-guardrails";
import { authorizeBillingActorForTarget } from "@/lib/billing-actor-authorization";
import { readAuthorizedFamilyPaymentTarget } from "@/lib/family-payment-preflight";
import { readFamilyPaymentSnapshot } from "@/lib/family-payment-snapshot";
import { startFamilyPayment, FAMILY_PAYMENT_ID_TOKEN } from "@/lib/family-payment-service";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { getStripeCheckoutAmounts, getStripePaymentMethodConfigurationId, getStripeSecretKey, getStripeWebhookSecret,
  readStripeConnectedAccountId, requiresStripePaymentMethodConfiguration, retrieveStripeConnectedAccount,
  shouldWaiveStripePaymentOperationsFee, stripeConnectedAccountPaysFeesDirectly, type StripePaymentMethodCategory } from "@/lib/integrations";
import { PAYMENT_PROCESSING_RECOVERY_DISCLOSURE, PAYMENT_PROCESSING_RECOVERY_VERSION } from "@/lib/payment-disclosures";
import { canChargeSavedPaymentMethod, paymentMethodAutopayCategory, paymentMethodManagementSummary } from "@/lib/payment-method-management";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { stripeConnectSavedMethodAccount } from "@/lib/stripe-connect-migration";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { stripeSchoolReadinessFlowFromFields } from "@/lib/stripe-school-readiness-flow";
import { stripeCustomerIdForAccount } from "@/lib/stripe-customer-scope";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { getParentPortalPaymentFamilyScope } from "@/lib/parent-portal-family-scope";
import { PARENT_PAYMENT_UNAVAILABLE_MESSAGE, paymentServiceError } from "@/lib/parent-payment-errors";

export const runtime = "nodejs";
type FamilyPaymentMethod = "saved_method" | "card_checkout" | "instant_bank_checkout" | "ach_checkout";
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
function parseAmountCents(body: Record<string, unknown>) {
  if (body.amountCents !== undefined) {
    const value = typeof body.amountCents === "number" ? body.amountCents : /^\d+$/.test(clean(body.amountCents)) ? Number(body.amountCents) : NaN;
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (body.amountDollars !== undefined) {
    const dollars = clean(body.amountDollars);
    if (!/^\d+(?:\.\d{1,2})?$/.test(dollars)) return null;
    const value = Math.round(Number(dollars) * 100);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  return undefined;
}
function checkoutCategory(method: FamilyPaymentMethod): StripePaymentMethodCategory {
  if (method === "card_checkout") return "card";
  if (method === "instant_bank_checkout") return "link";
  if (method === "ach_checkout") return "ach";
  return "default";
}

function checkoutCollectionMode(method: FamilyPaymentMethod, value: unknown, userCanManageBilling: boolean) {
  if (!userCanManageBilling) {
    if (method === "card_checkout") return "parent_card_checkout";
    if (method === "instant_bank_checkout") return "parent_instant_bank_checkout";
    if (method === "ach_checkout") return "parent_ach_checkout";
    return "parent_checkout";
  }
  const requested = clean(value);
  if (requested.startsWith("director_")) return requested;
  if (method === "card_checkout") return "director_card_terminal";
  if (method === "instant_bank_checkout") return "director_instant_bank_checkout";
  if (method === "ach_checkout") return "director_ach_checkout";
  return "director_checkout";
}

function safeReturnPath(value: unknown, fallback: string) {
  const path = clean(value);
  if (!path || !path.startsWith("/") || path.startsWith("//") || /[\\\\\u0000-\u001f\u007f]/.test(path)) return fallback;
  return path;
}

function appendQuery(path: string, key: string, value: string) {
  return appendRawQuery(path, key, encodeURIComponent(value));
}

function appendRawQuery(path: string, key: string, rawValue: string) {
  const [base, hash = ""] = path.split("#", 2), [pathname, query = ""] = base.split("?", 2);
  const params = new URLSearchParams(query); params.delete(key);
  return `${pathname}?${params.size ? `${params.toString()}&` : ""}${encodeURIComponent(key)}=${rawValue}${hash ? `#${hash}` : ""}`;
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (appReviewReservedIdentityKind(user.email)) return NextResponse.json({ ok: false, error: "Payments are disabled in the App Review demo workspace." }, { status: 403 });
  if (!hasTrustedMutationOrigin(request)) return NextResponse.json({ ok: false, error: "This payment request is not allowed." }, { status: 403 });
  const userCanManageBilling = canManageBilling(user), parentCheckout = isParentGuardian(user) && !userCanManageBilling;
  if (!userCanManageBilling && !parentCheckout) return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  const parsed: unknown = await request.json().catch(() => null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NextResponse.json({ ok: false, error: "Payment details are invalid." }, { status: 400 });
  const body = parsed as Record<string, unknown>, billingAccountId = clean(body.billingAccountId), familyId = clean(body.familyId);
  const method = clean(body.method) as FamilyPaymentMethod;
  const requestedAmountCents = parseAmountCents(body);
  if (!["saved_method", "card_checkout", "instant_bank_checkout", "ach_checkout"].includes(method) || requestedAmountCents === null
    || [body.billingAccountId, body.familyId].some(id => id !== undefined && typeof id !== "string")
    || body.amountCents !== undefined && body.amountDollars !== undefined || (!billingAccountId && !familyId)
    || [billingAccountId, familyId].some(id => id && !/^[A-Za-z0-9_-]{1,191}$/.test(id))) {
    return NextResponse.json({ ok: false, error: "Select a payment method and enter a valid payment amount." }, { status: 400 });
  }
  if (parentCheckout && method === "saved_method") return NextResponse.json({ ok: false, error: "Parents must confirm payment through secure checkout." }, { status: 400 });
  const parentFamilyScope = parentCheckout ? await getParentPortalPaymentFamilyScope(user.id, user.tenantId, familyId || null) : null;
  if (parentFamilyScope && !parentFamilyScope.ok) return NextResponse.json({ ok: false, error: "Your family link needs review before payment can continue." }, { status: 409 });
  // Minimal topology and fresh actor/device/grant proof precede all financial and child reads, in one snapshot.
  const initial = await prisma.$transaction(async tx => {
    const target = await readAuthorizedFamilyPaymentTarget(tx, user, { billingAccountId: billingAccountId || null, familyId: familyId || null });
    if (!target || parentFamilyScope?.ok && target.familyId !== parentFamilyScope.familyId) return null;
    const snapshot = await readFamilyPaymentSnapshot(tx, target);
    return snapshot ? { target, ...snapshot } : null;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  if (!initial) return NextResponse.json({ ok: false, error: "You do not have access to this family." }, { status: 403 });
  const { target, billingAccount, center, responsibilityReviewRequired, collectableCents } = initial;
  const centerId = target.centerId;
  if (responsibilityReviewRequired) return NextResponse.json({ ok: false, code: "parent_account_payment_responsibility_review_required",
    error: "The school must separate family and agency responsibility before an account payment can be made." }, { status: 409 });
  const amountCents = requestedAmountCents ?? collectableCents;
  if (amountCents <= 0 || amountCents > collectableCents) return NextResponse.json({ ok: false,
    error: "The amount exceeds the current family balance. Refresh and review the balance before paying." }, { status: 409 });
  const returnPath = safeReturnPath(body.returnPath, parentCheckout ? "/parent-portal" : "/billing-invoices");
  const description = parentCheckout ? "Family balance payment" : clean(body.description).slice(0, 200) || "Tuition payment";
  const source = parentCheckout ? "parent_portal" : clean(body.source).slice(0, 80) || "director_dashboard";
  const collectionMode = method === "saved_method" ? "director_saved_method" : checkoutCollectionMode(method, body.collectionMode, userCanManageBilling).slice(0, 80);
  const stripeSecretConfigured = Boolean(await getStripeSecretKey({ tenantId: user.tenantId }));
  const stripeWebhookConfigured = Boolean(await getStripeWebhookSecret({ tenantId: user.tenantId }));
  if (!stripeSecretConfigured) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: paymentServiceError({
          parentFacing: parentCheckout,
          providerError: "Online payment processing is not configured for this school.",
          fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
        }),
      },
      { status: 503 },
    );
  }
  if (process.env.STRIPE_REQUIRE_WEBHOOK_FOR_CHECKOUT !== "false" && !stripeWebhookConfigured) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: paymentServiceError({
          parentFacing: parentCheckout,
          providerError: "Online payment confirmation is not configured for this school.",
          fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
        }),
      },
      { status: 503 },
    );
  }

  const billingAccountFields = jsonRecord(billingAccount.customFields);
  const activeConnectedAccountId = readStripeConnectedAccountId(center.customFields);
  const savedPaymentMethodConnectedAccountId = clean(billingAccountFields.stripeDefaultPaymentMethodConnectedAccountId);
  const connectedAccountId = method === "saved_method"
    ? stripeConnectSavedMethodAccount({ activeAccountId: activeConnectedAccountId, savedMethodAccountId: savedPaymentMethodConnectedAccountId, centerCustomFields: center.customFields })
    : activeConnectedAccountId;
  if (method === "saved_method" && savedPaymentMethodConnectedAccountId && !connectedAccountId) {
    return NextResponse.json(
      { ok: false, error: "This saved payment method belongs to the school's prior payout account. Replace it before making a saved-method payment." },
      { status: 409 },
    );
  }
  let schoolPaysStripeFeesDirectly = jsonRecord(center.customFields).stripeFeesCollector === "stripe";
  const allowPlatformOnlyPayments = process.env.STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS === "true";
  const billingApproval = stripeSchoolBillingApproval({ customFields: center.customFields, centerName: center.name });
  if (!billingApproval.approved) {
    return NextResponse.json(
      {
        ok: false,
        error: paymentServiceError({
          parentFacing: parentCheckout,
          providerError: billingApproval.blockingReason || "Online billing is not approved for this school.",
          fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
        }),
        ...(parentCheckout ? {} : { billingApproval }),
      },
      { status: 403 },
    );
  }
  const paymentReadiness = stripeSchoolReadinessFlowFromFields({
    customFields: center.customFields,
    centerName: center.name,
  });
  if (!paymentReadiness.canAcceptParentPayments) {
    return NextResponse.json(
      {
        ok: false,
        error: paymentServiceError({
          parentFacing: parentCheckout,
          providerError: paymentReadiness.explanation,
          fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
        }),
        ...(parentCheckout ? {} : { paymentReadiness }),
      },
      { status: 403 },
    );
  }
  if (!connectedAccountId && !allowPlatformOnlyPayments) {
    return NextResponse.json(
      { ok: false, error: "This school needs a payout account before parent payments can be accepted." },
      { status: 400 },
    );
  }

  if (connectedAccountId && (method === "instant_bank_checkout" || process.env.STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT !== "false")) {
    const accountStatus = await retrieveStripeConnectedAccount(connectedAccountId, { tenantId: user.tenantId });
    if (!accountStatus.ok || !accountStatus.account) {
      return NextResponse.json(
        {
          ok: false,
          configured: accountStatus.configured,
          error: paymentServiceError({
            parentFacing: parentCheckout,
            providerError: accountStatus.error || "Payout status could not be confirmed.",
            fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
          }),
        },
        { status: accountStatus.configured ? 502 : 503 },
      );
    }
    const readiness = stripeConnectReadinessFromSnapshot(accountStatus.account);
    schoolPaysStripeFeesDirectly = stripeConnectedAccountPaysFeesDirectly(accountStatus.account);
    if (!readiness.canAcceptParentPayments) {
      return NextResponse.json(
        {
          ok: false,
          error: paymentServiceError({
            parentFacing: parentCheckout,
            providerError:
              readiness.blockingReason ||
              "This school's payout account is not ready yet. Finish payout onboarding before accepting parent payments.",
            fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
          }),
          ...(parentCheckout
            ? {}
            : {
                status: readiness.status,
                requirements: readiness.requirementFields,
              }),
        },
        { status: 400 },
      );
    }
  }

  const stripeCustomerId = stripeCustomerIdForAccount(billingAccountFields, connectedAccountId);
  const savedPaymentMethod = paymentMethodManagementSummary({ autopayPlaceholder: billingAccount.autopayPlaceholder,
    customFields: billingAccountFields, activeConnectedAccountId, centerCustomFields: center.customFields });
  if (method === "saved_method" && (!stripeCustomerId || !canChargeSavedPaymentMethod(savedPaymentMethod) || !savedPaymentMethod.stripeDefaultPaymentMethodId)) {
    return NextResponse.json({ ok: false, error: "This family needs a selected payment method in this school's current payout account before it can be charged." }, { status: 409 });
  }
  if (parentCheckout && billingAccount.family._count.children > 0 && savedPaymentMethod.paymentMethodReauthorizationRequired) {
    return NextResponse.json({ ok: false, code: "payment_method_reauthorization_required",
      error: "Replace the saved payment method first. No payment was started. The no-charge replacement moves saved payments to the school's current account; eligible existing autopay authorization resumes automatically." }, { status: 409 });
  }
  const requestedPaymentMethodCategory = method === "saved_method" ? paymentMethodAutopayCategory(savedPaymentMethod) : checkoutCategory(method);
  const paymentMethodConfigurationId = getStripePaymentMethodConfigurationId(requestedPaymentMethodCategory);
  const usesSpecificFeePolicy = requiresStripePaymentMethodConfiguration(requestedPaymentMethodCategory);
  if (method !== "saved_method" && usesSpecificFeePolicy && process.env.STRIPE_REQUIRE_PAYMENT_METHOD_CONFIGURATION_FOR_FEES === "true" && !paymentMethodConfigurationId) {
    return NextResponse.json({ ok: false, error: parentCheckout ? PARENT_PAYMENT_UNAVAILABLE_MESSAGE
      : "This payment method is not configured yet. Add the matching payment method configuration before enabling method-specific processing fees." }, { status: 400 });
  }
  const waiveBeeSuitePaymentOperationsFee = shouldWaiveStripePaymentOperationsFee({ tenantSlug: center.organization.tenant.slug,
    tenantName: center.organization.tenant.name, brandSlug: center.organization.brand?.slug, brandName: center.organization.brand?.name });
  const amounts = getStripeCheckoutAmounts(amountCents, { paymentMethodCategory: requestedPaymentMethodCategory, waiveBeeSuitePaymentOperationsFee, schoolPaysStripeFeesDirectly });
  const savedMethodNeedsCardAcceptance = method === "saved_method" && requestedPaymentMethodCategory === "card"
    && amounts.parentProcessingRecoveryAmountCents > 0 && !clean(billingAccountFields.cardProcessingRecoveryAcceptedAt);
  if (savedMethodNeedsCardAcceptance && body.processingRecoveryAccepted !== true) return NextResponse.json({ ok: false,
    error: "Card payments using a saved method need the card processing recovery disclosure accepted before charging.",
    feeDisclosure: PAYMENT_PROCESSING_RECOVERY_DISCLOSURE, feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION, requiresProcessingRecoveryAcceptance: true }, { status: 400 });
  const paymentLabel = `${billingAccount.family.name} family payment`;
  const metadata = {
    tenantId: user.tenantId,
    paymentScope: "family_balance",
    billingAccountId: billingAccount.id,
    familyId: billingAccount.familyId,
    centerId: center.id,
    stripeConnectedAccountId: connectedAccountId || "",
    stripeCustomerId: stripeCustomerId || "",
    stripeChargeType: connectedAccountId ? "direct" : "platform",
    invoiceAmountCents: String(amounts.invoiceAmountCents),
    parentSurchargeAmountCents: String(amounts.parentSurchargeAmountCents),
    parentProcessingRecoveryAmountCents: String(amounts.parentProcessingRecoveryAmountCents),
    schoolProcessingFeeAmountCents: String(amounts.schoolProcessingFeeAmountCents),
    stripeFeesCollector: schoolPaysStripeFeesDirectly ? "stripe" : "application",
    beeSuitePaymentOperationsFeeAmountCents: String(amounts.beeSuitePaymentOperationsFeeAmountCents),
    beeSuitePaymentOperationsFeeWaived: String(waiveBeeSuitePaymentOperationsFee),
    requestedPaymentMethodCategory,
    paymentMethodCategory: amounts.paymentMethodCategory,
    paymentMethodConfigurationMissing: String(method !== "saved_method" && usesSpecificFeePolicy && !paymentMethodConfigurationId),
    stripePaymentMethodConfigurationId: paymentMethodConfigurationId || "",
    familyPaymentMethod: method,
    bankAccountVerificationMethod: "",
    checkoutTotalCents: String(amounts.checkoutTotalCents),
    applicationFeeAmountCents: String(amounts.applicationFeeAmountCents),
    feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
    description: description,
    collectionMode,
    source: source,
    responsibilityReviewRequired: String(responsibilityReviewRequired),
    requestedByUserId: user.id,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
  };

  const commonRequest = { amountCents: amounts.checkoutTotalCents, invoiceAmountCents: amounts.invoiceAmountCents,
    parentSurchargeAmountCents: amounts.parentSurchargeAmountCents, invoiceNumber: paymentLabel, centerName: center.name,
    customerEmail: billingAccount.family.billingEmail, metadata, connectedAccountId, applicationFeeAmountCents: amounts.applicationFeeAmountCents, tenantId: user.tenantId };
  const topology = { ...target, connectedAccountId };
  const common = {
    topology,
    fields: { ...metadata, stripeCustomerId: method === "saved_method" ? stripeCustomerId : null,
      stripePaymentMethodId: method === "saved_method" ? savedPaymentMethod.stripeDefaultPaymentMethodId : null,
      stripePaymentMethodType: method === "saved_method" ? savedPaymentMethod.paymentMethodType : null,
      paymentMethodLabel: method === "saved_method" ? savedPaymentMethod.paymentMethodLabel : null,
      bankAccountVerificationMethod: null },
    acceptProcessingRecovery: savedMethodNeedsCardAcceptance ? { userId: user.id, version: PAYMENT_PROCESSING_RECOVERY_VERSION } : undefined,
    authorizeRequest: async () => {
      const fresh = await getCurrentUser();
      if (!fresh || fresh.id !== user.id || fresh.email !== user.email || fresh.role !== user.role || fresh.tenantId !== user.tenantId
        || fresh.identityTenantId !== user.identityTenantId || fresh.sessionVersion !== user.sessionVersion || fresh.deviceSessionId !== user.deviceSessionId
        || appReviewReservedIdentityKind(fresh.email) || fresh.workspace?.mode !== user.workspace?.mode
        || fresh.workspace?.activeCenterId !== user.workspace?.activeCenterId) return false;
      if (parentCheckout) {
        const scope = await getParentPortalPaymentFamilyScope(fresh.id, fresh.tenantId, target.familyId);
        return scope.ok && scope.familyId === target.familyId;
      }
      return canManageBilling(fresh) && fresh.centerIds.includes(target.centerId);
    },
    authorize: async (tx: Prisma.TransactionClient) => {
      if (!await authorizeBillingActorForTarget(tx, user, target)) return false;
      const fresh = await readFamilyPaymentSnapshot(tx, target);
      if (!fresh || fresh.responsibilityReviewRequired || amountCents > fresh.collectableCents
        || readStripeConnectedAccountId(fresh.center.customFields) !== connectedAccountId
        || fresh.billingAccount.family.billingEmail !== billingAccount.family.billingEmail || fresh.billingAccount.family.name !== billingAccount.family.name
        || fresh.center.name !== center.name || JSON.stringify(fresh.center.organization) !== JSON.stringify(center.organization)) return false;
      const freshMethod = paymentMethodManagementSummary({ autopayPlaceholder: fresh.billingAccount.autopayPlaceholder,
        customFields: fresh.billingAccount.customFields, activeConnectedAccountId: connectedAccountId, centerCustomFields: fresh.center.customFields });
      if (parentCheckout && fresh.billingAccount.family._count.children > 0 && freshMethod.paymentMethodReauthorizationRequired) return false;
      if (method === "saved_method" && (!canChargeSavedPaymentMethod(freshMethod)
        || freshMethod.stripeDefaultPaymentMethodId !== savedPaymentMethod.stripeDefaultPaymentMethodId
        || freshMethod.paymentMethodType !== savedPaymentMethod.paymentMethodType
        || stripeCustomerIdForAccount(fresh.billingAccount.customFields, connectedAccountId) !== stripeCustomerId)) return false;
      if (method === "saved_method" && requestedPaymentMethodCategory === "card" && amounts.parentProcessingRecoveryAmountCents > 0
        && !clean(jsonRecord(fresh.billingAccount.customFields).cardProcessingRecoveryAcceptedAt) && body.processingRecoveryAccepted !== true) return false;
      return stripeSchoolBillingApproval({ customFields: fresh.center.customFields, centerName: fresh.center.name }).approved
        && stripeSchoolReadinessFlowFromFields({ customFields: fresh.center.customFields, centerName: fresh.center.name }).canAcceptParentPayments;
    },
    audit: async (tx: Prisma.TransactionClient, paymentId: string, event: string, providerId: string | null) => {
      await writeAuditLog(user, { centerId, action: `billing.family_payment.${event}`, resource: "BillingAccount", resourceId: billingAccount.id,
        metadata: { paymentId, providerId, amountCents, checkoutTotalCents: amounts.checkoutTotalCents, requestedPaymentMethodCategory,
          paymentMethodCategory: amounts.paymentMethodCategory, collectionMode } }, tx);
    },
  };
  const successPath = appendRawQuery(appendQuery(appendQuery(returnPath, "payment", "success"), "familyPayment", FAMILY_PAYMENT_ID_TOKEN), "session_id", "{CHECKOUT_SESSION_ID}");
  const cancelPath = appendQuery(appendQuery(returnPath, "payment", "cancelled"), "familyPayment", FAMILY_PAYMENT_ID_TOKEN);
  const result = method === "saved_method" ? await startFamilyPayment({ ...common, kind: "saved_method", request: { ...commonRequest,
    customerId: stripeCustomerId!, paymentMethodId: savedPaymentMethod.stripeDefaultPaymentMethodId!, paymentMethodType: savedPaymentMethod.paymentMethodType,
    descriptionLabel: "director saved-method payment" } })
    : await startFamilyPayment({ ...common, kind: "checkout", request: { ...commonRequest,
      successUrl: `${getSecurePaymentAppBaseUrl(request.url)}${successPath}`, cancelUrl: `${getSecurePaymentAppBaseUrl(request.url)}${cancelPath}`,
      paymentMethodConfigurationId, paymentMethodCategory: requestedPaymentMethodCategory,
      bankAccountVerificationMethod: null, allowPaymentMethodFallback: false,
      onBehalfOfConnectedAccount: process.env.STRIPE_CHECKOUT_ON_BEHALF_OF === "true" },
      customer: { email: billingAccount.family.billingEmail, name: billingAccount.family.name, connectedAccountId, tenantId: user.tenantId,
        metadata: { tenantId: user.tenantId, billingAccountId: billingAccount.id, familyId: billingAccount.familyId, centerId,
          stripeConnectedAccountId: connectedAccountId || "", environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development" } } });
  const { statusCode, ...response } = result;
  return NextResponse.json({ ...response, ...(result.ok ? { feeDisclosure: PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
    feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION } : {}) }, { status: statusCode, headers: { "Cache-Control": "private, no-store" } });
}

export const POST = withApiLogging("POST", POSTHandler, { omitRequestBody: true, omitResponseBody: true });
