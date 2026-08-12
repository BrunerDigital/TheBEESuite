import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  createStripeBalancePaymentMethod,
  createStripeBalanceSoftwareSubscription,
  createStripeCustomer,
  createStripeSetupCheckoutSession,
  ensureStripeConnectedAccountCustomerConfiguration,
  ensureStripeSoftwareRecurringPrice,
  listStripeConnectedAccountPayoutBanks,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
  type StripePaymentMethodCategory,
} from "@/lib/integrations";
import { formatSchoolSoftwareFeeAmount, getSchoolSoftwareFeePolicyForCenter } from "@/lib/kidcity-software-billing";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { prisma } from "@/lib/prisma";
import { saveSoftwareSubscriptionSnapshot } from "@/lib/school-software-subscriptions";
import { readStripeConnectMigration, stripeConnectMigrationTargetIsReady } from "@/lib/stripe-connect-migration";
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
    if (body.approved !== true) {
      return NextResponse.json({ ok: false, error: `Confirm authorization before enabling the ${monthlyAmountLabel} monthly Stripe-balance subscription.` }, { status: 400 });
    }
    if (clean(fields.stripeSoftwareSubscriptionId)) {
      return NextResponse.json({ ok: false, error: "This school already has a software subscription." }, { status: 409 });
    }
    const activeConnectedAccountId = readStripeConnectedAccountId(fields);
    const migration = readStripeConnectMigration(fields);
    const deferredMigrationAuthorization = Boolean(migration.targetAccountId && !migration.cutoverAt);
    const connectedAccountId = deferredMigrationAuthorization ? migration.targetAccountId : activeConnectedAccountId;
    if (!connectedAccountId) {
      return NextResponse.json({ ok: false, error: "Connect this school's Stripe payout account before authorizing balance billing." }, { status: 409 });
    }
    if (deferredMigrationAuthorization && activeConnectedAccountId !== migration.sourceAccountId) {
      return NextResponse.json({ ok: false, error: "The school's active parent-payment account changed. Balance authorization was stopped." }, { status: 409 });
    }
    const account = await retrieveStripeConnectedAccount(connectedAccountId, { tenantId: user.tenantId });
    if (!account.ok || !account.account || !account.account.chargesEnabled) {
      return NextResponse.json({ ok: false, error: account.error || "This school's connected Stripe account must be active before balance billing can start." }, { status: account.configured ? 409 : 503 });
    }
    if (deferredMigrationAuthorization) {
      const banks = await listStripeConnectedAccountPayoutBanks({ accountId: connectedAccountId, tenantId: user.tenantId });
      const targetReady = banks.ok && stripeConnectMigrationTargetIsReady({
        chargesEnabled: account.account.chargesEnabled,
        payoutsEnabled: account.account.payoutsEnabled,
        detailsSubmitted: account.account.detailsSubmitted,
        requirementFields: account.account.requirementFields,
        feesCollector: account.account.feesCollector,
        lossesCollector: account.account.lossesCollector,
        payoutBankLast4: banks.defaultBank?.last4,
      });
      if (!targetReady) {
        return NextResponse.json({ ok: false, error: banks.error || `Complete the new Stripe account and payout bank before authorizing its ${monthlyAmountLabel} balance fee.` }, { status: 409 });
      }
    }
    const customerConfiguration = await ensureStripeConnectedAccountCustomerConfiguration({ accountId: connectedAccountId, tenantId: user.tenantId });
    if (!customerConfiguration.ok) {
      return NextResponse.json({ ok: false, error: customerConfiguration.error }, { status: customerConfiguration.configured ? 502 : 503 });
    }
    const paymentMethod = await createStripeBalancePaymentMethod({ accountId: connectedAccountId, tenantId: user.tenantId, centerId: center.id });
    if (!paymentMethod.ok) {
      return NextResponse.json({ ok: false, error: paymentMethod.error }, { status: paymentMethod.configured ? 502 : 503 });
    }
    const price = await ensureStripeSoftwareRecurringPrice({ tenantId: user.tenantId, unitAmountCents: monthlyAmountCents });
    if (!price.ok) return NextResponse.json({ ok: false, error: price.error }, { status: price.configured ? 502 : 503 });
    const approvedAt = new Date().toISOString();
    if (deferredMigrationAuthorization) {
      await prisma.center.update({
        where: { id: center.id },
        data: { customFields: {
          ...fields,
          stripeConnectMigrationBalancePaymentMethodId: paymentMethod.paymentMethodId,
          stripeConnectMigrationBalancePriceId: price.priceId,
          stripeConnectMigrationBalanceApprovalAt: approvedAt,
          stripeConnectMigrationBalanceMonthlyAmountCents: monthlyAmountCents,
          stripeConnectMigrationBalanceFeeTier: feePolicy.tier,
          stripeConnectMigrationBalanceApprovedByUserId: user.id,
          stripeConnectMigrationBalanceApprovedByEmail: user.email,
          stripeConnectMigrationStatus: "ready_for_cutover",
          stripeSoftwarePaymentMethodType: "stripe_balance",
          stripeSoftwarePaymentPreference: "stripe_balance",
          stripeSoftwarePaymentStatus: "authorized_for_cutover",
        } },
      });
      await writeAuditLog(user, {
        centerId: center.id,
        action: "billing.software_stripe_balance.migration_authorized",
        resource: "Center",
        resourceId: center.id,
        metadata: { sourceAccountId: migration.sourceAccountId, targetAccountId: connectedAccountId, monthlyAmountCents, feeTier: feePolicy.tier, subscriptionCreated: false },
      });
      return NextResponse.json({ ok: true, deferred: true, message: `${monthlyAmountLabel} monthly Stripe-balance billing is authorized for the new account and will start at cutover. Parent payments remain on the current account until then.` });
    }
    const result = await createStripeBalanceSoftwareSubscription({
      accountId: connectedAccountId,
      paymentMethodId: paymentMethod.paymentMethodId,
      priceId: price.priceId,
      tenantId: user.tenantId,
      centerId: center.id,
    });
    if (!result.ok || !result.subscription) {
      return NextResponse.json({ ok: false, error: result.error || `The ${monthlyAmountLabel} school subscription could not be started.` }, { status: result.configured ? 502 : 503 });
    }
    await prisma.center.update({
      where: { id: center.id },
      data: { customFields: {
        ...fields,
        stripeSoftwareCustomerId: connectedAccountId,
        stripeSoftwareDefaultPaymentMethodId: paymentMethod.paymentMethodId,
        stripeSoftwarePaymentMethodType: "stripe_balance",
        stripeSoftwarePaymentPreference: "stripe_balance",
        stripeSoftwarePaymentStatus: "authorized",
        stripeSoftwareBalanceApprovalAt: approvedAt,
        stripeSoftwareBalanceApprovedByUserId: user.id,
        stripeSoftwareBalanceApprovedByEmail: user.email,
        stripeSoftwareMonthlyAmountCents: monthlyAmountCents,
        stripeSoftwareFeeTier: feePolicy.tier,
      } },
    });
    await saveSoftwareSubscriptionSnapshot(prisma, center.id, result.subscription, {
      stripeSoftwareMonthlyAmountCents: monthlyAmountCents,
      stripeSoftwareBillingBasis: "per_school",
      stripeSoftwareFeeTier: feePolicy.tier,
      stripeSoftwareBalanceApprovalAt: approvedAt,
    });
    await writeAuditLog(user, {
      centerId: center.id,
      action: "billing.software_stripe_balance.authorized",
      resource: "Center",
      resourceId: center.id,
      metadata: { connectedAccountId, subscriptionId: result.subscription.id, monthlyAmountCents, feeTier: feePolicy.tier },
    });
    return NextResponse.json({ ok: true, message: `${monthlyAmountLabel} monthly billing from this school's Stripe balance is authorized.`, subscription: result.subscription });
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
      displayName: `${center.crmLocationId || center.name} via The BEE Suite`,
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
