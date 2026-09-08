import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import {
  accountDeletionApprovalPhrase,
  accountDeletionExecutionPhrase,
  accountDeletionFingerprint,
  canExecuteAccountDeletion,
} from "@/lib/account-deletion-policy";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { withApiLogging } from "@/lib/request-response-logging";
import { deleteSupabaseAuthUserByEmail } from "@/lib/supabase-auth";

export const runtime = "nodejs";

function objectValue(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } as Record<string, Prisma.JsonValue> : {};
}

async function PATCHHandler(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Request origin is not allowed." }, { status: 403 });
  }
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (actor.role !== UserRole.PLATFORM_OWNER) {
    return NextResponse.json({ ok: false, error: "Platform owner access is required." }, { status: 403 });
  }
  const limit = await checkPersistentRateLimit({
    key: `privacy-deletion-review:${actor.id}:${requestIp(request.headers)}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many privacy review attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.resetAt)) } },
    );
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim().toUpperCase() : "";
  const deletionRequest = await prisma.dataDeletionRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, tenantId: true, email: true, role: true, isActive: true, customFields: true } },
      guardian: { select: { id: true, userId: true, family: { select: { centerId: true } } } },
      center: { select: { organization: { select: { tenantId: true } } } },
    },
  });
  if (!deletionRequest) return NextResponse.json({ ok: false, error: "Deletion request not found." }, { status: 404 });
  const fingerprint = accountDeletionFingerprint(deletionRequest);

  if (action === "approve") {
    if (!["verified", "school_review"].includes(deletionRequest.status)) {
      return NextResponse.json({ ok: false, error: "Only a verified request awaiting school review can be approved." }, { status: 409 });
    }
    if (!deletionRequest.retentionNoticeAccepted || body.schoolRetentionReviewConfirmed !== true) {
      return NextResponse.json({ ok: false, error: "Confirm the school retention review before approval." }, { status: 400 });
    }
    if (confirmation !== accountDeletionApprovalPhrase(fingerprint)) {
      return NextResponse.json({ ok: false, error: "The approval phrase does not match this request." }, { status: 400 });
    }
    await prisma.$transaction([
      prisma.dataDeletionRequest.update({
        where: { id: deletionRequest.id },
        data: {
          status: "approved",
          metadata: {
            ...objectValue(deletionRequest.metadata),
            approval: { approvedAt: new Date().toISOString(), approvedById: actor.id, fingerprint, schoolRetentionReviewConfirmed: true },
          } as Prisma.InputJsonObject,
        },
      }),
      prisma.auditLog.create({
        data: {
          tenantId: deletionRequest.tenantId,
          centerId: deletionRequest.centerId,
          userId: actor.id,
          action: "privacy.account_deletion.approved",
          resource: "DataDeletionRequest",
          resourceId: deletionRequest.id,
          metadata: { targetUserId: deletionRequest.userId, fingerprint, schoolRetentionReviewConfirmed: true },
        },
      }),
    ]);
    return NextResponse.json({ ok: true, status: "approved", fingerprint });
  }

  if (action !== "execute") {
    return NextResponse.json({ ok: false, error: "Choose approve or execute." }, { status: 400 });
  }
  if (confirmation !== accountDeletionExecutionPhrase(fingerprint)) {
    return NextResponse.json({ ok: false, error: "The deletion phrase does not match this request." }, { status: 400 });
  }
  if (deletionRequest.status === "completed") {
    return NextResponse.json({ ok: true, duplicate: true, status: "completed" });
  }
  const target = deletionRequest.user;
  if (
    !target
    || target.tenantId !== deletionRequest.tenantId
    || deletionRequest.center?.organization.tenantId !== deletionRequest.tenantId
    || deletionRequest.guardian?.family.centerId !== deletionRequest.centerId
    || deletionRequest.guardian.userId !== target.id
    || !canExecuteAccountDeletion({
      status: deletionRequest.status,
      updatedAt: deletionRequest.updatedAt,
      targetRole: target.role,
      targetUserId: target.id,
      actorUserId: actor.id,
      retentionNoticeAccepted: deletionRequest.retentionNoticeAccepted,
      schoolReviewRequired: deletionRequest.schoolReviewRequired,
    })
  ) {
    return NextResponse.json({ ok: false, error: "This request is not eligible for parent login deletion." }, { status: 409 });
  }

  const executionAttemptId = randomUUID();
  const executionStartedAt = new Date();
  const claimed = await prisma.dataDeletionRequest.updateMany({
    where: { id: deletionRequest.id, status: deletionRequest.status, updatedAt: deletionRequest.updatedAt },
    data: {
      status: "executing",
      metadata: {
        ...objectValue(deletionRequest.metadata),
        execution: {
          status: "provider_delete_pending",
          attemptId: executionAttemptId,
          startedAt: executionStartedAt.toISOString(),
          fingerprint,
        },
      } as Prisma.InputJsonObject,
    },
  });
  if (claimed.count !== 1) {
    return NextResponse.json({ ok: false, error: "This deletion request is already being processed. Refresh before retrying." }, { status: 409 });
  }

  const providerResult = await deleteSupabaseAuthUserByEmail(target.email);
  if (!providerResult.ok) {
    await prisma.$transaction([
      prisma.dataDeletionRequest.update({
        where: { id: deletionRequest.id },
        data: {
          status: "partially_completed",
          metadata: {
            ...objectValue(deletionRequest.metadata),
            execution: { status: "provider_delete_failed", attemptId: executionAttemptId, lastAttemptAt: new Date().toISOString(), fingerprint },
          } as Prisma.InputJsonObject,
        },
      }),
      prisma.auditLog.create({
        data: {
          tenantId: deletionRequest.tenantId,
          centerId: deletionRequest.centerId,
          userId: actor.id,
          action: "privacy.account_deletion.provider_failed",
          resource: "DataDeletionRequest",
          resourceId: deletionRequest.id,
          metadata: { targetUserId: target.id, retryable: true, fingerprint },
        },
      }),
    ]);
    return NextResponse.json({ ok: false, error: "The authentication login was not deleted. No local identity data was removed; retry is safe." }, { status: 502 });
  }

  const completedAt = new Date();
  const tombstone = createHash("sha256").update(`${target.id}:${deletionRequest.id}`).digest("hex").slice(0, 24);
  const deletedEmail = `deleted+${tombstone}@accounts.invalid`;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.userAccessGrant.updateMany({ where: { userId: target.id, isActive: true }, data: { isActive: false } });
      await tx.deviceSession.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: completedAt, revokedById: actor.id } });
      await tx.webPushSubscription.updateMany({ where: { userId: target.id, isActive: true }, data: { isActive: false } });
      await tx.guardian.updateMany({ where: { userId: target.id }, data: { userId: null } });
      await tx.user.update({
        where: { id: target.id },
        data: {
          email: deletedEmail,
          name: "Deleted Parent Account",
          isActive: false,
          mustResetPassword: false,
          sessionVersion: { increment: 1 },
          customFields: { accountDeletion: { completedAt: completedAt.toISOString(), requestId: deletionRequest.id } },
        },
      });
      await tx.dataDeletionRequest.update({
        where: { id: deletionRequest.id },
        data: {
          status: "completed",
          requesterEmail: null,
          requesterName: null,
          details: null,
          completedAt,
          metadata: {
            execution: {
              status: "completed",
              completedAt: completedAt.toISOString(),
              completedById: actor.id,
              fingerprint,
              providerIdentityDeleted: providerResult.deleted,
              providerIdentityAlreadyMissing: providerResult.alreadyMissing,
              retainedRecords: ["childcare", "safety", "billing", "payment", "audit"],
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: deletionRequest.tenantId,
          centerId: deletionRequest.centerId,
          userId: actor.id,
          action: "privacy.account_deletion.completed",
          resource: "DataDeletionRequest",
          resourceId: deletionRequest.id,
          metadata: { targetUserId: target.id, fingerprint, authIdentityRemoved: true, historicalRecordsPreserved: true },
        },
      });
    });
  } catch {
    await prisma.$transaction([
      prisma.dataDeletionRequest.update({
        where: { id: deletionRequest.id },
        data: {
          status: "partially_completed",
          metadata: {
            ...objectValue(deletionRequest.metadata),
            execution: {
              status: "provider_deleted_local_cleanup_pending",
              attemptId: executionAttemptId,
              lastAttemptAt: new Date().toISOString(),
              fingerprint,
              providerIdentityDeleted: providerResult.deleted,
              providerIdentityAlreadyMissing: providerResult.alreadyMissing,
            },
          } as Prisma.InputJsonObject,
        },
      }),
      prisma.auditLog.create({
        data: {
          tenantId: deletionRequest.tenantId,
          centerId: deletionRequest.centerId,
          userId: actor.id,
          action: "privacy.account_deletion.local_cleanup_failed",
          resource: "DataDeletionRequest",
          resourceId: deletionRequest.id,
          metadata: { targetUserId: target.id, retryable: true, fingerprint, authIdentityRemoved: true },
        },
      }),
    ]);
    return NextResponse.json(
      { ok: false, error: "The login was deleted, but local cleanup is still pending. Retry this same request safely." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, status: "completed", completedAt: completedAt.toISOString() });
}

export const PATCH = withApiLogging("PATCH", PATCHHandler);
