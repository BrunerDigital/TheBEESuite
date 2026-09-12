import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

let user = null;
let bodyReads = 0;
let authReads = 0;
const unexpectedCalls = [];
function forbidden(name) {
  return () => { unexpectedCalls.push(name); throw new Error("Unexpected dormant purchase boundary: " + name); };
}
mock.module("@/lib/auth", { namedExports: {
  async getCurrentUser() { authReads++; return user; },
  isParentGuardian(actor) { return actor.role === "PARENT_GUARDIAN"; },
} });
mock.module("@/lib/prisma", { namedExports: { prisma: {
  family: { findFirst: forbidden("family") },
  product: { findUnique: forbidden("product") },
  center: { findUnique: forbidden("center") },
  $transaction: forbidden("transaction"),
} } });
mock.module("@/lib/parent-portal-family-scope", { namedExports: { getParentPortalFamilyScope: forbidden("familyScope") } });
mock.module("@/lib/billing-invoices", { namedExports: { createBillingInvoiceForFamily: forbidden("invoice") } });
mock.module("@/lib/billing-workflows", { namedExports: { normalizeBillingPeriod: forbidden("billingPeriod") } });
mock.module("@/lib/audit", { namedExports: { writeAuditLog: forbidden("audit") } });
mock.module("@/lib/request-response-logging", { namedExports: {
  withApiLogging(method, handler, options) {
    assert.equal(method, "POST");
    assert.deepEqual(options, { omitRequestBody: true, omitResponseBody: true });
    return handler;
  },
} });
const { POST } = await import("../../src/app/api/parent/products/purchase/route.ts");
const normalParent = { id: "fake-parent", tenantId: "fake-tenant", email: "fake-parent@example.invalid", role: "PARENT_GUARDIAN" };
function request(body = "{}") {
  const req = new NextRequest("https://fixture.invalid/api/parent/products/purchase", {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  Object.defineProperty(req, "json", { value: forbiddenBodyRead });
  return req;
}
function forbiddenBodyRead() { bodyReads++; throw new Error("Purchase body must not be read"); }
function noPurchaseWork() { assert.equal(bodyReads, 0); assert.deepEqual(unexpectedCalls, []); }
async function assertUnavailable(req) {
  const response = await POST(req);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const receipt = await response.json();
  assert.deepEqual(Object.keys(receipt).sort(), ["code", "error", "ok"]);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.code, "PRODUCT_PURCHASE_UNAVAILABLE");
  assert.match(receipt.error, /Existing invoices can still be paid from Payments/);
  assert.doesNotMatch(JSON.stringify(receipt), /fake-parent|fake-family|fake-product|fake-tenant/);
  noPurchaseWork();
}

test("actual dormant purchase route never creates an order", async t => {
  await t.test("original authentication and role denials remain first", async () => {
    for (const [actor, status, message] of [
      [null, 401, /Authentication required/],
      [{ ...normalParent, role: "TEACHER" }, 403, /Only linked parent accounts/],
      [{ ...normalParent, email: "app-review-parent@thebeesuite.io" }, 403, /App Review demo workspace/],
      [{ ...normalParent, email: "app-review-teacher@thebeesuite.io", role: "TEACHER" }, 403, /App Review demo workspace/],
    ]) {
      user = actor;
      const response = await POST(request());
      assert.equal(response.status, status);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.match(body.error, message);
      noPurchaseWork();
    }
  });
  await t.test("normal parents cannot revive the hidden store with a body or foreign target", async () => {
    user = normalParent;
    for (const body of ["{}", "{", "null", "[]", JSON.stringify({ familyId: "fake-family", productId: "fake-product", quantity: 1 }), JSON.stringify({ familyId: "foreign-family", productId: "foreign-product", quantity: 12, enabled: true, releaseApproved: true })]) {
      await assertUnavailable(request(body));
    }
  });
  await t.test("concurrent retries remain closed with no invoice or audit boundary", async () => {
    user = normalParent;
    await Promise.all(Array.from({ length: 20 }, () => assertUnavailable(request(JSON.stringify({ familyId: "fake-family", productId: "fake-product", quantity: 5, idempotencyKey: "same-fake-attempt" })))));
    assert.equal(authReads, 30);
    noPurchaseWork();
  });
});
