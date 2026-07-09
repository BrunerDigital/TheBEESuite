import assert from "node:assert/strict";
import test from "node:test";
import { canAccessModule } from "../src/lib/rbac";

test("parent app access is limited to the parent portal workspace", () => {
  const parent = { role: "PARENT_GUARDIAN" };

  assert.equal(canAccessModule(parent, "parent-portal"), true);
  assert.equal(canAccessModule(parent, "messages"), false);
  assert.equal(canAccessModule(parent, "notifications"), false);
  assert.equal(canAccessModule(parent, "crm-leads"), false);
  assert.equal(canAccessModule(parent, "fte-reports"), false);
});

test("authorized pickup app access is limited to the parent portal workspace", () => {
  const pickup = { role: "AUTHORIZED_PICKUP" };

  assert.equal(canAccessModule(pickup, "parent-portal"), true);
  assert.equal(canAccessModule(pickup, "messages"), false);
  assert.equal(canAccessModule(pickup, "notifications"), false);
});
