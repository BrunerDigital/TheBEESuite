import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  createStripeBalancePaymentMethod,
  createStripeBalanceSoftwareSubscription,
  createStripeCustomer,
  createStripeSoftwareSubscription,
  ensureStripeConnectedAccountCustomerConfiguration,
  ensureStripeSoftwareRecurringPrice,
  updateStripeSoftwareSubscription,
} from "@/lib/integrations";
import { getSchoolSoftwareFeePolicyForCenter } from "@/lib/kidcity-software-billing";
import { prisma } from "@/lib/prisma";
import { record, saveSoftwareSubscriptionSnapshot, textField } from "@/lib/school-software-subscriptions";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageOperations(user) || !canAccessAllCenters(user)) return NextResponse.json({ ok: false, error: "Platform-wide billing access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { centerId?: unknown; action?: unknown };
  const centerId = clean(body.centerId);
  const action = clean(body.action);
  const center = await prisma.center.findFirst({
    where: { id: centerId, organization: { tenantId: user.tenantId } },
    select: {
      id: true,
      name: true,
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
  const fields = record(center.customFields);
  const subscriptionId = textField(fields, "stripeSoftwareSubscriptionId");
  const itemId = textField(fields, "stripeSoftwareSubscriptionItemId");
  const quantity = 1;
  const feePolicy = getSchoolSoftwareFeePolicyForCenter(center);

  let result;
  if (action === "start") {
    if (subscriptionId) return NextResponse.json({ ok: false, error: "This school already has a subscription. Use Sync instead." }, { status: 409 });

    const connectedAccountId = textField(fields, "stripeConnectAccountId");
    const useConnectedBalanceBilling = connectedAccountId.startsWith("acct_") && textField(fields, "stripeSoftwareBillingSource") !== "external_payment_method";
    const price = await ensureStripeSoftwareRecurringPrice({ tenantId: user.tenantId, unitAmountCents: feePolicy.unitAmountCents });
    if (!price.ok) return NextResponse.json({ ok: false, error: price.error }, { status: price.configured ? 502 : 503 });

    if (useConnectedBalanceBilling) {
      const accountConfig = await ensureStripeConnectedAccountCustomerConfiguration({ accountId: connectedAccountId, tenantId: user.tenantId });
      if (!accountConfig.ok) return NextResponse.json({ ok: false, error: accountConfig.error || "Connected-account customer billing could not be enabled." }, { status: accountConfig.configured ? 502 : 503 });

      const balanceMethod = await createStripeBalancePaymentMethod({ accountId: connectedAccountId, tenantId: user.tenantId, centerId: center.id });
      if (!balanceMethod.ok || !balanceMethod.paymentMethodId) return NextResponse.json({ ok: false, error: balanceMethod.error || "Connected-account balance payment method could not be created." }, { status: balanceMethod.configured ? 502 : 503 });

      await prisma.center.update({
        where: { id: center.id },
        data: {
          customFields: {
            ...fields,
            stripeSoftwareCustomerAccountId: connectedAccountId,
            stripeSoftwareDefaultPaymentMethodId: balanceMethod.paymentMethodId,
            stripeSoftwareSetupIntentId: balanceMethod.setupIntentId || null,
            stripeSoftwareBillingSource: "connected_account_stripe_balance",
            stripeSoftwareBillingSourceConfiguredAt: new Date().toISOString(),
          },
        },
      });

      result = await createStripeBalanceSoftwareSubscription({
        accountId: connectedAccountId,
        paymentMethodId: balanceMethod.paymentMethodId,
        priceId: price.priceId,
        tenantId: user.tenantId,
        centerId: center.id,
      });
    } else {
      let customerId = textField(fields, "stripeSoftwareCustomerId");
      if (!customerId) {
        const customer = await createStripeCustomer({ email: center.email || user.email, name: center.name, tenantId: user.tenantId, metadata: { tenantId: user.tenantId, centerId: center.id, paymentScope: "school_software_fee" } });
        if (!customer.ok || !customer.id) return NextResponse.json({ ok: false, error: customer.error || "School billing customer could not be created." }, { status: customer.configured ? 502 : 503 });
        customerId = customer.id;
        await prisma.center.update({ where: { id: center.id }, data: { customFields: { ...fields, stripeSoftwareCustomerId: customerId } } });
      }
      if (!textField(fields, "stripeSoftwareDefaultPaymentMethodId")) return NextResponse.json({ ok: false, error: "The school must authorize a software payment method before recurring billing can start." }, { status: 400 });
      result = await createStripeSoftwareSubscription({ customerId, priceId: price.priceId, quantity, tenantId: user.tenantId, centerId: center.id });
    }
  } else if (action === "sync") {
    if (!subscriptionId || !itemId) return NextResponse.json({ ok: false, error: "No active subscription was found. Start billing first." }, { status: 400 });
    const price = await ensureStripeSoftwareRecurringPrice({ tenantId: user.tenantId, unitAmountCents: feePolicy.unitAmountCents });
    if (!price.ok) return NextResponse.json({ ok: false, error: price.error }, { status: price.configured ? 502 : 503 });
    result = await updateStripeSoftwareSubscription({ subscriptionId, itemId, priceId: price.priceId, quantity, tenantId: user.tenantId });
  } else if (action === "cancel" || action === "resume") {
    if (!subscriptionId) return NextResponse.json({ ok: false, error: "No subscription was found." }, { status: 400 });
    result = await updateStripeSoftwareSubscription({ subscriptionId, cancelAtPeriodEnd: action === "cancel", tenantId: user.tenantId });
  } else return NextResponse.json({ ok: false, error: "Unsupported subscription action." }, { status: 400 });

  if (!result.ok || !result.subscription) return NextResponse.json({ ok: false, error: result.error || "Subscription update failed." }, { status: result.configured ? 502 : 503 });
  await saveSoftwareSubscriptionSnapshot(prisma, center.id, result.subscription, {
    stripeSoftwareMonthlyAmountCents: feePolicy.unitAmountCents,
    stripeSoftwareFeeTier: feePolicy.tier,
    stripeSoftwareBillingBasis: feePolicy.billingBasis,
    stripeSoftwareBillingSource: textField(fields, "stripeSoftwareBillingSource") || "connected_account_stripe_balance",
  });
  await writeAuditLog(user, { centerId: center.id, action: `billing.software_subscription.${action}`, resource: "Center", resourceId: center.id, metadata: { subscriptionId: result.subscription.id, quantity, status: result.subscription.status, monthlyAmountCents: feePolicy.unitAmountCents, feeTier: feePolicy.tier } });
  return NextResponse.json({ ok: true, subscription: result.subscription });
}

export const POST = withApiLogging("POST", POSTHandler);
