import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
const fixtureModule = await import("./audit-history-fixture.ts");
const { auditActor, auditFixture } = fixtureModule.default ?? fixtureModule;
let user = auditActor(), fixture = auditFixture(), transactions = 0, failSnapshot = false, userRateLimited = false, ipRateLimited = false, rateCalls = [];
const authModule = await import("@/lib/auth");
mock.module("@/lib/auth", { namedExports: { ...(authModule.default ?? authModule), async getCurrentUser() { return user; } } });
mock.module("@/lib/prisma", { namedExports: { prisma: { async $transaction(run, options) {
  transactions++; assert.equal(options.isolationLevel, "RepeatableRead"); assert.equal(options.timeout, 20_000);
  if (failSnapshot) throw new Error("PRIVATE_DATABASE_DETAIL");
  return run(fixture.db);
} } } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(method, handler, options) {
  assert.equal(method, "GET"); assert.deepEqual(options, { omitRequestBody: true, omitResponseBody: true }); return handler;
} } });
mock.module("@/lib/rate-limit", { namedExports: {
  async checkPersistentRateLimit(input) { rateCalls.push(input); return { ok: input.key.startsWith("audit-export:user:") ? !userRateLimited : !ipRateLimited, remaining: 1, resetAt: Date.now() + 60_000 }; },
  requestIp() { return "fake-ip"; }, retryAfterSeconds() { return 60; },
} });
const route = await import("../../src/app/api/audit-logs/export/route.ts");
function reset(count = 121) { user = { ...auditActor(), id: "fake-reviewer", identityTenantId: "tenant-a" }; fixture = auditFixture(count); transactions = 0; failSnapshot = false; userRateLimited = false; ipRateLimited = false; rateCalls = []; }
const request = (query = "") => new NextRequest("https://thebeesuite.io/api/audit-logs/export" + query);
test("actual audit export denies anonymous wrong-role and pending workspace before data", async () => {
  for (const role of [null, "PARENT_GUARDIAN", "AUTHORIZED_PICKUP", "TEACHER", "BILLING_ADMIN", "pending"]) {
    reset(); user = role === null ? null : role === "pending" ? auditActor({ workspace: { mode: "pending" } }) : auditActor({ role });
    const response = await route.GET(request()); assert.equal(response.status, role === null ? 401 : 403); assert.equal(transactions, 0); assert.equal(fixture.calls.length, 0);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});
test("actual audit export rejects malformed filters and foreign school before event reads", async () => {
  for (const query of ["?q=a&q=b", "?start=2026-02-30", "?page=-1"]) { reset(); assert.equal((await route.GET(request(query))).status, 400); assert.equal(transactions, 0); }
  reset(); assert.equal((await route.GET(request("?centerId=school-b"))).status, 403); assert.ok(fixture.calls.every(call => call.model === "center"));
});
test("actual read-only auditor and director exports include all matching rows with private headers", async () => {
  for (const role of ["READ_ONLY_AUDITOR", "CENTER_DIRECTOR"]) {
    reset(501); user.role = role;
    const response = await route.GET(request("?page=2")); assert.equal(response.status, 200); assert.equal(transactions, 1);
    assert.equal(response.headers.get("x-audit-row-count"), "501"); assert.match(response.headers.get("content-type"), /^text\/csv/);
    assert.match(response.headers.get("content-disposition"), /^attachment; filename="bee-suite-audit-history-\d{4}-\d{2}-\d{2}\.csv"$/);
    assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const text = await response.text(); assert.equal(Buffer.byteLength(text), Number(response.headers.get("content-length")));
    assert.equal((text.match(/fake-record-event-/g) ?? []).length, 501); assert.doesNotMatch(text, /PRIVATE|SECRET|DO_NOT_SERIALIZE/);
  }
});
test("actual export cap and snapshot failure never deliver a partial CSV or internal error", async () => {
  reset(10_001); let response = await route.GET(request()); assert.equal(response.status, 413); assert.equal(fixture.calls.filter(call => call.model === "events").length, 0);
  assert.doesNotMatch(response.headers.get("content-type"), /csv/); assert.equal(response.headers.get("content-disposition"), null);
  reset(); failSnapshot = true; response = await route.GET(request()); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE_DATABASE_DETAIL/);
});
test("actual export preserves the shared IP bucket when the user bucket is already limited", async () => {
  reset(); userRateLimited = true;
  let response = await route.GET(request()); assert.equal(response.status, 429); assert.equal(response.headers.get("retry-after"), "60");
  assert.deepEqual(rateCalls.map(call => call.key), ["audit-export:user:tenant-a:fake-reviewer"]);
  assert.equal(transactions, 0); assert.equal(fixture.calls.length, 0); assert.equal(response.headers.get("cache-control"), "private, no-store");
  reset(); ipRateLimited = true;
  response = await route.GET(request()); assert.equal(response.status, 429);
  assert.deepEqual(rateCalls.map(call => call.key), ["audit-export:user:tenant-a:fake-reviewer", "audit-export:ip:fake-ip"]);
  assert.equal(transactions, 0); assert.equal(fixture.calls.length, 0);
});
