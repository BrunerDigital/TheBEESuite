import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { provisionalAchCreditCents } from "@/lib/ach-payment-lifecycle";
import { canAccessCenter, canManageBilling, getCurrentUser, isParentGuardian } from "@/lib/auth";
import {
  activeStripeCheckoutPaymentMessage,
  activeStripeCheckoutPaymentSummary,
  isActiveStripeCheckoutPayment,
  jsonRecord,
} from "@/lib/billing-guardrails";
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  createStripeOffSessionPaymentIntent,
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
  canChargeSavedPaymentMethod,
  paymentMethodAutopayCategory,
  paymentMethodManagementSummary,
} from "@/lib/payment-method-management";
import {
  AGENCY_LEDGER_ENTRY_TYPES,
  AGENCY_LEDGER_SOURCE_SYSTEM,
  paymentCollectionResponsibilityHoldRequired,
  parentPaymentAmountCents,
} from "@/lib/parent-billing-visibility";
import { canAccessFamilyRecord } from "@/lib/portal-guardrails";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { resolveStripeCheckoutDraftBlocker } from "@/lib/stripe-checkout-drafts";
import { createStripePaymentClaim } from "@/lib/stripe-payment-claims";
import { allOpenInvoicesResponsibilitySeparated } from "@/lib/invoice-responsibility-separation";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { stripeConnectSavedMethodAccount } from "@/lib/stripe-connect-migration";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { stripeSchoolReadinessFlowFromFields } from "@/lib/stripe-school-readiness-flow";
import { stripeCustomerCustomFieldPatch, stripeCustomerIdForAccount } from "@/lib/stripe-customer-scope";
import { applySucceededStripeFamilyBalancePayment } from "@/lib/stripe-payment-application";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { getParentPortalFamilyScope, getParentPortalPaymentFamilyScope } from "@/lib/parent-portal-family-scope";
import {
  PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
  paymentServiceError,
} from "@/lib/parent-payment-errors";

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
  const userCanManageBilling = canManageBilling(user);
  const userIsParentGuardian = isParentGuardian(user);
  if (!userCanManageBilling && !userIsParentGuardian) {
    return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const billingAccountId = clean(body.billingAccountId);
  const familyId = clean(body.familyId);
  const method = familyPaymentMethod(body.method);
  const parentFamilyScope = userIsParentGuardian && !userCanManageBilling
    ? method === "saved_method"
      ? await getParentPortalFamilyScope(user.id, user.tenantId, familyId || null)
      : await getParentPortalPaymentFamilyScope(user.id, user.tenantId, familyId || null)
    : null;
  if (parentFamilyScope && !parentFamilyScope.ok) {
    return NextResponse.json({ ok: false, error: "Your family link needs review before payment can continue." }, { status: 409 });
  }
  const parentCheckout = userIsParentGuardian && !userCanManageBilling;
  const returnPath = safeReturnPath(body.returnPath, parentCheckout ? "/parent-portal" : "/billing-invoices");
  const description = parentCheckout ? "Family balance payment" : clean(body.description) || "Tuition payment";
  const source = parentCheckout ? "parent_portal" : clean(body.source) || "director_dashboard";
  const collectionMode = checkoutCollectionMode(method, body.collectionMode, userCanManageBilling);

  const billingAccount = await prisma.billingAccount.findFirst({
    where: billingAccountId ? { id: billingAccountId } : { familyId },
    include: {
      invoices: {
        where: { status: { in: [PaymentStatus.OPEN, PaymentStatus.PAID, PaymentStatus.VOID] } },
        select: { status: true, totalCents: true, customFields: true, items: { select: { description: true } } },
      },
      family: {
        select: {
          id: true,
          name: true,
          billingEmail: true,
          centerId: true,
          customFields: true,
          guardians: { select: { userId: true } },
          children: { select: { id: true, customFields: true } },
        },
      },
    },
  });
  if (!billingAccount) {
    return NextResponse.json({ ok: false, error: "Billing account not found." }, { status: 404 });
  }
  if (parentFamilyScope?.ok && billingAccount.family.id !== parentFamilyScope.familyId) {
    return NextResponse.json({ ok: false, error: "You do not have access to this family." }, { status: 403 });
  }
  const centerId = billingAccount.family.centerId;
  const accessGuard = canAccessFamilyRecord({
    isParentGuardian: userIsParentGuardian,
    isLinkedGuardian: billingAccount.family.guardians.some((guardian) => guardian.userId === user.id),
    hasCenterAccess: Boolean(centerId && canAccessCenter(user, centerId)),
  });
  if (!accessGuard.ok || !centerId) {
    return NextResponse.json({ ok: false, error: "You do not have access to this family." }, { status: 403 });
  }
  if (parentCheckout && method === "saved_method") {
    return NextResponse.json({ ok: false, error: "Parents must confirm payment through secure checkout." }, { status: 400 });
  }

  const draftStripePayments = await prisma.payment.findMany({
    where: {
      billingAccountId: billingAccount.id,
      provider: "stripe",
      status: PaymentStatus.DRAFT,
    },
    select: { id: true, amountCents: true, customFields: true, externalIdPlaceholder: true, provider: true, status: true },
  });
  const activeInvoicePayment = parentCheckout
    ? draftStripePayments.find((item) => {
        const fields = jsonRecord(item.customFields);
        return isActiveStripeCheckoutPayment(item) && Boolean(fields.invoiceId);
      })
    : null;
  if (activeInvoicePayment) {
    return NextResponse.json(
      {
        ok: false,
        error: "An invoice checkout is already processing. Complete or cancel it before paying the family balance.",
        paymentId: activeInvoicePayment.id,
      },
      { status: 409 },
    );
  }

  const requestedAmountCents = parseAmountCents(body);
  const parentAmountProvided = typeof body.amountCents === "number"
    || clean(body.amountCents) !== ""
    || clean(body.amountDollars) !== "";
  if (parentCheckout && parentAmountProvided && requestedAmountCents <= 0) {
    return NextResponse.json(
      { ok: false, error: "Payment amount must be greater than zero.", code: "parent_account_payment_amount_invalid" },
      { status: 400 },
    );
  }
  const agencyLedgerEntries = parentCheckout
    ? await prisma.ledgerEntry.findMany({
        where: {
          billingAccountId: billingAccount.id,
          OR: [
            { type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } },
            { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM },
          ],
        },
        select: { type: true, sourceSystem: true, amountCents: true },
      })
    : [];
  const responsibilityReviewRequired = parentCheckout && paymentCollectionResponsibilityHoldRequired({
    accountBalanceCents: billingAccount.balanceCents,
    agencyLedgerEntries,
    invoiceResponsibilitySeparated: allOpenInvoicesResponsibilitySeparated(
      billingAccount.invoices,
      ...billingAccount.family.children.map((child) => ({ id: child.id, customFields: child.customFields })),
    ),
    responsibilityEvidence: [
      billingAccount.customFields,
      billingAccount.family.customFields,
      ...billingAccount.family.children.map((child) => child.customFields),
      ...billingAccount.invoices.flatMap((invoice) => [invoice.customFields, invoice.items.map((item) => item.description)]),
    ],
  });
  if (responsibilityReviewRequired) {
    return NextResponse.json(
      {
        ok: false,
        error: "The school must separate family and agency responsibility before an account payment can be made.",
        code: "parent_account_payment_responsibility_review_required",
      },
      { status: 409 },
    );
  }
  const amountCents = parentCheckout
    ? parentPaymentAmountCents({
        accountBalanceCents: billingAccount.balanceCents,
        agencyLedgerEntries,
        requestedAmountCents,
        responsibilityReviewRequired,
        provisionalCreditCents: provisionalAchCreditCents(draftStripePayments),
      })
    : requestedAmountCents > 0 ? requestedAmountCents : billingAccount.balanceCents;
  if (amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "Payment amount must be greater than zero." }, { status: 400 });
  }

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

  const center = await prisma.center.findUnique({
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
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "School not found." }, { status: 404 });
  }

  const billingAccountFields = jsonRecord(billingAccount.customFields);
  const activeConnectedAccountId = readStripeConnectedAccountId(center.customFields);
  const savedPaymentMethodConnectedAccountId = clean(billingAccountFields.stripeDefaultPaymentMethodConnectedAccountId);
  const connectedAccountId = method === "saved_method"
    ? stripeConnectSavedMethodAccount({
        activeAccountId: activeConnectedAccountId,
        savedMethodAccountId: savedPaymentMethodConnectedAccountId,
        centerCustomFields: center.customFields,
      })
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

  if (connectedAccountId && process.env.STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT !== "false") {
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
    if (connectedAccountId === activeConnectedAccountId) {
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
    }
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
        {
          ok: false,
          configured: customer.configured,
          error: paymentServiceError({
            parentFacing: parentCheckout,
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

  const savedPaymentMethod = paymentMethodManagementSummary({
    autopayPlaceholder: billingAccount.autopayPlaceholder,
    customFields: {
      ...billingAccountFields,
      ...stripeCustomerCustomFieldPatch(billingAccountFields, stripeCustomerId, connectedAccountId),
    },
  });
  const requestedPaymentMethodCategory = method === "saved_method"
    ? paymentMethodAutopayCategory(savedPaymentMethod)
    : checkoutCategory(method);
  const paymentMethodConfigurationId = getStripePaymentMethodConfigurationId(requestedPaymentMethodCategory);
  const usesSpecificFeePolicy = requiresStripePaymentMethodConfiguration(requestedPaymentMethodCategory);
  const requirePaymentMethodConfiguration = process.env.STRIPE_REQUIRE_PAYMENT_METHOD_CONFIGURATION_FOR_FEES === "true";
  if (method !== "saved_method" && usesSpecificFeePolicy && requirePaymentMethodConfiguration && !paymentMethodConfigurationId) {
    return NextResponse.json(
      {
        ok: false,
        error: parentCheckout
          ? PARENT_PAYMENT_UNAVAILABLE_MESSAGE
          : "This payment method is not configured yet. Add the matching payment method configuration before enabling method-specific processing fees.",
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
  const amounts = getStripeCheckoutAmounts(amountCents, {
    paymentMethodCategory: requestedPaymentMethodCategory,
    waiveBeeSuitePaymentOperationsFee,
    schoolPaysStripeFeesDirectly,
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
    schoolProcessingFeeAmountCents: String(amounts.schoolProcessingFeeAmountCents),
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
    responsibilityReviewRequired: String(responsibilityReviewRequired),
    requestedByUserId: user.id,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
  };

  if (method === "saved_method") {
    if (!canChargeSavedPaymentMethod(savedPaymentMethod) || !savedPaymentMethod.stripeDefaultPaymentMethodId) {
      return NextResponse.json(
        { ok: false, error: "This family does not have a selected payment method saved yet." },
        { status: 400 },
      );
    }
    const paymentClaim = await createStripePaymentClaim({
      billingAccountId: billingAccount.id,
      scope: "family_balance",
      paymentData: {
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
    if (!paymentClaim.created) {
      return NextResponse.json({
        ok: false,
        error: "Another payment is already pending or processing for this family. Wait for it to finish before submitting another payment.",
        paymentId: paymentClaim.blockingPaymentId,
      }, { status: 409 });
    }
    const payment = paymentClaim.payment;
    const intent = await createStripeOffSessionPaymentIntent({
      amountCents: amounts.checkoutTotalCents,
      invoiceAmountCents: amounts.invoiceAmountCents,
      parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
      invoiceNumber: paymentLabel,
      centerName: center.name,
      customerId: stripeCustomerId,
      paymentMethodId: savedPaymentMethod.stripeDefaultPaymentMethodId,
      paymentMethodType: savedPaymentMethod.paymentMethodType,
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
      await prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.DRAFT },
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
      await prisma.center.update({
        where: { id: center.id },
        data: { updatedAt: new Date() },
      });
      return NextResponse.json(
        { ok: false, configured: intent.configured, error: intent.error || "Saved payment method could not be charged." },
        { status: intent.configured ? 502 : 503 },
      );
    }

    let appliedImmediately = false;
    let immediateApplicationReason: string | null = null;
    let terminalPaymentStatus: PaymentStatus | null = null;
    if (intent.paymentIntent.status === "succeeded") {
      const application = await prisma.$transaction((tx) => applySucceededStripeFamilyBalancePayment(tx, {
        paymentId: payment.id,
        externalId: intent.paymentIntent!.id,
        stripePaymentIntentId: intent.paymentIntent!.id,
        stripePaymentStatus: intent.paymentIntent?.status || null,
        stripePaymentIntentStatus: intent.paymentIntent?.status || null,
        stripeAmountTotalCents: intent.paymentIntent?.amountCents ?? amounts.checkoutTotalCents,
        metadata: {
          ...metadata,
          paymentId: payment.id,
          paymentMethodLabel: savedPaymentMethod.paymentMethodLabel || null,
          collectionMode: "director_saved_method",
        },
        descriptionFallback: "Director saved method payment",
      }));
      appliedImmediately = application.applied || application.reason === "payment_already_applied";
      immediateApplicationReason = application.reason;
    }

    if (!appliedImmediately) {
      const submissionUpdate = await prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.DRAFT },
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
            immediateApplicationReason,
          }),
        },
      });
      if (submissionUpdate.count !== 1) {
        const winningPayment = await prisma.payment.findUnique({
          where: { id: payment.id },
          select: { status: true },
        });
        terminalPaymentStatus = winningPayment?.status ?? PaymentStatus.FAILED;
        appliedImmediately = terminalPaymentStatus === PaymentStatus.PAID;
      }
    }

    const terminalFailure = terminalPaymentStatus !== null && terminalPaymentStatus !== PaymentStatus.PAID;

    await writeAuditLog(user, {
      centerId: center.id,
      action: appliedImmediately
        ? "billing.family_payment.payment_intent_succeeded"
        : terminalFailure
          ? "billing.family_payment.payment_intent_failed"
          : "billing.family_payment.payment_intent_created",
      resource: "BillingAccount",
      resourceId: billingAccount.id,
      metadata: {
        paymentId: payment.id,
        stripePaymentIntentId: intent.paymentIntent.id,
        amountCents,
        checkoutTotalCents: amounts.checkoutTotalCents,
        paymentMethodCategory: amounts.paymentMethodCategory,
        appliedImmediately,
        immediateApplicationReason,
        terminalPaymentStatus,
      },
    });

    if (terminalFailure) {
      return NextResponse.json({
        ok: false,
        status: "failed",
        error: "The payment failed or was returned before processing finished. It can be retried.",
        paymentId: payment.id,
        stripePaymentIntentId: intent.paymentIntent.id,
      }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      status: appliedImmediately ? "paid" : "processing",
      paymentId: payment.id,
      stripePaymentIntentId: intent.paymentIntent.id,
      feeDisclosure: PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
      feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
    });
  }

  const activeFamilyPayment = draftStripePayments.find((item) => {
    const fields = jsonRecord(item.customFields);
    return isActiveStripeCheckoutPayment(item) && fields.paymentScope === "family_balance";
  });
  if (activeFamilyPayment) {
    const blocker = await resolveStripeCheckoutDraftBlocker({
      payment: activeFamilyPayment,
      connectedAccountId,
      tenantId: user.tenantId,
      scope: "family_balance",
      requestedPaymentMethodCategory: checkoutCategory(method),
      expectedAmountCents: amountCents,
      expectedCheckoutTotalCents: amounts.checkoutTotalCents,
      expectedFeeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
    });
    if (!blocker.blocked && blocker.url) {
      return NextResponse.json({
        ok: true,
        url: blocker.url,
        status: "checkout_session_reused",
        paymentId: activeFamilyPayment.id,
        stripeSessionId: blocker.pendingPayment?.stripeCheckoutSessionId,
        feeDisclosure: PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
        feeDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
      });
    }
    if (blocker.blocked) {
      return NextResponse.json(
        {
          ok: false,
          error: blocker.message || activeStripeCheckoutPaymentMessage(activeFamilyPayment, "family_balance"),
          paymentId: activeFamilyPayment.id,
          pendingPayment: blocker.pendingPayment || activeStripeCheckoutPaymentSummary(activeFamilyPayment),
        },
        { status: 409 },
      );
    }
  }

  const paymentClaim = await createStripePaymentClaim({
    billingAccountId: billingAccount.id,
    scope: "family_balance",
    paymentData: {
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
  if (!paymentClaim.created) {
    return NextResponse.json({
      ok: false,
      error: "Another payment is already pending or processing for this family. Wait for it to finish before submitting another payment.",
      paymentId: paymentClaim.blockingPaymentId,
    }, { status: 409 });
  }
  const payment = paymentClaim.payment;

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
    successUrl: `${getSecurePaymentAppBaseUrl(request.url)}${successPath}`,
    cancelUrl: `${getSecurePaymentAppBaseUrl(request.url)}${cancelPath}`,
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
    await prisma.center.update({
      where: { id: center.id },
      data: { updatedAt: new Date() },
    });
    return NextResponse.json(
      {
        ok: false,
        configured: session.configured,
        error: paymentServiceError({
          parentFacing: parentCheckout,
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
        ...metadata,
        paymentId: payment.id,
        stripeCheckoutSessionId: session.id,
        stripeCheckoutSessionCreatedAt: session.createdAt ?? null,
        stripeCheckoutSessionExpiresAt: session.expiresAt ?? null,
        stripeCheckoutSessionStatus: session.status ?? null,
        stripeCheckoutPaymentStatus: session.paymentStatus ?? null,
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
