import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { getTenantIntegrationCredentialMap, upsertTenantIntegrationCredentials } from "@/lib/integration-credentials";
import { integrationScopeForUser } from "@/lib/integration-scope";
import { isManagerAssignedMarketingConnection } from "@/lib/executive-marketing";
import {
  getIntegrationRuntimeStatus,
  hasRequiredMarketingAccountConfig,
  isMarketingIntegrationProvider,
  normalizeIntegrationProvider,
  readIntegrationConfig,
  sanitizeIntegrationConfig,
} from "@/lib/integration-setup";
import { discoverMarketingConnection } from "@/lib/marketing-account-discovery";
import { prisma } from "@/lib/prisma";

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

function isDirectorRole(role: UserRole) {
  return role === UserRole.CENTER_DIRECTOR || role === UserRole.ASSISTANT_DIRECTOR;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!allowedRoles.has(user.role)) {
    return NextResponse.json({ ok: false, error: "Director access required." }, { status: 403 });
  }
  const provider = normalizeIntegrationProvider((await params).provider);
  if (!provider || !isMarketingIntegrationProvider(provider)) {
    return NextResponse.json({ ok: false, error: "Unsupported marketing provider." }, { status: 404 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const accountId = typeof body?.accountId === "string" ? body.accountId.trim().slice(0, 300) : "";
  if (!accountId) return NextResponse.json({ ok: false, error: "Choose an account." }, { status: 400 });

  const scope = integrationScopeForUser(user, provider);
  const existing = await prisma.integration.findFirst({
    where: { tenantId: user.tenantId, provider, scopeKey: scope.scopeKey },
    orderBy: { lastSyncAt: "desc" },
  });
  if (!existing) return NextResponse.json({ ok: false, error: "Connect this provider before selecting an account." }, { status: 400 });
  if (isDirectorRole(user.role) && isManagerAssignedMarketingConnection(existing.configPlaceholder)) {
    return NextResponse.json({
      ok: false,
      error: "Reconnect this platform with your own provider login before changing the assigned profile.",
    }, { status: 409 });
  }

  try {
    const currentCredentials = await getTenantIntegrationCredentialMap(user.tenantId, provider, scope.centerId);
    const discovery = await discoverMarketingConnection({ provider, credentials: currentCredentials, selectedId: accountId });
    if (!discovery.candidates.some((candidate) => candidate.id === accountId)) {
      return NextResponse.json({ ok: false, error: "That account is not available to the connected provider login." }, { status: 403 });
    }
    await upsertTenantIntegrationCredentials({
      tenantId: user.tenantId,
      centerId: scope.centerId,
      provider,
      credentials: discovery.credentials,
      userId: user.id,
    });
    const existingRecord = record(existing.configPlaceholder);
    const setup = sanitizeIntegrationConfig(provider, {
      ...readIntegrationConfig(existing.configPlaceholder),
      ...discovery.config,
    });
    const oauth = record(existingRecord.oauth);
    const runtime = getIntegrationRuntimeStatus(provider, process.env, [
      ...Object.keys(currentCredentials),
      ...Object.keys(discovery.credentials),
    ]);
    const accountConfigured = hasRequiredMarketingAccountConfig(provider, setup);
    const saved = await prisma.integration.update({
      where: { id: existing.id },
      data: {
        status: runtime.configured && accountConfigured ? "verified" : "in_progress",
        lastSyncAt: new Date(),
        configPlaceholder: {
          ...existingRecord,
          setup,
          oauth: { ...oauth, accountSelectionRequired: false, discoveryError: null },
          availableAccounts: discovery.candidates,
        } as Prisma.InputJsonObject,
      },
    });
    await writeAuditLog(user, {
      action: "integration.oauth.account_selected",
      resource: "Integration",
      resourceId: saved.id,
      metadata: { provider, centerId: scope.centerId, accountId },
    });
    return NextResponse.json({ ok: true, provider, config: setup, configured: runtime.configured && accountConfigured });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "The provider account could not be selected.",
    }, { status: 422 });
  }
}
