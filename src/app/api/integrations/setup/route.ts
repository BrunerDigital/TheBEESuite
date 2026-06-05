import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  buildIntegrationSetupViews,
  getIntegrationRuntimeStatus,
  integrationRecordConfig,
  normalizeIntegrationProvider,
  normalizeIntegrationSetupStatus,
  sanitizeIntegrationConfig,
} from "@/lib/integration-setup";
import { sanitizeCredentialInput, upsertTenantIntegrationCredentials } from "@/lib/integration-credentials";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
]);

function actionValue(value: unknown) {
  return value === "check" ? "check" : "save";
}

export async function POST(request: NextRequest) {
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

  const action = actionValue(body?.action);
  const credentialInput = sanitizeCredentialInput(provider, body?.credentials);
  const existingCredentials = await prisma.integrationCredential.findMany({
    where: { tenantId: user.tenantId, provider },
    select: { key: true, lastFour: true, provider: true },
  });
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
  const configPlaceholder = integrationRecordConfig({
    config,
    checkedAt,
    checkedById: checkedAt ? user.id : null,
  });
  const savedCredentialKeys = await upsertTenantIntegrationCredentials({
    tenantId: user.tenantId,
    provider,
    credentials: credentialInput,
    userId: user.id,
  });

  const existing = await prisma.integration.findFirst({
    where: { tenantId: user.tenantId, provider },
    select: { id: true, lastSyncAt: true },
  });

  const saved = existing
    ? await prisma.integration.update({
        where: { id: existing.id },
        data: {
          status: setupStatus,
          configPlaceholder: configPlaceholder as Prisma.InputJsonValue,
          ...(checkedAt ? { lastSyncAt: checkedAt } : {}),
        },
      })
    : await prisma.integration.create({
        data: {
          tenantId: user.tenantId,
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
      setupStatus,
      runtimeConfigured: runtimeStatus.configured,
      configKeys: Object.keys(config),
      tenantCredentialKeys: savedCredentialKeys,
      storesTenantSecrets: true,
    },
  });
  const credentials = await prisma.integrationCredential.findMany({
    where: { tenantId: user.tenantId },
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
