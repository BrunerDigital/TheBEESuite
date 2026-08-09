export type SocialInboxItem = {
  id: string;
  network: string;
  category: string;
  type: string;
  author: string;
  text: string;
  createdAt: string | null;
  permalink: string | null;
  inboxPermalink: string | null;
};

export type ExternalReview = {
  id: string;
  name: string;
  reviewer: string;
  rating: number;
  comment: string;
  createdAt: string | null;
  updatedAt: string | null;
  reply: string;
  replyUpdatedAt: string | null;
  replyState: string;
};

type FetchLike = typeof fetch;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown, max = 10_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validHttpsUrl(value: unknown) {
  const raw = clean(value, 2_000);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(value: unknown) {
  const raw = clean(value, 100);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function providerError(json: unknown, status: number) {
  const data = record(json);
  const nested = record(data.error);
  return clean(nested.message || data.error || data.message, 400) || `Provider returned ${status}.`;
}

async function providerJson(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike,
) {
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const json = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new Error(providerError(json, response.status));
  return record(json);
}

function numericId(value: unknown) {
  const raw = clean(value, 80);
  return /^\d+$/.test(raw) ? raw : "";
}

export function normalizeMetaConversation(
  value: unknown,
  network: "FACEBOOK" | "INSTAGRAM",
  pageId: string,
  inboxUrl: string,
) {
  const conversation = record(value);
  const conversationId = clean(conversation.id, 300);
  const messages = record(conversation.messages);
  const conversationLink = validHttpsUrl(conversation.link);
  if (!conversationId || !Array.isArray(messages.data)) return [];
  return messages.data.flatMap((rawMessage): SocialInboxItem[] => {
    const message = record(rawMessage);
    const id = clean(message.id, 300);
    if (!id) return [];
    const from = record(message.from);
    const isFromSchool = clean(from.id, 100) === pageId;
    return [{
      id,
      network,
      category: isFromSchool ? "SENT" : "RECEIVED",
      type: "DIRECT_MESSAGE",
      author: isFromSchool ? "School profile" : clean(from.name, 200) || `${network === "INSTAGRAM" ? "Instagram" : "Facebook"} user`,
      text: clean(message.message, 8_000),
      createdAt: isoDate(message.created_time),
      permalink: conversationLink,
      inboxPermalink: inboxUrl,
    }];
  });
}

export async function fetchMetaInbox({
  pageId,
  token,
  fetchImpl = fetch,
}: {
  pageId: string;
  token: string;
  fetchImpl?: FetchLike;
}) {
  const page = numericId(pageId);
  if (!page || !clean(token)) throw new Error("A connected Facebook Page and Meta Page access token are required.");
  const params = new URLSearchParams({
    fields: "id,link,updated_time,participants,messages.limit(25){id,created_time,from,message}",
    limit: "25",
  });
  const configuredVersion = clean(process.env.META_GRAPH_API_VERSION, 20);
  const graphVersion = /^v\d+\.\d+$/.test(configuredVersion) ? configuredVersion : "v23.0";
  const inboxUrl = `https://business.facebook.com/latest/inbox/all?asset_id=${page}`;
  const request = (network: "FACEBOOK" | "INSTAGRAM") => {
    const query = new URLSearchParams(params);
    if (network === "INSTAGRAM") query.set("platform", "instagram");
    return providerJson(`https://graph.facebook.com/${graphVersion}/${page}/conversations?${query}`, {
      headers: { Authorization: `Bearer ${clean(token)}`, Accept: "application/json" },
    }, fetchImpl);
  };
  const results = await Promise.allSettled([request("FACEBOOK"), request("INSTAGRAM")]);
  const warnings: string[] = [];
  const items = results.flatMap((result, index) => {
    const network = index === 0 ? "FACEBOOK" as const : "INSTAGRAM" as const;
    if (result.status === "rejected") {
      warnings.push(`${network === "FACEBOOK" ? "Facebook" : "Instagram"} inbox: ${result.reason instanceof Error ? result.reason.message : "access unavailable"}`);
      return [];
    }
    return Array.isArray(result.value.data)
      ? result.value.data.flatMap((conversation) => normalizeMetaConversation(conversation, network, page, inboxUrl))
      : [];
  }).sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || ""))).slice(0, 50);
  if (results.every((result) => result.status === "rejected")) throw new Error(warnings.join(" ").slice(0, 400));
  return {
    items,
    warnings,
    inboxUrl,
    syncedAt: new Date().toISOString(),
  };
}

const starRatings: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export function normalizeGoogleReview(value: unknown): ExternalReview | null {
  const item = record(value);
  const name = clean(item.name, 500);
  const id = clean(item.reviewId, 200) || name.split("/").at(-1) || "";
  if (!id || !name) return null;
  const reviewer = record(item.reviewer);
  const reply = record(item.reviewReply);
  const rawRating = item.starRating;
  const rating = typeof rawRating === "number" ? rawRating : starRatings[clean(rawRating, 20).toUpperCase()] || 0;
  return {
    id,
    name,
    reviewer: clean(reviewer.displayName, 200) || (reviewer.isAnonymous === true ? "Anonymous reviewer" : "Google reviewer"),
    rating,
    comment: clean(item.comment, 8_000),
    createdAt: isoDate(item.createTime),
    updatedAt: isoDate(item.updateTime),
    reply: clean(reply.comment, 4_096),
    replyUpdatedAt: isoDate(reply.updateTime),
    replyState: clean(reply.state || reply.reviewReplyState, 100),
  };
}

function googleResourceSegment(value: string, prefix: string) {
  return clean(value, 300).replace(new RegExp(`^${prefix}/`, "i"), "");
}

function googleReviewBase(accountId: string, locationId: string) {
  const account = googleResourceSegment(accountId, "accounts");
  const location = googleResourceSegment(locationId, "locations");
  if (!account || !location || account.includes("/") || location.includes("/")) {
    throw new Error("A valid Google Business account and location are required.");
  }
  return `accounts/${account}/locations/${location}/reviews`;
}

export async function fetchGoogleBusinessReviews({
  accountId,
  locationId,
  token,
  fetchImpl = fetch,
}: {
  accountId: string;
  locationId: string;
  token: string;
  fetchImpl?: FetchLike;
}) {
  const base = googleReviewBase(accountId, locationId);
  if (!clean(token)) throw new Error("Google Business authorization is required.");
  const params = new URLSearchParams({ pageSize: "50", orderBy: "updateTime desc" });
  const json = await providerJson(`https://mybusiness.googleapis.com/v4/${base}?${params}`, {
    headers: { Authorization: `Bearer ${clean(token)}`, Accept: "application/json" },
  }, fetchImpl);
  const reviews = Array.isArray(json.reviews) ? json.reviews.flatMap((item) => {
    const normalized = normalizeGoogleReview(item);
    return normalized ? [normalized] : [];
  }) : [];
  return {
    reviews,
    averageRating: typeof json.averageRating === "number" ? json.averageRating : null,
    totalReviewCount: typeof json.totalReviewCount === "number" ? json.totalReviewCount : reviews.length,
    nextPageToken: clean(json.nextPageToken, 1_000) || null,
    syncedAt: new Date().toISOString(),
  };
}

export async function replyToGoogleBusinessReview({
  accountId,
  locationId,
  reviewName,
  comment,
  token,
  fetchImpl = fetch,
}: {
  accountId: string;
  locationId: string;
  reviewName: string;
  comment: string;
  token: string;
  fetchImpl?: FetchLike;
}) {
  const base = googleReviewBase(accountId, locationId);
  const name = clean(reviewName, 500);
  const responseText = clean(comment, 4_096);
  if (!name.startsWith(`${base}/`) || name.slice(base.length + 1).includes("/")) {
    throw new Error("That review does not belong to the selected school location.");
  }
  if (!responseText) throw new Error("Write a response before publishing it.");
  if (!clean(token)) throw new Error("Google Business authorization is required.");
  const json = await providerJson(`https://mybusiness.googleapis.com/v4/${name}/reply`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${clean(token)}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment: responseText }),
  }, fetchImpl);
  return {
    comment: clean(json.comment, 4_096) || responseText,
    updateTime: isoDate(json.updateTime) || new Date().toISOString(),
    state: clean(json.state || json.reviewReplyState, 100),
  };
}
