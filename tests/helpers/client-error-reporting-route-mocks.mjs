import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

let stored = [], userReads = 0, limitAllowed = true, failRateLimit = false;
mock.module("@/lib/prisma", { namedExports: { prisma: { clientErrorReport: { async upsert(input) { stored.push(input); return { id: "fake-report", occurrenceCount: 1 }; } } } } });
mock.module("@/lib/auth", { namedExports: { async getCurrentUser() { userReads++; return { id: "fake-user", tenantId: "fake-tenant", primaryCenterId: "fake-school" }; } } });
mock.module("@/lib/rate-limit", { namedExports: { async checkPersistentRateLimit() { if (failRateLimit) throw new Error("FakeShortCode"); return { ok: limitAllowed, resetAt: Date.now() + 60000 }; }, requestIp() { return "fake-ip"; }, retryAfterSeconds() { return 60; } } });
const { POST } = await import("../../src/app/api/system/client-error-reports/route.ts");
process.env.CLIENT_ERROR_REPORTING = "on";
process.env.REQUEST_RESPONSE_LOGGING = "off";
function post(body, origin = "https://fixture.invalid") {
  return POST(new NextRequest("https://fixture.invalid/api/system/client-error-reports", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Referer: "https://fixture.invalid/payment-method-form/FakePayload.FakeSignature" }, body: JSON.stringify(body) }));
}
test("cached or direct credential report performs no attribution or storage", async () => {
  for (const path of ["/payment-method-form/FakePayload.FakeSignature", "/payment-method-form/r/fake7", "/%70ayment-method-form/%66ake7", "/reset-password#code=fake7", "/parents/setup", "/login?tokenHash=fake7"]) {
    assert.deepEqual(await (await post({ path, message: "fake7", metadata: { token: "fake7" } })).json(), { ok: true, suppressed: true });
  }
  assert.equal(userReads, 0); assert.equal(stored.length, 0);
});
test("safe report retains attribution and deduplication", async () => {
  const response = await post({ source: "window.error", errorType: "TypeError", path: "/parent-portal/families/fake7", message: "Loading chunk failed", stackSample: "TypeError at handler (https://fixture.invalid/_next/static/chunks/fake.js:3:4)", metadata: { line: 3, column: 4, token: "fake7", fake7: "fake7" } });
  assert.equal(response.status, 200); assert.equal(stored.length, 1); assert.equal(userReads, 1);
  const input = stored[0];
  assert.equal(input.create.path, "/parent-portal/families/:id");
  assert.equal(input.create.userId, "fake-user"); assert.equal(input.create.tenantId, "fake-tenant");
  assert.equal(input.create.message, "Loading chunk failed"); assert.deepEqual(input.create.metadata, { line: 3, column: 4 });
  assert.equal(input.where.dedupeKey.length, 40); assert.deepEqual(input.update.occurrenceCount, { increment: 1 });
  assert.equal(JSON.stringify(input).includes("fake7"), false);
});
test("same-origin and rate limits remain enforced", async () => {
  assert.equal((await post({ path: "/dashboard" }, "https://foreign.invalid")).status, 403);
  limitAllowed = false;
  assert.equal((await post({ path: "/dashboard" })).status, 429);
  assert.equal(stored.length, 1);
});

test("pre-parse failure logs never sample a raw diagnostic body or Referer", async () => {
  const info = console.info, error = console.error, logged = [];
  console.info = value => logged.push(value); console.error = value => logged.push(value);
  process.env.REQUEST_RESPONSE_LOGGING = "on"; failRateLimit = true;
  try {
    const body = JSON.stringify({ path: "/payment-method-form/r/FakeShortCode", metadata: { "https://fixture.invalid/payment-method-form/r/FakeShortCode": "copied" } });
    await assert.rejects(POST(new NextRequest("https://fixture.invalid/api/system/client-error-reports", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)), Referer: "https://fixture.invalid/payment-method-form/r/FakeShortCode" }, body })));
  } finally { console.info = info; console.error = error; process.env.REQUEST_RESPONSE_LOGGING = "off"; }
  assert.ok(logged.length >= 2); assert.equal(JSON.stringify(logged).includes("FakeShortCode"), false);
  const requestLog = logged.map(line => JSON.parse(line)).find(line => line.event === "api.request");
  assert.equal(requestLog.request.body.omitted, "sensitive_route"); assert.equal(requestLog.request.headers.referer, "[REDACTED]");
  assert.equal(stored.length, 1);
});
