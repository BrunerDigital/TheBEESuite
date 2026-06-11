import assert from "node:assert/strict";
import { test } from "node:test";
import { canAccessModule } from "../src/lib/rbac";

test("non-executive Kid City accounting cannot access the corporate software invoice billing tab", () => {
  const accounting = {
    role: "BILLING_ADMIN",
    email: "accounting@kidcityusa.com",
    accessScope: "none",
    centerIds: [],
  };

  assert.equal(canAccessModule(accounting, "corporate-billing"), false);
  assert.equal(canAccessModule(accounting, "billing-invoices"), true);
  assert.equal(canAccessModule(accounting, "billing-settings"), true);
});

test("tenant-wide executives can access the corporate software invoice billing tab", () => {
  const executive = {
    role: "BRAND_ADMIN",
    email: "executive@example.com",
    accessScope: "tenant",
    centerIds: [],
  };

  assert.equal(canAccessModule(executive, "corporate-billing"), true);
  assert.equal(canAccessModule(executive, "agency-admin"), true);
  assert.equal(canAccessModule(executive, "white-label"), true);
});

test("ordinary center billing users do not get corporate software invoice access", () => {
  const schoolBilling = {
    role: "BILLING_ADMIN",
    email: "billing@example.com",
    accessScope: "center",
    centerIds: ["center_1"],
  };

  assert.equal(canAccessModule(schoolBilling, "corporate-billing"), false);
  assert.equal(canAccessModule(schoolBilling, "billing-invoices"), true);
});
