import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import {
  getStripeWebhookSecret,
  getStripeCheckoutAmounts,
  listStripeConnectedAccountPayoutBanks,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
  stripeConnectedAccountPaysFeesDirectly,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { stripeBillingApprovalCustomFieldPatch } from "@/lib/stripe-billing-approval";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { verifyStripeConnectAccountBinding } from "@/lib/stripe-connect-setup";
import { stripeSchoolReadinessFlowFromFields } from "@/lib/stripe-school-readiness-flow";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageBilling(user)) {
    return NextResponse.json({ ok: false, error: "Live parent billing activation is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as {
    centerId?: unknown;
    activationAcknowledged?: unknown;
  };
  const centerId = clean(body.centerId) || user.primaryCenterId;
  if (!centerId) {
    return NextResponse.json({ ok: false, error: "Choose a center before activating parent payments." }, { status: 400 });
  }
  if (!canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }
  if (body.activationAcknowledged !== true) {
    return NextResponse.json(
      { ok: false, error: "Confirm the final billing activation before continuing." },
      { status: 400 },
    );
  }

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });
  }

  const webhookSecret = await getStripeWebhookSecret({ tenantId: center.organization.tenantId });
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "The Stripe webhook signing secret must be configured before parent payments can be activated." },
      { status: 409 },
    );
  }

  const existingFields = jsonObject(center.customFields);
  const accountId = readStripeConnectedAccountId(existingFields);
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "Complete this school's Stripe setup first." }, { status: 409 });
  }

  const [retrieved, payoutBanks] = await Promise.all([
    retrieveStripeConnectedAccount(accountId, { tenantId: center.organization.tenantId }),
    listStripeConnectedAccountPayoutBanks({ accountId, tenantId: center.organization.tenantId }),
  ]);
  const binding = verifyStripeConnectAccountBinding(accountId, retrieved.account?.id);
  if (!retrieved.ok || !retrieved.account || !binding.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: !retrieved.ok || !retrieved.account
          ? retrieved.error || "The school's Stripe account could not be verified."
          : binding.ok ? "The school's Stripe account could not be verified." : binding.error,
      },
      { status: retrieved.configured ? 409 : 503 },
    );
  }
  if (!retrieved.account.livemode) {
    return NextResponse.json({ ok: false, error: "A live Stripe account is required before parent payments can be activated." }, { status: 409 });
  }
  const schoolPaysStripeFeesDirectly = stripeConnectedAccountPaysFeesDirectly(retrieved.account);
  const feeCheck = getStripeCheckoutAmounts(10_000, {
    paymentMethodCategory: "card",
    schoolPaysStripeFeesDirectly,
  });
  if (
    feeCheck.checkoutTotalCents !== 10_000 ||
    feeCheck.parentProcessingRecoveryAmountCents !== 0 ||
    feeCheck.applicationFeeAmountCents < feeCheck.beeSuitePaymentOperationsFeeAmountCents ||
    (!schoolPaysStripeFeesDirectly && feeCheck.schoolProcessingFeeAmountCents <= 0)
  ) {
    return NextResponse.json(
      { ok: false, error: "The school-paid Stripe fee policy could not be verified. Activation was stopped." },
      { status: 409 },
    );
  }

  const readiness = stripeConnectReadinessFromSnapshot(retrieved.account);
  if (readiness.status !== "ready") {
    return NextResponse.json({ ok: false, error: readiness.blockingReason || "Stripe setup is not ready." }, { status: 409 });
  }
  if (!payoutBanks.ok || !payoutBanks.defaultBank?.last4 || payoutBanks.defaultBank.defaultForCurrency !== true) {
    return NextResponse.json(
      { ok: false, error: payoutBanks.error || "Confirm this school's default payout bank before activation." },
      { status: 409 },
    );
  }

  const activatedAt = new Date().toISOString();
  const approvalPatch = stripeBillingApprovalCustomFieldPatch({
    approved: true,
    approvedAt: activatedAt,
    approvedBy: `${user.name || user.email} (${user.role})`,
    billingPreviewApprovedAt: activatedAt,
    accountingApprovedAt: activatedAt,
    cutoverApprovedAt: activatedAt,
  });
  const nextFields: Prisma.JsonObject = {
    ...existingFields,
    ...stripeConnectCustomFieldPatch(readiness),
    ...approvalPatch,
    stripePayoutBankName: payoutBanks.defaultBank.bankName || null,
    stripePayoutBankLast4: payoutBanks.defaultBank.last4,
    stripePayoutBankStatus: payoutBanks.defaultBank.status || null,
    stripePayoutBankCurrency: payoutBanks.defaultBank.currency || null,
    stripePayoutBankDefaultConfirmed: payoutBanks.defaultBank.defaultForCurrency === true,
    stripePayoutBankCount: payoutBanks.banks.length,
    stripePayoutBankLastSyncedAt: activatedAt,
    livePaymentsEnabled: true,
    tuitionBillingEnabled: true,
    refundsEnabled: true,
    billingActivationStatus: "active",
    billingActivationSource: "director_confirmed_stripe_readiness_flow_v1",
    billingActivatedAt: clean(existingFields.billingActivatedAt) || activatedAt,
    billingActivationLastVerifiedAt: activatedAt,
  };

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.center.updateMany({
      where: {
        id: center.id,
        customFields: { equals: existingFields as Prisma.InputJsonValue },
      },
      data: { customFields: nextFields },
    });
    if (updated.count !== 1) return { updated: false };

    await tx.auditLog.create({
      data: {
        tenantId: center.organization.tenantId,
        centerId: center.id,
        userId: user.id,
        action: "billing.connect.parent_payments_activated",
        resource: "Center",
        resourceId: center.id,
        metadata: {
          source: "stripe_school_readiness_flow_v1",
          stripeConnectedAccountId: accountId,
          crmLocationId: center.crmLocationId || null,
          payoutBankConfirmed: true,
          schoolPaysStripeFeesDirectly,
          stripeFeeCollectionMode: schoolPaysStripeFeesDirectly
            ? "stripe_collects_from_school_account"
            : "retained_from_school_proceeds",
          parentProcessingFeeCents: 0,
          chargesCreated: 0,
          invoicesCreated: 0,
          paymentsChanged: 0,
        },
      },
    });
    return { updated: true };
  });

  if (!result.updated) {
    return NextResponse.json(
      { ok: false, error: "This school's billing settings changed during activation. Check status and try again." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    centerId: center.id,
    flow: stripeSchoolReadinessFlowFromFields({ customFields: nextFields, centerName: center.name }),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export const POST = withApiLogging("POST", POSTHandler);
