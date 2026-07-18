import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { getTenantIntegrationCredentialMap } from "@/lib/integration-credentials";
import { readIntegrationConfig } from "@/lib/integration-setup";
import { prisma } from "@/lib/prisma";
import { providerForSocialChannel, publishSocialPost, SOCIAL_CHANNELS, type SocialChannel } from "@/lib/social-publishing";
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

function clean(value: unknown, max = 5_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validUrl(value: unknown) {
  const raw = clean(value, 2_000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function selectedChannels(value: unknown) {
  const allowed = new Set(SOCIAL_CHANNELS.map((item) => item.channel));
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is SocialChannel => typeof item === "string" && allowed.has(item as SocialChannel))))
    : [];
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!allowedRoles.has(user.role)) return NextResponse.json({ ok: false, error: "Director access required." }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const text = clean(body?.text);
  const title = clean(body?.title, 200);
  const mediaUrl = validUrl(body?.mediaUrl);
  const linkUrl = validUrl(body?.linkUrl);
  const channels = selectedChannels(body?.channels);
  const scheduledAtRaw = clean(body?.scheduledAt, 100);
  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
  const scheduleValid = Boolean(scheduledAt && !Number.isNaN(scheduledAt.getTime()) && scheduledAt.getTime() > Date.now());
  const mode = body?.mode === "schedule" ? "schedule" : body?.mode === "draft" ? "draft" : "publish";

  if (!text) return NextResponse.json({ ok: false, error: "Post text is required." }, { status: 400 });
  if (!channels.length) return NextResponse.json({ ok: false, error: "Choose at least one connected social profile." }, { status: 400 });
  if (mode === "schedule" && !scheduleValid) return NextResponse.json({ ok: false, error: "Choose a future publish time." }, { status: 400 });
  const needsImage = channels.some((channel) => channel === "instagram" || channel === "pinterest_social");
  const needsVideo = channels.includes("tiktok_social");
  if (needsImage && !mediaUrl) return NextResponse.json({ ok: false, error: "Instagram and Pinterest require a public image URL." }, { status: 400 });
  if (needsVideo && !mediaUrl) return NextResponse.json({ ok: false, error: "TikTok requires a public video URL." }, { status: 400 });

  const brand = await prisma.brand.findFirst({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const campaign = await prisma.campaign.create({
    data: {
      tenantId: user.tenantId,
      brandId: brand?.id ?? null,
      name: title || `Social post · ${new Date().toLocaleDateString("en-US")}`,
      type: "social_post",
      body: text,
      audience: { label: channels.join(", "), channels, centerId: user.primaryCenterId ?? null, mediaUrl: mediaUrl || null, linkUrl: linkUrl || null } as Prisma.InputJsonObject,
      status: mode === "draft" ? "draft" : mode === "schedule" ? "scheduled" : "publishing",
      scheduledAt: mode === "schedule" ? scheduledAt : null,
      metrics: { platform: "social", channels, createdFrom: "social_publisher", publishResults: [] },
    },
  });

  if (mode !== "publish") {
    await writeAuditLog(user, { action: `social.post.${mode === "draft" ? "drafted" : "scheduled"}`, resource: "Campaign", resourceId: campaign.id, metadata: { channels, scheduledAt: scheduledAt?.toISOString() ?? null } });
    return NextResponse.json({ ok: true, campaignId: campaign.id, status: campaign.status, results: [] });
  }

  const results = [];
  for (const channel of channels) {
    const provider = providerForSocialChannel(channel);
    if (!provider) continue;
    const [integration, credentials] = await Promise.all([
      prisma.integration.findFirst({ where: { tenantId: user.tenantId, provider }, orderBy: { lastSyncAt: "desc" }, select: { configPlaceholder: true } }),
      getTenantIntegrationCredentialMap(user.tenantId, provider),
    ]);
    results.push(await publishSocialPost({ channel, text, title, mediaUrl: mediaUrl || undefined, linkUrl: linkUrl || undefined, config: readIntegrationConfig(integration?.configPlaceholder), credentials }));
  }

  const allPublished = results.length === channels.length && results.every((result) => result.ok);
  const anyPublished = results.some((result) => result.ok);
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: allPublished ? "sent" : anyPublished ? "partial" : "failed",
      sentAt: anyPublished ? new Date() : null,
      metrics: { platform: "social", channels, createdFrom: "social_publisher", publishResults: results as unknown as Prisma.InputJsonArray },
    },
  });
  await writeAuditLog(user, { action: allPublished ? "social.post.published" : "social.post.publish_failed", resource: "Campaign", resourceId: campaign.id, metadata: { channels, published: results.filter((result) => result.ok).map((result) => result.channel), failed: results.filter((result) => !result.ok).map((result) => result.channel) } });

  return NextResponse.json({ ok: allPublished, campaignId: campaign.id, status: allPublished ? "sent" : anyPublished ? "partial" : "failed", results }, { status: allPublished ? 200 : anyPublished ? 207 : 422 });
}

export const POST = withApiLogging("POST", POSTHandler);
