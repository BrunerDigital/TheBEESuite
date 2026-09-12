import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import {
  appReviewFamilyContainsReservedIdentity,
  appReviewReservedIdentityKind,
} from "@/lib/app-review-targeting";
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
import { stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { stripeSchoolReadinessFlowFromFields } from "@/lib/stripe-school-readiness-flow";
import { startInvoiceCheckout } from "@/lib/invoice-checkout-service";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
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

async function POSTHandler(request: NextRequest) {
  if (!hasTrustedMutationOrigin(request)) return NextResponse.json({ ok: false, error: "Untrusted request origin." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const token = clean(body.token);
  const validation = validatePaymentMethodRequestToken(token);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }

  const payload = validation.payload;
  if (payload.intent === "payment_method_reauthorization") {
    return NextResponse.json(
      {
        ok: false,
        code: "payment_method_reauthorization_required",
        error: "This link is for replacing the saved payment method. No payment was started. Complete the no-charge replacement first so the update is not requested again.",
      },
      { status: 409 },
    );
  }
  if (appReviewReservedIdentityKind(payload.email)) {
    return NextResponse.json({
      ok: false,
      error: "Payments are disabled in the App Review demo workspace.",
    }, { status: 403 });
  }
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
        select: {
          id: true,
          fullName: true,
          email: true,
          userId: true,
          user: { select: { email: true } },
        },
      },
      children: { select: { id: true, customFields: true } },
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
  if (appReviewFamilyContainsReservedIdentity(family)) {
    return NextResponse.json({
      ok: false,
      error: "Payments are disabled in the App Review demo workspace.",
    }, { status: 403 });
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
  if (!invoiceResponsibilityReviewExempt(
    invoice.customFields,
    invoice.totalCents,
    ...family.children.map((child) => ({ id: child.id, customFields: child.customFields })),
  ) && paymentCollectionResponsibilityHoldRequired({
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
    // Collection reads provider readiness without overwriting school configuration.

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
  const baseUrl = getSecurePaymentAppBaseUrl(request.url);
  const formPath = `/payment-method-form/${encodeURIComponent(token)}`;
  const centerLabel = center.crmLocationId ?? center.name;
  const successPath = appendRawQuery(
    appendQuery(appendQuery(formPath, "payment", "success"), "invoice", invoice.id),
    "session_id",
    "{CHECKOUT_SESSION_ID}",
  );
  const cancelPath = appendQuery(appendQuery(formPath, "payment", "cancelled"), "invoice", invoice.id);
  const result = await startInvoiceCheckout({
    topology: { tenantId: payload.tenantId, familyId: family.id, centerId: center.id, connectedAccountId },
    billingAccountId: billingAccount.id, invoiceId: invoice.id, invoiceTotalCents: invoice.totalCents,
    keyPrefix: "payment-request-checkout",
    customer: {
      email: family.billingEmail, name: family.name,
      metadata: { tenantId: payload.tenantId, billingAccountId: billingAccount.id, familyId: family.id,
        centerId: center.id, stripeConnectedAccountId: connectedAccountId || "",
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development" },
      connectedAccountId, tenantId: payload.tenantId,
    },
    request: {
    amountCents: amounts.checkoutTotalCents,
    invoiceAmountCents: amounts.invoiceAmountCents,
    parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
    invoiceNumber: invoice.number,
    centerName: center.name,
    customerEmail: payload.email,
    successUrl: `${baseUrl}${successPath}`,
    cancelUrl: `${baseUrl}${cancelPath}`,
    metadata: {
      source: PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE,
      tenantId: payload.tenantId,
      invoiceId: invoice.id,
      familyId: family.id,
      centerId: center.id,
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
    checkoutBranding: buildPaymentMethodRequestCheckoutBranding({
      centerLabel,
      familyName: family.name,
      intent: requestedPaymentMethodCategory === "link_bank" ? "instant_bank_verification" : "payment_steps",
    }),
    tenantId: payload.tenantId,
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
      bankAccountVerificationMethod, paymentRequestTokenFamilyId: family.id, paymentRequestRecipientEmail: payload.email,
      stripeChargeType: connectedAccountId ? "direct" : "platform",
    },
    authorize: async tx => {
      if (!validatePaymentMethodRequestToken(token).ok) return false;
      const freshFamily = await tx.family.findFirst({
        where: { id: family.id, centerId: center.id, billingAccount: { id: billingAccount.id } },
        select: { billingEmail: true, guardians: { select: { id: true, fullName: true, email: true, userId: true,
          user: { select: { email: true } } } } },
      });
      return Boolean(freshFamily && !appReviewFamilyContainsReservedIdentity(freshFamily)
        && paymentMethodRequestRecipientOptions(freshFamily).some(recipient => recipient.email === payload.email));
    },
    audit: async (tx, paymentId, session) => {
      await tx.auditLog.create({
    data: {
      tenantId: payload.tenantId,
      centerId: center.id,
      action: "billing.payment_method_request.checkout_created",
      resource: "Invoice",
      resourceId: invoice.id,
      metadata: {
        paymentId,
        familyId: family.id,
        recipientEmail: payload.email,
        stripeSessionId: session.id,
        requestedPaymentMethodCategory,
        paymentMethodCategory: amounts.paymentMethodCategory,
      },
    },
  });
  await tx.center.update({ where: { id: center.id }, data: { updatedAt: new Date() } });
    },
  });
  const { statusCode, ...response } = result;
  return NextResponse.json({
    ...response,
    ...(result.ok ? { feeDisclosure: PAYMENT_PROCESSING_RECOVERY_DISCLOSURE, feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION } : {}),
  }, { status: statusCode });
}

export const POST = withApiLogging("POST", POSTHandler);
