import assert from "node:assert/strict";
import test from "node:test";
import { fetchAdCampaignAnalytics } from "@/lib/ad-campaign-analytics";

test("Meta ad analytics aggregates campaign spend, delivery, clicks, and lead actions", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    data: [
      {
        campaign_id: "campaign_1",
        campaign_name: "Fall enrollment",
        spend: "125.50",
        impressions: "10000",
        clicks: "250",
        actions: [
          { action_type: "lead", value: "12" },
          { action_type: "link_click", value: "250" },
        ],
      },
    ],
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;

  try {
    const result = await fetchAdCampaignAnalytics({
      provider: "meta_ads",
      config: { adAccountId: "act_123" },
      credentials: { META_ADS_ACCESS_TOKEN: "token" },
    });
    assert.equal(result.spend, 125.5);
    assert.equal(result.impressions, 10_000);
    assert.equal(result.clicks, 250);
    assert.equal(result.leads, 12);
    assert.equal(result.campaigns[0]?.name, "Fall enrollment");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
