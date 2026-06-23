import { NextRequest, NextResponse } from "next/server";
import {
  createStripeCustomer,
  createStripeSetupCheckoutSession,
  getStripeProcessingRecoveryAmount,
  readStripeConnectedAccountId,
  type StripePaymentMethodCategory,
} from "@/lib/integrations";
import { PAYMENT_PROCESSING_RECOVERY_VERSION } from "@/lib/payment-disclosures";
import {
  PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE,
  paymentMethodRequestRecipientOptions,
  validatePaymentMethodRequestToken,
} from "@/lib/payment-method-request-forms";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { stripeCustomerCustomFieldPatch, stripeCustomerIdForAccount } from "@/lib/stripe-customer-scope";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requestBaseUrl(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return request.nextUrl.origin;
}

function paymentMethodCategoryFrom(value: unknown): StripePaymentMethodCategory {
  const normalized = clean(value).toLowerCase();
  if (normalized === "ach" || normalized === "card") return normalized;
  return "ach";
}

async function POSTHandler(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const token = clean(body.token);
  const rate = checkRateLimit({
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
      organization: { select: { tenantId: true } },
    },
  });
  if (!center || center.organization.tenantId !== payload.tenantId) {
    return NextResponse.json({ ok: false, error: "Payment setup link could not be matched to this school." }, { status: 404 });
  }

  const allowedEmails = new Set(paymentMethodRequestRecipientOptions({
    billingEmail: family.billingEmail,
    guardians: family.guardians,
  }).map((recipient) => recipient.email));
  if (!allowedEmails.has(payload.email)) {
    return NextResponse.json(
      { ok: false, error: "This payment setup link is no longer connected to a saved family email." },
      { status: 403 },
    );
  }

  const billingAccount = await prisma.billingAccount.upsert({
    where: { familyId: family.id },
    update: {},
    create: { familyId: family.id, balanceCents: 0 },
    select: { id: true, customFields: true },
  });
  const currentFields = jsonObject(billingAccount.customFields);
  const connectedAccountId = readStripeConnectedAccountId(center.customFields);
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
        { ok: false, configured: customer.configured, error: customer.error || "Payment profile could not be created." },
        { status: customer.configured ? 502 : 503 },
      );
    }
    customerId = customer.id;
  }

  const baseUrl = requestBaseUrl(request);
  const formPath = `/payment-method-form/${encodeURIComponent(token)}`;
  const setup = await createStripeSetupCheckoutSession({
    customerId,
    customerEmail: payload.email,
    paymentMethodCategory,
    successUrl: `${baseUrl}${formPath}?paymentMethod=success`,
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
      enableAutopay: "true",
      preferredPaymentMethodCategory: paymentMethodCategory,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    },
    connectedAccountId,
    tenantId: payload.tenantId,
  });
  if (!setup.ok || !setup.url) {
    return NextResponse.json(
      { ok: false, configured: setup.configured, error: setup.error || "Payment method setup could not be created." },
      { status: setup.configured ? 502 : 503 },
    );
  }

  const updatedAt = new Date().toISOString();
  await prisma.billingAccount.update({
    where: { id: billingAccount.id },
    data: {
      customFields: {
        ...currentFields,
        ...stripeCustomerCustomFieldPatch(currentFields, customerId, connectedAccountId),
        stripeSetupCheckoutSessionId: setup.id || null,
        stripeSetupConnectedAccountId: connectedAccountId || null,
        paymentMethodManagementStatus: "setup_session_created",
        paymentMethodManagementUpdatedAt: updatedAt,
        paymentMethodRequestLastOpenedAt: updatedAt,
        paymentMethodRequestLastRecipientEmail: payload.email,
        autopayStatus: "pending",
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

  return NextResponse.json({ ok: true, url: setup.url, status: "setup_session_created" });
}

export const POST = withApiLogging("POST", POSTHandler);
