import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { fetchAdCampaignAnalytics } from "@/lib/ad-campaign-analytics";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { integrationScopeForUser } from "@/lib/integration-scope";
import { getMarketingConnection } from "@/lib/marketing-connection";
import {
  AD_INTEGRATION_PROVIDERS,
  normalizeIntegrationProvider,
  readIntegrationConfig,
} from "@/lib/integration-setup";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!allowedRoles.has(user.role)) {
    return NextResponse.json({ ok: false, error: "Director access required." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const provider = normalizeIntegrationProvider(body?.provider);
  if (!provider || !AD_INTEGRATION_PROVIDERS.includes(provider)) {
    return NextResponse.json({ ok: false, error: "Choose a supported advertising provider." }, { status: 400 });
  }
  const scope = integrationScopeForUser(user, provider);
  if (!scope.centerId && (user.role === UserRole.CENTER_DIRECTOR || user.role === UserRole.ASSISTANT_DIRECTOR)) {
    return NextResponse.json({ ok: false, error: "A school assignment is required before syncing ad data." }, { status: 403 });
  }
  const connection = await getMarketingConnection({
    tenantId: user.tenantId,
    centerId: scope.centerId,
    provider,
    updatedById: user.id,
  });
  const integration = connection.integration;
  if (!integration) return NextResponse.json({ ok: false, error: "Connect this ad account before syncing." }, { status: 400 });

  try {
    const analytics = await fetchAdCampaignAnalytics({
      provider,
      config: readIntegrationConfig(integration.configPlaceholder),
      credentials: connection.credentials,
    });
    const current = record(integration.configPlaceholder);
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(analytics.syncedAt),
        configPlaceholder: { ...current, adAnalytics: analytics } as Prisma.InputJsonObject,
      },
    });
    await writeAuditLog(user, {
      action: "ads.analytics.synced",
      resource: "Integration",
      resourceId: integration.id,
      metadata: {
        provider,
        centerId: scope.centerId,
        campaignCount: analytics.campaigns.length,
        period: analytics.period,
      },
    });
    return NextResponse.json({ ok: true, provider, analytics });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 500) : "Ad campaign analytics could not be synced.",
    }, { status: 422 });
  }
}

export const POST = withApiLogging("POST", POSTHandler);
