import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "prisma/migrations/20260812120000_authorized_pickup_user_link/migration.sql",
  "utf8",
);

test("authorized pickup records require one exact reviewed user link", () => {
  assert.match(schema, /model AuthorizedPickup[\s\S]*userId\s+String\?\s+@unique/);
  assert.match(schema, /user\s+User\?\s+@relation\(fields: \[userId\], references: \[id\]\)/);
});

test("authorized pickup portal fails closed and verifies the linked family tenant", () => {
  const pickupStart = page.indexOf("if (user.role === UserRole.AUTHORIZED_PICKUP)");
  const parentStart = page.indexOf("const parentPortalView", pickupStart);
  assert.ok(pickupStart >= 0 && parentStart > pickupStart);
  const pickupBranch = page.slice(pickupStart, parentStart);

  assert.match(pickupBranch, /authorizedPickup\.findFirst\([\s\S]*where: \{ userId: user\.id \}/);
  assert.match(pickupBranch, /organization: \{ tenantId: user\.tenantId \}/);
  assert.match(pickupBranch, /if \(!pickupCenter\) return <AuthorizedPickupAccessBlocked/);
  assert.match(pickupBranch, /currentlyEnrolledChildWhere\(\)/);
  assert.match(pickupBranch, /AuthorizedPickupWorkspace/);
  assert.doesNotMatch(pickupBranch, /billingAccount|invoice|ledgerEntry|message|document|dailyReport|incidentReport|childMedia/);
});

test("authorized pickup migration cannot reset or replace guardian PINs", () => {
  assert.match(migration, /ALTER TABLE "AuthorizedPickup" ADD COLUMN "userId"/);
  assert.doesNotMatch(migration, /ALTER TABLE "Guardian"|UPDATE "Guardian"|DELETE FROM "Guardian"|checkInPinHash|checkInPinSetAt/i);
});

test("existing parent guardian portal path remains separate", () => {
  const parentStart = page.indexOf("const parentPortalView");
  const parentPortal = page.slice(parentStart);
  assert.match(parentPortal, /user\.role === UserRole\.PARENT_GUARDIAN[\s\S]*getParentPortalFamilyScope\(user\.id, selectedParentFamilyId\)/);
  assert.match(parentPortal, /buildGuardianKioskCredential/);
  assert.match(parentPortal, /checkInPinHash: guardian\.checkInPinHash/);
});
