import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { readAuthorizedFamilyPaymentTarget } from "../src/lib/family-payment-preflight";
import { matchesPrismaWhere } from "./helpers/matches-prisma-where";

type Actor = Parameters<typeof readAuthorizedFamilyPaymentTarget>[1];
type Database = Parameters<typeof readAuthorizedFamilyPaymentTarget>[0];
function fixture(role: UserRole = UserRole.CENTER_DIRECTOR) {
  const target = { tenantId: "fake-tenant", centerId: "fake-school", familyId: "fake-family", billingAccountId: "fake-account" };
  const actor: Actor = { id: "fake-user", email: "fake@example.invalid", role, identityTenantId: target.tenantId, tenantId: target.tenantId,
    sessionVersion: 3, deviceSessionId: "fake-device", centerIds: [target.centerId], workspace: { mode: "center", activeCenterId: target.centerId } as Actor["workspace"] };
  const center = { id: target.centerId, organization: { tenantId: target.tenantId } };
  const family = { id: target.familyId, centerId: target.centerId };
  const account = { id: target.billingAccountId, familyId: family.id, family };
  const user = { id: actor.id, email: actor.email, role, tenantId: actor.identityTenantId, isActive: true, sessionVersion: 3, mustResetPassword: false,
    staffProfile: { centerId: center.id, center } as { centerId: string; center: typeof center } | null, accessGrants: [] };
  const device = { id: actor.deviceSessionId, userId: actor.id, tenantId: actor.identityTenantId, revokedAt: null as Date | null };
  const guardian = { id: "fake-guardian", userId: actor.id, familyId: family.id, family };
  const calls: Array<{ model: string; where: unknown; select: unknown }> = [];
  const delegate = (model: string, row: unknown) => ({ async findFirst({ where, select }: { where: unknown; select: Record<string, unknown> }) {
    calls.push({ model, where, select });
    assert.doesNotMatch(JSON.stringify(select), /invoices|children|balanceCents|customFields|billingEmail|name/);
    if (!matchesPrismaWhere(row, where)) return null;
    if (model === "billingAccount" && "family" in select) {
      assert.deepEqual(select, { id: true, familyId: true, family: { select: { id: true, centerId: true } } }); return structuredClone(account);
    }
    assert.deepEqual(select, { id: true }); return { id: "fake-match" };
  } });
  const db = { billingAccount: delegate("billingAccount", account), user: delegate("user", user), deviceSession: delegate("deviceSession", device), center: delegate("center", center), guardian: delegate("guardian", guardian) } as unknown as Database;
  return { actor, target, family, account, user, center, guardian, device, calls, db,
    read: (input = { billingAccountId: target.billingAccountId as string | null, familyId: target.familyId as string | null }) => readAuthorizedFamilyPaymentTarget(db, actor, input) };
}
test("family-payment preflight reads only minimal topology before exact fresh authorization", async () => {
  for (const role of [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN, UserRole.PARENT_GUARDIAN, UserRole.PLATFORM_OWNER]) {
    const f = fixture(role); assert.deepEqual(await f.read(), f.target);
    assert.deepEqual(f.calls[0].where, { id: f.target.billingAccountId, familyId: f.target.familyId });
    assert.deepEqual(await f.read({ billingAccountId: null, familyId: f.target.familyId }), f.target);
    assert.deepEqual(await f.read({ billingAccountId: f.target.billingAccountId, familyId: null }), f.target);
  }
});
test("mismatched or malformed supplied IDs cannot select an alternate family account", async () => {
  for (const input of [{ billingAccountId: null, familyId: null }, { billingAccountId: "../account", familyId: null }, { billingAccountId: "", familyId: "fake-family" },
    { billingAccountId: "fake-account", familyId: "other-family" }, { billingAccountId: "other-account", familyId: "fake-family" }]) {
    const f = fixture(); assert.equal(await f.read(input), null); assert.ok(f.calls.length <= 1);
  }
});
for (const change of ["inactive", "role", "version", "device", "assignment", "center-tenant", "family-school", "family-id", "guardian", "identity-tenant"] as const) test(`family-payment preflight rejects ${change} without financial or provider reads`, async () => {
  const f = fixture(change === "guardian" ? UserRole.PARENT_GUARDIAN : UserRole.CENTER_DIRECTOR);
  if (change === "inactive") f.user.isActive = false;
  if (change === "role") f.user.role = UserRole.TEACHER;
  if (change === "version") f.user.sessionVersion++;
  if (change === "device") f.device.revokedAt = new Date();
  if (change === "assignment") f.user.staffProfile = null;
  if (change === "center-tenant") f.center.organization.tenantId = "foreign";
  if (change === "family-school") f.family.centerId = "another-school";
  if (change === "family-id") f.family.id = "other-family";
  if (change === "guardian") f.guardian.userId = "other-parent";
  if (change === "identity-tenant") f.user.tenantId = "foreign";
  assert.equal(await f.read(), null);
});
test("selected platform school retains home identity while a historical parent needs no current-child read", async () => {
  const f = fixture(UserRole.PLATFORM_OWNER); f.actor.identityTenantId = f.user.tenantId = f.device.tenantId = "fake-home-tenant";
  assert.deepEqual(await f.read(), f.target);
  f.actor.workspace = { mode: "all" } as Actor["workspace"]; assert.equal(await f.read(), null);
  const p = fixture(UserRole.PARENT_GUARDIAN); p.actor.centerIds = []; p.user.staffProfile = null;
  assert.deepEqual(await p.read(), p.target);
});
