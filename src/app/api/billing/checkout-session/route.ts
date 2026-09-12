import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { canAccessAllCenters, canManageBilling, getCurrentUser, isParentGuardian, type CurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { appReviewReservedIdentityKind } from "@/lib/app-review-targeting";
import { jsonRecord } from "@/lib/billing-guardrails";
import {
  getStripeCheckoutAmounts,
  getStripePaymentMethodConfigurationId,
  getStripeSecretKey,
  getStripeWebhookSecret,
  readStripeConnectedAccountId,
  requiresStripePaymentMethodConfiguration,
  retrieveStripeConnectedAccount,
  shouldWaiveStripePaymentOperationsFee,
  stripeConnectedAccountPaysFeesDirectly,
  type StripePaymentMethodCategory,
} from "@/lib/integrations";
import {
  PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
  PAYMENT_PROCESSING_RECOVERY_VERSION,
} from "@/lib/payment-disclosures";
import { canAccessFamilyRecord } from "@/lib/portal-guardrails";
import { invoiceProductCheckoutBranding, invoiceProductStripeMetadata } from "@/lib/product-billing";
import { prisma } from "@/lib/prisma";
import { stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { stripeSchoolReadinessFlowFromFields } from "@/lib/stripe-school-readiness-flow";
import { invoiceCheckoutTenant } from "@/lib/invoice-checkout-attempt";
import { startInvoiceCheckout } from "@/lib/invoice-checkout-service";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { getParentPortalPaymentFamilyScope } from "@/lib/parent-portal-family-scope";
import { invoiceResponsibilityReviewExempt, invoiceResponsibilitySeparation } from "@/lib/invoice-responsibility-separation";
import {
  AGENCY_LEDGER_ENTRY_TYPES,
  AGENCY_LEDGER_SOURCE_SYSTEM,
  paymentCollectionResponsibilityHoldRequired,
} from "@/lib/parent-billing-visibility";
import {
  PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
  paymentServiceError,
} from "@/lib/parent-payment-errors";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function paymentMethodCategory(value: unknown): StripePaymentMethodCategory {
  const normalized = clean(value).toLowerCase();
  if (normalized === "ach" || normalized === "card" || normalized === "link_bank") return normalized;
  return "default";
}

function checkoutCollectionMode(value: unknown, requestedPaymentMethodCategory: StripePaymentMethodCategory, userCanManageBilling: boolean) {
  const requested = clean(value);
  if (userCanManageBilling && requested.startsWith("director_")) return requested;
  if (userCanManageBilling && requestedPaymentMethodCategory === "card") return "director_card_terminal";
  if (userCanManageBilling && requestedPaymentMethodCategory === "link_bank") return "director_instant_bank_checkout";
  if (userCanManageBilling && requestedPaymentMethodCategory === "ach") return "director_ach_checkout";
  return "parent_checkout";
}

function requestBaseUrl(request: NextRequest) {
  return getSecurePaymentAppBaseUrl(request.url);
}

function safeReturnPath(value: unknown, fallback: string) {
  const path = clean(value);
  if (!path || !path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path)) return fallback;
  return path;
}

function appendQuery(path: string, key: string, value: string) {
  return appendRawQuery(path, key, encodeURIComponent(value));
}

function appendRawQuery(path: string, key: string, rawValue: string) {
  const [base, hash = ""] = path.split("#", 2);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${encodeURIComponent(key)}=${rawValue}${hash ? `#${hash}` : ""}`;
}

async function canAccessInvoice(input: {
  user: CurrentUser;
  userId: string;
  isParentGuardian: boolean;
  roleScoped: boolean;
  centerIds: string[];
  invoiceId: string;
}) {
  // Prove the minimal topology before materializing any children or ledger data.
  const target = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    select: { billingAccountId: true, billingAccount: { select: { familyId: true, family: { select: { centerId: true } } } } },
  });
  const centerId = target?.billingAccount.family.centerId;
  const targetCenter = centerId ? await prisma.center.findUnique({
    where: { id: centerId }, select: { id: true, organization: { select: { tenantId: true } } },
  }) : null;
  const tenantId = invoiceCheckoutTenant(input.user, targetCenter ? { id: targetCenter.id, tenantId: targetCenter.organization.tenantId } : null);
  if (!target || !tenantId || !centerId) return { ok: false as const, status: 404, error: "Invoice not found." };
  const isFamilyGuardian = input.isParentGuardian && Boolean(await prisma.guardian.findFirst({
    where: { familyId: target.billingAccount.familyId, userId: input.userId }, select: { id: true },
  }));
  const hasCenterAccess = input.roleScoped || input.centerIds.includes(centerId);
  const accessGuard = canAccessFamilyRecord({ isParentGuardian: input.isParentGuardian, isLinkedGuardian: isFamilyGuardian, hasCenterAccess });
  if (!accessGuard.ok) return { ok: false as const, status: accessGuard.status, error: "You do not have access to this invoice." };
  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, billingAccountId: target.billingAccountId,
      billingAccount: { familyId: target.billingAccount.familyId, family: { centerId } } },
    include: {
      billingAccount: {
        include: {
          family: {
            include: {
              guardians: { select: { userId: true } },
              children: { select: { id: true, customFields: true } },
            },
          },
          ledgerEntries: {
            where: {
              OR: [
                { type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } },
                { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM },
              ],
            },
            select: { type: true, sourceSystem: true, amountCents: true, invoiceId: true, externalId: true, metadata: true },
          },
        },
      },
      items: {
        select: {
          description: true,
          amountCents: true,
          productId: true,
        },
      },
    },
  });

  if (!invoice) return { ok: false as const, status: 404, error: "Invoice not found." };

  return { ok: true as const, invoice, centerId, tenantId };
}

async function POSTHandler(request: NextRequest) {
  if (!hasTrustedMutationOrigin(request)) return NextResponse.json({ ok: false, error: "Untrusted request origin." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (appReviewReservedIdentityKind(user.email)) {
    return NextResponse.json({ ok: false, error: "Checkout is disabled in the App Review demo workspace." }, { status: 403 });
  }

  const userCanManageBilling = canManageBilling(user);
  const userIsParentGuardian = isParentGuardian(user);
  const parentCheckout = userIsParentGuardian && !userCanManageBilling;
  if (!userCanManageBilling && !userIsParentGuardian) {
    return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  }
  const body = await request.json();
  const invoiceId = clean(body.invoiceId);
  const requestedPaymentMethodCategory = paymentMethodCategory(body.paymentMethodCategory || body.paymentMethod);
  const collectionMode = checkoutCollectionMode(body.collectionMode, requestedPaymentMethodCategory, userCanManageBilling);
  const source = userCanManageBilling ? clean(body.source) || "director_dashboard" : "parent_portal";
  const bankAccountVerificationMethod = requestedPaymentMethodCategory === "link_bank" ? "instant" : null;
  const defaultReturnPath = userIsParentGuardian && !userCanManageBilling ? "/parent-portal" : "/billing-invoices";
  const returnPath = safeReturnPath(body.returnPath, defaultReturnPath);
  if (!invoiceId) {
    return NextResponse.json({ ok: false, error: "Invoice ID is required." }, { status: 400 });
  }

  const access = await canAccessInvoice({
    user,
    userId: user.id,
    isParentGuardian: userIsParentGuardian,
    roleScoped: canAccessAllCenters(user),
    centerIds: user.centerIds,
    invoiceId,
  });
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const { invoice, centerId, tenantId } = access;
  const parentFamilyScope = userIsParentGuardian && !userCanManageBilling
    ? await getParentPortalPaymentFamilyScope(user.id, user.tenantId, invoice.billingAccount.family.id)
    : null;
  if (parentFamilyScope && !parentFamilyScope.ok) {
    return NextResponse.json({ ok: false, error: "Your family link needs review before payment can continue." }, { status: 409 });
  }
  if (parentFamilyScope?.ok && invoice.billingAccount.family.id !== parentFamilyScope.familyId) {
    return NextResponse.json({ ok: false, error: "You do not have access to this invoice." }, { status: 403 });
  }
  const productCheckoutBranding = invoiceProductCheckoutBranding({
    invoiceNumber: invoice.number,
    familyName: invoice.billingAccount.family.name,
    customFields: invoice.customFields,
    items: invoice.items,
  });
  if (userIsParentGuardian && !userCanManageBilling && !productCheckoutBranding) {
    return NextResponse.json(
      { ok: false, error: "Refresh the parent portal and pay the family balance shown there." },
      { status: 409 },
    );
  }
  if (invoice.status !== PaymentStatus.OPEN) {
    return NextResponse.json({ ok: false, error: "This invoice is no longer open for payment." }, { status: 409 });
  }
  if (invoice.totalCents <= 0) {
    return NextResponse.json({ ok: false, error: "Invoice total must be greater than zero." }, { status: 400 });
  }
  if (!invoiceResponsibilityReviewExempt(
    invoice.customFields,
    invoice.totalCents,
    ...invoice.billingAccount.family.children.map((child) => ({ id: child.id, customFields: child.customFields })),
  ) && paymentCollectionResponsibilityHoldRequired({
    accountBalanceCents: invoice.billingAccount.balanceCents,
    agencyLedgerEntries: invoice.billingAccount.ledgerEntries,
    invoiceId: invoice.id,
    invoiceResponsibilitySeparated: invoiceResponsibilitySeparation(invoice.customFields) !== null,
    responsibilityEvidence: [
      invoice.customFields,
      invoice.items.map((item) => item.description),
    ],
    enforceCollectionHold: true,
  })) {
    return NextResponse.json(
      { ok: false, error: "Separate family and agency responsibility before opening payment." },
      { status: 409 },
    );
  }

  const stripeSecretConfigured = Boolean(await getStripeSecretKey({ tenantId }));
  const stripeWebhookConfigured = Boolean(await getStripeWebhookSecret({ tenantId }));

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

  const center = centerId
    ? await prisma.center.findFirst({
        where: { id: centerId, organization: { tenantId } },
        select: {
          id: true,
          name: true,
          customFields: true,
          organization: {
            select: {
              tenant: { select: { name: true, slug: true } },
              brand: { select: { name: true, slug: true } },
            },
          },
        },
      })
    : null;
  const connectedAccountId = readStripeConnectedAccountId(center?.customFields);
  let schoolPaysStripeFeesDirectly = jsonRecord(center?.customFields).stripeFeesCollector === "stripe";
  const allowPlatformOnlyPayments = process.env.STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS === "true";

  const billingApproval = stripeSchoolBillingApproval({ customFields: center?.customFields, centerName: center?.name });
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
    customFields: center?.customFields,
    centerName: center?.name,
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
      {
        ok: false,
        error: "This school needs a payout account before parent payments can be accepted.",
      },
      { status: 400 },
    );
  }

  if (connectedAccountId && process.env.STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT !== "false") {
    const accountStatus = await retrieveStripeConnectedAccount(connectedAccountId, { tenantId });
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
    // Collection reads provider readiness; it must not overwrite concurrent school configuration.

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

  const paymentMethodConfigurationId = getStripePaymentMethodConfigurationId(requestedPaymentMethodCategory);
  const usesSpecificFeePolicy = requiresStripePaymentMethodConfiguration(requestedPaymentMethodCategory);
  const requirePaymentMethodConfiguration = process.env.STRIPE_REQUIRE_PAYMENT_METHOD_CONFIGURATION_FOR_FEES === "true";
  if (usesSpecificFeePolicy && requirePaymentMethodConfiguration && !paymentMethodConfigurationId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This payment method is not configured yet. Add the matching payment method configuration before enabling method-specific processing fees.",
      },
      { status: 400 },
    );
  }
  const waiveBeeSuitePaymentOperationsFee = shouldWaiveStripePaymentOperationsFee({
    tenantSlug: center?.organization.tenant.slug,
    tenantName: center?.organization.tenant.name,
    brandSlug: center?.organization.brand?.slug,
    brandName: center?.organization.brand?.name,
  });
  const baseUrl = requestBaseUrl(request);
  const successPath = appendRawQuery(
    appendQuery(appendQuery(returnPath, "payment", "success"), "invoice", invoice.id),
    "session_id",
    "{CHECKOUT_SESSION_ID}",
  );
  const cancelPath = appendQuery(appendQuery(returnPath, "payment", "cancelled"), "invoice", invoice.id);
  const amounts = getStripeCheckoutAmounts(invoice.totalCents, {
    paymentMethodCategory: requestedPaymentMethodCategory,
    waiveBeeSuitePaymentOperationsFee,
    schoolPaysStripeFeesDirectly,
  });
  const productCheckoutMetadata = invoiceProductStripeMetadata(invoice.customFields);
  const paymentDescription = productCheckoutBranding?.paymentDescription;
  const result = await startInvoiceCheckout({
    topology: { tenantId, familyId: invoice.billingAccount.familyId, centerId, connectedAccountId },
    billingAccountId: invoice.billingAccountId, invoiceId: invoice.id, invoiceTotalCents: invoice.totalCents,
    keyPrefix: "checkout",
    customer: {
      email: invoice.billingAccount.family.billingEmail, name: invoice.billingAccount.family.name,
      metadata: { tenantId, billingAccountId: invoice.billingAccountId, familyId: invoice.billingAccount.familyId,
        centerId, stripeConnectedAccountId: connectedAccountId || "",
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development" },
      connectedAccountId, tenantId,
    },
    request: {
    amountCents: amounts.checkoutTotalCents,
    invoiceAmountCents: amounts.invoiceAmountCents,
    parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
    invoiceNumber: invoice.number,
    centerName: center?.name,
    customerEmail: invoice.billingAccount.family.billingEmail,
    successUrl: `${baseUrl}${successPath}`,
    cancelUrl: `${baseUrl}${cancelPath}`,
    metadata: {
      tenantId,
      invoiceId: invoice.id,
      familyId: invoice.billingAccount.familyId,
      centerId: centerId || "",
      stripeConnectedAccountId: connectedAccountId || "",
      stripeChargeType: connectedAccountId ? "direct" : "platform",
      invoiceAmountCents: String(amounts.invoiceAmountCents),
      parentSurchargeAmountCents: String(amounts.parentSurchargeAmountCents),
      parentProcessingRecoveryAmountCents: String(amounts.parentProcessingRecoveryAmountCents),
      schoolProcessingFeeAmountCents: String(amounts.schoolProcessingFeeAmountCents),
      beeSuitePaymentOperationsFeeAmountCents: String(amounts.beeSuitePaymentOperationsFeeAmountCents),
      beeSuitePaymentOperationsFeeWaived: String(waiveBeeSuitePaymentOperationsFee),
      requestedPaymentMethodCategory,
      paymentMethodCategory: amounts.paymentMethodCategory,
      bankAccountVerificationMethod: bankAccountVerificationMethod || "",
      collectionMode,
      source,
      paymentMethodConfigurationMissing: String(usesSpecificFeePolicy && !paymentMethodConfigurationId),
      checkoutTotalCents: String(amounts.checkoutTotalCents),
      applicationFeeAmountCents: String(amounts.applicationFeeAmountCents),
      ...productCheckoutMetadata,
      description: paymentDescription || "",
      feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    },
    connectedAccountId,
    applicationFeeAmountCents: amounts.applicationFeeAmountCents,
    paymentMethodConfigurationId,
    paymentMethodCategory: requestedPaymentMethodCategory,
    bankAccountVerificationMethod,
    onBehalfOfConnectedAccount: process.env.STRIPE_CHECKOUT_ON_BEHALF_OF === "true",
    checkoutBranding: productCheckoutBranding,
    tenantId,
  },
    fields: {
      invoiceAmountCents: amounts.invoiceAmountCents,
      parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
      parentProcessingRecoveryAmountCents: amounts.parentProcessingRecoveryAmountCents,
      schoolProcessingFeeAmountCents: amounts.schoolProcessingFeeAmountCents,
      beeSuitePaymentOperationsFeeAmountCents: amounts.beeSuitePaymentOperationsFeeAmountCents,
      beeSuitePaymentOperationsFeeWaived: waiveBeeSuitePaymentOperationsFee,
      requestedPaymentMethodCategory, paymentMethodCategory: amounts.paymentMethodCategory,
      paymentMethodConfigurationMissing: usesSpecificFeePolicy && !paymentMethodConfigurationId,
      checkoutTotalCents: amounts.checkoutTotalCents, applicationFeeAmountCents: amounts.applicationFeeAmountCents,
      feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
      bankAccountVerificationMethod, collectionMode, source, ...productCheckoutMetadata,
      description: paymentDescription || null, stripeChargeType: connectedAccountId ? "direct" : "platform",
    },
    authorizeRequest: async () => {
      // Reuse the current session/grant/workspace resolver before each claim.
      const fresh = await getCurrentUser();
      if (!fresh || fresh.id !== user.id || fresh.role !== user.role || fresh.tenantId !== user.tenantId
        || appReviewReservedIdentityKind(fresh.email)
        || invoiceCheckoutTenant(fresh, { id: centerId, tenantId }) !== tenantId) return false;
      if (parentCheckout) {
        const familyScope = await getParentPortalPaymentFamilyScope(fresh.id, tenantId, invoice.billingAccount.familyId);
        return familyScope.ok && familyScope.familyId === invoice.billingAccount.familyId;
      }
      return canManageBilling(fresh) && (canAccessAllCenters(fresh) || fresh.centerIds.includes(centerId));
    },
    authorize: async tx => {
      const actor = await tx.user.findFirst({ where: { id: user.id, email: user.email, tenantId: user.tenantId,
        role: user.role, isActive: true }, select: { id: true } });
      if (!actor) return false;
      if (user.deviceSessionId && !await tx.deviceSession.findFirst({ where: { id: user.deviceSessionId,
        userId: user.id, tenantId: user.tenantId, revokedAt: null }, select: { id: true } })) return false;
      return !parentCheckout || Boolean(await tx.guardian.findFirst({
        where: { userId: user.id, familyId: invoice.billingAccount.familyId }, select: { id: true },
      }));
    },
    audit: async (tx, paymentId, session) => {
      await writeAuditLog({ ...user, tenantId }, {
    centerId,
    action: "billing.checkout.created",
    resource: "Invoice",
    resourceId: invoice.id,
    metadata: {
      paymentId,
      stripeSessionId: session.id,
      amountCents: invoice.totalCents,
      checkoutTotalCents: amounts.checkoutTotalCents,
      stripeConnectedAccountId: connectedAccountId || null,
      parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
      parentProcessingRecoveryAmountCents: amounts.parentProcessingRecoveryAmountCents,
      schoolProcessingFeeAmountCents: amounts.schoolProcessingFeeAmountCents,
      beeSuitePaymentOperationsFeeAmountCents: amounts.beeSuitePaymentOperationsFeeAmountCents,
      beeSuitePaymentOperationsFeeWaived: waiveBeeSuitePaymentOperationsFee,
      requestedPaymentMethodCategory,
      paymentMethodCategory: amounts.paymentMethodCategory,
      paymentMethodConfigurationMissing: usesSpecificFeePolicy && !paymentMethodConfigurationId,
      applicationFeeAmountCents: amounts.applicationFeeAmountCents,
      collectionMode,
      source,
      ...productCheckoutMetadata,
      description: paymentDescription || null,
    },
      }, tx);
    },
  });
  const { statusCode, ...response } = result;
  return NextResponse.json({
    ...response,
    ...(result.ok ? { feeDisclosure: PAYMENT_PROCESSING_RECOVERY_DISCLOSURE, feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION } : {}),
  }, { status: statusCode });
}

export const POST = withApiLogging("POST", POSTHandler);
