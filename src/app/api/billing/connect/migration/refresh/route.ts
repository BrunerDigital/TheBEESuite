import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { createStripeAccountLink } from "@/lib/integrations";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { prisma } from "@/lib/prisma";
import { readStripeConnectMigration } from "@/lib/stripe-connect-migration";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

function settingsUrl(baseUrl: string, centerId?: string, status = "refresh_failed") {
  const url = new URL("/billing-settings", baseUrl);
  url.searchParams.set("stripeMigration", status);
  if (centerId) url.searchParams.set("center", centerId);
  return url;
}

async function GETHandler(request: NextRequest) {
  const baseUrl = getSecurePaymentAppBaseUrl(request.url);
  const user = await getCurrentUser();
  if (!user) {
    const loginUrl = new URL("/directors", baseUrl);
    loginUrl.searchParams.set("next", "/billing-settings");
    return NextResponse.redirect(loginUrl);
  }
  if (!canManageBilling(user) && !canManageOperations(user)) return NextResponse.redirect(settingsUrl(baseUrl, undefined, "forbidden"));
  const centerId = request.nextUrl.searchParams.get("centerId") || user.primaryCenterId;
  if (!centerId || !canAccessCenter(user, centerId)) return NextResponse.redirect(settingsUrl(baseUrl, centerId || undefined, "forbidden"));
  const center = await prisma.center.findUnique({ where: { id: centerId }, select: { id: true, customFields: true } });
  if (!center) return NextResponse.redirect(settingsUrl(baseUrl, centerId, "not_found"));
  const migration = readStripeConnectMigration(center.customFields);
  if (!migration.targetAccountId || migration.cutoverAt) return NextResponse.redirect(settingsUrl(baseUrl, center.id, "not_prepared"));
  const returnUrl = `${baseUrl}/stripe-reauthorization?stripeMigration=return&center=${encodeURIComponent(center.id)}`;
  const refreshUrl = `${baseUrl}/api/billing/connect/migration/refresh?centerId=${encodeURIComponent(center.id)}`;
  const link = await createStripeAccountLink({ accountId: migration.targetAccountId, refreshUrl, returnUrl, tenantId: user.tenantId });
  if (!link.ok || !link.url) return NextResponse.redirect(settingsUrl(baseUrl, center.id, link.configured ? "refresh_failed" : "stripe_missing"));
  return NextResponse.redirect(link.url);
}

export const GET = withApiLogging("GET", GETHandler);
