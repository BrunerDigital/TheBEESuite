import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail, uniqueEmails } from "@/lib/integrations";
import { buildReviewRequestCopy, normalizeCampaignDraft } from "@/lib/marketing-workflows";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function resolveCenterIds(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, requestedCenterId: string) {
  if (requestedCenterId) {
    if (!canAccessCenter(user, requestedCenterId)) return null;
    return [requestedCenterId];
  }
  if (!canAccessAllCenters(user)) return user.centerIds;
  const centers = await prisma.center.findMany({
    where: { organization: { tenantId: user.tenantId }, status: { not: "closed" } },
    select: { id: true },
  });
  return centers.map((center) => center.id);
}

async function familyRecipients(centerIds: string[], limit: number) {
  const families = await prisma.family.findMany({
    where: { centerId: { in: centerIds } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      billingEmail: true,
      guardians: {
        where: { email: { not: null } },
        select: { email: true },
        take: 3,
      },
    },
  });
  return {
    familyCount: families.length,
    recipients: uniqueEmails(
      families.flatMap((family) => [
        family.billingEmail ?? "",
        ...family.guardians.map((guardian) => guardian.email ?? ""),
      ]),
    ),
  };
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Review request workflows are not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const centerId = clean(body.centerId);
  const centerIds = await resolveCenterIds(user, centerId);
  if (!centerIds) return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  if (!centerIds.length) return NextResponse.json({ ok: false, error: "No centers are available for this review request." }, { status: 400 });

  const limit = Math.max(1, Math.min(Number(body.limit) || 500, 1000));
  const requestedSendAt = clean(body.sendAt) || clean(body.scheduledAt);
  const sendAt = requestedSendAt ? new Date(requestedSendAt) : null;
  const center = centerId
    ? await prisma.center.findFirst({ where: { id: centerId, organization: { tenantId: user.tenantId } }, select: { name: true } })
    : null;
  const subject = clean(body.subject) || `How was your experience with ${center?.name ?? "our school"}?`;
  const reviewUrl = clean(body.reviewUrl);
  const message = clean(body.body) || buildReviewRequestCopy({ centerName: center?.name, reviewUrl });
  const brand = await prisma.brand.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const draft = normalizeCampaignDraft({
    name: clean(body.name) || "Family review request",
    type: "review_request",
    templateKey: "review_request",
    subject,
    body: message,
    audience: centerId ? center?.name ?? "Selected center families" : "Active enrolled families",
    status: sendAt && sendAt > new Date() ? "scheduled" : "active",
    scheduledAt: requestedSendAt,
  });

  const campaign = await prisma.campaign.create({
    data: {
      tenantId: user.tenantId,
      brandId: brand?.id ?? null,
      name: draft.name,
      type: draft.type,
      subject: draft.subject,
      body: draft.body,
      templateKey: draft.templateKey,
      audience: {
        ...(draft.audience ?? {}),
        centerId: centerId || null,
        centerCount: centerIds.length,
        workflow: "review_request",
        reviewUrl: reviewUrl || null,
      } as Prisma.InputJsonObject,
      status: sendAt && sendAt > new Date() ? "scheduled" : "active",
      scheduledAt: sendAt && sendAt > new Date() ? sendAt : null,
      metrics: {
        createdFrom: "review_request_workflow",
        requestedBy: user.email,
      },
    },
  });

  if (sendAt && sendAt > new Date()) {
    await writeAuditLog(user, {
      centerId: centerId || user.primaryCenterId,
      action: "review_request.scheduled",
      resource: "Campaign",
      resourceId: campaign.id,
      metadata: {
        campaignId: campaign.id,
        scheduledAt: sendAt.toISOString(),
        centerCount: centerIds.length,
      },
    });
    return NextResponse.json({ ok: true, scheduled: true, campaign, recipientCount: 0 }, { status: 201 });
  }

  const { recipients, familyCount } = await familyRecipients(centerIds, limit);
  if (!recipients.length) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: "paused",
        metrics: {
          ...asRecord(campaign.metrics),
          lastDeliveryStatus: "no_recipients",
          lastAttemptAt: new Date().toISOString(),
        },
      },
    });
    return NextResponse.json({ ok: false, error: "No family or guardian email recipients were found.", campaign }, { status: 400 });
  }

  const email = await sendEmail({
    to: recipients,
    subject,
    text: message,
    replyTo: user.email,
    fromName: brand?.name ?? "The BEE Suite",
    categories: ["campaign_email"],
    customArgs: { campaignId: campaign.id, workflow: "review_request" },
    tenantId: user.tenantId,
  });
  await recordEmailDeliveryAttempt({
    tenantId: user.tenantId,
    centerId: centerId || null,
    purpose: "campaign_email",
    to: recipients,
    subject,
    text: message,
    replyTo: user.email,
    fromName: brand?.name ?? "The BEE Suite",
    result: email,
    metadata: {
      campaignId: campaign.id,
      workflow: "review_request",
      familyCount,
      centerCount: centerIds.length,
      reviewUrl: reviewUrl || null,
    },
  });
  const updatedCampaign = await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: email.ok ? "active" : "paused",
      sentAt: email.ok ? new Date() : null,
      metrics: {
        ...asRecord(campaign.metrics),
        lastAttemptAt: new Date().toISOString(),
        lastSendAt: email.ok ? new Date().toISOString() : null,
        lastRecipientCount: recipients.length,
        lastDeliveryStatus: email.ok ? "delivered" : email.configured ? "failed" : "not_configured",
        lastProviderMessageId: email.id ?? null,
        lastError: email.error ?? null,
      },
    },
  });
  await writeAuditLog(user, {
    centerId: centerId || user.primaryCenterId,
    action: email.ok ? "review_request.sent" : "review_request.not_sent",
    resource: "Campaign",
    resourceId: campaign.id,
    metadata: {
      recipientCount: recipients.length,
      familyCount,
      provider: email.provider,
      configured: email.configured,
      error: email.error ?? null,
    },
  });

  return NextResponse.json({
    ok: email.ok,
    campaign: updatedCampaign,
    email,
    recipientCount: recipients.length,
    error: email.ok ? undefined : email.error || "Review request could not be queued.",
  }, { status: email.ok ? 201 : email.configured ? 502 : 503 });
}

export const POST = withApiLogging("POST", POSTHandler);
