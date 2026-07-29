import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { canManageExecutiveMarketingPortfolio } from "@/lib/executive-marketing";
import {
  getTenantIntegrationCredentialMap,
  upsertTenantIntegrationCredentials,
} from "@/lib/integration-credentials";
import { centerIntegrationScopeKey } from "@/lib/integration-scope";
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
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageExecutiveMarketingPortfolio(user.role)) {
    return NextResponse.json({ ok: false, error: "Executive access is required." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action === "assign" ? "assign" : body?.action === "refresh" ? "refresh" : null;
  const provider = normalizeIntegrationProvider(body?.provider);
  if (!action || !provider || !isMarketingIntegrationProvider(provider)) {
    return NextResponse.json({ ok: false, error: "Choose a supported marketing platform action." }, { status: 400 });
  }

  const managerIntegration = await prisma.integration.findFirst({
    where: { tenantId: user.tenantId, provider, scopeKey: "tenant" },
    orderBy: { lastSyncAt: "desc" },
  });
  if (!managerIntegration) {
    return NextResponse.json({ ok: false, error: "Connect the executive manager login for this platform first." }, { status: 409 });
  }

  try {
    const managerCredentials = await getTenantIntegrationCredentialMap(user.tenantId, provider, null);
    const accountId = typeof body?.accountId === "string" ? body.accountId.trim().slice(0, 300) : "";
    const discovery = await discoverMarketingConnection({
      provider,
      credentials: managerCredentials,
      selectedId: action === "assign" ? accountId : null,
    });
    const managerRecord = record(managerIntegration.configPlaceholder);
    const managerOauth = record(managerRecord.oauth);
    await prisma.integration.update({
      where: { id: managerIntegration.id },
      data: {
        lastSyncAt: new Date(),
        configPlaceholder: {
          ...managerRecord,
          oauth: { ...managerOauth, discoveryError: null, accountsRefreshedAt: new Date().toISOString() },
          availableAccounts: discovery.candidates,
        } as Prisma.InputJsonObject,
      },
    });

    if (action === "refresh") {
      await writeAuditLog(user, {
        action: "integration.oauth.accounts_refreshed",
        resource: "Integration",
        resourceId: managerIntegration.id,
        metadata: { provider, discoveredAccountCount: discovery.candidates.length },
      });
      return NextResponse.json({ ok: true, accounts: discovery.candidates });
    }

    if (!accountId || !discovery.candidates.some((candidate) => candidate.id === accountId)) {
      return NextResponse.json({
        ok: false,
        error: "That profile is no longer available to the connected manager login. Refresh the list and choose again.",
      }, { status: 403 });
    }
    const centerId = typeof body?.centerId === "string" ? body.centerId.trim().slice(0, 200) : "";
    const center = centerId
      ? await prisma.center.findFirst({
          where: {
            id: centerId,
            status: "active",
            organization: { tenantId: user.tenantId },
          },
          select: { id: true, name: true },
        })
      : null;
    if (!center) {
      return NextResponse.json({ ok: false, error: "Choose an active school in your BEE Suite organization." }, { status: 404 });
    }

    const scopeKey = centerIntegrationScopeKey(center.id);
    const existing = await prisma.integration.findFirst({
      where: { tenantId: user.tenantId, provider, scopeKey },
      orderBy: { lastSyncAt: "desc" },
    });
    const existingRecord = record(existing?.configPlaceholder);
    const setup = sanitizeIntegrationConfig(provider, {
      ...readIntegrationConfig(existing?.configPlaceholder),
      ...discovery.config,
    });
    const centerCredentials = { ...managerCredentials, ...discovery.credentials };
    await upsertTenantIntegrationCredentials({
      tenantId: user.tenantId,
      centerId: center.id,
      provider,
      credentials: centerCredentials,
      userId: user.id,
    });
    const runtime = getIntegrationRuntimeStatus(provider, process.env, Object.keys(centerCredentials));
    const configured = runtime.configured && hasRequiredMarketingAccountConfig(provider, setup);
    const selectedAccount = discovery.candidates.find((candidate) => candidate.id === accountId)!;
    const now = new Date();
    const saved = await prisma.integration.upsert({
      where: {
        tenantId_provider_scopeKey: {
          tenantId: user.tenantId,
          provider,
          scopeKey,
        },
      },
      update: {
        centerId: center.id,
        status: configured ? "verified" : "in_progress",
        lastSyncAt: now,
        configPlaceholder: {
          ...existingRecord,
          setup,
          oauth: {
            ...managerOauth,
            centerId: center.id,
            accountSelectionRequired: false,
            discoveryError: null,
            assignedFromManagerScope: true,
            assignedById: user.id,
            assignedAt: now.toISOString(),
            managerIntegrationId: managerIntegration.id,
          },
          availableAccounts: [selectedAccount],
        } as Prisma.InputJsonObject,
      },
      create: {
        tenantId: user.tenantId,
        centerId: center.id,
        scopeKey,
        provider,
        status: configured ? "verified" : "in_progress",
        lastSyncAt: now,
        configPlaceholder: {
          setup,
          oauth: {
            ...managerOauth,
            centerId: center.id,
            accountSelectionRequired: false,
            discoveryError: null,
            assignedFromManagerScope: true,
            assignedById: user.id,
            assignedAt: now.toISOString(),
            managerIntegrationId: managerIntegration.id,
          },
          availableAccounts: [selectedAccount],
        } as Prisma.InputJsonObject,
      },
    });
    await writeAuditLog(user, {
      centerId: center.id,
      action: "integration.executive.profile_assigned",
      resource: "Integration",
      resourceId: saved.id,
      metadata: {
        provider,
        accountId,
        accountLabel: selectedAccount.label,
        managerIntegrationId: managerIntegration.id,
        configured,
      },
    });
    return NextResponse.json({
      ok: true,
      accounts: discovery.candidates,
      connection: {
        provider,
        configured,
        accountLabel: selectedAccount.label,
        setupStatus: configured ? "verified" : "in_progress",
        lastSyncAt: now.toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "The executive marketing connection could not be updated.",
    }, { status: 422 });
  }
}

export const POST = withApiLogging("POST", POSTHandler);
