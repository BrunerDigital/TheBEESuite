import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import { isActiveStripeCheckoutPayment, jsonRecord } from "@/lib/billing-guardrails";
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  createStripeOffSessionPaymentIntent,
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
  canChargeSavedPaymentMethod,
  paymentMethodAutopayCategory,
  paymentMethodManagementSummary,
} from "@/lib/payment-method-management";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { stripeCustomerCustomFieldPatch, stripeCustomerIdForAccount } from "@/lib/stripe-customer-scope";
import { getAppBaseUrl } from "@/lib/supabase-auth";

export const runtime = "nodejs";

type FamilyPaymentMethod = "saved_method" | "card_checkout" | "instant_bank_checkout" | "ach_checkout";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseAmountCents(body: Record<string, unknown>) {
  if (typeof body.amountCents === "number" && Number.isFinite(body.amountCents)) {
    return Math.round(body.amountCents);
  }
  const integer = Number.parseInt(clean(body.amountCents), 10);
  if (Number.isFinite(integer)) return integer;
  const dollars = clean(body.amountDollars);
  if (!dollars) return 0;
  const numeric = Number.parseFloat(dollars.replace(/[$,]/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function familyPaymentMethod(value: unknown): FamilyPaymentMethod {
  const normalized = clean(value).toLowerCase();
  if (normalized === "saved_method" || normalized === "card_checkout" || normalized === "instant_bank_checkout" || normalized === "ach_checkout") {
    return normalized;
  }
  return "card_checkout";
}

function checkoutCategory(method: FamilyPaymentMethod): StripePaymentMethodCategory {
  if (method === "card_checkout") return "card";
  if (method === "instant_bank_checkout") return "link_bank";
  if (method === "ach_checkout") return "ach";
  return "default";
}

function checkoutCollectionMode(method: FamilyPaymentMethod, value: unknown) {
  const requested = clean(value);
  if (requested.startsWith("director_")) return requested;
  if (method === "card_checkout") return "director_card_terminal";
  if (method === "instant_bank_checkout") return "director_instant_bank_checkout";
  if (method === "ach_checkout") return "director_ach_checkout";
  return "director_checkout";
}

function safeReturnPath(value: unknown, fallback: string) {
  const path = clean(value);
  if (!path || !path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
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
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageBilling(user)) {
    return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const billingAccountId = clean(body.billingAccountId);
  const familyId = clean(body.familyId);
  const method = familyPaymentMethod(body.method);
  const returnPath = safeReturnPath(body.returnPath, "/billing-invoices");
  const description = clean(body.description) || "Tuition payment";
  const source = clean(body.source) || "director_dashboard";
  const collectionMode = checkoutCollectionMode(method, body.collectionMode);

  const billingAccount = await prisma.billingAccount.findFirst({
    where: billingAccountId ? { id: billingAccountId } : { familyId },
    include: {
      family: {
        select: {
          id: true,
          name: true,
          billingEmail: true,
          centerId: true,
        },
      },
    },
  });
  if (!billingAccount) {
    return NextResponse.json({ ok: false, error: "Billing account not found." }, { status: 404 });
  }
  if (!billingAccount.family.centerId || !canAccessCenter(user, billingAccount.family.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this family." }, { status: 403 });
  }

  const requestedAmountCents = parseAmountCents(body);
  const amountCents = requestedAmountCents > 0 ? requestedAmountCents : billingAccount.balanceCents;
  if (amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "Payment amount must be greater than zero." }, { status: 400 });
  }

  const stripeSecretConfigured = Boolean(await getStripeSecretKey({ tenantId: user.tenantId }));
  const stripeWebhookConfigured = Boolean(await getStripeWebhookSecret({ tenantId: user.tenantId }));
  if (!stripeSecretConfigured) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Payment processor keys are missing for this tenant, so parent payments are disabled." },
      { status: 503 },
    );
  }
  if (process.env.STRIPE_REQUIRE_WEBHOOK_FOR_CHECKOUT !== "false" && !stripeWebhookConfigured) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Payment processor webhook signing secret is missing for this tenant, so payment reconciliation is disabled." },
      { status: 503 },
    );
  }

  const center = await prisma.center.findUnique({
    where: { id: billingAccount.family.centerId },
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
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "School not found." }, { status: 404 });
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
    const accountStatus = await retrieveStripeConnectedAccount(connectedAccountId, { tenantId: user.tenantId });
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

  const billingAccountFields = jsonRecord(billingAccount.customFields);
  let stripeCustomerId = stripeCustomerIdForAccount(billingAccountFields, connectedAccountId);
  if (!stripeCustomerId) {
    if (method === "saved_method") {
      return NextResponse.json(
        {
          ok: false,
          error: connectedAccountId
            ? "This family needs a saved payment method in this school's payout account before the selected method can be charged."
            : "This family needs a saved payment customer record before the selected method can be charged.",
        },
        { status: 400 },
      );
    }
    const customer = await createStripeCustomer({
      email: billingAccount.family.billingEmail,
      name: billingAccount.family.name,
      metadata: {
        tenantId: user.tenantId,
        billingAccountId: billingAccount.id,
        familyId: billingAccount.familyId,
        centerId: center.id,
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
      where: { id: billingAccount.id },
      data: {
        customFields: {
          ...billingAccountFields,
          ...stripeCustomerCustomFieldPatch(billingAccountFields, stripeCustomerId, connectedAccountId),
        },
      },
    });
  }

  const savedPaymentMethod = paymentMethodManagementSummary({
    autopayPlaceholder: billingAccount.autopayPlaceholder,
    customFields: {
      ...billingAccountFields,
      ...stripeCustomerCustomFieldPatch(billingAccountFields, stripeCustomerId, connectedAccountId),
    },
  });
  const savedPaymentMethodConnectedAccountId = clean(billingAccountFields.stripeDefaultPaymentMethodConnectedAccountId);
  if (method === "saved_method" && connectedAccountId && savedPaymentMethodConnectedAccountId && savedPaymentMethodConnectedAccountId !== connectedAccountId) {
    return NextResponse.json(
      { ok: false, error: "The saved payment method belongs to a different Stripe account. Replace the family payment method before charging it." },
      { status: 400 },
    );
  }
  const requestedPaymentMethodCategory = method === "saved_method"
    ? paymentMethodAutopayCategory(savedPaymentMethod)
    : checkoutCategory(method);
  const paymentMethodConfigurationId = getStripePaymentMethodConfigurationId(requestedPaymentMethodCategory);
  const usesSpecificFeePolicy = requestedPaymentMethodCategory !== "default";
  const requirePaymentMethodConfiguration = process.env.STRIPE_REQUIRE_PAYMENT_METHOD_CONFIGURATION_FOR_FEES === "true";
  if (method !== "saved_method" && usesSpecificFeePolicy && requirePaymentMethodConfiguration && !paymentMethodConfigurationId) {
    return NextResponse.json(
      {
        ok: false,
        error: "This payment method is not configured yet. Add the matching payment method configuration before enabling method-specific processing fees.",
      },
      { status: 400 },
    );
  }
  const effectivePaymentMethodCategory =
    method !== "saved_method" && usesSpecificFeePolicy && !paymentMethodConfigurationId ? "default" : requestedPaymentMethodCategory;
  const waiveBeeSuitePaymentOperationsFee = shouldWaiveStripePaymentOperationsFee({
    tenantSlug: center.organization.tenant.slug,
    tenantName: center.organization.tenant.name,
    brandSlug: center.organization.brand?.slug,
    brandName: center.organization.brand?.name,
  });
  const amounts = getStripeCheckoutAmounts(amountCents, {
    paymentMethodCategory: effectivePaymentMethodCategory,
    waiveBeeSuitePaymentOperationsFee,
  });

  let currentBillingAccountFields: Record<string, unknown> = {
    ...billingAccountFields,
    ...stripeCustomerCustomFieldPatch(billingAccountFields, stripeCustomerId, connectedAccountId),
  };
  const savedMethodNeedsCardAcceptance =
    method === "saved_method" &&
    requestedPaymentMethodCategory === "card" &&
    amounts.parentProcessingRecoveryAmountCents > 0 &&
    !clean(currentBillingAccountFields.cardProcessingRecoveryAcceptedAt);
  if (savedMethodNeedsCardAcceptance && body.processingRecoveryAccepted !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "Card payments using a saved method need the card processing recovery disclosure accepted before charging.",
        feeDisclosure: PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
        feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
        requiresProcessingRecoveryAcceptance: true,
      },
      { status: 400 },
    );
  }
  if (savedMethodNeedsCardAcceptance) {
    const acceptedAt = new Date().toISOString();
    currentBillingAccountFields = {
      ...currentBillingAccountFields,
      cardProcessingRecoveryAcceptedAt: acceptedAt,
      cardProcessingRecoveryAcceptedByUserId: user.id,
      cardProcessingRecoveryDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
    };
    await prisma.billingAccount.update({
      where: { id: billingAccount.id },
      data: { customFields: jsonInput(currentBillingAccountFields) },
    });
  }

  const paymentLabel = `${billingAccount.family.name} family payment`;
  const metadata = {
    tenantId: user.tenantId,
    paymentScope: "family_balance",
    billingAccountId: billingAccount.id,
    familyId: billingAccount.familyId,
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
    paymentMethodConfigurationMissing: String(method !== "saved_method" && usesSpecificFeePolicy && !paymentMethodConfigurationId),
    checkoutTotalCents: String(amounts.checkoutTotalCents),
    applicationFeeAmountCents: String(amounts.applicationFeeAmountCents),
    feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
    description,
    collectionMode,
    source,
    requestedByUserId: user.id,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
  };

  if (method === "saved_method") {
    if (!canChargeSavedPaymentMethod(savedPaymentMethod) || !savedPaymentMethod.stripeDefaultPaymentMethodId) {
      return NextResponse.json(
        { ok: false, error: "This family does not have a selected payment method saved in Stripe." },
        { status: 400 },
      );
    }
    const payment = await prisma.payment.create({
      data: {
        billingAccountId: billingAccount.id,
        amountCents,
        status: PaymentStatus.DRAFT,
        provider: "stripe",
        externalIdPlaceholder: "payment_intent_pending",
        customFields: jsonInput({
          ...metadata,
          paymentMethodLabel: savedPaymentMethod.paymentMethodLabel || null,
          collectionMode: "director_saved_method",
          status: "director_saved_method_pending",
        }),
      },
    });
    const intent = await createStripeOffSessionPaymentIntent({
      amountCents: amounts.checkoutTotalCents,
      invoiceAmountCents: amounts.invoiceAmountCents,
      parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
      invoiceNumber: paymentLabel,
      centerName: center.name,
      customerId: stripeCustomerId,
      paymentMethodId: savedPaymentMethod.stripeDefaultPaymentMethodId,
      customerEmail: billingAccount.family.billingEmail,
      metadata: {
        ...metadata,
        paymentId: payment.id,
        collectionMode: "director_saved_method",
      },
      connectedAccountId,
      applicationFeeAmountCents: amounts.applicationFeeAmountCents,
      idempotencyKey: `family-payment:intent:${payment.id}`,
      descriptionLabel: "director saved-method payment",
      tenantId: user.tenantId,
    });
    if (!intent.ok || !intent.paymentIntent?.id) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          externalIdPlaceholder: intent.id || intent.error || "stripe_payment_intent_failed",
          customFields: jsonInput({
            ...metadata,
            paymentId: payment.id,
            collectionMode: "director_saved_method",
            status: "director_saved_method_failed",
            stripePaymentIntentId: intent.paymentIntent?.id || intent.id || null,
            stripePaymentIntentStatus: intent.paymentIntent?.status || null,
            stripeError: intent.error || "stripe_payment_intent_failed",
          }),
        },
      });
      return NextResponse.json(
        { ok: false, configured: intent.configured, error: intent.error || "Saved payment method could not be charged." },
        { status: intent.configured ? 502 : 503 },
      );
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        externalIdPlaceholder: intent.paymentIntent.id,
        customFields: jsonInput({
          ...metadata,
          paymentId: payment.id,
          paymentMethodLabel: savedPaymentMethod.paymentMethodLabel || null,
          collectionMode: "director_saved_method",
          status: intent.paymentIntent.status === "succeeded" ? "director_saved_method_succeeded_pending_webhook" : "director_saved_method_processing",
          stripePaymentIntentId: intent.paymentIntent.id,
          stripePaymentIntentStatus: intent.paymentIntent.status || null,
          stripeAmountTotalCents: intent.paymentIntent.amountCents ?? null,
        }),
      },
    });

    await writeAuditLog(user, {
      centerId: center.id,
      action: "billing.family_payment.payment_intent_created",
      resource: "BillingAccount",
      resourceId: billingAccount.id,
      metadata: {
        paymentId: payment.id,
        stripePaymentIntentId: intent.paymentIntent.id,
        amountCents,
        checkoutTotalCents: amounts.checkoutTotalCents,
        paymentMethodCategory: amounts.paymentMethodCategory,
      },
    });

    return NextResponse.json({
      ok: true,
      status: "processing",
      paymentId: payment.id,
      stripePaymentIntentId: intent.paymentIntent.id,
      feeDisclosure: PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
      feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
    });
  }

  const draftStripePayments = await prisma.payment.findMany({
    where: {
      billingAccountId: billingAccount.id,
      provider: "stripe",
      status: PaymentStatus.DRAFT,
    },
    select: { id: true, customFields: true, provider: true, status: true },
  });
  const activeFamilyPayment = draftStripePayments.find((item) => {
    const fields = jsonRecord(item.customFields);
    return isActiveStripeCheckoutPayment(item) && fields.paymentScope === "family_balance";
  });
  if (activeFamilyPayment) {
    return NextResponse.json(
      {
        ok: false,
        error: "A balance checkout session is already pending for this family. Complete or expire it before creating another balance checkout.",
        paymentId: activeFamilyPayment.id,
      },
      { status: 409 },
    );
  }

  const payment = await prisma.payment.create({
    data: {
      billingAccountId: billingAccount.id,
      amountCents,
      status: PaymentStatus.DRAFT,
      provider: "stripe",
      externalIdPlaceholder: "checkout_session_pending",
      customFields: jsonInput({
        ...metadata,
        bankAccountVerificationMethod: method === "instant_bank_checkout" ? "instant" : null,
        collectionMode,
        status: "checkout_pending",
      }),
    },
  });

  const successPath = appendRawQuery(
    appendQuery(appendQuery(returnPath, "payment", "success"), "familyPayment", payment.id),
    "session_id",
    "{CHECKOUT_SESSION_ID}",
  );
  const cancelPath = appendQuery(appendQuery(returnPath, "payment", "cancelled"), "familyPayment", payment.id);
  const session = await createStripeCheckoutSession({
    amountCents: amounts.checkoutTotalCents,
    invoiceAmountCents: amounts.invoiceAmountCents,
    parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
    invoiceNumber: paymentLabel,
    centerName: center.name,
    customerId: stripeCustomerId,
    customerEmail: billingAccount.family.billingEmail,
    successUrl: `${getAppBaseUrl(request.url)}${successPath}`,
    cancelUrl: `${getAppBaseUrl(request.url)}${cancelPath}`,
    metadata: {
      ...metadata,
      paymentId: payment.id,
      bankAccountVerificationMethod: method === "instant_bank_checkout" ? "instant" : "",
      collectionMode,
    },
    connectedAccountId,
    applicationFeeAmountCents: amounts.applicationFeeAmountCents,
    paymentMethodConfigurationId,
    paymentMethodCategory: requestedPaymentMethodCategory,
    bankAccountVerificationMethod: method === "instant_bank_checkout" ? "instant" : null,
    onBehalfOfConnectedAccount: process.env.STRIPE_CHECKOUT_ON_BEHALF_OF === "true",
    idempotencyKey: `family-payment:checkout:${payment.id}`,
    tenantId: user.tenantId,
  });
  if (!session.ok || !session.url) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        externalIdPlaceholder: session.error || "stripe_checkout_failed",
        customFields: jsonInput({
          ...metadata,
          paymentId: payment.id,
          bankAccountVerificationMethod: method === "instant_bank_checkout" ? "instant" : null,
          collectionMode,
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
        ...metadata,
        paymentId: payment.id,
        stripeCheckoutSessionId: session.id,
        stripeConnectedAccountId: connectedAccountId || null,
        stripeCustomerConnectedAccountId: connectedAccountId || null,
        bankAccountVerificationMethod: method === "instant_bank_checkout" ? "instant" : null,
        collectionMode,
        status: "checkout_created",
      }),
    },
  });

  await writeAuditLog(user, {
    centerId: center.id,
    action: "billing.family_payment.checkout_created",
    resource: "BillingAccount",
    resourceId: billingAccount.id,
    metadata: {
      paymentId: payment.id,
      stripeSessionId: session.id,
      amountCents,
      checkoutTotalCents: amounts.checkoutTotalCents,
      requestedPaymentMethodCategory,
      paymentMethodCategory: amounts.paymentMethodCategory,
      bankAccountVerificationMethod: method === "instant_bank_checkout" ? "instant" : null,
      collectionMode,
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
