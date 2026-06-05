import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canManageBilling, getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  createStripeBillingPortalSession,
  createStripeCustomer,
  createStripeSetupCheckoutSession,
} from "@/lib/integrations";
import { canCreatePaymentMethodManagementSession } from "@/lib/payment-method-management";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requestBaseUrl(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return request.nextUrl.origin;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function actionFrom(value: unknown) {
  const action = clean(value).toLowerCase();
  if (action === "portal" || action === "disable_autopay" || action === "setup") return action;
  return "setup";
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageBilling(user) && !isParentGuardian(user)) {
    return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const billingAccountId = clean(body.billingAccountId);
  const action = actionFrom(body.action);
  if (!billingAccountId) {
    return NextResponse.json({ ok: false, error: "Billing account ID is required." }, { status: 400 });
  }

  const billingAccount = await prisma.billingAccount.findUnique({
    where: { id: billingAccountId },
    include: {
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
    },
  });
  if (!billingAccount) {
    return NextResponse.json({ ok: false, error: "Billing account not found." }, { status: 404 });
  }

  const centerId = billingAccount.family.centerId ?? billingAccount.family.children[0]?.classroom?.center?.id ?? null;
  const isLinkedGuardian = billingAccount.family.guardians.some((guardian) => guardian.userId === user.id);
  const hasCenterAccess = canAccessAllCenters(user) || Boolean(centerId && user.centerIds.includes(centerId));
  const access = canCreatePaymentMethodManagementSession({ isLinkedGuardian, hasCenterAccess });
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const currentFields = jsonObject(billingAccount.customFields);
  const baseUrl = requestBaseUrl(request);

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

  const existingCustomerId = clean(currentFields.stripeCustomerId);
  if (action === "portal") {
    if (!existingCustomerId) {
      return NextResponse.json(
        { ok: false, error: "Save a payment method before opening payment method management." },
        { status: 400 },
      );
    }
    const portal = await createStripeBillingPortalSession({
      customerId: existingCustomerId,
      returnUrl: `${baseUrl}/parent-portal?paymentMethod=portal_return`,
    });
    if (!portal.ok || !portal.url) {
      return NextResponse.json(
        { ok: false, configured: portal.configured, error: portal.error || "Stripe customer portal could not be created." },
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
      metadata: {
        billingAccountId: billingAccount.id,
        familyId: billingAccount.familyId,
        centerId: centerId || "",
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      },
    });
    if (!customer.ok || !customer.id) {
      return NextResponse.json(
        { ok: false, configured: customer.configured, error: customer.error || "Stripe customer could not be created." },
        { status: customer.configured ? 502 : 503 },
      );
    }
    customerId = customer.id;
  }

  const setup = await createStripeSetupCheckoutSession({
    customerId,
    customerEmail: billingAccount.family.billingEmail,
    successUrl: `${baseUrl}/parent-portal?paymentMethod=success`,
    cancelUrl: `${baseUrl}/parent-portal?paymentMethod=cancelled`,
    metadata: {
      setupFlow: "billing_account_payment_method",
      billingAccountId: billingAccount.id,
      familyId: billingAccount.familyId,
      centerId: centerId || "",
      requestedByUserId: user.id,
      enableAutopay: "true",
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    },
  });
  if (!setup.ok || !setup.url) {
    return NextResponse.json(
      { ok: false, configured: setup.configured, error: setup.error || "Payment method setup could not be created." },
      { status: setup.configured ? 502 : 503 },
    );
  }

  await prisma.billingAccount.update({
    where: { id: billingAccount.id },
    data: {
      customFields: {
        ...currentFields,
        stripeCustomerId: customerId,
        stripeSetupCheckoutSessionId: setup.id || null,
        paymentMethodManagementStatus: "setup_session_created",
        paymentMethodManagementUpdatedAt: new Date().toISOString(),
        autopayStatus: "pending",
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
