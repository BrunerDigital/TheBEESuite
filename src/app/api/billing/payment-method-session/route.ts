import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canManageBilling, getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  createStripeBillingPortalSession,
  createStripeCustomer,
  createStripeSetupCheckoutSession,
  getStripeProcessingRecoveryAmount,
  readStripeConnectedAccountId,
  type StripePaymentMethodCategory,
} from "@/lib/integrations";
import { PAYMENT_PROCESSING_RECOVERY_VERSION } from "@/lib/payment-disclosures";
import { canCreatePaymentMethodManagementSession } from "@/lib/payment-method-management";
import { prisma } from "@/lib/prisma";
import { stripeCustomerCustomFieldPatch, stripeCustomerIdForAccount } from "@/lib/stripe-customer-scope";
import { getAppBaseUrl } from "@/lib/supabase-auth";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requestBaseUrl(request: NextRequest) {
  return getAppBaseUrl(request.url);
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function actionFrom(value: unknown) {
  const action = clean(value).toLowerCase();
  if (action === "portal" || action === "disable_autopay" || action === "setup") return action;
  return "setup";
}

function paymentMethodCategoryFrom(value: unknown): StripePaymentMethodCategory {
  const category = clean(value).toLowerCase();
  if (category === "ach" || category === "card" || category === "link_bank") return category;
  return "default";
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

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageBilling(user) && !isParentGuardian(user)) {
    return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const billingAccountId = clean(body.billingAccountId);
  const familyId = clean(body.familyId);
  const action = actionFrom(body.action);
  const paymentMethodCategory = paymentMethodCategoryFrom(body.paymentMethodCategory);
  const bankAccountVerificationMethod = paymentMethodCategory === "link_bank" ? "instant" : null;
  const processingRecoveryAccepted = body.processingRecoveryAccepted === true ||
    clean(body.processingRecoveryAccepted).toLowerCase() === "true";
  const returnPath = safeReturnPath(body.returnPath, isParentGuardian(user) ? "/parent-portal" : "/family-detail");
  if (!billingAccountId && !familyId) {
    return NextResponse.json({ ok: false, error: "Billing account or family ID is required." }, { status: 400 });
  }

  const billingAccountInclude = {
    family: {
      include: {
        guardians: { select: { userId: true, email: true } },
        children: {
          select: {
            classroom: {
              select: {
                center: {
                  select: {
                    id: true,
                    name: true,
                    organization: { select: { tenantId: true } },
                  },
                },
              },
            },
          },
          take: 1,
        },
      },
    },
  };

  let billingAccount = billingAccountId
    ? await prisma.billingAccount.findUnique({
        where: { id: billingAccountId },
        include: billingAccountInclude,
      })
    : null;

  if (!billingAccount && familyId) {
    const family = await prisma.family.findUnique({
      where: { id: familyId },
      include: {
        guardians: { select: { userId: true, email: true } },
        children: {
          select: {
            classroom: {
              select: {
                center: {
                  select: {
                    id: true,
                    name: true,
                    organization: { select: { tenantId: true } },
                  },
                },
              },
            },
          },
          take: 1,
        },
      },
    });
    if (!family) {
      return NextResponse.json({ ok: false, error: "Family not found." }, { status: 404 });
    }

    const familyCenterId = family.centerId ?? family.children[0]?.classroom?.center?.id ?? null;
    const isLinkedGuardian = family.guardians.some((guardian) => guardian.userId === user.id);
    const hasCenterAccess = canAccessAllCenters(user) || Boolean(familyCenterId && user.centerIds.includes(familyCenterId));
    const access = canCreatePaymentMethodManagementSession({ isLinkedGuardian, hasCenterAccess });
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    billingAccount = await prisma.billingAccount.upsert({
      where: { familyId: family.id },
      update: {},
      create: { familyId: family.id, balanceCents: 0 },
      include: billingAccountInclude,
    });
  }

  if (!billingAccount) {
    return NextResponse.json({ ok: false, error: "Billing account not found." }, { status: 404 });
  }

  const currentFields = jsonObject(billingAccount.customFields);
  const centerId = billingAccount.family.centerId ?? billingAccount.family.children[0]?.classroom?.center?.id ?? null;
  const isLinkedGuardian = billingAccount.family.guardians.some((guardian) => guardian.userId === user.id);
  const hasCenterAccess = canAccessAllCenters(user) || Boolean(centerId && user.centerIds.includes(centerId));
  const access = canCreatePaymentMethodManagementSession({ isLinkedGuardian, hasCenterAccess });
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  if (
    action === "setup" &&
    paymentMethodCategory === "card" &&
    getStripeProcessingRecoveryAmount(10_000, "card") > 0 &&
    !processingRecoveryAccepted
  ) {
    return NextResponse.json(
      { ok: false, error: "Card setup requires confirming the processing recovery disclosure before continuing." },
      { status: 400 },
    );
  }

  const baseUrl = requestBaseUrl(request);
  const center = centerId
    ? await prisma.center.findUnique({
        where: { id: centerId },
        select: { id: true, customFields: true, organization: { select: { tenantId: true } } },
      })
    : null;
  const tenantId = center?.organization.tenantId ?? billingAccount.family.children[0]?.classroom?.center?.organization.tenantId ?? user.tenantId;
  const connectedAccountId = readStripeConnectedAccountId(center?.customFields);

  if (action === "disable_autopay") {
    await prisma.billingAccount.update({
      where: { id: billingAccount.id },
      data: {
        autopayPlaceholder: false,
        customFields: {
          ...currentFields,
          autopayEnabled: false,
          autopayStatus: "disabled",
          autopayDisabledAt: new Date().toISOString(),
          autopayDisabledByUserId: user.id,
        },
      },
    });
    await writeAuditLog(user, {
      centerId,
      action: "billing.autopay.disabled",
      resource: "BillingAccount",
      resourceId: billingAccount.id,
      metadata: { familyId: billingAccount.familyId },
    });
    return NextResponse.json({ ok: true, status: "disabled" });
  }

  const existingCustomerId = stripeCustomerIdForAccount(currentFields, connectedAccountId);
  if (action === "portal") {
    if (!existingCustomerId) {
      return NextResponse.json(
        { ok: false, error: "Save a payment method before opening payment method management." },
        { status: 400 },
      );
    }
    const portal = await createStripeBillingPortalSession({
      customerId: existingCustomerId,
      returnUrl: `${baseUrl}${appendQuery(returnPath, "paymentMethod", "portal_return")}`,
      connectedAccountId,
      tenantId,
    });
    if (!portal.ok || !portal.url) {
      return NextResponse.json(
        { ok: false, configured: portal.configured, error: portal.error || "Payment method management could not be opened." },
        { status: portal.configured ? 502 : 503 },
      );
    }

    await prisma.billingAccount.update({
      where: { id: billingAccount.id },
      data: {
        customFields: {
          ...currentFields,
          stripeCustomerPortalSessionId: portal.id || null,
          paymentMethodManagementStatus: "portal_session_created",
          paymentMethodManagementUpdatedAt: new Date().toISOString(),
        },
      },
    });
    return NextResponse.json({ ok: true, url: portal.url, status: "portal_session_created" });
  }

  let customerId = existingCustomerId;
  if (!customerId) {
    const fallbackEmail = billingAccount.family.billingEmail ?? billingAccount.family.guardians.find((guardian) => guardian.email)?.email;
    const customer = await createStripeCustomer({
      email: fallbackEmail,
      name: billingAccount.family.name,
      tenantId,
      metadata: {
        tenantId,
        billingAccountId: billingAccount.id,
        familyId: billingAccount.familyId,
        centerId: centerId || "",
        stripeConnectedAccountId: connectedAccountId || "",
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

  const setup = await createStripeSetupCheckoutSession({
    customerId,
    customerEmail: billingAccount.family.billingEmail,
    paymentMethodCategory,
    bankAccountVerificationMethod,
    successUrl: `${baseUrl}${appendRawQuery(appendQuery(returnPath, "paymentMethod", "success"), "session_id", "{CHECKOUT_SESSION_ID}")}`,
    cancelUrl: `${baseUrl}${appendQuery(returnPath, "paymentMethod", "cancelled")}`,
    metadata: {
      tenantId,
      setupFlow: "billing_account_payment_method",
      billingAccountId: billingAccount.id,
      familyId: billingAccount.familyId,
      centerId: centerId || "",
      stripeConnectedAccountId: connectedAccountId || "",
      stripeCustomerId: customerId,
      requestedByUserId: user.id,
      enableAutopay: "true",
      preferredPaymentMethodCategory: paymentMethodCategory,
      bankAccountVerificationMethod: bankAccountVerificationMethod || "",
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    },
    connectedAccountId,
    tenantId,
  });
  if (!setup.ok || !setup.url) {
    return NextResponse.json(
      { ok: false, configured: setup.configured, error: setup.error || "Payment method setup could not be created." },
      { status: setup.configured ? 502 : 503 },
    );
  }

  const paymentMethodManagementUpdatedAt = new Date().toISOString();
  await prisma.billingAccount.update({
    where: { id: billingAccount.id },
    data: {
      customFields: {
        ...currentFields,
        ...stripeCustomerCustomFieldPatch(currentFields, customerId, connectedAccountId),
        stripeSetupCheckoutSessionId: setup.id || null,
        stripeSetupConnectedAccountId: connectedAccountId || null,
        paymentMethodManagementStatus: "setup_session_created",
        paymentMethodManagementUpdatedAt,
        autopayStatus: "pending",
        ...(paymentMethodCategory === "card" && processingRecoveryAccepted
          ? {
              cardProcessingRecoveryAcceptedAt: paymentMethodManagementUpdatedAt,
              cardProcessingRecoveryAcceptedByUserId: user.id,
              cardProcessingRecoveryDisclosureVersion: PAYMENT_PROCESSING_RECOVERY_VERSION,
            }
          : {}),
      },
    },
  });
  await writeAuditLog(user, {
    centerId,
    action: "billing.payment_method.setup_created",
    resource: "BillingAccount",
    resourceId: billingAccount.id,
    metadata: {
      familyId: billingAccount.familyId,
      stripeCustomerId: customerId,
      stripeCheckoutSessionId: setup.id || null,
    },
  });

  return NextResponse.json({ ok: true, url: setup.url, status: "setup_session_created" });
}

export const POST = withApiLogging("POST", POSTHandler);
