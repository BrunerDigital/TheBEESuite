import { Prisma } from "@prisma/client";
import {
  getTenantIntegrationCredentialMap,
  upsertTenantIntegrationCredentials,
} from "@/lib/integration-credentials";
import { integrationScopeKey } from "@/lib/integration-scope";
import { readIntegrationConfig, type IntegrationProvider } from "@/lib/integration-setup";
import { refreshMarketingOAuthCredentials } from "@/lib/marketing-oauth";
import { prisma } from "@/lib/prisma";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export async function getMarketingConnection({
  tenantId,
  centerId,
  provider,
  updatedById,
}: {
  tenantId: string;
  centerId?: string | null;
  provider: IntegrationProvider;
  updatedById: string;
}) {
  const scopeKey = integrationScopeKey(centerId);
  const [integration, savedCredentials] = await Promise.all([
    prisma.integration.findFirst({
      where: { tenantId, provider, scopeKey },
      orderBy: { lastSyncAt: "desc" },
    }),
    getTenantIntegrationCredentialMap(tenantId, provider, centerId),
  ]);
  if (!integration) {
    return { integration: null, config: {}, credentials: savedCredentials };
  }

  const stored = record(integration.configPlaceholder);
  const oauth = record(stored.oauth);
  const refreshed = await refreshMarketingOAuthCredentials({
    provider,
    credentials: savedCredentials,
    expiresAt: typeof oauth.expiresAt === "string" ? oauth.expiresAt : null,
  });
  if (!refreshed) {
    return {
      integration,
      config: readIntegrationConfig(integration.configPlaceholder),
      credentials: savedCredentials,
    };
  }

  await upsertTenantIntegrationCredentials({
    tenantId,
    centerId,
    provider,
    credentials: refreshed.credentials,
    userId: updatedById,
  });
  const updated = await prisma.integration.update({
    where: { id: integration.id },
    data: {
      configPlaceholder: {
        ...stored,
        oauth: {
          ...oauth,
          expiresAt: refreshed.expiresAt,
          refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt ?? oauth.refreshTokenExpiresAt ?? null,
          refreshedAt: new Date().toISOString(),
        },
      } as Prisma.InputJsonObject,
    },
  });
  return {
    integration: updated,
    config: readIntegrationConfig(updated.configPlaceholder),
    credentials: { ...savedCredentials, ...refreshed.credentials },
  };
}
