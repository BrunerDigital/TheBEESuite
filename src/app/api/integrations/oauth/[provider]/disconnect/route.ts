import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { integrationScopeForUser } from "@/lib/integration-scope";
import { isMarketingIntegrationProvider, normalizeIntegrationProvider } from "@/lib/integration-setup";
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

export async function POST(
  _request: NextRequest,
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
  const scope = integrationScopeForUser(user, provider);
  if ((user.role === UserRole.CENTER_DIRECTOR || user.role === UserRole.ASSISTANT_DIRECTOR) && !scope.centerId) {
    return NextResponse.json({ ok: false, error: "A school assignment is required." }, { status: 403 });
  }

  const existing = await prisma.integration.findFirst({
    where: { tenantId: user.tenantId, provider, scopeKey: scope.scopeKey },
    select: { id: true },
  });
  const deleted = await prisma.$transaction(async (tx) => {
    const credentials = await tx.integrationCredential.deleteMany({
      where: { tenantId: user.tenantId, provider, scopeKey: scope.scopeKey },
    });
    const integrations = await tx.integration.deleteMany({
      where: { tenantId: user.tenantId, provider, scopeKey: scope.scopeKey },
    });
    return { credentials: credentials.count, integrations: integrations.count };
  });

  await writeAuditLog(user, {
    action: "integration.oauth.disconnected",
    resource: "Integration",
    resourceId: existing?.id ?? null,
    metadata: {
      provider,
      centerId: scope.centerId,
      deletedCredentials: deleted.credentials,
      deletedIntegrations: deleted.integrations,
      providerAuthorizationMayRequireRevocation: true,
    },
  });
  return NextResponse.json({ ok: true, provider });
}
