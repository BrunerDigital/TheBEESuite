import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser, requiresPasswordResetGate } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createStripeExpressDashboardLoginLink, readStripeConnectedAccountId, retrieveStripeConnectedAccount } from "@/lib/integrations";
import { loginHrefForNextPath } from "@/lib/login-routing";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { verifyStripeConnectAccountBinding } from "@/lib/stripe-connect-setup";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function fallbackUrl(baseUrl: string, centerId?: string, status = "payout_link_failed") {
  const url = new URL("/billing-settings", baseUrl);
  url.searchParams.set("stripeConnect", status);
  if (centerId) url.searchParams.set("center", centerId);
  return url;
}

async function GETHandler(request: NextRequest) {
  const baseUrl = getSecurePaymentAppBaseUrl(request.url);
  const centerId = clean(request.nextUrl.searchParams.get("center"));
  const nextPath = `/payouts${centerId ? `?center=${encodeURIComponent(centerId)}` : ""}`;
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL(loginHrefForNextPath(nextPath, "CENTER_DIRECTOR"), baseUrl));
  }
  if (requiresPasswordResetGate(user)) {
    return NextResponse.redirect(new URL(`/reset-password?force=1&next=${encodeURIComponent(nextPath)}`, baseUrl));
  }
  if (!canManageBilling(user) && !canManageOperations(user)) {
    return NextResponse.redirect(fallbackUrl(baseUrl, undefined, "forbidden"));
  }
  if (!centerId || !canAccessCenter(user, centerId)) {
    return NextResponse.redirect(fallbackUrl(baseUrl, centerId || undefined, "forbidden"));
  }

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: {
      id: true,
      crmLocationId: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  });
  if (!center) {
    return NextResponse.redirect(fallbackUrl(baseUrl, centerId, "not_found"));
  }
  if (center.organization.tenantId !== user.tenantId) {
    return NextResponse.redirect(fallbackUrl(baseUrl, undefined, "forbidden"));
  }

  const accountId = readStripeConnectedAccountId(center.customFields);
  if (!accountId) {
    return NextResponse.redirect(fallbackUrl(baseUrl, center.id, "not_started"));
  }

  const retrieved = await retrieveStripeConnectedAccount(accountId, { tenantId: user.tenantId });
  const binding = verifyStripeConnectAccountBinding(accountId, retrieved.account?.id);
  if (!retrieved.ok || !retrieved.account || !binding.ok) {
    await writeAuditLog(user, {
      centerId: center.id,
      action: "billing.connect.payout_notification_link_failed",
      resource: "Center",
      resourceId: center.id,
      metadata: {
        stripeConnectedAccountId: accountId,
        crmLocationId: center.crmLocationId || null,
        configured: retrieved.configured,
      },
    });
    return NextResponse.redirect(fallbackUrl(baseUrl, center.id, retrieved.configured ? "payout_link_failed" : "stripe_missing"));
  }

  const dashboardMode = retrieved.account.dashboard;
  let destination: string;
  if (dashboardMode === "full") {
    destination = "https://dashboard.stripe.com/";
  } else if (dashboardMode === "express") {
    const link = await createStripeExpressDashboardLoginLink({ accountId, tenantId: user.tenantId });
    if (!link.ok || !link.url) {
      await writeAuditLog(user, {
        centerId: center.id,
        action: "billing.connect.payout_notification_link_failed",
        resource: "Center",
        resourceId: center.id,
        metadata: {
          stripeConnectedAccountId: accountId,
          crmLocationId: center.crmLocationId || null,
          configured: link.configured,
        },
      });
      return NextResponse.redirect(fallbackUrl(baseUrl, center.id, link.configured ? "payout_link_failed" : "stripe_missing"));
    }
    destination = link.url;
  } else {
    await writeAuditLog(user, {
      centerId: center.id,
      action: "billing.connect.payout_notification_link_failed",
      resource: "Center",
      resourceId: center.id,
      metadata: {
        stripeConnectedAccountId: accountId,
        crmLocationId: center.crmLocationId || null,
        configured: retrieved.configured,
        dashboardMode: dashboardMode || "unknown",
      },
    });
    return NextResponse.redirect(fallbackUrl(baseUrl, center.id, "payout_link_failed"));
  }

  await writeAuditLog(user, {
    centerId: center.id,
    action: "billing.connect.payout_notification_opened",
    resource: "Center",
    resourceId: center.id,
    metadata: {
      stripeConnectedAccountId: accountId,
      crmLocationId: center.crmLocationId || null,
      dashboardMode,
    },
  });

  return NextResponse.redirect(destination, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Expires: "0",
      Pragma: "no-cache",
      Vary: "Cookie",
    },
  });
}

export const GET = withApiLogging("GET", GETHandler);
