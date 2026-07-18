import { NextRequest, NextResponse } from "next/server";
import { writeSystemAuditLog } from "@/lib/audit";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail, uniqueEmails } from "@/lib/integrations";
import { getTenantIntegrationCredentialMap } from "@/lib/integration-credentials";
import { readIntegrationConfig } from "@/lib/integration-setup";
import { prisma } from "@/lib/prisma";
import { providerForSocialChannel, publishSocialPost, SOCIAL_CHANNELS, type SocialChannel } from "@/lib/social-publishing";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function campaignRecipients(input: {
  tenantId: string;
  campaignType: string;
  audience: unknown;
}) {
  const audience = asRecord(input.audience);
  const selectedCenterId = typeof audience.centerId === "string" && audience.centerId ? audience.centerId : null;
  const centers = await prisma.center.findMany({
    where: {
      status: { not: "closed" },
      organization: { tenantId: input.tenantId },
      ...(selectedCenterId ? { id: selectedCenterId } : {}),
    },
    select: { id: true },
    take: 2000,
  });
  const centerIds = centers.map((center) => center.id);
  if (!centerIds.length) {
    return { recipients: [], centerIds, familyCount: 0, leadCount: 0, workflow: "none" };
  }

  const workflow = typeof audience.workflow === "string" ? audience.workflow : input.campaignType;
  if (workflow === "review_request" || input.campaignType === "review_request") {
    const families = await prisma.family.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: { updatedAt: "desc" },
      take: 1000,
      select: {
        billingEmail: true,
        guardians: {
          where: { email: { not: null } },
          select: { email: true },
          take: 3,
        },
      },
    });
    return {
      recipients: uniqueEmails(
        families.flatMap((family) => [
          family.billingEmail ?? "",
          ...family.guardians.map((guardian) => guardian.email ?? ""),
        ]),
      ),
      centerIds,
      familyCount: families.length,
      leadCount: 0,
      workflow,
    };
  }

  const leads = await prisma.lead.findMany({
    where: {
      centerId: { in: centerIds },
      status: { not: "closed" },
      email: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    take: 1000,
    select: { email: true },
  });
  return {
    recipients: uniqueEmails(leads.map((lead) => lead.email ?? "")),
    centerIds,
    familyCount: 0,
    leadCount: leads.length,
    workflow,
  };
}

async function GETHandler(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const now = new Date();
  const dueCampaigns = await prisma.campaign.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
      body: { not: null },
      OR: [
        { tenantId: { not: null } },
        { brand: { is: { tenantId: { not: "" } } } },
      ],
    },
    orderBy: { scheduledAt: "asc" },
    take: 25,
    include: { brand: { select: { id: true, name: true, tenantId: true } } },
  });

  const results = [];
  for (const campaign of dueCampaigns) {
    const tenantId = campaign.tenantId ?? campaign.brand?.tenantId;
    if (!tenantId || !campaign.body) continue;

    if (campaign.type === "social_post") {
      const audience = asRecord(campaign.audience);
      const allowedChannels = new Set(SOCIAL_CHANNELS.map((item) => item.channel));
      const channels = Array.isArray(audience.channels)
        ? audience.channels.filter((item): item is SocialChannel => typeof item === "string" && allowedChannels.has(item as SocialChannel))
        : [];
      if (dryRun) {
        results.push({ campaignId: campaign.id, sent: false, channelCount: channels.length, dryRun: true });
        continue;
      }
      const publishResults = [];
      for (const channel of channels) {
        const provider = providerForSocialChannel(channel);
        if (!provider) continue;
        const [integration, credentials] = await Promise.all([
          prisma.integration.findFirst({ where: { tenantId, provider }, orderBy: { lastSyncAt: "desc" }, select: { configPlaceholder: true } }),
          getTenantIntegrationCredentialMap(tenantId, provider),
        ]);
        publishResults.push(await publishSocialPost({
          channel,
          text: campaign.body,
          title: campaign.name,
          mediaUrl: clean(audience.mediaUrl) || undefined,
          linkUrl: clean(audience.linkUrl) || undefined,
          config: readIntegrationConfig(integration?.configPlaceholder),
          credentials,
        }));
      }
      const allPublished = publishResults.length === channels.length && publishResults.every((result) => result.ok);
      const anyPublished = publishResults.some((result) => result.ok);
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: allPublished ? "sent" : anyPublished ? "partial" : "failed",
          sentAt: anyPublished ? now : campaign.sentAt,
          scheduledAt: null,
          metrics: { ...asRecord(campaign.metrics), publishResults, lastAttemptAt: now.toISOString() },
        },
      });
      await writeSystemAuditLog({ tenantId, action: allPublished ? "social.scheduler.published" : "social.scheduler.publish_failed", resource: "Campaign", resourceId: campaign.id, metadata: { channels, published: publishResults.filter((result) => result.ok).map((result) => result.channel) } });
      results.push({ campaignId: campaign.id, sent: allPublished, channelCount: channels.length, publishResults });
      continue;
    }

    const recipientScope = await campaignRecipients({
      tenantId,
      campaignType: campaign.type,
      audience: campaign.audience,
    });
    const recipients = recipientScope.recipients;
    if (!recipients.length) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: "paused",
          metrics: {
            ...asRecord(campaign.metrics),
            lastAttemptAt: now.toISOString(),
            lastDeliveryStatus: "no_recipients",
            lastRecipientWorkflow: recipientScope.workflow,
            lastCenterCount: recipientScope.centerIds.length,
            lastFamilyCount: recipientScope.familyCount,
            lastLeadCount: recipientScope.leadCount,
          },
        },
      });
      results.push({ campaignId: campaign.id, sent: false, recipientCount: 0, error: "No recipients." });
      continue;
    }

    if (dryRun) {
      results.push({ campaignId: campaign.id, sent: false, recipientCount: recipients.length, dryRun: true });
      continue;
    }

    const subject = clean(campaign.subject) || campaign.name;
    const email = await sendEmail({
      to: recipients,
      subject,
      text: campaign.body,
      fromName: campaign.brand?.name ?? "The BEE Suite",
      categories: ["campaign_email"],
      customArgs: { campaignId: campaign.id },
      tenantId,
    });
    await recordEmailDeliveryAttempt({
      tenantId,
      centerId: recipientScope.centerIds.length === 1 ? recipientScope.centerIds[0] : null,
      purpose: "campaign_email",
      to: recipients,
      subject,
      text: campaign.body,
      fromName: campaign.brand?.name ?? "The BEE Suite",
      result: email,
      metadata: {
        campaignId: campaign.id,
        scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
        cron: true,
        workflow: recipientScope.workflow,
        familyCount: recipientScope.familyCount,
        leadCount: recipientScope.leadCount,
        centerCount: recipientScope.centerIds.length,
      },
    });
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: email.ok ? "active" : "paused",
        sentAt: email.ok ? now : campaign.sentAt,
        scheduledAt: email.ok ? null : campaign.scheduledAt,
        metrics: {
          ...asRecord(campaign.metrics),
          lastAttemptAt: now.toISOString(),
          lastSendAt: email.ok ? now.toISOString() : null,
          lastRecipientCount: recipients.length,
          lastRecipientWorkflow: recipientScope.workflow,
          lastCenterCount: recipientScope.centerIds.length,
          lastFamilyCount: recipientScope.familyCount,
          lastLeadCount: recipientScope.leadCount,
          lastProviderMessageId: email.id ?? null,
          lastDeliveryStatus: email.ok ? "delivered" : email.configured ? "failed" : "not_configured",
          lastError: email.error ?? null,
        },
      },
    });
    await writeSystemAuditLog({
      tenantId,
      action: email.ok ? "campaign.scheduler.sent" : "campaign.scheduler.not_sent",
      resource: "Campaign",
      resourceId: campaign.id,
      metadata: {
        recipientCount: recipients.length,
        familyCount: recipientScope.familyCount,
        leadCount: recipientScope.leadCount,
        centerCount: recipientScope.centerIds.length,
        workflow: recipientScope.workflow,
        provider: email.provider,
        configured: email.configured,
        error: email.error ?? null,
      },
    });
    results.push({ campaignId: campaign.id, sent: email.ok, recipientCount: recipients.length, error: email.error ?? null });
  }

  return NextResponse.json({ ok: true, scanned: dueCampaigns.length, results });
}

export const GET = withApiLogging("GET", GETHandler);
