import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

let user = { id: "director", role: "CENTER_DIRECTOR", primaryCenterId: "school-a", centerIds: ["school-a"], tenantId: "tenant-a" };
let balance = 10000;
let processing = false;
let reads = 0;
const center = { id: "school-a", name: "First School", crmLocationId: null, organization: { tenantId: "tenant-a", brand: { name: "School" } } };
const family = () => ({ id: "family-a", name: "A Family", centerId: "school-a", billingEmail: "billing@example.test", children: [{ enrollmentStatus: "enrolled", classroomId: "room-a" }], guardians: [{ id: "guardian", fullName: "Parent", email: "parent@example.test", userId: null, user: null }], billingAccount: { customFields: {}, balanceCents: balance, payments: processing ? [{ amountCents: 10000, provider: "stripe", status: "DRAFT", customFields: { paymentMethodCategory: "ach", status: "paid_processing" } }] : [] } });
mock.module("@/lib/prisma", { namedExports: { prisma: {
  center: {
    async findMany({ where }) { reads++; assert.deepEqual(where.id.in, ["school-a"]); assert.equal(where.organization.tenantId, "tenant-a"); assert.equal(where.status.not, "closed"); return [center]; },
    async findUnique() { return center; },
  },
  family: {
    async findFirst({ where }) { reads++; assert.deepEqual(where.centerId.in, ["school-a"]); assert.ok(where.children.some); return where.id === "family-a" ? family() : null; },
    async findUnique() { return family(); },
  },
} } });
mock.module("@/lib/auth", { namedExports: {
  async getCurrentUser() { return user; }, canManageBilling(subject) { return subject?.role === "CENTER_DIRECTOR"; },
  canAccessAllCenters() { return false; }, canAccessCenter(_user, id) { return id === "school-a"; },
} });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_name, handler) { return handler; } } });
mock.module("@/lib/integrations", { namedExports: { async sendEmail() { throw new Error("No real sends allowed"); } } });
mock.module("@/lib/integration-deliveries", { namedExports: { async recordEmailDeliveryAttempt() { throw new Error("No delivery mutations allowed"); } } });
mock.module("@/lib/audit", { namedExports: { async writeAuditLog() { throw new Error("No audit mutations allowed"); } } });
const { GET } = await import("../../src/app/api/billing/payment-reminder-preview/route.ts");
const { POST } = await import("../../src/app/api/billing/payment-method-requests/route.ts");
const get = (id = "family-a") => GET(new NextRequest(`https://app.test/api/billing/payment-reminder-preview?familyId=${id}`));
const post = (expectedBalanceCents) => POST(new NextRequest("https://app.test/api/billing/payment-method-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ familyId: "family-a", emails: ["parent@example.test"], intent: "payment_steps", balanceReminder: true, expectedBalanceCents }) }));

test("preview rejects anonymous and auditor access before reading records", async () => {
  const director = user;
  user = null; assert.equal((await get()).status, 401);
  user = { ...director, role: "READ_ONLY_AUDITOR" }; assert.equal((await get()).status, 403);
  assert.equal(reads, 0); user = director;
});
test("preview reads only the authorized current family and creates no link or message", async () => {
  assert.equal((await get("foreign-family")).status, 404);
  const response = await get(); assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const preview = await response.json();
  assert.equal(preview.balanceCents, 10000); assert.equal(preview.recipients.length, 2);
  assert.match(preview.recipients[0].text, /secure payment link created when you send/);
});
test("preview blocks settled balances and pending ACH payments", async () => {
  balance = 0; assert.equal((await get()).status, 409);
  balance = 10000; processing = true; assert.equal((await get()).status, 409); processing = false;
});
test("send rejects stale balance and processing payment before links, notifications, or emails", async () => {
  assert.equal((await post(9999)).status, 409);
  processing = true; assert.equal((await post(10000)).status, 409); processing = false;
  balance = 0; assert.equal((await post(0)).status, 409); balance = 10000;
});
