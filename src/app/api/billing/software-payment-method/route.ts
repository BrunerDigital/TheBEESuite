import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  createStripeCustomer,
  createStripeSetupCheckoutSession,
  findStripeSchoolSoftwareCustomers,
  type StripePaymentMethodCategory,
} from "@/lib/integrations";
import { formatSchoolSoftwareFeeAmount, getSchoolSoftwareFeePolicyForCenter } from "@/lib/kidcity-software-billing";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

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
  const body = await request.json().catch(() => ({})) as { centerId?: unknown; method?: unknown; approved?: unknown };
  const centerId = clean(body.centerId) || user.primaryCenterId;
  if (!centerId || !canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "Choose a school you are allowed to manage." }, { status: 403 });
  }
  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      email: true,
      customFields: true,
      ownerGroup: {
        select: {
          name: true,
          ownerType: true,
          billingEmail: true,
          contactName: true,
          customFields: true,
        },
      },
    },
  });
  if (!center) return NextResponse.json({ ok: false, error: "School not found." }, { status: 404 });

  const fields = jsonObject(center.customFields);
  const feePolicy = getSchoolSoftwareFeePolicyForCenter(center);
  const monthlyAmountCents = feePolicy.unitAmountCents;
  const monthlyAmountLabel = formatSchoolSoftwareFeeAmount(monthlyAmountCents);
  const requested = clean(body.method);
  if (requested === "stripe_balance") {
    return NextResponse.json({
      ok: false,
      error: `Stripe balance is not a supported school software payment method. Authorize ACH or card for the ${monthlyAmountLabel} recurring monthly subscription.`,
    }, { status: 409 });
  }
  const paymentMethodCategory: StripePaymentMethodCategory = requested === "card" ? "card" : requested === "ach" ? "ach" : "default";
  if (paymentMethodCategory === "ach" && !clean(fields.stripePayoutBankLast4)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Connect and confirm this school's payout bank first. Software-fee authorization is separate from the payout destination.",
      },
      { status: 409 },
    );
  }

  let customerId = clean(fields.stripeSoftwareCustomerId);
  if (!customerId) {
    const existing = await findStripeSchoolSoftwareCustomers({ centerId: center.id, tenantId: user.tenantId });
    if (!existing.ok) {
      return NextResponse.json({ ok: false, configured: existing.configured, error: existing.error || "School software billing profiles could not be checked." }, { status: existing.configured ? 502 : 503 });
    }
    if (existing.customerIds.length > 1) {
      return NextResponse.json({ ok: false, error: "Multiple school software billing profiles require platform review before authorization can continue." }, { status: 409 });
    }
    customerId = existing.customerIds[0] || "";
  }
  if (!customerId) {
    const customer = await createStripeCustomer({
      email: center.email || null,
      name: center.crmLocationId || center.name,
      tenantId: user.tenantId,
      metadata: { tenantId: user.tenantId, centerId: center.id, paymentScope: "school_software_fee" },
      idempotencyKey: `school-software-customer:${user.tenantId}:${center.id}`,
    });
    if (!customer.ok || !customer.id) {
      return NextResponse.json({ ok: false, configured: customer.configured, error: customer.error || "School software billing profile could not be created." }, { status: customer.configured ? 502 : 503 });
    }
    customerId = customer.id;
  }

  const baseUrl = getSecurePaymentAppBaseUrl(request.url);
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
      submitMessage: "Authorize this school payment method for The BEE Suite software fees. This is separate from the school's payout destination.",
      setupDescription: "Authorize a payment method for the school's recurring BEE Suite software fee.",
      afterSubmitMessage: "Your school software payment method has been saved. You will return to The BEE Suite.",
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
