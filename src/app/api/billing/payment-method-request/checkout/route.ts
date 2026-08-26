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
import {
  buildPaymentMethodRequestCheckoutBranding,
  PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE,
  paymentMethodRequestRecipientOptions,
  validatePaymentMethodRequestToken,
} from "@/lib/payment-method-request-forms";
import {
  PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
  paymentServiceError,
} from "@/lib/parent-payment-errors";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { resolveStripeCheckoutDraftBlocker } from "@/lib/stripe-checkout-drafts";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { stripeSchoolReadinessFlowFromFields } from "@/lib/stripe-school-readiness-flow";
import { stripeCustomerCustomFieldPatch, stripeCustomerIdForAccount } from "@/lib/stripe-customer-scope";
import { invoiceResponsibilityReviewExempt, invoiceResponsibilitySeparation } from "@/lib/invoice-responsibility-separation";
import {
  AGENCY_LEDGER_ENTRY_TYPES,
  AGENCY_LEDGER_SOURCE_SYSTEM,
  paymentCollectionResponsibilityHoldRequired,
} from "@/lib/parent-billing-visibility";

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
  const bankAccountVerificationMethod = requestedPaymentMethodCategory === "link_bank" ? "automatic" : null;
  const invoiceId = clean(body.invoiceId);

  const family = await prisma.family.findUnique({
    where: { id: payload.familyId },
    select: {
      id: true,
      centerId: true,
      name: true,
      billingEmail: true,
      customFields: true,
      guardians: {
        select: { id: true, fullName: true, email: true, userId: true },
      },
      children: { select: { customFields: true } },
      billingAccount: {
        select: {
          id: true,
          familyId: true,
          balanceCents: true,
          autopayPlaceholder: true,
          customFields: true,
          ledgerEntries: {
            where: {
              OR: [
                { type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } },
                { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM },
              ],
            },
            select: { type: true, amountCents: true, sourceSystem: true, invoiceId: true, metadata: true },
          },
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
  const agencyLedgerEntries = "ledgerEntries" in billingAccount ? billingAccount.ledgerEntries : [];
  const invoice = invoiceId
    ? await prisma.invoice.findFirst({
        where: { id: invoiceId, billingAccountId: billingAccount.id },
        include: { items: { select: { description: true } }, billingAccount: { include: { family: true } } },
      })
    : await prisma.invoice.findFirst({
        where: { billingAccountId: billingAccount.id, status: PaymentStatus.OPEN },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        include: { items: { select: { description: true } }, billingAccount: { include: { family: true } } },
      });
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "No open invoice is available for this payment link." }, { status: 404 });
  }
  if (invoice.status !== PaymentStatus.OPEN) {
    return NextResponse.json({ ok: false, error: "This invoice is no longer open for payment." }, { status: 409 });
  }
  if (invoice.totalCents <= 0) {
    return NextResponse.json({ ok: false, error: "Invoice total must be greater than zero." }, { status: 400 });
  }
  if (!invoiceResponsibilityReviewExempt(invoice.customFields, invoice.totalCents) && paymentCollectionResponsibilityHoldRequired({
    accountBalanceCents: billingAccount.balanceCents,
    agencyLedgerEntries,
    invoiceId: invoice.id,
    invoiceResponsibilitySeparated: invoiceResponsibilitySeparation(invoice.customFields) !== null,
    responsibilityEvidence: [
      invoice.customFields,
      invoice.items.map((item) => item.description),
    ],
    enforceCollectionHold: true,
  })) {
    return NextResponse.json(
      { ok: false, error: "The school must separate family and agency responsibility before this invoice can be paid." },
      { status: 409 },
    );
  }

  const stripeSecretConfigured = Boolean(await getStripeSecretKey({ tenantId: payload.tenantId }));
  const stripeWebhookConfigured = Boolean(await getStripeWebhookSecret({ tenantId: payload.tenantId }));
  if (!stripeSecretConfigured) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: paymentServiceError({
          parentFacing: true,
          providerError: "Payment processor keys are missing, so checkout is disabled.",
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
          parentFacing: true,
          providerError:
            "Payment processor webhook signing secret is missing, so payment reconciliation is disabled.",
          fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
        }),
      },
      { status: 503 },
    );
  }

  const connectedAccountId = readStripeConnectedAccountId(center.customFields);
  let schoolPaysStripeFeesDirectly = jsonRecord(center.customFields).stripeFeesCollector === "stripe";
  const allowPlatformOnlyPayments = process.env.STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS === "true";
  const billingApproval = stripeSchoolBillingApproval({ customFields: center.customFields, centerName: center.name });
  if (!billingApproval.approved) {
    return NextResponse.json(
      {
        ok: false,
        error: paymentServiceError({
          parentFacing: true,
          providerError: billingApproval.blockingReason || "Online billing is not approved for this school.",
          fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
        }),
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
          parentFacing: true,
          providerError: paymentReadiness.explanation,
          fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
        }),
      },
      { status: 403 },
    );
  }
  if (!connectedAccountId && !allowPlatformOnlyPayments) {
    return NextResponse.json(
      {
        ok: false,
        error: paymentServiceError({
          parentFacing: true,
          providerError: "This school needs a payout account before parent payments can be accepted.",
          fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
        }),
      },
      { status: 400 },
    );
  }

  if (connectedAccountId && process.env.STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT !== "false") {
    const accountStatus = await retrieveStripeConnectedAccount(connectedAccountId, { tenantId: payload.tenantId });
    if (!accountStatus.ok || !accountStatus.account) {
      return NextResponse.json(
        {
          ok: false,
          configured: accountStatus.configured,
          error: paymentServiceError({
            parentFacing: true,
            providerError: accountStatus.error || "Payout status could not be confirmed.",
            fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
          }),
        },
        { status: accountStatus.configured ? 502 : 503 },
      );
    }
    const readiness = stripeConnectReadinessFromSnapshot(accountStatus.account);
    schoolPaysStripeFeesDirectly = stripeConnectedAccountPaysFeesDirectly(accountStatus.account);
    await prisma.center.update({
      where: { id: center.id },
      data: {
        customFields: {
          ...jsonRecord(center.customFields),
          ...stripeConnectCustomFieldPatch(readiness),
          stripeMerchantCapabilityStatus: accountStatus.account.merchantCapabilityStatus || null,
          stripeRecipientTransferStatus: accountStatus.account.recipientTransferStatus || null,
          stripeFeesCollector: accountStatus.account.feesCollector || null,
          stripeLossesCollector: accountStatus.account.lossesCollector || null,
        },
      },
    });
    if (!readiness.canAcceptParentPayments) {
      return NextResponse.json(
        {
          ok: false,
          error: paymentServiceError({
            parentFacing: true,
            providerError: readiness.blockingReason || "This school's payout account is not ready yet.",
            fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
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
        error: paymentServiceError({
          parentFacing: true,
          providerError: "This payment method is not configured yet.",
          fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
        }),
      },
      { status: 400 },
    );
  }
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
        {
          ok: false,
          configured: customer.configured,
          error: paymentServiceError({
            parentFacing: true,
            providerError: customer.error || "Family payment profile could not be created.",
            fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
          }),
        },
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
      requestedPaymentMethodCategory,
      expectedAmountCents: invoice.totalCents,
      expectedCheckoutTotalCents: invoice.totalCents,
      expectedFeeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
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

  const waiveBeeSuitePaymentOperationsFee = shouldWaiveStripePaymentOperationsFee({
    tenantSlug: center.organization.tenant.slug,
    tenantName: center.organization.tenant.name,
    brandSlug: center.organization.brand?.slug,
    brandName: center.organization.brand?.name,
  });
  const amounts = getStripeCheckoutAmounts(invoice.totalCents, {
    paymentMethodCategory: requestedPaymentMethodCategory,
    waiveBeeSuitePaymentOperationsFee,
    schoolPaysStripeFeesDirectly,
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

  const baseUrl = getSecurePaymentAppBaseUrl(request.url);
  const formPath = `/payment-method-form/${encodeURIComponent(token)}`;
  const centerLabel = center.crmLocationId ?? center.name;
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
      schoolProcessingFeeAmountCents: String(amounts.schoolProcessingFeeAmountCents),
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
      intent: requestedPaymentMethodCategory === "link_bank" ? "instant_bank_verification" : "payment_steps",
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
    await prisma.center.update({ where: { id: center.id }, data: { updatedAt: new Date() } });
    return NextResponse.json(
      {
        ok: false,
        configured: session.configured,
        error: paymentServiceError({
          parentFacing: true,
          providerError: session.error || "Payment checkout could not be created.",
          fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
        }),
      },
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
        schoolProcessingFeeAmountCents: amounts.schoolProcessingFeeAmountCents,
        beeSuitePaymentOperationsFeeAmountCents: amounts.beeSuitePaymentOperationsFeeAmountCents,
        beeSuitePaymentOperationsFeeWaived: waiveBeeSuitePaymentOperationsFee,
        requestedPaymentMethodCategory,
        paymentMethodCategory: amounts.paymentMethodCategory,
        paymentMethodConfigurationMissing: usesSpecificFeePolicy && !paymentMethodConfigurationId,
        checkoutTotalCents: amounts.checkoutTotalCents,
        applicationFeeAmountCents: amounts.applicationFeeAmountCents,
        stripeCheckoutSessionId: session.id,
        stripeCheckoutSessionCreatedAt: session.createdAt ?? null,
        stripeCheckoutSessionExpiresAt: session.expiresAt ?? null,
        stripeCheckoutSessionStatus: session.status ?? null,
        stripeCheckoutPaymentStatus: session.paymentStatus ?? null,
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
  await prisma.center.update({ where: { id: center.id }, data: { updatedAt: new Date() } });

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
