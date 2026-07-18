import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createStripeCustomer, createStripeSetupCheckoutSession, type StripePaymentMethodCategory } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { getAppBaseUrl } from "@/lib/supabase-auth";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageBilling(user) && !canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Software payment settings are not allowed for this role." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({})) as { centerId?: unknown; method?: unknown };
  const centerId = clean(body.centerId) || user.primaryCenterId;
  if (!centerId || !canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "Choose a school you are allowed to manage." }, { status: 403 });
  }
  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, name: true, crmLocationId: true, email: true, customFields: true },
  });
  if (!center) return NextResponse.json({ ok: false, error: "School not found." }, { status: 404 });

  const fields = jsonObject(center.customFields);
  let customerId = clean(fields.stripeSoftwareCustomerId);
  if (!customerId) {
    const customer = await createStripeCustomer({
      email: center.email || user.email,
      name: center.crmLocationId || center.name,
      tenantId: user.tenantId,
      metadata: { tenantId: user.tenantId, centerId: center.id, paymentScope: "school_software_fee" },
    });
    if (!customer.ok || !customer.id) {
      return NextResponse.json({ ok: false, configured: customer.configured, error: customer.error || "School software billing profile could not be created." }, { status: customer.configured ? 502 : 503 });
    }
    customerId = customer.id;
  }

  const requested = clean(body.method);
  const paymentMethodCategory: StripePaymentMethodCategory = requested === "card" ? "card" : requested === "ach" ? "ach" : "default";
  const baseUrl = getAppBaseUrl(request.url);
  const session = await createStripeSetupCheckoutSession({
    customerId,
    paymentMethodCategory,
    bankAccountVerificationMethod: paymentMethodCategory === "ach" ? "instant" : null,
    successUrl: `${baseUrl}/billing-settings?softwarePayment=success&center=${encodeURIComponent(center.id)}`,
    cancelUrl: `${baseUrl}/billing-settings?softwarePayment=cancelled&center=${encodeURIComponent(center.id)}`,
    metadata: {
      tenantId: user.tenantId,
      centerId: center.id,
      stripeCustomerId: customerId,
      setupFlow: "school_software_payment_method",
      paymentScope: "school_software_fee",
      preferredMethod: paymentMethodCategory,
    },
    checkoutBranding: {
      displayName: center.crmLocationId || center.name,
      setupDescription: "Authorize a payment method for the school's recurring BEE Suite software fee.",
      afterSubmitMessage: "Your school software payment method has been saved.",
    },
    tenantId: user.tenantId,
  });
  if (!session.ok || !session.url) {
    return NextResponse.json({ ok: false, configured: session.configured, error: session.error || "Secure payment-method setup could not be opened." }, { status: session.configured ? 502 : 503 });
  }

  await prisma.center.update({
    where: { id: center.id },
    data: { customFields: { ...fields, stripeSoftwareCustomerId: customerId, stripeSoftwareSetupSessionId: session.id, stripeSoftwarePaymentPreference: paymentMethodCategory === "ach" ? "payout_bank" : paymentMethodCategory, stripeSoftwarePaymentStatus: "setup_pending" } },
  });
  await writeAuditLog(user, { centerId: center.id, action: "billing.software_payment_method.setup_started", resource: "Center", resourceId: center.id, metadata: { method: paymentMethodCategory } });
  return NextResponse.json({ ok: true, url: session.url });
}

export const POST = withApiLogging("POST", POSTHandler);
