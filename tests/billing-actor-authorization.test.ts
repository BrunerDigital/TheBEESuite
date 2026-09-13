import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { authorizeBillingActorForTarget } from "../src/lib/billing-actor-authorization";
import { matchesPrismaWhere } from "./helpers/matches-prisma-where";

type Actor = Parameters<typeof authorizeBillingActorForTarget>[1];
type Database = Parameters<typeof authorizeBillingActorForTarget>[0];
const at = new Date("2026-09-13T23:00:00Z");
function fixture(role: UserRole = UserRole.CENTER_DIRECTOR) {
  const target = { tenantId: "fake-target-tenant", centerId: "fake-school", familyId: "fake-family", billingAccountId: "fake-account" };
  const actor: Actor = { id: "fake-user", email: "fake@example.invalid", role, identityTenantId: target.tenantId,
    tenantId: target.tenantId, sessionVersion: 7, deviceSessionId: "fake-device", centerIds: [target.centerId],
    workspace: { mode: "center", activeCenterId: target.centerId } as Actor["workspace"] };
  const center = { id: target.centerId, organization: { tenantId: target.tenantId } };
  const grant = () => ({ tenantId: target.tenantId, role: actor.role, isActive: true, scopeType: "CENTER", centerId: target.centerId,
    center: structuredClone(center), startsAt: null as Date | null, endsAt: null as Date | null });
  const record = { id: actor.id, email: actor.email, tenantId: actor.identityTenantId, role, isActive: true,
    sessionVersion: 7, mustResetPassword: false, staffProfile: { centerId: target.centerId, center: structuredClone(center) } as { centerId: string; center: typeof center } | null,
    accessGrants: [] as ReturnType<typeof grant>[] };
  const device = { id: "fake-device", userId: actor.id, tenantId: actor.identityTenantId, revokedAt: null as Date | null };
  const account = { id: target.billingAccountId, familyId: target.familyId, family: { id: target.familyId, centerId: target.centerId } };
  const guardian = { id: "fake-guardian", userId: actor.id, familyId: target.familyId, family: { ...account.family } };
  const calls: Array<{ model: string; where: unknown }> = [];
  const delegate = (model: string, row: unknown) => ({ async findFirst({ where, select }: { where: unknown; select: unknown }) {
    assert.deepEqual(select, { id: true }); calls.push({ model, where });
    return matchesPrismaWhere(row, where) ? { id: "fake-matched" } : null;
  } });
  const db = { user: delegate("user", record), deviceSession: delegate("deviceSession", device), center: delegate("center", center),
    billingAccount: delegate("billingAccount", account), guardian: delegate("guardian", guardian) } as unknown as Database;
  return { actor, target, record, device, center, account, guardian, grant, calls, db,
    check: () => authorizeBillingActorForTarget(db, actor, target, at) };
}

test("actual home identity and selected foreign school are separate predicates", async () => {
  const f = fixture(UserRole.PLATFORM_OWNER);
  f.actor.identityTenantId = f.record.tenantId = f.device.tenantId = "fake-home-tenant";
  assert.equal(await f.check(), true);
  assert.equal((f.calls.find(call => call.model === "user")!.where as { tenantId: string }).tenantId, "fake-home-tenant");
  assert.equal((f.calls.find(call => call.model === "deviceSession")!.where as { tenantId: string }).tenantId, "fake-home-tenant");
  assert.deepEqual(f.calls.find(call => call.model === "center")!.where, { id: "fake-school", organization: { tenantId: "fake-target-tenant" } });
  assert.deepEqual(f.calls.find(call => call.model === "billingAccount")!.where, { id: "fake-account", familyId: "fake-family", family: { id: "fake-family", centerId: "fake-school" } });
  f.device.tenantId = "fake-target-tenant"; assert.equal(await f.check(), false);
});

for (const role of [UserRole.PLATFORM_OWNER, UserRole.BRAND_ADMIN, UserRole.REGIONAL_MANAGER, UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN, UserRole.PARENT_GUARDIAN]) test(`${role} retains valid exact-school billing authority`, async () => {
  const f = fixture(role); assert.equal(await f.check(), true);
  f.actor.deviceSessionId = null; f.device.revokedAt = at; assert.equal(await f.check(), true);
  f.record.mustResetPassword = true; assert.equal(await f.check(), role === UserRole.PARENT_GUARDIAN);
});

for (const change of ["wrong-effective-tenant", "empty-school", "missing-identity", "missing-version", "bad-version", "foreign-all", "foreign-other-selection"] as const) test(`snapshot rejects ${change} before any database query`, async () => {
  const f = fixture(UserRole.PLATFORM_OWNER);
  if (change === "wrong-effective-tenant") f.actor.tenantId = "foreign";
  if (change === "empty-school") f.actor.centerIds = [];
  if (change === "missing-identity") f.actor.identityTenantId = "";
  if (change === "missing-version") delete (f.actor as Partial<Actor>).sessionVersion;
  if (change === "bad-version") f.actor.sessionVersion = -1;
  if (change.startsWith("foreign-")) {
    f.actor.identityTenantId = "fake-home";
    f.actor.workspace = { mode: change === "foreign-all" ? "all" : "center", activeCenterId: "fake-other-school" } as Actor["workspace"];
  }
  assert.equal(await f.check(), false); assert.equal(f.calls.length, 0);
});

for (const role of Object.values(UserRole).filter(role => role !== UserRole.PLATFORM_OWNER)) test(`${role} cannot borrow a foreign identity tenant`, async () => {
  const f = fixture(role); f.actor.identityTenantId = "fake-home";
  assert.equal(await f.check(), false); assert.equal(f.calls.length, 0);
});

for (const role of [UserRole.TEACHER, UserRole.READ_ONLY_AUDITOR, UserRole.AUTHORIZED_PICKUP]) test(`${role} cannot authorize a financial claim`, async () => {
  const f = fixture(role); assert.equal(await f.check(), false); assert.equal(f.calls.length, 0);
});

for (const change of ["identity", "email", "role", "inactive", "session-version", "password", "revoked-device", "other-device-user", "moved-school", "moved-family", "other-account", "other-family"] as const) test(`fresh transaction rejects ${change}`, async () => {
  const f = fixture();
  if (change === "identity") f.record.tenantId = "foreign";
  if (change === "email") f.record.email = "changed@example.invalid";
  if (change === "role") f.record.role = UserRole.TEACHER;
  if (change === "inactive") f.record.isActive = false;
  if (change === "session-version") f.record.sessionVersion++;
  if (change === "password") f.record.mustResetPassword = true;
  if (change === "revoked-device") f.device.revokedAt = at;
  if (change === "other-device-user") f.device.userId = "other";
  if (change === "moved-school") f.center.organization.tenantId = "foreign";
  if (change === "moved-family") f.account.family.centerId = "other-school";
  if (change === "other-account") f.account.id = "other-account";
  if (change === "other-family") f.account.familyId = "other-family";
  assert.equal(await f.check(), false);
});

for (const change of ["valid", "inclusive-dates", "expired", "future", "inactive", "foreign-tenant", "foreign-school-owner", "other-school", "wrong-role", "owner-group"] as const) test(`exact dated CENTER grant ${change}`, async () => {
  const f = fixture(UserRole.BILLING_ADMIN); f.record.staffProfile = null; const g = f.grant(); f.record.accessGrants = [g];
  if (change === "inclusive-dates") g.startsAt = g.endsAt = at;
  if (change === "expired") g.endsAt = new Date(at.getTime() - 1);
  if (change === "future") g.startsAt = new Date(at.getTime() + 1);
  if (change === "inactive") g.isActive = false;
  if (change === "foreign-tenant") g.tenantId = "foreign";
  if (change === "foreign-school-owner") g.center.organization.tenantId = "foreign";
  if (change === "other-school") g.centerId = "other-school";
  if (change === "wrong-role") g.role = UserRole.TEACHER;
  if (change === "owner-group") g.scopeType = "OWNER_GROUP";
  assert.equal(await f.check(), ["valid", "inclusive-dates"].includes(change));
});

test("school assignment removal or foreign owner denies without broadening to another assignment", async () => {
  const f = fixture(); f.record.staffProfile = null; assert.equal(await f.check(), false);
  const g = fixture(); g.record.staffProfile!.centerId = "other-school"; assert.equal(await g.check(), false);
  const h = fixture(); h.record.staffProfile!.center.organization.tenantId = "foreign"; assert.equal(await h.check(), false);
});

test("Parent requires current exact guardian, family and school, not a staff assignment", async () => {
  const f = fixture(UserRole.PARENT_GUARDIAN); f.actor.centerIds = []; f.record.staffProfile = null;
  assert.equal(await f.check(), true);
  f.guardian.userId = "other-parent"; assert.equal(await f.check(), false);
  f.guardian.userId = f.actor.id; f.guardian.family.centerId = "other-school"; assert.equal(await f.check(), false);
  f.guardian.family.centerId = f.target.centerId; f.guardian.familyId = "other-family"; assert.equal(await f.check(), false);
});

test("predicate fixture rejects missing fields, unknown operators and malformed comparisons", () => {
  assert.equal(matchesPrismaWhere({ id: "fake" }, { tenantId: "fake" }), false);
  assert.equal(matchesPrismaWhere("fake", { unrecognized: "fake" }), false);
  assert.throws(() => matchesPrismaWhere("fake", { lte: at }));
});
