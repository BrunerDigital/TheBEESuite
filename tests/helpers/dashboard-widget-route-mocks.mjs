import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
const widgetLibrary = await import("../../src/lib/dashboard-widgets.ts");
const { dashboardWidgetPreferencesKey } = widgetLibrary.default ?? widgetLibrary;

let fields, active, actor, auditCount, checklistAttempts = 0;
const user = { id: "synthetic-user", tenantId: "synthetic-tenant", role: "TEACHER", email: "synthetic@example.test" };
mock.module("@/lib/auth", { namedExports: { getCurrentUser: async () => actor, canAccessCenter: () => true } });
mock.module("@/lib/audit", { namedExports: { writeAuditLog: async () => { auditCount++; } } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging: (_method, handler) => handler } });
mock.module("@/lib/prisma", { namedExports: { prisma: {
  user: {
    findFirst: async () => { throw new Error("Saving must not read and replace a stale customFields snapshot."); },
    findUnique: async () => ({ customFields: structuredClone(fields), updatedAt: new Date("2026-09-29T16:00:00.000Z") }),
    async updateMany({ where, data }) {
      checklistAttempts++;
      // Timestamp precision must not allow a same-millisecond block to disappear.
      if (checklistAttempts === 1) fields = { ...fields, messageBlocks: { sender: true } };
      assert.deepEqual(where.updatedAt, new Date("2026-09-29T16:00:00.000Z"));
      if (JSON.stringify(where.AND[0].customFields.equals) !== JSON.stringify(fields)) return { count: 0 };
      fields = structuredClone(data.customFields); return { count: 1 };
    },
  },
  async $executeRaw(strings, ...values) {
    const query = Prisma.sql(strings, ...values);
    assert.match(query.text, /UPDATE "User" SET "customFields"/);
    assert.match(query.text, /jsonb_typeof\("customFields"\)/);
    assert.match(query.text, /AND "tenantId" = \$\d+ AND "isActive" = true/);
    assert.deepEqual(query.values.slice(-2), [user.id, user.tenantId]);
    if (!active) return 0;
    // A block and unrelated profile preference commit before the widget write.
    fields = { ...fields, messageBlocks: { sender: true }, profilePhoto: { storageKey: "synthetic-photo" } };
    assert.equal(query.values[0], dashboardWidgetPreferencesKey);
    if (/jsonb_set\(/.test(query.text)) fields[dashboardWidgetPreferencesKey] = JSON.parse(query.values[1]);
    else { assert.match(query.text, /END - \$1::text/); delete fields[dashboardWidgetPreferencesKey]; }
    return 1;
  },
} } });

const { POST } = await import("../../src/app/api/dashboard/widgets/route.ts");
const { PATCH } = await import("../../src/app/api/setup-checklist/route.ts");
test("widget saves and resets preserve a concurrent block and current profile fields", async () => {
  for (const reset of [false, true]) {
    actor = user; active = true; auditCount = 0; fields = { unrelated: "preserved", [dashboardWidgetPreferencesKey]: { old: true } };
    const response = await POST(new NextRequest("https://example.test/api/dashboard/widgets", { method: "POST", body: JSON.stringify({ reset, hiddenWidgetIds: ["familyCommunication"], tenantId: "forged-tenant" }) }));
    assert.equal(response.status, 200); assert.equal(auditCount, 1);
    assert.deepEqual(fields.messageBlocks, { sender: true }); assert.equal(fields.unrelated, "preserved");
    assert.deepEqual(fields.profilePhoto, { storageKey: "synthetic-photo" });
    if (reset) assert.equal(fields[dashboardWidgetPreferencesKey], undefined);
    else assert.deepEqual(fields[dashboardWidgetPreferencesKey].hiddenWidgetIds, ["familyCommunication"]);
  }
  active = false; auditCount = 0;
  assert.equal((await POST(new NextRequest("https://example.test/api/dashboard/widgets", { method: "POST", body: "{}" }))).status, 404);
  assert.equal(auditCount, 0);
  actor = null;
  assert.equal((await POST(new NextRequest("https://example.test/api/dashboard/widgets", { method: "POST", body: "{}" }))).status, 401);
});

test("checklist retries preserve a block even when the profile timestamp is unchanged", async () => {
  actor = user; active = true; auditCount = 0; fields = { unrelated: "preserved" }; checklistAttempts = 0;
  const response = await PATCH(new NextRequest("https://example.test/api/setup-checklist", { method: "PATCH", body: JSON.stringify({ key: "teacher_profile", completedIds: [] }) }));
  assert.equal(response.status, 200); assert.equal(checklistAttempts, 2); assert.equal(auditCount, 1);
  assert.deepEqual(fields.messageBlocks, { sender: true }); assert.equal(fields.unrelated, "preserved");
  assert.ok(fields.setupChecklists.teacher_profile);
});
