import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createStripeAccountLink, readStripeConnectedAccountId } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function requestBaseUrl(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return request.nextUrl.origin;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function settingsUrl(baseUrl: string, centerId?: string, status = "refresh_failed") {
  const url = new URL("/billing-settings", baseUrl);
  url.searchParams.set("stripeConnect", status);
  if (centerId) url.searchParams.set("center", centerId);
  return url;
}

export async function GET(request: NextRequest) {
  const baseUrl = requestBaseUrl(request);
  const user = await getCurrentUser();
  if (!user) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("next", "/billing-settings");
    return NextResponse.redirect(loginUrl);
  }

  if (!canManageBilling(user) && !canManageOperations(user)) {
    return NextResponse.redirect(settingsUrl(baseUrl, undefined, "forbidden"));
  }

  const centerId = request.nextUrl.searchParams.get("centerId") || user.primaryCenterId;
  if (!centerId || !canAccessCenter(user, centerId)) {
    return NextResponse.redirect(settingsUrl(baseUrl, centerId || undefined, "forbidden"));
  }

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, crmLocationId: true, customFields: true },
  });
  if (!center) {
    return NextResponse.redirect(settingsUrl(baseUrl, centerId, "not_found"));
  }

  const accountId = readStripeConnectedAccountId(center.customFields);
  if (!accountId) {
    return NextResponse.redirect(settingsUrl(baseUrl, center.id, "not_started"));
  }

  const returnUrl = `${baseUrl}/billing-settings?stripeConnect=return&center=${encodeURIComponent(center.id)}`;
  const refreshUrl = `${baseUrl}/api/billing/connect/refresh?centerId=${encodeURIComponent(center.id)}`;
  const link = await createStripeAccountLink({ accountId, refreshUrl, returnUrl, tenantId: user.tenantId });

  if (!link.ok || !link.url) {
    await prisma.center.update({
      where: { id: center.id },
      data: {
        customFields: {
          ...jsonObject(center.customFields),
          stripePayoutStatus: "refresh_failed",
          stripeConnectLastError: link.error || "Payout account link refresh failed.",
          stripeConnectLastSyncedAt: new Date().toISOString(),
        },
      },
    });
    return NextResponse.redirect(settingsUrl(baseUrl, center.id, link.configured ? "refresh_failed" : "stripe_missing"));
  }

  await prisma.center.update({
    where: { id: center.id },
    data: {
      customFields: {
        ...jsonObject(center.customFields),
        stripePayoutStatus: "onboarding_link_refreshed",
        stripeConnectLastOnboardingAt: new Date().toISOString(),
      },
    },
  });

  await writeAuditLog(user, {
    centerId: center.id,
    action: "billing.connect.onboarding_link_refreshed",
    resource: "Center",
    resourceId: center.id,
    metadata: {
      stripeConnectedAccountId: accountId,
      crmLocationId: center.crmLocationId || null,
    },
  });

  return NextResponse.redirect(link.url);
}
