import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { readStripeConnectedAccountId, retrieveStripeConnectedAccount } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function jsonObject(value: unknown): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageBilling(user) && !canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Payout status is not allowed for this role." }, { status: 403 });
  }

  const centerId = request.nextUrl.searchParams.get("centerId") || user.primaryCenterId;
  if (!centerId) {
    return NextResponse.json({ ok: false, error: "Choose a center before checking payout status." }, { status: 400 });
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

  const existingFields = jsonObject(center.customFields);
  const accountId = readStripeConnectedAccountId(existingFields);
  if (!accountId) {
    return NextResponse.json({
      ok: true,
      configured: Boolean(process.env.STRIPE_SECRET_KEY),
      centerId: center.id,
      account: null,
      status: "not_started",
    });
  }

  const retrieved = await retrieveStripeConnectedAccount(accountId);
  if (!retrieved.ok || !retrieved.account) {
    return NextResponse.json(
      { ok: false, configured: retrieved.configured, error: retrieved.error || "Stripe payout status could not be checked." },
      { status: retrieved.configured ? 502 : 503 },
    );
  }

  const status = retrieved.account.payoutsEnabled && retrieved.account.chargesEnabled
    ? "ready"
    : retrieved.account.payoutsEnabled
      ? "payouts_ready"
      : "requirements_due";

  await prisma.center.update({
    where: { id: center.id },
    data: {
      customFields: {
        ...existingFields,
        stripeConnectAccountId: accountId,
        stripeChargesEnabled: retrieved.account.chargesEnabled,
        stripePayoutsEnabled: retrieved.account.payoutsEnabled,
        stripeDetailsSubmitted: retrieved.account.detailsSubmitted,
        stripeMerchantCapabilityStatus: retrieved.account.merchantCapabilityStatus || null,
        stripeRecipientTransferStatus: retrieved.account.recipientTransferStatus || null,
        stripePayoutRequirementFields: retrieved.account.requirementFields,
        stripePayoutStatus: status,
        stripeConnectLastSyncedAt: new Date().toISOString(),
      },
    },
  });

  await writeAuditLog(user, {
    centerId: center.id,
    action: "billing.connect.status_synced",
    resource: "Center",
    resourceId: center.id,
    metadata: {
      stripeConnectedAccountId: accountId,
      status,
      requirementCount: retrieved.account.requirementFields.length,
    },
  });

  return NextResponse.json({
    ok: true,
    configured: true,
    centerId: center.id,
    status,
    account: retrieved.account,
  });
}
