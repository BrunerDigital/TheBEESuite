import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { canAccessAllCenters, canManageBilling, getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  createStripeCheckoutSession,
  getStripeCheckoutAmounts,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
} from "@/lib/integrations";
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

async function canAccessInvoice(userId: string, roleScoped: boolean, centerIds: string[], invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      billingAccount: {
        include: {
          family: {
            include: {
              guardians: { select: { userId: true } },
            },
          },
        },
      },
    },
  });

  if (!invoice) return { ok: false as const, status: 404, error: "Invoice not found." };

  const centerId = invoice.billingAccount.family.centerId;
  const isFamilyGuardian = invoice.billingAccount.family.guardians.some((guardian) => guardian.userId === userId);
  const hasCenterAccess = !centerId || roleScoped || centerIds.includes(centerId);

  if (!hasCenterAccess && !isFamilyGuardian) {
    return { ok: false as const, status: 403, error: "You do not have access to this invoice." };
  }

  return { ok: true as const, invoice, centerId };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageBilling(user) && !isParentGuardian(user)) {
    return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json();
  const invoiceId = clean(body.invoiceId);
  if (!invoiceId) {
    return NextResponse.json({ ok: false, error: "Invoice ID is required." }, { status: 400 });
  }

  const access = await canAccessInvoice(user.id, canAccessAllCenters(user), user.centerIds, invoiceId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const { invoice, centerId } = access;
  if (invoice.status === PaymentStatus.PAID) {
    return NextResponse.json({ ok: false, error: "This invoice is already paid." }, { status: 400 });
  }
  if (invoice.totalCents <= 0) {
    return NextResponse.json({ ok: false, error: "Invoice total must be greater than zero." }, { status: 400 });
  }

  const center = centerId
    ? await prisma.center.findUnique({
        where: { id: centerId },
        select: { id: true, name: true, customFields: true },
      })
    : null;
  const connectedAccountId = readStripeConnectedAccountId(center?.customFields);
  const allowPlatformOnlyPayments = process.env.STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS === "true";

  if (!connectedAccountId && !allowPlatformOnlyPayments) {
    return NextResponse.json(
      {
        ok: false,
        error: "This school needs a Stripe payout account before parent payments can be accepted.",
      },
      { status: 400 },
    );
  }

  if (connectedAccountId && process.env.STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT !== "false") {
    const accountStatus = await retrieveStripeConnectedAccount(connectedAccountId);
    if (!accountStatus.ok || !accountStatus.account) {
      return NextResponse.json(
        {
          ok: false,
          configured: accountStatus.configured,
          error: accountStatus.error || "Stripe payout status could not be confirmed.",
        },
        { status: accountStatus.configured ? 502 : 503 },
      );
    }

    if (!accountStatus.account.payoutsEnabled) {
      return NextResponse.json(
        {
          ok: false,
          error: "This school's payout account is not ready yet. Finish Stripe onboarding before accepting parent payments.",
          requirements: accountStatus.account.requirementFields,
        },
        { status: 400 },
      );
    }

    await prisma.center.update({
      where: { id: centerId! },
      data: {
        customFields: {
          ...(center?.customFields && typeof center.customFields === "object" && !Array.isArray(center.customFields)
            ? center.customFields
            : {}),
          stripeConnectAccountId: connectedAccountId,
          stripeChargesEnabled: accountStatus.account.chargesEnabled,
          stripePayoutsEnabled: accountStatus.account.payoutsEnabled,
          stripeDetailsSubmitted: accountStatus.account.detailsSubmitted,
          stripeMerchantCapabilityStatus: accountStatus.account.merchantCapabilityStatus || null,
          stripeRecipientTransferStatus: accountStatus.account.recipientTransferStatus || null,
          stripePayoutRequirementFields: accountStatus.account.requirementFields,
          stripePayoutStatus: accountStatus.account.payoutsEnabled ? "ready" : "requirements_due",
          stripeConnectLastSyncedAt: new Date().toISOString(),
        },
      },
    });
  }

  const payment = await prisma.payment.create({
    data: {
      billingAccountId: invoice.billingAccountId,
      amountCents: invoice.totalCents,
      status: PaymentStatus.DRAFT,
      provider: "stripe",
      externalIdPlaceholder: "checkout_session_pending",
      customFields: {
        invoiceAmountCents: invoice.totalCents,
        status: "checkout_pending",
      },
    },
  });

  const baseUrl = requestBaseUrl(request);
  const amounts = getStripeCheckoutAmounts(invoice.totalCents);
  const session = await createStripeCheckoutSession({
    amountCents: amounts.checkoutTotalCents,
    invoiceAmountCents: amounts.invoiceAmountCents,
    parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
    invoiceNumber: invoice.number,
    centerName: center?.name,
    customerEmail: invoice.billingAccount.family.billingEmail,
    successUrl: `${baseUrl}/parent-portal?payment=success&invoice=${invoice.id}`,
    cancelUrl: `${baseUrl}/parent-portal?payment=cancelled&invoice=${invoice.id}`,
    metadata: {
      invoiceId: invoice.id,
      paymentId: payment.id,
      familyId: invoice.billingAccount.familyId,
      centerId: centerId || "",
      stripeConnectedAccountId: connectedAccountId || "",
      invoiceAmountCents: String(amounts.invoiceAmountCents),
      parentSurchargeAmountCents: String(amounts.parentSurchargeAmountCents),
      checkoutTotalCents: String(amounts.checkoutTotalCents),
      applicationFeeAmountCents: String(amounts.applicationFeeAmountCents),
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    },
    connectedAccountId,
    applicationFeeAmountCents: amounts.applicationFeeAmountCents,
    onBehalfOfConnectedAccount: process.env.STRIPE_CHECKOUT_ON_BEHALF_OF === "true",
  });

  if (!session.ok || !session.url) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        externalIdPlaceholder: session.error || "stripe_checkout_failed",
        customFields: {
          invoiceAmountCents: amounts.invoiceAmountCents,
          parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
          checkoutTotalCents: amounts.checkoutTotalCents,
          applicationFeeAmountCents: amounts.applicationFeeAmountCents,
          status: "checkout_failed",
          stripeError: session.error || "stripe_checkout_failed",
        },
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
      customFields: {
        invoiceAmountCents: amounts.invoiceAmountCents,
        parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
        checkoutTotalCents: amounts.checkoutTotalCents,
        applicationFeeAmountCents: amounts.applicationFeeAmountCents,
        stripeCheckoutSessionId: session.id,
        stripeConnectedAccountId: connectedAccountId || null,
        status: "checkout_created",
      },
    },
  });

  await writeAuditLog(user, {
    centerId,
    action: "billing.checkout.created",
    resource: "Invoice",
    resourceId: invoice.id,
    metadata: {
      paymentId: payment.id,
      stripeSessionId: session.id,
      amountCents: invoice.totalCents,
      checkoutTotalCents: amounts.checkoutTotalCents,
      stripeConnectedAccountId: connectedAccountId || null,
      parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
      applicationFeeAmountCents: amounts.applicationFeeAmountCents,
    },
  });

  return NextResponse.json({ ok: true, url: session.url, paymentId: payment.id, stripeSessionId: session.id });
}
