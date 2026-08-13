import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { providerForSocialChannel, publishSocialPost, SOCIAL_CHANNELS } from "@/lib/social-publishing";

test("social publishing covers the supported owned-profile channels", () => {
  assert.deepEqual(SOCIAL_CHANNELS.map((item) => item.channel), ["facebook", "instagram", "linkedin_social", "google_business", "tiktok_social", "pinterest_social", "x_social"]);
  assert.equal(providerForSocialChannel("facebook"), "meta_social");
  assert.equal(providerForSocialChannel("instagram"), "meta_social");
});

test("Facebook publishing sends Page copy and destination link", async () => {
  const originalFetch = globalThis.fetch;
  let url = "";
  let body = "";
  globalThis.fetch = (async (input, init) => {
    url = String(input);
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ id: "page_post_1" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await publishSocialPost({ channel: "facebook", text: "Enrollment is open", linkUrl: "https://example.com/enroll", config: { facebookPageId: "page_1" }, credentials: { META_SOCIAL_ACCESS_TOKEN: "token" } });
    assert.equal(result.ok, true);
    assert.match(url, /page_1\/feed$/);
    assert.match(body, /message=Enrollment\+is\+open/);
    assert.match(body, /link=https%3A%2F%2Fexample.com%2Fenroll/);
  } finally { globalThis.fetch = originalFetch; }
});

test("Instagram publishing requires public media and uses the container workflow", async () => {
  const missing = await publishSocialPost({ channel: "instagram", text: "Hello", config: { instagramAccountId: "ig_1" }, credentials: { META_SOCIAL_ACCESS_TOKEN: "token" } });
  assert.equal(missing.ok, false);
  assert.equal(missing.configured, false);

  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ id: urls.length === 1 ? "container_1" : "post_1" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await publishSocialPost({ channel: "instagram", text: "Hello", mediaUrl: "https://example.com/image.jpg", config: { instagramAccountId: "ig_1" }, credentials: { META_SOCIAL_ACCESS_TOKEN: "token" } });
    assert.equal(result.ok, true);
    assert.match(urls[0], /ig_1\/media$/);
    assert.match(urls[1], /ig_1\/media_publish$/);
  } finally { globalThis.fetch = originalFetch; }
});

test("TikTok unaudited publishing stays private-only", async () => {
  const originalFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = (async (_input, init) => {
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ data: { publish_id: "pub_1" } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await publishSocialPost({ channel: "tiktok_social", text: "Video", mediaUrl: "https://example.com/video.mp4", config: { auditStatus: "in_review" }, credentials: { TIKTOK_SOCIAL_ACCESS_TOKEN: "token" } });
    assert.equal(result.ok, true);
    assert.match(body, /SELF_ONLY/);
    assert.doesNotMatch(body, /PUBLIC_TO_EVERYONE/);
  } finally { globalThis.fetch = originalFetch; }
});

test("social publisher carries the selected school into posting and analytics", () => {
  const component = readFileSync(
    new URL("../src/components/social-publishing-studio.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /centerId/);
  assert.match(component, /selectedTimeZone = selectedCenter\?\.timeZone \|\| timeZone/);
  assert.match(component, /zonedDateTimeLocalToUtc\(scheduledAt, selectedTimeZone\)/);
  assert.match(component, /body: JSON\.stringify\(\{\s+mode,\s+centerId,/);
  assert.match(component, /body: JSON\.stringify\(\{ provider, centerId \}\)/);
  assert.match(component, /selectedProfiles = profiles\.filter\(\(item\) => item\.centerId === centerId\)/);
  assert.match(component, /href=\{`\/integrations\?provider=\$\{connection\.provider\}`\}/);
});

test("social post and analytics APIs resolve school scope before provider access", () => {
  const postsRoute = readFileSync(
    new URL("../src/app/api/marketing/social-posts/route.ts", import.meta.url),
    "utf8",
  );
  const analyticsRoute = readFileSync(
    new URL("../src/app/api/marketing/social-analytics/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(postsRoute, /resolveMarketingCenter\(user, body\?\.centerId\)/);
  assert.match(postsRoute, /centerId: center\.id/);
  assert.match(postsRoute, /audience: \{ label: `\$\{center\.name\}/);
  assert.match(analyticsRoute, /resolveMarketingCenter\(user, body\?\.centerId\)/);
  assert.match(analyticsRoute, /centerId: center\.id/);
  assert.match(analyticsRoute, /metadata: \{ centerId: center\.id, provider/);
});
