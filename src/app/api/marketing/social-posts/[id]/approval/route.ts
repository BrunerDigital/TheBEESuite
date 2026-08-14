import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { canManageExecutiveMarketingPortfolio } from "@/lib/executive-marketing";
import { resolveMarketingCenter } from "@/lib/marketing-center-access";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown, max = 1_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function POSTHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageExecutiveMarketingPortfolio(user.role)) {
    return NextResponse.json({ ok: false, error: "Executive marketing approval access required." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action === "request_changes" ? "request_changes" : "approve";
  const note = clean(body?.note, 800);
  const scheduledAtRaw = clean(body?.scheduledAt, 100);
  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
  const scheduleValid = Boolean(scheduledAt && !Number.isNaN(scheduledAt.getTime()) && scheduledAt.getTime() > Date.now());

  const campaign = await prisma.campaign.findFirst({
    where: { id, tenantId: user.tenantId, type: "social_post" },
    select: { id: true, audience: true, metrics: true, status: true },
  });
  if (!campaign) return NextResponse.json({ ok: false, error: "Social post not found." }, { status: 404 });

  const audience = asRecord(campaign.audience);
  const centerId = clean(audience.centerId, 200);
  let center: Awaited<ReturnType<typeof resolveMarketingCenter>>;
  try {
    center = await resolveMarketingCenter(user, centerId);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "This social post is outside your school access.",
    }, { status: 403 });
  }

  const metrics = asRecord(campaign.metrics);
  const approval = {
    ...asRecord(metrics.approval),
    status: action === "request_changes" ? "changes_requested" : scheduleValid ? "scheduled" : "approved",
    reviewedById: user.id,
    reviewedAt: new Date().toISOString(),
    note: note || null,
  };
  const nextStatus = action === "request_changes" ? "changes_requested" : scheduleValid ? "scheduled" : "approved";

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: nextStatus,
      scheduledAt: scheduleValid ? scheduledAt : null,
      metrics: { ...metrics, approval } as Prisma.InputJsonObject,
    },
  });
  await writeAuditLog(user, {
    action: action === "request_changes" ? "social.post.changes_requested" : scheduleValid ? "social.post.approved_scheduled" : "social.post.approved",
    resource: "Campaign",
    resourceId: campaign.id,
    centerId: center.id,
    metadata: {
      centerId: center.id,
      previousStatus: campaign.status,
      status: nextStatus,
      scheduledAt: scheduleValid ? scheduledAt?.toISOString() ?? null : null,
      note: note || null,
    },
  });

  return NextResponse.json({ ok: true, status: nextStatus, scheduledAt: scheduleValid ? scheduledAt?.toISOString() ?? null : null });
}

export const POST = withApiLogging("POST", POSTHandler);
