import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canManageCrmLeads, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail, uniqueEmails } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function visibleCenterIds(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  if (!canAccessAllCenters(user)) return user.centerIds;
  const centers = await prisma.center.findMany({
    where: {
      status: { not: "closed" },
      organization: { tenantId: user.tenantId },
    },
    select: { id: true },
  });
  return centers.map((center) => center.id);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageCrmLeads(user)) {
    return NextResponse.json({ ok: false, error: "Campaign email sending is not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const message = clean(body.message) || clean(body.body);
  const limit = Math.max(1, Math.min(Number(body.limit) || 1000, 1000));

  if (!message) {
    return NextResponse.json({ ok: false, error: "Campaign email body is required before sending." }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      brand: { select: { id: true, name: true, tenantId: true } },
    },
  });
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign not found." }, { status: 404 });
  if (campaign.brand?.tenantId && campaign.brand.tenantId !== user.tenantId) {
    return NextResponse.json({ ok: false, error: "You do not have access to this campaign." }, { status: 403 });
  }
  if (campaign.type && !["email", "newsletter", "nurture"].includes(campaign.type.toLowerCase())) {
    return NextResponse.json({ ok: false, error: "Only email-style campaigns can be sent through SendGrid." }, { status: 400 });
  }

  const centerIds = await visibleCenterIds(user);
  if (!centerIds.length) return NextResponse.json({ ok: false, error: "No centers are available for this campaign." }, { status: 400 });

  const leads = await prisma.lead.findMany({
    where: {
      centerId: { in: centerIds },
      status: { not: "closed" },
      email: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, email: true },
  });
  const recipients = uniqueEmails(leads.map((lead) => lead.email ?? "")).slice(0, 1000);
  if (!recipients.length) {
    return NextResponse.json({ ok: false, error: "No lead email recipients were found for this campaign." }, { status: 400 });
  }

  const subject = clean(body.subject) || campaign.name;
  const email = await sendEmail({
    to: recipients,
    subject,
    text: message,
    replyTo: user.email,
    fromName: campaign.brand?.name ?? "The BEE Suite",
    categories: ["campaign_email"],
    customArgs: { campaignId: campaign.id },
    tenantId: user.tenantId,
  });

  await recordEmailDeliveryAttempt({
    tenantId: user.tenantId,
    purpose: "campaign_email",
    to: recipients,
    subject,
    text: message,
    replyTo: user.email,
    fromName: campaign.brand?.name ?? "The BEE Suite",
    result: email,
    metadata: {
      campaignId: campaign.id,
      leadCount: leads.length,
      centerCount: centerIds.length,
    },
  });

  if (email.ok) {
    const metrics = {
      ...asRecord(campaign.metrics),
      lastSendAt: new Date().toISOString(),
      lastRecipientCount: recipients.length,
      lastProviderMessageId: email.id ?? null,
    };
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "active", metrics },
    });
  }

  await writeAuditLog(user, {
    centerId: user.primaryCenterId,
    action: email.ok ? "campaign.email.sent" : "campaign.email.not_sent",
    resource: "Campaign",
    resourceId: campaign.id,
    metadata: {
      recipientCount: recipients.length,
      provider: email.provider,
      providerMessageId: email.id ?? null,
      configured: email.configured,
      error: email.error ?? null,
    },
  });

  return NextResponse.json({
    ok: email.ok,
    email,
    recipientCount: recipients.length,
    error: email.ok ? undefined : email.error || "Campaign email could not be queued.",
  }, { status: email.ok ? 200 : email.configured ? 502 : 503 });
}
