import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma } from "@prisma/client";
import {
  activeStripeCheckoutPaymentMessage,
  activeStripeCheckoutPaymentSummary,
  isActiveStripeCheckoutPayment,
  jsonRecord,
} from "@/lib/billing-guardrails";
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  getStripeCheckoutAmounts,
  getStripePaymentMethodConfigurationId,
  getStripeSecretKey,
  getStripeWebhookSecret,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
  shouldWaiveStripePaymentOperationsFee,
  type StripePaymentMethodCategory,
} from "@/lib/integrations";
import {
  PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
  PAYMENT_PROCESSING_RECOVERY_VERSION,
} from "@/lib/payment-disclosures";
import {
  buildPaymentMethodRequestCheckoutBranding,
  buildPublicPaymentBrandAssetUrl,
  getPaymentMethodRequestAppBaseUrl,
  PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE,
  paymentMethodRequestRecipientOptions,
  validatePaymentMethodRequestToken,
} from "@/lib/payment-method-request-forms";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { resolveWorkspaceBranding } from "@/lib/brand-assets";
import { resolveStripeCheckoutDraftBlocker } from "@/lib/stripe-checkout-drafts";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { stripeCustomerCustomFieldPatch, stripeCustomerIdForAccount } from "@/lib/stripe-customer-scope";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function paymentMethodCategory(value: unknown): StripePaymentMethodCategory {
  const normalized = clean(value).toLowerCase();
  if (normalized === "card" || normalized === "link_bank" || normalized === "ach") return normalized;
  return "link_bank";
}

function appendQuery(path: string, key: string, value: string) {
  const [base, hash = ""] = path.split("#", 2);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash ? `#${hash}` : ""}`;
}

function appendRawQuery(path: string, key: string, rawValue: string) {
  const [base, hash = ""] = path.split("#", 2);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${encodeURIComponent(key)}=${rawValue}${hash ? `#${hash}` : ""}`;
}

function jsonInput(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

async function POSTHandler(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const token = clean(body.token);
  const validation = validatePaymentMethodRequestToken(token);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }

  const payload = validation.payload;
  const requestedPaymentMethodCategory = paymentMethodCategory(body.paymentMethodCategory);
  const bankAccountVerificationMethod = requestedPaymentMethodCategory === "link_bank" ? "instant" : null;
  const invoiceId = clean(body.invoiceId);

  const family = await prisma.family.findUnique({
    where: { id: payload.familyId },
    select: {
      id: true,
      centerId: true,
      name: true,
      billingEmail: true,
      guardians: {
        select: { id: true, fullName: true, email: true, userId: true },
      },
      billingAccount: {
        select: {
          id: true,
          familyId: true,
          balanceCents: true,
          autopayPlaceholder: true,
          customFields: true,
        },
      },
    },
  });
  if (!family || family.centerId !== payload.centerId) {
    return NextResponse.json({ ok: false, error: "Payment link could not be matched to this family." }, { status: 404 });
  }

  const allowedEmails = new Set(paymentMethodRequestRecipientOptions({
    billingEmail: family.billingEmail,
    guardians: family.guardians,
  }).map((recipient) => recipient.email));
  if (!allowedEmails.has(payload.email)) {
    return NextResponse.json(
      { ok: false, error: "This payment link is no longer connected to a saved family email." },
      { status: 403 },
    );
  }

  const center = await prisma.center.findUnique({
    where: { id: payload.centerId },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      customFields: true,
      organization: {
        select: {
          tenantId: true,
          tenant: { select: { name: true, slug: true } },
          brand: { select: { name: true, slug: true } },
        },
      },
    },
  });
  if (!center || center.organization.tenantId !== payload.tenantId) {
    return NextResponse.json({ ok: false, error: "Payment link could not be matched to this school." }, { status: 404 });
  }

  const billingAccount = family.billingAccount ?? await prisma.billingAccount.upsert({
    where: { familyId: family.id },
    update: {},
    create: { familyId: family.id, balanceCents: 0 },
  });
  const invoice = invoiceId
    ? await prisma.invoice.findFirst({
        where: { id: invoiceId, billingAccountId: billingAccount.id },
        include: { billingAccount: { include: { family: true } } },
      })
    : await prisma.invoice.findFirst({
        where: { billingAccountId: billingAccount.id, status: PaymentStatus.OPEN },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        include: { billingAccount: { include: { family: true } } },
      });
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "No open invoice is available for this payment link." }, { status: 404 });
  }
  if (invoice.status === PaymentStatus.PAID) {
    return NextResponse.json({ ok: false, error: "This invoice is already paid." }, { status: 400 });
  }
  if (invoice.totalCents <= 0) {
    return NextResponse.json({ ok: false, error: "Invoice total must be greater than zero." }, { status: 400 });
  }

  const stripeSecretConfigured = Boolean(await getStripeSecretKey({ tenantId: payload.tenantId }));
  const stripeWebhookConfigured = Boolean(await getStripeWebhookSecret({ tenantId: payload.tenantId }));
  if (!stripeSecretConfigured) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Payment processor keys are missing, so checkout is disabled." },
      { status: 503 },
    );
  }
  if (process.env.STRIPE_REQUIRE_WEBHOOK_FOR_CHECKOUT !== "false" && !stripeWebhookConfigured) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Payment processor webhook signing secret is missing, so payment reconciliation is disabled." },
      { status: 503 },
    );
  }

  const connectedAccountId = readStripeConnectedAccountId(center.customFields);
  const allowPlatformOnlyPayments = process.env.STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS === "true";
  if (!connectedAccountId && !allowPlatformOnlyPayments) {
    return NextResponse.json(
      { ok: false, error: "This school needs a payout account before parent payments can be accepted." },
      { status: 400 },
    );
  }

  if (connectedAccountId && process.env.STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT !== "false") {
    const accountStatus = await retrieveStripeConnectedAccount(connectedAccountId, { tenantId: payload.tenantId });
    if (!accountStatus.ok || !accountStatus.account) {
      return NextResponse.json(
        { ok: false, configured: accountStatus.configured, error: accountStatus.error || "Payout status could not be confirmed." },
        { status: accountStatus.configured ? 502 : 503 },
      );
    }
    const readiness = stripeConnectReadinessFromSnapshot(accountStatus.account);
    await prisma.center.update({
      where: { id: center.id },
      data: {
        customFields: {
          ...jsonRecord(center.customFields),
          ...stripeConnectCustomFieldPatch(readiness),
          stripeMerchantCapabilityStatus: accountStatus.account.merchantCapabilityStatus || null,
          stripeRecipientTransferStatus: accountStatus.account.recipientTransferStatus || null,
        },
      },
    });
    if (!readiness.canAcceptParentPayments) {
      return NextResponse.json(
        { ok: false, error: readiness.blockingReason || "This school's payout account is not ready yet." },
        { status: 400 },
      );
    }
  }

  const paymentMethodConfigurationId = getStripePaymentMethodConfigurationId(requestedPaymentMethodCategory);
  const usesSpecificFeePolicy = requestedPaymentMethodCategory !== "default";
  const requirePaymentMethodConfiguration = process.env.STRIPE_REQUIRE_PAYMENT_METHOD_CONFIGURATION_FOR_FEES === "true";
  if (usesSpecificFeePolicy && requirePaymentMethodConfiguration && !paymentMethodConfigurationId) {
    return NextResponse.json(
      { ok: false, error: "This payment method is not configured yet." },
      { status: 400 },
    );
  }
  const effectivePaymentMethodCategory =
    usesSpecificFeePolicy && !paymentMethodConfigurationId ? "default" : requestedPaymentMethodCategory;

  const billingAccountFields = jsonRecord(billingAccount.customFields);
  let stripeCustomerId = stripeCustomerIdForAccount(billingAccountFields, connectedAccountId);
  if (!stripeCustomerId) {
    const customer = await createStripeCustomer({
      email: payload.email,
      name: family.name,
      metadata: {
        tenantId: payload.tenantId,
        billingAccountId: billingAccount.id,
        familyId: family.id,
        centerId: center.id,
        stripeConnectedAccountId: connectedAccountId || "",
        setupSource: PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE,
        recipientEmail: payload.email,
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      },
      connectedAccountId,
      tenantId: payload.tenantId,
    });
    if (!customer.ok || !customer.id) {
      return NextResponse.json(
        { ok: false, configured: customer.configured, error: customer.error || "Family payment profile could not be created." },
        { status: customer.configured ? 502 : 503 },
      );
    }
    stripeCustomerId = customer.id;
    await prisma.billingAccount.update({
      where: { id: billingAccount.id },
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
      tenantId: payload.tenantId,
      scope: "invoice",
    });
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

  const waiveBeeSuitePaymentOperationsFee = shouldWaiveStripePaymentOperationsFee({
    tenantSlug: center.organization.tenant.slug,
    tenantName: center.organization.tenant.name,
    brandSlug: center.organization.brand?.slug,
    brandName: center.organization.brand?.name,
  });
  const amounts = getStripeCheckoutAmounts(invoice.totalCents, {
    paymentMethodCategory: effectivePaymentMethodCategory,
    waiveBeeSuitePaymentOperationsFee,
  });
  const payment = await prisma.payment.create({
    data: {
      billingAccountId: invoice.billingAccountId,
      amountCents: invoice.totalCents,
      status: PaymentStatus.DRAFT,
      provider: "stripe",
      externalIdPlaceholder: "checkout_session_pending",
      customFields: jsonInput({
        invoiceId: invoice.id,
        invoiceAmountCents: invoice.totalCents,
        stripeCustomerId,
        stripeCustomerConnectedAccountId: connectedAccountId || null,
        paymentRequestTokenFamilyId: family.id,
        paymentRequestRecipientEmail: payload.email,
        bankAccountVerificationMethod,
        status: "checkout_pending",
      }),
    },
  });

  const baseUrl = getPaymentMethodRequestAppBaseUrl(request.url);
  const formPath = `/payment-method-form/${encodeURIComponent(token)}`;
  const centerLabel = center.crmLocationId ?? center.name;
  const branding = resolveWorkspaceBranding({
    tenantName: center.organization.tenant.name,
    tenantSlug: center.organization.tenant.slug,
    brandName: center.organization.brand?.name,
    brandSlug: center.organization.brand?.slug,
    organizationName: center.name,
    email: payload.email,
  });
  const logoUrl = buildPublicPaymentBrandAssetUrl(baseUrl, branding.logoSrc);
  const iconUrl = buildPublicPaymentBrandAssetUrl(baseUrl, branding.markSrc);
  const successPath = appendRawQuery(
    appendQuery(appendQuery(formPath, "payment", "success"), "invoice", invoice.id),
    "session_id",
    "{CHECKOUT_SESSION_ID}",
  );
  const cancelPath = appendQuery(appendQuery(formPath, "payment", "cancelled"), "invoice", invoice.id);
  const session = await createStripeCheckoutSession({
    amountCents: amounts.checkoutTotalCents,
    invoiceAmountCents: amounts.invoiceAmountCents,
    parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
    invoiceNumber: invoice.number,
    centerName: center.name,
    customerId: stripeCustomerId,
    customerEmail: payload.email,
    successUrl: `${baseUrl}${successPath}`,
    cancelUrl: `${baseUrl}${cancelPath}`,
    metadata: {
      source: PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE,
      tenantId: payload.tenantId,
      invoiceId: invoice.id,
      paymentId: payment.id,
      familyId: family.id,
      centerId: center.id,
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
      paymentMethodConfigurationMissing: String(usesSpecificFeePolicy && !paymentMethodConfigurationId),
      checkoutTotalCents: String(amounts.checkoutTotalCents),
      applicationFeeAmountCents: String(amounts.applicationFeeAmountCents),
      feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
      paymentRequestRecipientEmail: payload.email,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    },
    connectedAccountId,
    applicationFeeAmountCents: amounts.applicationFeeAmountCents,
    paymentMethodConfigurationId,
    paymentMethodCategory: requestedPaymentMethodCategory,
    bankAccountVerificationMethod,
    onBehalfOfConnectedAccount: process.env.STRIPE_CHECKOUT_ON_BEHALF_OF === "true",
    idempotencyKey: `payment-request-checkout:${payment.id}`,
    checkoutBranding: buildPaymentMethodRequestCheckoutBranding({
      centerLabel,
      familyName: family.name,
      intent: bankAccountVerificationMethod === "instant" ? "instant_bank_verification" : "payment_steps",
      logoUrl,
      iconUrl,
    }),
    tenantId: payload.tenantId,
  });

  if (!session.ok || !session.url) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        externalIdPlaceholder: session.error || "stripe_checkout_failed",
        customFields: jsonInput({
          invoiceId: invoice.id,
          invoiceAmountCents: amounts.invoiceAmountCents,
          requestedPaymentMethodCategory,
          paymentMethodCategory: amounts.paymentMethodCategory,
          checkoutTotalCents: amounts.checkoutTotalCents,
          stripeCustomerId,
          stripeCustomerConnectedAccountId: connectedAccountId || null,
          bankAccountVerificationMethod,
          stripeError: session.error || "stripe_checkout_failed",
          status: "checkout_failed",
        }),
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
      customFields: jsonInput({
        invoiceId: invoice.id,
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
        stripeCheckoutSessionId: session.id,
        stripeConnectedAccountId: connectedAccountId || null,
        stripeCustomerId,
        stripeCustomerConnectedAccountId: connectedAccountId || null,
        bankAccountVerificationMethod,
        paymentRequestTokenFamilyId: family.id,
        paymentRequestRecipientEmail: payload.email,
        stripeChargeType: connectedAccountId ? "direct" : "platform",
        status: "checkout_created",
      }),
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: payload.tenantId,
      centerId: center.id,
      action: "billing.payment_method_request.checkout_created",
      resource: "Invoice",
      resourceId: invoice.id,
      metadata: {
        paymentId: payment.id,
        familyId: family.id,
        recipientEmail: payload.email,
        stripeSessionId: session.id,
        requestedPaymentMethodCategory,
        paymentMethodCategory: amounts.paymentMethodCategory,
      },
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
