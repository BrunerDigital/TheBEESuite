import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assessSchoolDataSetup, readSchoolDataSetup } from "@/lib/school-data-setup";
import { loadSchoolDataReviewEvidence } from "@/lib/school-data-setup-server";
import { checkPersistentRateLimit, retryAfterSeconds } from "@/lib/rate-limit";
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

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!allowedRoles.has(user.role)) return NextResponse.json({ ok: false, error: "Setup support is not allowed for this role." }, { status: 403 });
  const body = await request.json().catch(() => null) as { centerId?: unknown } | null;
  const centerId = typeof body?.centerId === "string" ? body.centerId.trim() : "";
  if (!centerId) return NextResponse.json({ ok: false, error: "Choose a school before requesting setup help." }, { status: 400 });
  if (!canAccessCenter(user, centerId)) return NextResponse.json({ ok: false, error: "You do not have access to that school." }, { status: 403 });

  const center = await prisma.center.findFirst({
    where: { id: centerId, organization: { tenantId: user.tenantId } },
    select: { id: true, name: true, customFields: true },
  });
  if (!center) return NextResponse.json({ ok: false, error: "School not found." }, { status: 404 });

  const evidence = await loadSchoolDataReviewEvidence({ centerId, tenantId: user.tenantId });
  const assessment = assessSchoolDataSetup(readSchoolDataSetup(center.customFields), evidence);
  const setupTeam = await prisma.user.findMany({
    where: { role: UserRole.PLATFORM_OWNER, isActive: true },
    select: { id: true },
    take: 25,
  });
  if (!setupTeam.length) {
    return NextResponse.json({ ok: false, error: "No setup-team recipient is configured. Contact BEE Suite support and include the school name." }, { status: 503 });
  }

  const rate = await checkPersistentRateLimit({
    key: `school-setup-support:${user.id}:${centerId}`,
    limit: 1,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "A setup-help request is already open for this school. The setup team has the current evidence." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rate.resetAt)) } },
    );
  }

  const reference = `SETUP-${randomUUID().slice(0, 8).toUpperCase()}`;
  const evidenceFingerprint = createHash("sha256").update(assessment.revision).digest("hex");
  await prisma.notification.createMany({
    data: setupTeam.map((recipient) => ({
      userId: recipient.id,
      title: `School setup help requested: ${center.name}`,
      body: `${user.name} (${user.email}) requested setup help. Current data step: ${assessment.label}. Reference ${reference}. Open the school-scoped setup workspace; family and child details were intentionally omitted.`,
      type: "Onboarding",
      priority: "high",
    })),
  });
  await writeAuditLog(user, {
    action: "school_setup.support.requested",
    resource: "Center",
    resourceId: centerId,
    centerId,
    metadata: {
      reference,
      assessmentStatus: assessment.status,
      blockedReason: assessment.blockedReason,
      evidenceFingerprint,
      recipientCount: setupTeam.length,
    },
  });

  return NextResponse.json({ ok: true, reference, message: `Setup help requested. Reference ${reference}.` });
}

export const POST = withApiLogging("POST", POSTHandler);
