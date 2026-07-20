import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { canAccessAllCenters, canManageBilling, getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  activeStripeCheckoutPaymentMessage,
  activeStripeCheckoutPaymentSummary,
  isActiveStripeCheckoutPayment,
  jsonRecord,
} from "@/lib/billing-guardrails";
import {
  createStripeCustomer,
  createStripeCheckoutSession,
  getStripeCheckoutAmounts,
  getStripePaymentMethodConfigurationId,
  getStripeSecretKey,
  getStripeWebhookSecret,
  readStripeConnectedAccountId,
  requiresStripePaymentMethodConfiguration,
  retrieveStripeConnectedAccount,
  shouldWaiveStripePaymentOperationsFee,
  type StripePaymentMethodCategory,
} from "@/lib/integrations";
import {
  PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
  PAYMENT_PROCESSING_RECOVERY_VERSION,
} from "@/lib/payment-disclosures";
import { canAccessFamilyRecord } from "@/lib/portal-guardrails";
import { invoiceProductCheckoutBranding, invoiceProductStripeMetadata } from "@/lib/product-billing";
import { prisma } from "@/lib/prisma";
import { resolveStripeCheckoutDraftBlocker } from "@/lib/stripe-checkout-drafts";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { stripeCustomerCustomFieldPatch, stripeCustomerIdForAccount } from "@/lib/stripe-customer-scope";
import { getAppBaseUrl } from "@/lib/supabase-auth";

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
  return getAppBaseUrl(request.url);
}

function safeReturnPath(value: unknown, fallback: string) {
  const path = clean(value);
  if (!path || !path.startsWith("/") || path.startsWith("//")) return fallback;
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
  userId: string;
  isParentGuardian: boolean;
  roleScoped: boolean;
  centerIds: string[];
  invoiceId: string;
}) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    include: {
      billingAccount: {
        include: {
          family: {
            include: {
              guardians: { select: { userId: true } },
            },
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

  const centerId = invoice.billingAccount.family.centerId;
  const isFamilyGuardian = invoice.billingAccount.family.guardians.some((guardian) => guardian.userId === input.userId);
  const hasCenterAccess = input.roleScoped || Boolean(centerId && input.centerIds.includes(centerId));
  const accessGuard = canAccessFamilyRecord({
    isParentGuardian: input.isParentGuardian,
    isLinkedGuardian: isFamilyGuardian,
    hasCenterAccess,
  });
  if (!accessGuard.ok) {
    return { ok: false as const, status: accessGuard.status, error: "You do not have access to this invoice." };
  }

  return { ok: true as const, invoice, centerId };
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const userCanManageBilling = canManageBilling(user);
  const userIsParentGuardian = isParentGuardian(user);
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
    userId: user.id,
    isParentGuardian: userIsParentGuardian,
    roleScoped: canAccessAllCenters(user),
    centerIds: user.centerIds,
    invoiceId,
  });
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const { invoice, centerId } = access;
  if (invoice.status === PaymentStatus.PAID) {
    return NextResponse.json({ ok: false, error: "This invoice is already paid." }, { status: 400 });
  }
  if (invoice.totalCents <= 0) {
    return NextResponse.json({ ok: false, error: "Invoice total must be greater than zero." }, { status: 400 });
  }

  const stripeSecretConfigured = Boolean(await getStripeSecretKey({ tenantId: user.tenantId }));
  const stripeWebhookConfigured = Boolean(await getStripeWebhookSecret({ tenantId: user.tenantId }));

  if (!stripeSecretConfigured) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Payment processor keys are missing for this tenant, so parent checkout is disabled." },
      { status: 503 },
    );
  }
  if (process.env.STRIPE_REQUIRE_WEBHOOK_FOR_CHECKOUT !== "false" && !stripeWebhookConfigured) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Payment processor webhook signing secret is missing for this tenant, so payment reconciliation is disabled." },
      { status: 503 },
    );
  }

  const center = centerId
    ? await prisma.center.findUnique({
        where: { id: centerId },
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
  const allowPlatformOnlyPayments = process.env.STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS === "true";

  const billingApproval = stripeSchoolBillingApproval({ customFields: center?.customFields, centerName: center?.name });
  if (!billingApproval.approved) {
    return NextResponse.json({ ok: false, error: billingApproval.blockingReason, billingApproval }, { status: 403 });
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
    const accountStatus = await retrieveStripeConnectedAccount(connectedAccountId, { tenantId: user.tenantId });
    if (!accountStatus.ok || !accountStatus.account) {
      return NextResponse.json(
        {
          ok: false,
          configured: accountStatus.configured,
          error: accountStatus.error || "Payout status could not be confirmed.",
        },
        { status: accountStatus.configured ? 502 : 503 },
      );
    }

    const readiness = stripeConnectReadinessFromSnapshot(accountStatus.account);
    await prisma.center.update({
      where: { id: centerId! },
      data: {
        customFields: {
          ...(center?.customFields && typeof center.customFields === "object" && !Array.isArray(center.customFields)
            ? center.customFields
            : {}),
          ...stripeConnectCustomFieldPatch(readiness),
          stripeMerchantCapabilityStatus: accountStatus.account.merchantCapabilityStatus || null,
          stripeRecipientTransferStatus: accountStatus.account.recipientTransferStatus || null,
        },
      },
    });

    if (!readiness.canAcceptParentPayments) {
      return NextResponse.json(
        {
          ok: false,
          error: readiness.blockingReason || "This school's payout account is not ready yet. Finish payout onboarding before accepting parent payments.",
          status: readiness.status,
          requirements: readiness.requirementFields,
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
  });
  const billingAccountFields = jsonRecord(invoice.billingAccount.customFields);
  const productCheckoutBranding = invoiceProductCheckoutBranding({
    invoiceNumber: invoice.number,
    familyName: invoice.billingAccount.family.name,
    customFields: invoice.customFields,
    items: invoice.items,
  });
  const productCheckoutMetadata = invoiceProductStripeMetadata(invoice.customFields);
  const paymentDescription = productCheckoutBranding?.paymentDescription;
  let stripeCustomerId = stripeCustomerIdForAccount(billingAccountFields, connectedAccountId);
  if (!stripeCustomerId) {
    const customer = await createStripeCustomer({
      email: invoice.billingAccount.family.billingEmail,
      name: invoice.billingAccount.family.name,
      metadata: {
        tenantId: user.tenantId,
        billingAccountId: invoice.billingAccountId,
        familyId: invoice.billingAccount.familyId,
        centerId: centerId || "",
        stripeConnectedAccountId: connectedAccountId || "",
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      },
      connectedAccountId,
      tenantId: user.tenantId,
    });
    if (!customer.ok || !customer.id) {
      return NextResponse.json(
        { ok: false, configured: customer.configured, error: customer.error || "Family payment profile could not be created." },
        { status: customer.configured ? 502 : 503 },
      );
    }
    stripeCustomerId = customer.id;
    await prisma.billingAccount.update({
      where: { id: invoice.billingAccountId },
      data: {
        customFields: {
          ...billingAccountFields,
          ...stripeCustomerCustomFieldPatch(billingAccountFields, stripeCustomerId, connectedAccountId),
        },
      },
    });
  }

  const draftStripePayments = await prisma.payment.findMany({
    where: {
      billingAccountId: invoice.billingAccountId,
      provider: "stripe",
      status: PaymentStatus.DRAFT,
    },
    select: { id: true, amountCents: true, status: true, provider: true, externalIdPlaceholder: true, customFields: true },
  });
  const activePayment = draftStripePayments.find((item) =>
    isActiveStripeCheckoutPayment(item) && jsonRecord(item.customFields).invoiceId === invoice.id,
  );
  if (activePayment) {
    const blocker = await resolveStripeCheckoutDraftBlocker({
      payment: activePayment,
      connectedAccountId,
      tenantId: user.tenantId,
      scope: "invoice",
      requestedPaymentMethodCategory,
      expectedAmountCents: invoice.totalCents,
    });
    if (!blocker.blocked && blocker.url) {
      return NextResponse.json({
        ok: true,
        url: blocker.url,
        status: "checkout_session_reused",
        paymentId: activePayment.id,
        stripeSessionId: blocker.pendingPayment?.stripeCheckoutSessionId,
        feeDisclosure: PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
        feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
      });
    }
    if (blocker.blocked) {
      return NextResponse.json(
        {
          ok: false,
          error: blocker.message || activeStripeCheckoutPaymentMessage(activePayment, "invoice"),
          paymentId: activePayment.id,
          pendingPayment: blocker.pendingPayment || activeStripeCheckoutPaymentSummary(activePayment),
        },
        { status: 409 },
      );
    }
  }

  const payment = await prisma.payment.create({
    data: {
      billingAccountId: invoice.billingAccountId,
      amountCents: invoice.totalCents,
      status: PaymentStatus.DRAFT,
      provider: "stripe",
      externalIdPlaceholder: "checkout_session_pending",
      customFields: {
        invoiceId: invoice.id,
        invoiceAmountCents: invoice.totalCents,
        stripeCustomerId,
        stripeCustomerConnectedAccountId: connectedAccountId || null,
        bankAccountVerificationMethod,
        collectionMode,
        source,
        ...productCheckoutMetadata,
        description: paymentDescription || null,
        status: "checkout_pending",
      },
    },
  });

  const session = await createStripeCheckoutSession({
    amountCents: amounts.checkoutTotalCents,
    invoiceAmountCents: amounts.invoiceAmountCents,
    parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
    invoiceNumber: invoice.number,
    centerName: center?.name,
    customerId: stripeCustomerId,
    customerEmail: invoice.billingAccount.family.billingEmail,
    successUrl: `${baseUrl}${successPath}`,
    cancelUrl: `${baseUrl}${cancelPath}`,
    metadata: {
      tenantId: user.tenantId,
      invoiceId: invoice.id,
      paymentId: payment.id,
      familyId: invoice.billingAccount.familyId,
      centerId: centerId || "",
      stripeConnectedAccountId: connectedAccountId || "",
      stripeCustomerId,
      stripeChargeType: connectedAccountId ? "direct" : "platform",
      invoiceAmountCents: String(amounts.invoiceAmountCents),
      parentSurchargeAmountCents: String(amounts.parentSurchargeAmountCents),
      parentProcessingRecoveryAmountCents: String(amounts.parentProcessingRecoveryAmountCents),
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
    idempotencyKey: `checkout:${payment.id}`,
    checkoutBranding: productCheckoutBranding,
    tenantId: user.tenantId,
  });

  if (!session.ok || !session.url) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        externalIdPlaceholder: session.error || "stripe_checkout_failed",
        customFields: {
          invoiceAmountCents: amounts.invoiceAmountCents,
          parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
          parentProcessingRecoveryAmountCents: amounts.parentProcessingRecoveryAmountCents,
          beeSuitePaymentOperationsFeeAmountCents: amounts.beeSuitePaymentOperationsFeeAmountCents,
          beeSuitePaymentOperationsFeeWaived: waiveBeeSuitePaymentOperationsFee,
          requestedPaymentMethodCategory,
          paymentMethodCategory: amounts.paymentMethodCategory,
          paymentMethodConfigurationMissing: usesSpecificFeePolicy && !paymentMethodConfigurationId,
          checkoutTotalCents: amounts.checkoutTotalCents,
          applicationFeeAmountCents: amounts.applicationFeeAmountCents,
          invoiceId: invoice.id,
          stripeCustomerId,
          stripeCustomerConnectedAccountId: connectedAccountId || null,
          bankAccountVerificationMethod,
          collectionMode,
          source,
          ...productCheckoutMetadata,
          description: paymentDescription || null,
          stripeChargeType: connectedAccountId ? "direct" : "platform",
          status: "checkout_failed",
          stripeError: session.error || "stripe_checkout_failed",
        },
      },
    });

    return NextResponse.json(
      { ok: false, configured: session.configured, error: session.error || "Payment checkout could not be created." },
      { status: session.configured ? 502 : 503 },
    );
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      externalIdPlaceholder: session.id,
      customFields: {
        invoiceAmountCents: amounts.invoiceAmountCents,
        invoiceId: invoice.id,
        parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
        parentProcessingRecoveryAmountCents: amounts.parentProcessingRecoveryAmountCents,
        beeSuitePaymentOperationsFeeAmountCents: amounts.beeSuitePaymentOperationsFeeAmountCents,
        beeSuitePaymentOperationsFeeWaived: waiveBeeSuitePaymentOperationsFee,
        requestedPaymentMethodCategory,
        paymentMethodCategory: amounts.paymentMethodCategory,
        paymentMethodConfigurationMissing: usesSpecificFeePolicy && !paymentMethodConfigurationId,
        checkoutTotalCents: amounts.checkoutTotalCents,
        applicationFeeAmountCents: amounts.applicationFeeAmountCents,
        stripeCheckoutSessionId: session.id,
        stripeConnectedAccountId: connectedAccountId || null,
        stripeCustomerId,
        stripeCustomerConnectedAccountId: connectedAccountId || null,
        bankAccountVerificationMethod,
        collectionMode,
        source,
        ...productCheckoutMetadata,
        description: paymentDescription || null,
        stripeChargeType: connectedAccountId ? "direct" : "platform",
        status: "checkout_created",
      },
    },
  });

  await writeAuditLog(user, {
    centerId,
    action: "billing.checkout.created",
    resource: "Invoice",
    resourceId: invoice.id,
    metadata: {
      paymentId: payment.id,
      stripeSessionId: session.id,
      amountCents: invoice.totalCents,
      checkoutTotalCents: amounts.checkoutTotalCents,
      stripeConnectedAccountId: connectedAccountId || null,
      parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
      parentProcessingRecoveryAmountCents: amounts.parentProcessingRecoveryAmountCents,
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
  });

  return NextResponse.json({
    ok: true,
    url: session.url,
    paymentId: payment.id,
    stripeSessionId: session.id,
    feeDisclosure: PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
    feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
  });
}

export const POST = withApiLogging("POST", POSTHandler);
