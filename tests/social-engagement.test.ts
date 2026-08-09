import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchGoogleBusinessReviews,
  fetchMetaInbox,
  normalizeGoogleReview,
  normalizeMetaConversation,
  replyToGoogleBusinessReview,
} from "@/lib/social-engagement";

test("Meta conversation normalization keeps school direction and safe provider links", () => {
  assert.deepEqual(normalizeMetaConversation({
    id: "conversation-1",
    link: "https://facebook.com/messages/t/1",
    messages: { data: [{
      id: "message-1",
      created_time: "2026-08-08T12:00:00Z",
      from: { id: "parent-1", name: "Parent Example" },
      message: "Can I schedule a tour?",
    }] },
  }, "INSTAGRAM", "12345", "https://business.facebook.com/latest/inbox/all?asset_id=12345"), [{
    id: "message-1",
    network: "INSTAGRAM",
    category: "RECEIVED",
    type: "DIRECT_MESSAGE",
    author: "Parent Example",
    text: "Can I schedule a tour?",
    createdAt: "2026-08-08T12:00:00.000Z",
    permalink: "https://facebook.com/messages/t/1",
    inboxPermalink: "https://business.facebook.com/latest/inbox/all?asset_id=12345",
  }]);
});

test("Meta inbox queries Facebook and Instagram through one school Page token", async () => {
  const requestUrls: string[] = [];
  const authorizations: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requestUrls.push(url);
    authorizations.push(new Headers(init?.headers).get("Authorization") || "");
    const networkAuthor = url.includes("platform=instagram") ? "Instagram Parent" : "Facebook Parent";
    return new Response(JSON.stringify({ data: [{ id: `conversation-${requestUrls.length}`, messages: { data: [{ id: `message-${requestUrls.length}`, from: { id: "parent", name: networkAuthor }, message: "Hello", created_time: "2026-08-08T12:00:00Z" }] } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const result = await fetchMetaInbox({
    pageId: "12345",
    token: "secret-token",
    fetchImpl,
  });
  assert.equal(requestUrls.length, 2);
  assert.equal(requestUrls.every((url) => url.startsWith("https://graph.facebook.com/v23.0/12345/conversations?")), true);
  assert.equal(requestUrls.some((url) => url.includes("platform=instagram")), true);
  assert.deepEqual(authorizations, ["Bearer secret-token", "Bearer secret-token"]);
  assert.equal(result.items.length, 2);
  assert.equal(result.inboxUrl, "https://business.facebook.com/latest/inbox/all?asset_id=12345");
});

test("Google review normalization includes response state without exposing unrelated fields", () => {
  assert.deepEqual(normalizeGoogleReview({
    name: "accounts/1/locations/2/reviews/3",
    reviewId: "3",
    reviewer: { displayName: "Reviewer" },
    starRating: "FIVE",
    comment: "Wonderful team",
    createTime: "2026-08-01T12:00:00Z",
    updateTime: "2026-08-02T12:00:00Z",
    reviewReply: { comment: "Thank you!", updateTime: "2026-08-03T12:00:00Z", state: "PUBLISHED" },
  }), {
    id: "3",
    name: "accounts/1/locations/2/reviews/3",
    reviewer: "Reviewer",
    rating: 5,
    comment: "Wonderful team",
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-02T12:00:00.000Z",
    reply: "Thank you!",
    replyUpdatedAt: "2026-08-03T12:00:00.000Z",
    replyState: "PUBLISHED",
  });
});

test("Google review reads and replies stay inside the configured account and location", async () => {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method || "GET", body: String(init?.body || "") });
    if (init?.method === "PUT") return new Response(JSON.stringify({ comment: "Thanks for the feedback.", updateTime: "2026-08-08T14:00:00Z" }), { status: 200 });
    return new Response(JSON.stringify({ reviews: [], averageRating: 4.8, totalReviewCount: 42 }), { status: 200 });
  }) as typeof fetch;

  const reviews = await fetchGoogleBusinessReviews({ accountId: "accounts/1", locationId: "locations/2", token: "google-token", fetchImpl });
  assert.equal(reviews.totalReviewCount, 42);
  assert.match(calls[0]?.url || "", /^https:\/\/mybusiness\.googleapis\.com\/v4\/accounts\/1\/locations\/2\/reviews\?/);

  const reply = await replyToGoogleBusinessReview({
    accountId: "1",
    locationId: "2",
    reviewName: "accounts/1/locations/2/reviews/3",
    comment: "Thanks for the feedback.",
    token: "google-token",
    fetchImpl,
  });
  assert.equal(reply.comment, "Thanks for the feedback.");
  assert.equal(calls[1]?.method, "PUT");
  assert.equal(calls[1]?.url, "https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews/3/reply");

  await assert.rejects(() => replyToGoogleBusinessReview({
    accountId: "1",
    locationId: "2",
    reviewName: "accounts/1/locations/999/reviews/3",
    comment: "This must fail.",
    token: "google-token",
    fetchImpl,
  }), /does not belong/);
  assert.equal(calls.length, 2);
});
