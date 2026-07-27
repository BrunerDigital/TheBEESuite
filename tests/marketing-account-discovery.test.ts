import assert from "node:assert/strict";
import test from "node:test";
import { discoverMarketingConnection } from "@/lib/marketing-account-discovery";

test("LinkedIn Ads OAuth discovers and selects an accessible ad account", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    elements: [
      { id: 123456, name: "Enrollment Campaigns", status: "ACTIVE", test: false },
    ],
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  try {
    const result = await discoverMarketingConnection({
      provider: "linkedin_ads",
      credentials: { LINKEDIN_ADS_ACCESS_TOKEN: "token" },
    });
    assert.deepEqual(result.config, {
      adAccountId: "123456",
      accountLabel: "Enrollment Campaigns",
    });
    assert.equal(result.candidates[0]?.kind, "LinkedIn ad account");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Microsoft Ads OAuth discovers and selects an accessible account", async () => {
  const originalFetch = globalThis.fetch;
  const previousDeveloperToken = process.env.MICROSOFT_ADS_DEVELOPER_TOKEN;
  process.env.MICROSOFT_ADS_DEVELOPER_TOKEN = "developer-token";
  globalThis.fetch = (async (_input, init) => {
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer token");
    assert.equal(headers.get("DeveloperToken"), "developer-token");
    return new Response(JSON.stringify({
      AccountsInfo: [
        { Id: "998877", Name: "School Search Ads", Number: "X123456" },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await discoverMarketingConnection({
      provider: "microsoft_ads",
      credentials: { MICROSOFT_ADS_ACCESS_TOKEN: "token" },
    });
    assert.deepEqual(result.config, {
      accountId: "998877",
      accountLabel: "School Search Ads",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousDeveloperToken === undefined) delete process.env.MICROSOFT_ADS_DEVELOPER_TOKEN;
    else process.env.MICROSOFT_ADS_DEVELOPER_TOKEN = previousDeveloperToken;
  }
});
