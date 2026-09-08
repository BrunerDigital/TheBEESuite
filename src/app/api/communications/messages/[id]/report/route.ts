import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { canAccessAllCenters, getCurrentUser } from "@/lib/auth";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { canReportVisibleMessage } from "@/lib/message-report-policy";
import { prisma } from "@/lib/prisma";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

const allowedReasons = new Set(["inappropriate_or_abusive", "privacy_concern", "spam_or_fraud", "safety_concern", "other"]);

function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } as Record<string, Prisma.JsonValue> : {};
}

function deterministicReportId(tenantId: string, reporterId: string, messageId: string) {
  return `modreport_${createHash("sha256").update(`${tenantId}:${reporterId}:${messageId}`).digest("hex")}`;
}

async function POSTHandler(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Request origin is not allowed." }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

  const { id } = await context.params;
  if (!id) return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });
  const rateLimit = await checkPersistentRateLimit({
    key: `message-report:${user.id}:${requestIp(request.headers)}`,
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many reports. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rateLimit.resetAt)) } },
    );
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const submittedReason = typeof body.reason === "string" ? body.reason.trim().toLowerCase() : "";
  const reason = allowedReasons.has(submittedReason) ? submittedReason : "other";
  const details = typeof body.details === "string" ? body.details.trim().slice(0, 500) : "";
  const message = await prisma.message.findUnique({
    where: { id },
    include: {
      sender: { select: { tenantId: true } },
      assignedTo: { select: { tenantId: true } },
      family: {
        include: {
          guardians: { select: { userId: true } },
          children: { where: currentlyEnrolledChildWhere(), select: { classroomId: true } },
        },
      },
    },
  });
  if (!message) return NextResponse.json({ ok: false, error: "Message not found." }, { status: 404 });

  const threadCenterId = message.threadKey?.startsWith("internal:") ? message.threadKey.slice("internal:".length) : null;
  const centerId = message.family?.centerId ?? threadCenterId ?? user.primaryCenterId;
  const center = centerId
    ? await prisma.center.findUnique({ where: { id: centerId }, select: { organization: { select: { tenantId: true } } } })
    : null;
  const tenantId = center?.organization.tenantId ?? message.sender?.tenantId ?? message.assignedTo?.tenantId ?? null;
  const visible = canReportVisibleMessage({
    id: user.id,
    tenantId: user.tenantId,
    role: user.role,
    centerIds: user.centerIds,
    assignedClassroomId: user.assignedClassroomId,
    canAccessEveryCenter: canAccessAllCenters(user),
  }, {
    senderId: message.senderId,
    assignedToId: message.assignedToId,
    threadKey: message.threadKey,
    tenantId,
    centerId,
    isFamilyMessage: Boolean(message.familyId),
    guardianUserIds: message.family?.guardians.map((guardian) => guardian.userId).filter((value): value is string => Boolean(value)) ?? [],
    currentClassroomIds: message.family?.children.map((child) => child.classroomId).filter((value): value is string => Boolean(value)) ?? [],
  });
  if (!visible) return NextResponse.json({ ok: false, error: "Message is not available in your access scope." }, { status: 404 });

  const leaders = centerId
    ? await getCenterLeadershipUsers({ centerId, excludeUserId: user.id, roles: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR] })
    : [];
  const reportId = deterministicReportId(user.tenantId, user.id, message.id);
  const reportedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`message-report:${message.id}`}, 0))`;
      const current = await tx.message.findUnique({ where: { id: message.id }, select: { metadata: true } });
      if (!current) throw new Error("Message not found.");
      const metadata = jsonObject(current.metadata);
      const priorModeration = jsonObject(metadata.moderation);
      const reportCount = typeof priorModeration.reportCount === "number" ? priorModeration.reportCount : 0;
      await tx.auditLog.create({
        data: {
          id: reportId,
          tenantId: user.tenantId,
          centerId,
          userId: user.id,
          action: "message.moderation.reported",
          resource: "Message",
          resourceId: message.id,
          metadata: { reason, details: details || null, reportedSenderId: message.senderId } satisfies Prisma.InputJsonObject,
        },
      });
      await tx.message.update({
        where: { id: message.id },
        data: {
          sentiment: "needs_review",
          metadata: {
            ...metadata,
            moderation: {
              ...priorModeration,
              status: "needs_review",
              reportCount: reportCount + 1,
              lastReportedAt: reportedAt.toISOString(),
            },
          } as Prisma.InputJsonObject,
        },
      });
      if (leaders.length) {
        await tx.notification.createMany({
          data: leaders.map((leader) => ({
            userId: leader.id,
            title: "Message requires conduct review",
            body: "A message in a school conversation was reported. Review the preserved thread and follow the school safety process.",
            type: "message_moderation",
            priority: "high",
            dedupeKey: `message-moderation:${message.id}:${leader.id}`,
          })),
          skipDuplicates: true,
        });
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  return NextResponse.json({ ok: true, reportedAt: reportedAt.toISOString() }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
