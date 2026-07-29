import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createStripePayoutBankSelectionLink, readStripeConnectedAccountId } from "@/lib/integrations";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

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

  const baseUrl = getSecurePaymentAppBaseUrl(request.url);
  const returnUrl = `${baseUrl}/billing-settings?stripeConnect=return&center=${encodeURIComponent(center.id)}`;
  const refreshUrl = `${baseUrl}/api/billing/connect/refresh?centerId=${encodeURIComponent(center.id)}`;
  const link = await createStripePayoutBankSelectionLink({
    accountId,
    refreshUrl,
    returnUrl,
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
    },
  });

  return NextResponse.json(
    {
      ok: true,
      url: link.url,
      mode: link.mode,
      centerId: center.id,
      centerName: center.name,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export const POST = withApiLogging("POST", POSTHandler);
