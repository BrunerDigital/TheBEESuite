import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { getTenantIntegrationCredentialMap } from "@/lib/integration-credentials";
import { normalizeIntegrationProvider, readIntegrationConfig, SOCIAL_INTEGRATION_PROVIDERS } from "@/lib/integration-setup";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedRoles = new Set<UserRole>([UserRole.PLATFORM_OWNER, UserRole.BRAND_ADMIN, UserRole.REGIONAL_MANAGER, UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR]);

function stringValue(config: Record<string, string | boolean>, key: string) {
  return typeof config[key] === "string" ? String(config[key]).trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && Number.isFinite(Number(value)) ? Number(value) : 0;
}

function sumNumbers(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + sumNumbers(item), 0);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).reduce<number>((sum, item) => sum + sumNumbers(item), 0);
  return numberValue(value);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function getJson(url: string, token: string, extraHeaders: Record<string, string> = {}) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ...extraHeaders } });
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(String(record(json?.error).message || json?.message || `Provider returned ${response.status}.`));
  return json ?? {};
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!allowedRoles.has(user.role)) return NextResponse.json({ ok: false, error: "Director access required." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const provider = normalizeIntegrationProvider(body?.provider);
  if (!provider || !SOCIAL_INTEGRATION_PROVIDERS.includes(provider)) return NextResponse.json({ ok: false, error: "Choose a supported social profile." }, { status: 400 });

  const integration = await prisma.integration.findFirst({ where: { tenantId: user.tenantId, provider }, orderBy: { lastSyncAt: "desc" } });
  if (!integration) return NextResponse.json({ ok: false, error: "Connect this profile before syncing analytics." }, { status: 400 });
  const config = readIntegrationConfig(integration.configPlaceholder);
  const credentials = await getTenantIntegrationCredentialMap(user.tenantId, provider);
  let analytics: Record<string, number> = {};

  try {
    if (provider === "x_social") {
      const userId = stringValue(config, "userId");
      const json = await getJson(`https://api.x.com/2/users/${encodeURIComponent(userId)}?user.fields=public_metrics`, credentials.X_SOCIAL_ACCESS_TOKEN || "");
      const metrics = record(record(json.data).public_metrics);
      analytics = { followers: numberValue(metrics.followers_count), following: numberValue(metrics.following_count), posts: numberValue(metrics.tweet_count), likes: numberValue(metrics.like_count) };
    } else if (provider === "tiktok_social") {
      const json = await getJson("https://open.tiktokapis.com/v2/user/info/?fields=follower_count,following_count,likes_count,video_count", credentials.TIKTOK_SOCIAL_ACCESS_TOKEN || "");
      const account = record(record(json.data).user);
      analytics = { followers: numberValue(account.follower_count), following: numberValue(account.following_count), likes: numberValue(account.likes_count), posts: numberValue(account.video_count) };
    } else if (provider === "meta_social") {
      const token = credentials.META_SOCIAL_ACCESS_TOKEN || "";
      const pageId = stringValue(config, "facebookPageId");
      const instagramId = stringValue(config, "instagramAccountId");
      const [page, instagram] = await Promise.all([
        pageId ? getJson(`https://graph.facebook.com/${encodeURIComponent(pageId)}?fields=fan_count,followers_count`, token) : Promise.resolve({} as Record<string, unknown>),
        instagramId ? getJson(`https://graph.facebook.com/${encodeURIComponent(instagramId)}?fields=followers_count,media_count`, token) : Promise.resolve({} as Record<string, unknown>),
      ]);
      analytics = { followers: numberValue(page.followers_count) + numberValue(instagram.followers_count), facebookFans: numberValue(page.fan_count), instagramFollowers: numberValue(instagram.followers_count), posts: numberValue(instagram.media_count) };
    } else if (provider === "pinterest_social") {
      const json = await getJson("https://api.pinterest.com/v5/user_account", credentials.PINTEREST_SOCIAL_ACCESS_TOKEN || "");
      analytics = { followers: numberValue(json.follower_count), following: numberValue(json.following_count), monthlyViews: numberValue(json.monthly_views) };
    } else if (provider === "linkedin_social") {
      const organizationId = stringValue(config, "organizationId");
      const urn = encodeURIComponent(`urn:li:organization:${organizationId}`);
      const json = await getJson(`https://api.linkedin.com/rest/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${urn}`, credentials.LINKEDIN_SOCIAL_ACCESS_TOKEN || "", { "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || "202604", "X-Restli-Protocol-Version": "2.0.0" });
      const element = Array.isArray(json.elements) ? record(json.elements[0]) : {};
      const total = record(element.followerCountsByAssociationType);
      analytics = { followers: sumNumbers(total) };
    } else {
      const locationId = stringValue(config, "locationId");
      const end = new Date();
      const start = new Date(end.getTime() - 29 * 86_400_000);
      const params = new URLSearchParams({ "dailyRange.start_date.year": String(start.getUTCFullYear()), "dailyRange.start_date.month": String(start.getUTCMonth() + 1), "dailyRange.start_date.day": String(start.getUTCDate()), "dailyRange.end_date.year": String(end.getUTCFullYear()), "dailyRange.end_date.month": String(end.getUTCMonth() + 1), "dailyRange.end_date.day": String(end.getUTCDate()) });
      for (const metric of ["BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "WEBSITE_CLICKS", "CALL_CLICKS", "BUSINESS_DIRECTION_REQUESTS"]) params.append("dailyMetrics", metric);
      const json = await getJson(`https://businessprofileperformance.googleapis.com/v1/locations/${encodeURIComponent(locationId)}:fetchMultiDailyMetricsTimeSeries?${params}`, credentials.GOOGLE_BUSINESS_ACCESS_TOKEN || "");
      const series = Array.isArray(json.multiDailyMetricTimeSeries) ? json.multiDailyMetricTimeSeries : [];
      for (const item of series) {
        const row = record(item);
        const metric = String(row.dailyMetric || "").toLowerCase();
        const values = Array.isArray(record(record(row.dailyMetricTimeSeries).timeSeries).datedValues) ? record(record(row.dailyMetricTimeSeries).timeSeries).datedValues as unknown[] : [];
        analytics[metric] = values.reduce<number>((sum, value) => sum + numberValue(record(value).value), 0);
      }
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Profile analytics could not be synced." }, { status: 422 });
  }

  const current = record(integration.configPlaceholder);
  await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncAt: new Date(), configPlaceholder: { ...current, analytics, analyticsUpdatedAt: new Date().toISOString() } as Prisma.InputJsonObject } });
  await writeAuditLog(user, { action: "social.analytics.synced", resource: "Integration", resourceId: integration.id, metadata: { provider, metricKeys: Object.keys(analytics) } });
  return NextResponse.json({ ok: true, provider, analytics, syncedAt: new Date().toISOString() });
}

export const POST = withApiLogging("POST", POSTHandler);
