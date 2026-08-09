import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  canManageExecutiveMarketingPortfolio,
  normalizeExecutiveMarketingAssignments,
} from "@/lib/executive-marketing";
import {
  encryptIntegrationCredential,
  getTenantIntegrationCredentialMap,
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
  const action = body?.action === "assign_many"
    ? "assign_many"
    : body?.action === "assign"
      ? "assign"
      : body?.action === "refresh"
        ? "refresh"
        : null;
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
    const discovery = await discoverMarketingConnection({
      provider,
      credentials: managerCredentials,
      selectedId: null,
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

    const normalizedAssignments = normalizeExecutiveMarketingAssignments(
      action === "assign_many"
        ? body?.assignments
        : [{ accountId: body?.accountId, centerId: body?.centerId }],
    );
    if (!normalizedAssignments.ok) {
      return NextResponse.json({ ok: false, error: normalizedAssignments.error }, { status: 400 });
    }
    const assignments = normalizedAssignments.assignments;
    const candidateById = new Map(discovery.candidates.map((candidate) => [candidate.id, candidate]));
    if (assignments.some((assignment) => !candidateById.has(assignment.accountId))) {
      return NextResponse.json({
        ok: false,
        error: "One or more profiles are no longer available to the connected manager login. Refresh the list and choose again.",
      }, { status: 403 });
    }
    const centers = await prisma.center.findMany({
      where: {
        id: { in: assignments.map((assignment) => assignment.centerId) },
        status: "active",
        organization: { tenantId: user.tenantId },
      },
      select: { id: true, name: true },
    });
    if (centers.length !== assignments.length) {
      return NextResponse.json({
        ok: false,
        error: "One or more selected schools are no longer active in your BEE Suite organization.",
      }, { status: 409 });
    }

    const selectedConnections = assignments.map((assignment) => discovery.selections[assignment.accountId]);
    if (selectedConnections.some((connection) => !connection)) {
      return NextResponse.json({
        ok: false,
        error: "A selected profile is no longer available to the connected manager login.",
      }, { status: 403 });
    }
    const scopeKeys = assignments.map((assignment) => centerIntegrationScopeKey(assignment.centerId));
    const existingIntegrations = await prisma.integration.findMany({
      where: { tenantId: user.tenantId, provider, scopeKey: { in: scopeKeys } },
    });
    const existingByScope = new Map(existingIntegrations.map((integration) => [integration.scopeKey, integration]));
    const now = new Date();
    const connections = await prisma.$transaction(async (tx) => {
      const activeCenterCount = await tx.center.count({
        where: {
          id: { in: assignments.map((assignment) => assignment.centerId) },
          status: "active",
          organization: { tenantId: user.tenantId },
        },
      });
      if (activeCenterCount !== assignments.length) {
        throw new Error("One or more selected schools changed while the profiles were being imported. Review the mappings and try again.");
      }

      const savedConnections = [];
      for (const [index, assignment] of assignments.entries()) {
        const selectedAccount = candidateById.get(assignment.accountId)!;
        const selectedConnection = selectedConnections[index]!;
        const scopeKey = centerIntegrationScopeKey(assignment.centerId);
        const existing = existingByScope.get(scopeKey);
        const existingRecord = record(existing?.configPlaceholder);
        const setup = sanitizeIntegrationConfig(provider, {
          ...readIntegrationConfig(existing?.configPlaceholder),
          ...selectedConnection.config,
        });
        const centerCredentials = Object.fromEntries(
          Object.entries({ ...managerCredentials, ...selectedConnection.credentials })
            .filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1])),
        );
        for (const [key, value] of Object.entries(centerCredentials)) {
          await tx.integrationCredential.upsert({
            where: {
              tenantId_provider_scopeKey_key: {
                tenantId: user.tenantId,
                provider,
                scopeKey,
                key,
              },
            },
            update: {
              centerId: assignment.centerId,
              encryptedValue: encryptIntegrationCredential(value),
              lastFour: value.slice(-4),
              updatedById: user.id,
            },
            create: {
              tenantId: user.tenantId,
              centerId: assignment.centerId,
              scopeKey,
              provider,
              key,
              encryptedValue: encryptIntegrationCredential(value),
              lastFour: value.slice(-4),
              createdById: user.id,
              updatedById: user.id,
            },
          });
        }
        const runtime = getIntegrationRuntimeStatus(provider, process.env, Object.keys(centerCredentials));
        const configured = runtime.configured && hasRequiredMarketingAccountConfig(provider, setup);
        const saved = await tx.integration.upsert({
          where: {
            tenantId_provider_scopeKey: {
              tenantId: user.tenantId,
              provider,
              scopeKey,
            },
          },
          update: {
            centerId: assignment.centerId,
            status: configured ? "verified" : "in_progress",
            lastSyncAt: now,
            configPlaceholder: {
              ...existingRecord,
              setup,
              oauth: {
                ...managerOauth,
                centerId: assignment.centerId,
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
            centerId: assignment.centerId,
            scopeKey,
            provider,
            status: configured ? "verified" : "in_progress",
            lastSyncAt: now,
            configPlaceholder: {
              setup,
              oauth: {
                ...managerOauth,
                centerId: assignment.centerId,
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
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId,
            centerId: assignment.centerId,
            userId: user.id,
            action: "integration.executive.profile_assigned",
            resource: "Integration",
            resourceId: saved.id,
            metadata: {
              provider,
              accountId: assignment.accountId,
              accountLabel: selectedAccount.label,
              managerIntegrationId: managerIntegration.id,
              configured,
              batchSize: assignments.length,
            },
          },
        });
        savedConnections.push({
          centerId: assignment.centerId,
          provider,
          configured,
          accountId: assignment.accountId,
          accountLabel: selectedAccount.label,
          setupStatus: configured ? "verified" : "in_progress",
          lastSyncAt: now.toISOString(),
        });
      }
      return savedConnections;
    }, { maxWait: 10_000, timeout: 30_000 });

    return NextResponse.json({
      ok: true,
      accounts: discovery.candidates,
      connections,
      ...(action === "assign" ? { connection: connections[0] } : {}),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "The executive marketing connection could not be updated.",
    }, { status: 422 });
  }
}

export const POST = withApiLogging("POST", POSTHandler);
