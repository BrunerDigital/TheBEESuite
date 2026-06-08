import assert from "node:assert/strict";
import { test } from "node:test";
import { canAccessModule } from "../src/lib/rbac";

test("Kid City accounting can access only the corporate software invoice billing tab", () => {
  const accounting = {
    role: "BILLING_ADMIN",
    email: "accounting@kidcityusa.com",
    accessScope: "none",
    centerIds: [],
  };

  assert.equal(canAccessModule(accounting, "corporate-billing"), true);
  assert.equal(canAccessModule(accounting, "agency-admin"), false);
  assert.equal(canAccessModule(accounting, "white-label"), false);
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
