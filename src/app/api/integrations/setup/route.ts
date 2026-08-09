import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  buildIntegrationSetupViews,
  getIntegrationRuntimeStatus,
  integrationRecordConfig,
  isMarketingIntegrationProvider,
  normalizeIntegrationProvider,
  normalizeIntegrationSetupStatus,
  sanitizeIntegrationConfig,
} from "@/lib/integration-setup";
import { sanitizeCredentialInput, upsertTenantIntegrationCredentials } from "@/lib/integration-credentials";
import { integrationScopeForUser } from "@/lib/integration-scope";
import { isManagerAssignedMarketingConnection } from "@/lib/executive-marketing";
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

function actionValue(value: unknown) {
  return value === "check" ? "check" : "save";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isDirectorRole(role: UserRole) {
  return role === UserRole.CENTER_DIRECTOR || role === UserRole.ASSISTANT_DIRECTOR;
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!allowedRoles.has(user.role)) {
    return NextResponse.json({ ok: false, error: "Platform, brand, or regional access required." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const provider = normalizeIntegrationProvider(body?.provider);
  if (!provider) {
    return NextResponse.json({ ok: false, error: "Unknown integration provider." }, { status: 400 });
  }
  if (isDirectorRole(user.role) && !isMarketingIntegrationProvider(provider)) {
    return NextResponse.json({ ok: false, error: "Directors can manage marketing connections only." }, { status: 403 });
  }
  const scope = integrationScopeForUser(user, provider);
  if (isDirectorRole(user.role) && isMarketingIntegrationProvider(provider) && !scope.centerId) {
    return NextResponse.json({ ok: false, error: "A school assignment is required before managing marketing connections." }, { status: 403 });
  }

  const action = actionValue(body?.action);
  const credentialInput = sanitizeCredentialInput(provider, body?.credentials);
  const [existingCredentials, existing] = await Promise.all([
    prisma.integrationCredential.findMany({
      where: { tenantId: user.tenantId, provider, scopeKey: scope.scopeKey },
      select: { key: true, lastFour: true, provider: true },
    }),
    prisma.integration.findFirst({
      where: { tenantId: user.tenantId, provider, scopeKey: scope.scopeKey },
      orderBy: { lastSyncAt: "desc" },
    }),
  ]);
  if (isDirectorRole(user.role) && isManagerAssignedMarketingConnection(existing?.configPlaceholder)) {
    return NextResponse.json({
      ok: false,
      error: "Reconnect this platform with your own provider login before changing the assigned profile.",
    }, { status: 409 });
  }
  const runtimeStatus = getIntegrationRuntimeStatus(
    provider,
    process.env,
    Array.from(new Set([...existingCredentials.map((credential) => credential.key), ...Object.keys(credentialInput)])),
  );
  const checkedAt = action === "check" ? new Date() : null;
  const setupStatus = action === "check"
    ? runtimeStatus.configured ? "verified" : "needs_credentials"
    : normalizeIntegrationSetupStatus(body?.setupStatus);
  const config = sanitizeIntegrationConfig(provider, body?.config);
  const configPlaceholder = {
    ...record(existing?.configPlaceholder),
    ...integrationRecordConfig({
      config,
      checkedAt,
      checkedById: checkedAt ? user.id : null,
    }),
  };
  const savedCredentialKeys = await upsertTenantIntegrationCredentials({
    tenantId: user.tenantId,
    centerId: scope.centerId,
    provider,
    credentials: credentialInput,
    userId: user.id,
  });

  const saved = await prisma.integration.upsert({
    where: {
      tenantId_provider_scopeKey: {
        tenantId: user.tenantId,
        provider,
        scopeKey: scope.scopeKey,
      },
    },
    update: {
      centerId: scope.centerId,
      status: setupStatus,
      configPlaceholder: configPlaceholder as Prisma.InputJsonValue,
      ...(checkedAt ? { lastSyncAt: checkedAt } : {}),
    },
    create: {
      tenantId: user.tenantId,
      centerId: scope.centerId,
      scopeKey: scope.scopeKey,
      provider,
      status: setupStatus,
      configPlaceholder: configPlaceholder as Prisma.InputJsonValue,
      lastSyncAt: checkedAt,
    },
  });

  await writeAuditLog(user, {
    action: action === "check" ? "integration.setup.checked" : "integration.setup.saved",
    resource: "Integration",
    resourceId: saved.id,
    metadata: {
      provider,
      centerId: scope.centerId,
      setupStatus,
      runtimeConfigured: runtimeStatus.configured,
      configKeys: Object.keys(config),
      tenantCredentialKeys: savedCredentialKeys,
      storesTenantSecrets: true,
    },
  });
  const credentials = await prisma.integrationCredential.findMany({
    where: { tenantId: user.tenantId, scopeKey: scope.scopeKey },
    select: { provider: true, key: true, lastFour: true },
  });

  const integration = buildIntegrationSetupViews([
    {
      id: saved.id,
      provider: saved.provider,
      status: saved.status,
      configPlaceholder: saved.configPlaceholder,
      lastSyncAt: saved.lastSyncAt,
    },
  ], process.env, credentials).find((item) => item.provider === provider);

  return NextResponse.json({ ok: true, integration });
}

export const POST = withApiLogging("POST", POSTHandler);
