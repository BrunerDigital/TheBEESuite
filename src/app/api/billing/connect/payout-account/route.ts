import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  createStripePayoutBankSelectionLink,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
} from "@/lib/integrations";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { verifyStripeConnectAccountBinding } from "@/lib/stripe-connect-setup";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageBilling(user) && !canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Payout bank selection is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { centerId?: unknown };
  const centerId = clean(body.centerId) || user.primaryCenterId;
  if (!centerId) {
    return NextResponse.json({ ok: false, error: "Choose a center before selecting its payout bank." }, { status: 400 });
  }
  if (!canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      customFields: true,
    },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });
  }

  const accountId = readStripeConnectedAccountId(center.customFields);
  if (!accountId) {
    return NextResponse.json(
      { ok: false, error: "Start this school's Stripe payout onboarding before choosing its bank account." },
      { status: 409 },
    );
  }

  const retrieved = await retrieveStripeConnectedAccount(accountId, { tenantId: user.tenantId });
  const binding = verifyStripeConnectAccountBinding(accountId, retrieved.account?.id);
  if (!retrieved.ok || !retrieved.account || !binding.ok) {
    const error = !retrieved.ok || !retrieved.account
      ? retrieved.error || "The school's designated payout account could not be retrieved."
      : !binding.ok
        ? binding.error
        : "The school's designated payout account could not be verified.";
    await writeAuditLog(user, {
      centerId: center.id,
      action: "billing.connect.payout_bank_mapping_verification_failed",
      resource: "Center",
      resourceId: center.id,
      metadata: {
        stripeConnectedAccountId: accountId,
        crmLocationId: center.crmLocationId || null,
      },
    });
    return NextResponse.json(
      { ok: false, configured: retrieved.configured, error },
      { status: retrieved.ok && retrieved.account ? 409 : retrieved.configured ? 502 : 503 },
    );
  }

  const baseUrl = getSecurePaymentAppBaseUrl(request.url);
  const attemptId = randomUUID();
  const returnUrl = new URL("/billing-settings", baseUrl);
  returnUrl.searchParams.set("stripeConnect", "return");
  returnUrl.searchParams.set("center", center.id);
  returnUrl.searchParams.set("payoutAttempt", attemptId);
  const refreshUrl = new URL("/api/billing/connect/refresh", baseUrl);
  refreshUrl.searchParams.set("centerId", center.id);
  refreshUrl.searchParams.set("payoutAttempt", attemptId);
  const link = await createStripePayoutBankSelectionLink({
    accountId,
    refreshUrl: refreshUrl.toString(),
    returnUrl: returnUrl.toString(),
    tenantId: user.tenantId,
  });
  if (!link.ok || !link.url) {
    return NextResponse.json(
      { ok: false, configured: link.configured, error: link.error || "Stripe payout settings could not be opened." },
      { status: link.configured ? 502 : 503 },
    );
  }

  await writeAuditLog(user, {
    centerId: center.id,
    action: link.mode === "onboarding"
      ? "billing.connect.payout_bank_onboarding_opened"
      : "billing.connect.payout_bank_selection_opened",
    resource: "Center",
    resourceId: center.id,
    metadata: {
      stripeConnectedAccountId: accountId,
      crmLocationId: center.crmLocationId || null,
      mode: link.mode,
      attemptId,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      url: link.url,
      mode: link.mode,
      attemptId,
      centerId: center.id,
      centerName: center.name,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Expires": "0",
        "Pragma": "no-cache",
        "Vary": "Cookie",
      },
    },
  );
}

export const POST = withApiLogging("POST", POSTHandler);
