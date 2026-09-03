import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  createStripeCustomer,
  createStripeSetupCheckoutSession,
  expireStripeCheckoutSession,
  getStripeProcessingRecoveryAmount,
  readStripeConnectedAccountId,
  type StripePaymentMethodCategory,
} from "@/lib/integrations";
import { PAYMENT_PROCESSING_RECOVERY_VERSION } from "@/lib/payment-disclosures";
import { canPreserveAutopayConsentForPaymentMethodMigration } from "@/lib/payment-method-management";
import {
  buildPaymentMethodRequestCheckoutBranding,
  PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE,
  paymentMethodRequestRecipientOptions,
  validatePaymentMethodRequestToken,
} from "@/lib/payment-method-request-forms";
import {
  PARENT_PAYMENT_METHOD_UNAVAILABLE_MESSAGE,
  paymentServiceError,
} from "@/lib/parent-payment-errors";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { prisma } from "@/lib/prisma";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { stripeCustomerCustomFieldPatch, stripeCustomerIdForAccount } from "@/lib/stripe-customer-scope";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { stripeSchoolReadinessFlowFromFields } from "@/lib/stripe-school-readiness-flow";
import { readStripeConnectMigration, stripeConnectSavedMethodNeedsReauthorization } from "@/lib/stripe-connect-migration";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requestBaseUrl(request: NextRequest) {
  return getSecurePaymentAppBaseUrl(request.url);
}

function paymentMethodCategoryFrom(value: unknown): StripePaymentMethodCategory {
  const normalized = clean(value).toLowerCase();
  if (normalized === "ach" || normalized === "card" || normalized === "link_bank") return normalized;
  return "card";
}

async function POSTHandler(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const token = clean(body.token);
  const rate = await checkPersistentRateLimit({
    key: `payment-method-request:${requestIp(request.headers)}:${token.slice(-24) || "missing"}`,
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many payment setup attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rate.resetAt)) } },
    );
  }

  const validation = validatePaymentMethodRequestToken(token);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }

  const paymentMethodCategory = paymentMethodCategoryFrom(body.paymentMethodCategory);
  const bankAccountVerificationMethod = paymentMethodCategory === "link_bank" ? "automatic" : null;
  const processingRecoveryAccepted = body.processingRecoveryAccepted === true ||
    clean(body.processingRecoveryAccepted).toLowerCase() === "true";
  if (
    paymentMethodCategory === "card" &&
    getStripeProcessingRecoveryAmount(10_000, "card") > 0 &&
    !processingRecoveryAccepted
  ) {
    return NextResponse.json(
      { ok: false, error: "Card setup requires confirming the processing recovery disclosure before continuing." },
      { status: 400 },
    );
  }

  const payload = validation.payload;
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
    },
  });
  if (!family || family.centerId !== payload.centerId) {
    return NextResponse.json({ ok: false, error: "Payment setup link could not be matched to this family." }, { status: 404 });
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
          name: true,
          tenantId: true,
          tenant: { select: { name: true, slug: true } },
          brand: { select: { name: true, slug: true } },
        },
      },
    },
  });
  if (!center || center.organization.tenantId !== payload.tenantId) {
    return NextResponse.json({ ok: false, error: "Payment setup link could not be matched to this school." }, { status: 404 });
  }

  const billingApproval = stripeSchoolBillingApproval({ customFields: center.customFields, centerName: center.name });
  if (!billingApproval.approved) {
    return NextResponse.json(
      {
        ok: false,
        error: paymentServiceError({
          parentFacing: true,
          providerError: billingApproval.blockingReason || "Online billing is not approved for this school.",
          fallback: PARENT_PAYMENT_METHOD_UNAVAILABLE_MESSAGE,
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
          fallback: PARENT_PAYMENT_METHOD_UNAVAILABLE_MESSAGE,
        }),
      },
      { status: 403 },
    );
  }

  const recipient = paymentMethodRequestRecipientOptions({
    billingEmail: family.billingEmail,
    guardians: family.guardians,
  }).find((option) => option.email === payload.email);
  if (!recipient) {
    return NextResponse.json(
      { ok: false, error: "This payment setup link is no longer connected to a saved family email." },
      { status: 403 },
    );
  }

  const billingAccount = await prisma.billingAccount.upsert({
    where: { familyId: family.id },
    update: {},
    create: { familyId: family.id, balanceCents: 0 },
    select: { id: true, autopayPlaceholder: true, customFields: true },
  });
  const currentFields = jsonObject(billingAccount.customFields);
  if (currentFields.stripeBankVerificationPending === true) {
    return NextResponse.json(
      {
        ok: false,
        error: "Bank verification is already pending. Wait for Stripe to finish before starting another payment method update.",
      },
      { status: 409 },
    );
  }
  const connectedAccountId = readStripeConnectedAccountId(center.customFields);
  let paymentMethodReauthorizationRequired = false;
  if (payload.intent === "payment_method_reauthorization") {
    const migration = readStripeConnectMigration(center.customFields);
    const savedMethodAccountId = clean(currentFields.stripeDefaultPaymentMethodConnectedAccountId);
    paymentMethodReauthorizationRequired = stripeConnectSavedMethodNeedsReauthorization({
      activeAccountId: connectedAccountId,
      savedMethodAccountId,
      centerCustomFields: center.customFields,
    });
    if (!migration.cutoverAt || !paymentMethodReauthorizationRequired || connectedAccountId !== migration.targetAccountId) {
      return NextResponse.json({ ok: false, error: "This payment update is no longer needed or the school payment account changed. Please ask the school for a new link." }, { status: 409 });
    }
  }
  const recipientCanPreserveAutopay = paymentMethodReauthorizationRequired
    && canPreserveAutopayConsentForPaymentMethodMigration({
      autopayPlaceholder: billingAccount.autopayPlaceholder,
      customFields: currentFields,
      linkedGuardianUserIds: recipient.userIds,
    });
  let customerId = stripeCustomerIdForAccount(currentFields, connectedAccountId);
  if (!customerId) {
    const customer = await createStripeCustomer({
      email: payload.email,
      name: family.name,
      tenantId: payload.tenantId,
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
    });
    if (!customer.ok || !customer.id) {
      return NextResponse.json(
        {
          ok: false,
          configured: customer.configured,
          error: paymentServiceError({
            parentFacing: true,
            providerError: customer.error || "Payment profile could not be created.",
            fallback: PARENT_PAYMENT_METHOD_UNAVAILABLE_MESSAGE,
          }),
        },
        { status: customer.configured ? 502 : 503 },
      );
    }
    customerId = customer.id;
  }

  const baseUrl = requestBaseUrl(request);
  const formPath = `/payment-method-form/${encodeURIComponent(token)}`;
  const centerLabel = center.crmLocationId ?? center.name;
  const setup = await createStripeSetupCheckoutSession({
    customerId,
    customerEmail: payload.email,
    paymentMethodCategory,
    bankAccountVerificationMethod,
    successUrl: `${baseUrl}${formPath}?paymentMethod=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}${formPath}?paymentMethod=cancelled`,
    metadata: {
      tenantId: payload.tenantId,
      setupFlow: "billing_account_payment_method",
      setupSource: PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE,
      billingAccountId: billingAccount.id,
      familyId: family.id,
      centerId: center.id,
      stripeConnectedAccountId: connectedAccountId || "",
      stripeCustomerId: customerId,
      recipientEmail: payload.email,
      autopaySetupMode: recipientCanPreserveAutopay ? "preserve_existing" : "preserve",
      paymentMethodReauthorization: paymentMethodReauthorizationRequired ? "true" : "false",
      preferredPaymentMethodCategory: paymentMethodCategory,
      bankAccountVerificationMethod: bankAccountVerificationMethod || "",
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    },
    connectedAccountId,
    checkoutBranding: buildPaymentMethodRequestCheckoutBranding({
      centerLabel,
      familyName: family.name,
      intent: payload.intent ?? (paymentMethodCategory === "link_bank" ? "instant_bank_verification" : "payment_steps"),
    }),
    tenantId: payload.tenantId,
  });
  if (!setup.ok || !setup.url) {
    return NextResponse.json(
      {
        ok: false,
        configured: setup.configured,
        error: paymentServiceError({
          parentFacing: true,
          providerError: setup.error || "Payment method setup could not be created.",
          fallback: PARENT_PAYMENT_METHOD_UNAVAILABLE_MESSAGE,
        }),
      },
      { status: setup.configured ? 502 : 503 },
    );
  }

  const updatedAt = new Date().toISOString();
  const setupAccountUpdate = await prisma.billingAccount.updateMany({
    where: {
      id: billingAccount.id,
      autopayPlaceholder: billingAccount.autopayPlaceholder,
      customFields: billingAccount.customFields === null
        ? { equals: Prisma.DbNull }
        : { equals: billingAccount.customFields as Prisma.InputJsonValue },
    },
    data: {
      customFields: {
        ...currentFields,
        ...stripeCustomerCustomFieldPatch(currentFields, customerId, connectedAccountId),
        stripeSetupCheckoutSessionId: setup.id || null,
        stripeSetupCheckoutSessionCreatedAt: setup.createdAt ?? null,
        stripeSetupCheckoutSessionExpiresAt: setup.expiresAt ?? null,
        stripeSetupCheckoutSessionStatus: setup.status ?? null,
        stripeSetupConnectedAccountId: connectedAccountId || null,
        paymentMethodManagementStatus: "setup_session_created",
        paymentMethodManagementUpdatedAt: updatedAt,
        paymentMethodRequestLastOpenedAt: updatedAt,
        paymentMethodRequestLastRecipientEmail: payload.email,
        ...(paymentMethodCategory === "card" && processingRecoveryAccepted
          ? {
              cardProcessingRecoveryAcceptedAt: updatedAt,
              cardProcessingRecoveryAcceptedByUserEmail: payload.email,
              cardProcessingRecoveryDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
            }
          : {}),
      },
    },
  });
  if (setupAccountUpdate.count !== 1) {
    if (setup.id) {
      await expireStripeCheckoutSession({
        sessionId: setup.id,
        connectedAccountId,
        tenantId: payload.tenantId,
      });
    }
    return NextResponse.json(
      { ok: false, error: "Payment method status changed while the secure setup form was opening. Refresh and try again." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, url: setup.url, status: "setup_session_created" });
}

export const POST = withApiLogging("POST", POSTHandler);
