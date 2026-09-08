import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  postJsonToGoogleAppsScriptWebhook,
  trustedGoogleAppsScriptWebhookUrl,
} from "@/lib/google-apps-script-webhook";

test("only canonical HTTPS Apps Script deployment URLs are accepted", () => {
  const valid = "https://script.google.com/macros/s/AKfycb_test-123/exec";
  assert.equal(trustedGoogleAppsScriptWebhookUrl(valid), valid);

  for (const value of [
    "http://script.google.com/macros/s/AKfycb_test/exec",
    "https://script.google.com:444/macros/s/AKfycb_test/exec",
    "https://user:pass@script.google.com/macros/s/AKfycb_test/exec",
    "https://script.google.com.evil.example/macros/s/AKfycb_test/exec",
    "https://127.0.0.1/macros/s/AKfycb_test/exec",
    "https://[::1]/macros/s/AKfycb_test/exec",
    "https://169.254.169.254/macros/s/AKfycb_test/exec",
    "https://script.google.com/macros/s/AKfycb_test/dev",
    "https://script.googleusercontent.com/macros/echo?key=test",
    "https://script.google.com/macros/s/AKfycb_test/exec#fragment",
  ]) {
    assert.equal(trustedGoogleAppsScriptWebhookUrl(value), null, value);
  }
});

test("webhook fetch revalidates redirects and preserves safe Google targets", async () => {
  const calls: Array<{ url: string; method?: string; redirect?: string }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method, redirect: init?.redirect });
    if (calls.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://script.googleusercontent.com/macros/echo?user_content_key=test" },
      });
    }
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  const response = await postJsonToGoogleAppsScriptWebhook({
    url: "https://script.google.com/macros/s/AKfycb_test/exec",
    payload: { safe: true },
    fetchImpl,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    {
      url: "https://script.google.com/macros/s/AKfycb_test/exec",
      method: "POST",
      redirect: "manual",
    },
    {
      url: "https://script.googleusercontent.com/macros/echo?user_content_key=test",
      method: "GET",
      redirect: "manual",
    },
  ]);
});

test("webhook fetch refuses redirects to private or lookalike destinations", async () => {
  for (const location of [
    "http://127.0.0.1/internal",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://script.googleusercontent.com.evil.example/macros/echo",
  ]) {
    const fetchImpl = (async () => new Response(null, { status: 302, headers: { location } })) as typeof fetch;
    await assert.rejects(
      postJsonToGoogleAppsScriptWebhook({
        url: "https://script.google.com/macros/s/AKfycb_test/exec",
        payload: { safe: true },
        fetchImpl,
      }),
      /redirected outside the allowed service/,
    );
  }
});

test("all configured webhook consumers use the shared fail-closed transport", async () => {
  const [setup, inquiry, fte] = await Promise.all([
    readFile("src/app/api/integrations/setup/route.ts", "utf8"),
    readFile("src/lib/inquiry-integrations.ts", "utf8"),
    readFile("src/app/api/fte-reports/route.ts", "utf8"),
  ]);
  assert.match(setup, /trustedGoogleAppsScriptWebhookUrl\(credentialInput\.GOOGLE_SHEETS_WEBHOOK_URL\)/);
  assert.match(inquiry, /postJsonToGoogleAppsScriptWebhook\(\{/);
  assert.match(fte, /postJsonToGoogleAppsScriptWebhook\(\{/);
  assert.doesNotMatch(inquiry, /await fetch\(url/);
  assert.doesNotMatch(fte, /await fetch\(webhookUrl/);
});
