import type { IntegrationProvider } from "@/lib/integration-setup";

export type SocialChannel = "facebook" | "instagram" | "linkedin_social" | "google_business" | "tiktok_social" | "pinterest_social" | "x_social";

export type SocialPublishInput = {
  channel: SocialChannel;
  text: string;
  mediaUrl?: string;
  linkUrl?: string;
  title?: string;
  config: Record<string, string | boolean>;
  credentials: Record<string, string>;
};

export type SocialPublishResult = {
  ok: boolean;
  configured: boolean;
  channel: SocialChannel;
  externalId?: string;
  error?: string;
};

export const SOCIAL_CHANNELS: Array<{
  channel: SocialChannel;
  provider: IntegrationProvider;
  name: string;
  publishing: "available" | "review_required";
  analytics: "available" | "limited";
  mediaRequirement?: "image" | "video";
}> = [
  { channel: "facebook", provider: "meta_social", name: "Facebook Page", publishing: "available", analytics: "available" },
  { channel: "instagram", provider: "meta_social", name: "Instagram", publishing: "available", analytics: "available", mediaRequirement: "image" },
  { channel: "linkedin_social", provider: "linkedin_social", name: "LinkedIn Page", publishing: "review_required", analytics: "available" },
  { channel: "google_business", provider: "google_business", name: "Google Business", publishing: "available", analytics: "available" },
  { channel: "tiktok_social", provider: "tiktok_social", name: "TikTok", publishing: "review_required", analytics: "limited", mediaRequirement: "video" },
  { channel: "pinterest_social", provider: "pinterest_social", name: "Pinterest", publishing: "available", analytics: "available", mediaRequirement: "image" },
  { channel: "x_social", provider: "x_social", name: "X", publishing: "available", analytics: "available" },
];

export function providerForSocialChannel(channel: SocialChannel) {
  return SOCIAL_CHANNELS.find((item) => item.channel === channel)?.provider ?? null;
}

function stringConfig(config: Record<string, string | boolean>, key: string) {
  return typeof config[key] === "string" ? String(config[key]).trim() : "";
}

async function responseResult(response: Response, channel: SocialChannel) {
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const error = json?.error && typeof json.error === "object" ? json.error as Record<string, unknown> : null;
    return { ok: false, configured: true, channel, error: String(error?.message ?? json?.message ?? `Provider returned ${response.status}.`) } satisfies SocialPublishResult;
  }
  const data = json?.data && typeof json.data === "object" ? json.data as Record<string, unknown> : null;
  return { ok: true, configured: true, channel, externalId: String(json?.id ?? data?.publish_id ?? data?.id ?? "") || undefined } satisfies SocialPublishResult;
}

export async function publishSocialPost(input: SocialPublishInput): Promise<SocialPublishResult> {
  const { channel, config, credentials } = input;
  if (channel === "facebook") {
    const token = credentials.META_SOCIAL_ACCESS_TOKEN;
    const pageId = stringConfig(config, "facebookPageId");
    if (!token || !pageId) return { ok: false, configured: false, channel, error: "Facebook Page ID and Page access token are required." };
    const body = new URLSearchParams({ message: input.text, access_token: token });
    if (input.linkUrl) body.set("link", input.linkUrl);
    return responseResult(await fetch(`https://graph.facebook.com/${encodeURIComponent(pageId)}/feed`, { method: "POST", body }), channel);
  }

  if (channel === "instagram") {
    const token = credentials.META_SOCIAL_ACCESS_TOKEN;
    const accountId = stringConfig(config, "instagramAccountId");
    if (!token || !accountId || !input.mediaUrl) return { ok: false, configured: false, channel, error: "Instagram professional account, access token, and public image URL are required." };
    const createBody = new URLSearchParams({ image_url: input.mediaUrl, caption: input.text, access_token: token });
    const createResponse = await fetch(`https://graph.facebook.com/${encodeURIComponent(accountId)}/media`, { method: "POST", body: createBody });
    const created = await createResponse.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
    if (!createResponse.ok || !created?.id) return { ok: false, configured: true, channel, error: created?.error?.message ?? "Instagram media container could not be created." };
    const publishBody = new URLSearchParams({ creation_id: created.id, access_token: token });
    return responseResult(await fetch(`https://graph.facebook.com/${encodeURIComponent(accountId)}/media_publish`, { method: "POST", body: publishBody }), channel);
  }

  if (channel === "linkedin_social") {
    const token = credentials.LINKEDIN_SOCIAL_ACCESS_TOKEN;
    const organizationId = stringConfig(config, "organizationId");
    if (!token || !organizationId) return { ok: false, configured: false, channel, error: "LinkedIn organization ID and approved access token are required." };
    const commentary = input.linkUrl ? `${input.text}\n\n${input.linkUrl}` : input.text;
    const response = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || "202604", "X-Restli-Protocol-Version": "2.0.0" },
      body: JSON.stringify({ author: `urn:li:organization:${organizationId}`, commentary, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false }),
    });
    const result = await responseResult(response, channel);
    return { ...result, externalId: result.externalId || response.headers.get("x-restli-id") || undefined };
  }

  if (channel === "google_business") {
    const token = credentials.GOOGLE_BUSINESS_ACCESS_TOKEN;
    const accountId = stringConfig(config, "accountId");
    const locationId = stringConfig(config, "locationId");
    if (!token || !accountId || !locationId) return { ok: false, configured: false, channel, error: "Google Business account, location, and OAuth token are required." };
    return responseResult(await fetch(`https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/localPosts`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ languageCode: "en-US", summary: input.text, topicType: "STANDARD", ...(input.linkUrl ? { callToAction: { actionType: "LEARN_MORE", url: input.linkUrl } } : {}) }),
    }), channel);
  }

  if (channel === "pinterest_social") {
    const token = credentials.PINTEREST_SOCIAL_ACCESS_TOKEN;
    const boardId = stringConfig(config, "boardId");
    if (!token || !boardId || !input.mediaUrl) return { ok: false, configured: false, channel, error: "Pinterest board, access token, and public image URL are required." };
    return responseResult(await fetch("https://api.pinterest.com/v5/pins", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ board_id: boardId, title: input.title || input.text.slice(0, 80), description: input.text, link: input.linkUrl || undefined, media_source: { source_type: "image_url", url: input.mediaUrl } }),
    }), channel);
  }

  if (channel === "x_social") {
    const token = credentials.X_SOCIAL_ACCESS_TOKEN;
    if (!token) return { ok: false, configured: false, channel, error: "X OAuth user access token is required." };
    return responseResult(await fetch("https://api.x.com/2/tweets", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.linkUrl ? `${input.text}\n${input.linkUrl}` : input.text }),
    }), channel);
  }

  const token = credentials.TIKTOK_SOCIAL_ACCESS_TOKEN;
  const auditStatus = stringConfig(config, "auditStatus");
  if (!token || !input.mediaUrl) return { ok: false, configured: false, channel, error: "TikTok user access token and public video URL are required." };
  const privacyLevel = auditStatus === "approved" ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY";
  return responseResult(await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ post_info: { title: input.text, privacy_level: privacyLevel, disable_duet: false, disable_comment: false, disable_stitch: false, video_cover_timestamp_ms: 1000 }, source_info: { source: "PULL_FROM_URL", video_url: input.mediaUrl } }),
  }), channel);
}
