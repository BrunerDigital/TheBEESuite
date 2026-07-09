import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { canRequestAccountDeletion } from "@/lib/portal-guardrails";
import { prisma } from "@/lib/prisma";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

const openDeletionStatuses = [
  "pending_verification",
  "verified",
  "school_review",
  "approved",
  "partially_completed",
];

function clean(value: unknown, maxLength = 2000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function bool(value: unknown) {
  return value === true || value === "true" || value === "1" || value === "on";
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function deletionDueDate() {
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 30);
  return dueAt;
}

function summarizeRequest(request: {
  id: string;
  requestType: string;
  status: string;
  createdAt: Date;
  dueAt: Date | null;
  verifiedAt: Date | null;
  completedAt: Date | null;
  retentionNoticeAccepted: boolean;
  schoolReviewRequired: boolean;
}) {
  return {
    id: request.id,
    requestType: request.requestType,
    status: request.status,
    createdAt: request.createdAt,
    dueAt: request.dueAt,
    verifiedAt: request.verifiedAt,
    completedAt: request.completedAt,
    retentionNoticeAccepted: request.retentionNoticeAccepted,
    schoolReviewRequired: request.schoolReviewRequired,
  };
}

async function POSTHandler(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Request origin is not allowed." }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const ip = requestIp(request.headers);
  const rateLimit = await checkPersistentRateLimit({
    key: `privacy:deletion-request:${user.id}:${ip}`,
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.ok) {
    const retryAfter = retryAfterSeconds(rateLimit.resetAt);
    return NextResponse.json(
      { ok: false, error: "Too many deletion requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const guardianId = clean(body.guardianId, 128);
  const details = clean(body.details, 1500);
  const retentionNoticeAccepted = bool(body.retentionNoticeAccepted);

  if (!guardianId) {
    return NextResponse.json({ ok: false, error: "Guardian profile is required." }, { status: 400 });
  }

  const guardian = await prisma.guardian.findUnique({
    where: { id: guardianId },
    include: {
      family: {
        select: {
          id: true,
          name: true,
          centerId: true,
        },
      },
    },
  });
  if (!guardian) {
    return NextResponse.json({ ok: false, error: "Guardian profile not found." }, { status: 404 });
  }

  const access = canRequestAccountDeletion({
    isParentGuardian: isParentGuardian(user),
    isLinkedGuardian: guardian.userId === user.id,
    retentionNoticeAccepted,
  });
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const existing = await prisma.dataDeletionRequest.findFirst({
    where: {
      tenantId: user.tenantId,
      userId: user.id,
      guardianId: guardian.id,
      status: { in: openDeletionStatuses },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      requestType: true,
      status: true,
      createdAt: true,
      dueAt: true,
      verifiedAt: true,
      completedAt: true,
      retentionNoticeAccepted: true,
      schoolReviewRequired: true,
    },
  });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, request: summarizeRequest(existing) });
  }

  const dueAt = deletionDueDate();
  const deletionRequest = await prisma.dataDeletionRequest.create({
    data: {
      tenantId: user.tenantId,
      centerId: guardian.family.centerId,
      familyId: guardian.family.id,
      guardianId: guardian.id,
      userId: user.id,
      status: "verified",
      source: "parent_portal",
      requesterEmail: guardian.email || user.email,
      requesterName: guardian.fullName || user.name,
      details: details || null,
      retentionNoticeAccepted,
      schoolReviewRequired: true,
      verifiedAt: new Date(),
      dueAt,
      metadata: {
        userEmail: user.email,
        familyName: guardian.family.name,
        guardianRelation: guardian.relation,
        submittedFrom: "parent_portal",
        retentionNoticeAcceptedAt: new Date().toISOString(),
      } satisfies Prisma.InputJsonObject,
    },
    select: {
      id: true,
      requestType: true,
      status: true,
      createdAt: true,
      dueAt: true,
      verifiedAt: true,
      completedAt: true,
      retentionNoticeAccepted: true,
      schoolReviewRequired: true,
    },
  });

  const directors = guardian.family.centerId
    ? await getCenterLeadershipUsers({
        centerId: guardian.family.centerId,
        roles: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR],
      })
    : [];

  await Promise.all([
    ...directors.map((director) =>
      prisma.notification.create({
        data: {
          userId: director.id,
          title: "Account deletion request",
          body: `${guardian.fullName} requested parent portal account deletion for ${guardian.family.name}. Review childcare record retention before closing the request.`,
          type: "privacy_request",
          priority: "high",
          dedupeKey: `privacy:data-deletion:${deletionRequest.id}:${director.id}`,
        },
      }),
    ),
    writeAuditLog(user, {
      centerId: guardian.family.centerId,
      action: "privacy.account_deletion.requested",
      resource: "DataDeletionRequest",
      resourceId: deletionRequest.id,
      metadata: {
        familyId: guardian.family.id,
        guardianId: guardian.id,
        status: deletionRequest.status,
        dueAt: deletionRequest.dueAt?.toISOString() ?? null,
        retentionNoticeAccepted: true,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, request: summarizeRequest(deletionRequest) }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
