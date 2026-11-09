import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManagePlatformBilling, PlatformBillingError, platformBillingRequestId } from "@/lib/platform-billing-policy";
import { createPlatformBillingAccount, reservePlatformBillingCharge, openPlatformBillingCheckout, findPlatformBillingCharge, readPlatformBillingDashboard, validatePlatformBillingCheckout } from "@/lib/platform-billing";
import { platformStripeClient } from "@/lib/platform-billing-stripe";
import { applyPlatformSubscription, syncPlatformBillingCharge } from "@/lib/platform-billing-events";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { logOperationalError, withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };

async function authorizedUser() {
  const user = await getCurrentUser();
  if (!user) throw new PlatformBillingError("Authentication required.", 401);
  if (!canManagePlatformBilling(user) || user.mustResetPassword) throw new PlatformBillingError("BEE Suite platform executive access in All locations is required.", 403);
  return user;
}

function failed(error: unknown) {
  if (error instanceof PlatformBillingError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers: noStore });
  logOperationalError("platform_billing.request_failed", error);
  return NextResponse.json({ ok: false, error: "BEE Suite billing is temporarily unavailable. Refresh the history and retry the same request." }, { status: 503, headers: noStore });
}

async function GETHandler() {
  try {
    const user = await authorizedUser();
    const data = await readPlatformBillingDashboard(prisma, user.identityTenantId);
    return NextResponse.json({ ok: true, data, configured: Boolean(process.env.STRIPE_PLATFORM_SECRET_KEY?.trim() || process.env.STRIPE_SECRET_KEY?.trim()) }, { headers: noStore });
  } catch (error) { return failed(error); }
}

async function POSTHandler(request: NextRequest) {
  try {
    const user = await authorizedUser();
    const origin = request.headers.get("origin");
    if ((origin && origin !== request.nextUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new PlatformBillingError("This billing request must originate in The BEE Suite.", 403);
    if (Number(request.headers.get("content-length") || 0) > 16_384) throw new PlatformBillingError("Billing request is too large.", 413);
    const value: unknown = await request.json().catch(() => null);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlatformBillingError("Enter valid billing details.");
    const body = value as Record<string, unknown>;
    if (body.action === "create-account") {
      const account = await createPlatformBillingAccount(prisma, user, body);
      return NextResponse.json({ ok: true, accountId: account.id }, { headers: noStore });
    }
    if (!["create-charge", "retry", "sync", "close-request", "cancel-subscription", "resume-subscription"].includes(String(body.action))) throw new PlatformBillingError("Unsupported billing action.");
    const stripe = platformStripeClient();
    const charge = body.action === "create-charge"
      ? await reservePlatformBillingCharge(prisma, user, body)
      : await findPlatformBillingCharge(prisma, user, body.chargeId);
    if (body.action === "create-charge" || body.action === "retry") {
      const checkout = await openPlatformBillingCheckout(prisma, stripe, user, charge, getSecurePaymentAppBaseUrl(request.url));
      return NextResponse.json({ ok: true, ...checkout }, { headers: noStore });
    }
    if (body.action === "close-request") {
      if (!charge.stripeCheckoutSessionId || charge.stripeSubscriptionId) throw new PlatformBillingError("Refresh this charge before closing its checkout.", 409);
      const session = await stripe.checkout.sessions.retrieve(charge.stripeCheckoutSessionId);
      validatePlatformBillingCheckout(charge, session);
      if (session.status === "complete") throw new PlatformBillingError("The payer has already submitted this checkout. Refresh the payment status.", 409);
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id, {}, { idempotencyKey: `platform-expire:${charge.id}` });
    } else if (body.action === "cancel-subscription" || body.action === "resume-subscription") {
      if (!charge.stripeSubscriptionId) throw new PlatformBillingError("This charge has no subscription.", 409);
      const requestId = platformBillingRequestId(body.requestId);
      const current = await stripe.subscriptions.retrieve(charge.stripeSubscriptionId);
      if (["canceled", "incomplete_expired"].includes(current.status)) throw new PlatformBillingError("This subscription has ended. Create a new authorization to bill again.", 409);
      // Validate the authoritative subscription's payer, scope, and amount before changing it.
      await applyPlatformSubscription(prisma, charge, current, { id: `verify_${requestId}`, type: "customer.subscription.updated", data: { object: current } });
      const subscription = await stripe.subscriptions.update(current.id, { cancel_at_period_end: body.action === "cancel-subscription" }, { idempotencyKey: `platform-subscription:${charge.id}:${body.action}:${requestId}` });
      await applyPlatformSubscription(prisma, charge, subscription, { id: `action_${requestId}`, type: "customer.subscription.updated", data: { object: subscription } });
      await prisma.auditLog.create({ data: { tenantId: user.identityTenantId, userId: user.id, action: `billing.platform.${body.action}`, resource: "PlatformBilling", resourceId: charge.id, metadata: { subscriptionId: subscription.id, cancelAtPeriodEnd: subscription.cancel_at_period_end } } });
    }
    await syncPlatformBillingCharge(prisma, stripe, charge);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) { return failed(error); }
}

export const GET = withApiLogging("GET", GETHandler, { omitResponseBody: true });
export const POST = withApiLogging("POST", POSTHandler, { omitRequestBody: true, omitResponseBody: true });
