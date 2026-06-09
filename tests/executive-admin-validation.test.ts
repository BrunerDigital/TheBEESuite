import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateExecutiveCenterForm,
  validateExecutiveOwnerGroupForm,
  validateExecutivePasswordAction,
  validateExecutiveUserForm,
} from "@/lib/executive-admin-validation";

test("executive school validation requires live schools to have valid location IDs", () => {
  assert.ok(validateExecutiveCenterForm({
    name: "Kid City USA - Sarasota",
    status: "active",
  }).some((error) => error.includes("Location ID is required")));

  assert.deepEqual(validateExecutiveCenterForm({
    name: "Archived School",
    status: "closed",
  }), []);

  assert.ok(validateExecutiveCenterForm({
    name: "Kid City USA - Sarasota",
    crmLocationId: "Kid City Sarasota",
    status: "active",
  }).some((error) => error.includes("ST | City")));
});

test("executive owner group validation covers edit status and billing email", () => {
  assert.deepEqual(validateExecutiveOwnerGroupForm({
    name: "Smith Family Ownership Group",
    ownerType: "franchisee",
    status: "closed",
    billingEmail: "billing@example.com",
  }), []);

  assert.deepEqual(validateExecutiveOwnerGroupForm({
    name: "",
    ownerType: "unsupported",
    status: "deleted",
    billingEmail: "not-email",
  }), [
    "Owner group name is required.",
    "Choose a supported owner group type.",
    "Choose a supported owner group status.",
    "Owner group billing email must be valid.",
  ]);
});

test("executive user validation protects scope and credential choices", () => {
  assert.deepEqual(validateExecutiveUserForm({
    name: "Sarah Johnson",
    role: "TEACHER",
    accessScopeType: "CENTER",
    centerId: "center_1",
  }), []);

  assert.ok(validateExecutiveUserForm({
    name: "Jane Director",
    email: "jane@example.com",
    role: "CENTER_DIRECTOR",
    accessScopeType: "TENANT",
  }).includes("Tenant-wide access is limited to executive, regional, billing, or auditor roles."));

  assert.ok(validateExecutiveUserForm({
    name: "Alex Admin",
    email: "alex@example.com",
    role: "BRAND_ADMIN",
    accessScopeType: "TENANT",
    password: "short",
    sendPasswordReset: "yes",
  }).includes("Temporary passwords must be at least 8 characters."));

  assert.ok(validateExecutiveUserForm({
    name: "Alex Admin",
    email: "alex@example.com",
    role: "BRAND_ADMIN",
    accessScopeType: "TENANT",
    password: "temporary-123",
    sendPasswordReset: "yes",
  }).includes("Choose either a temporary password or a reset email, not both."));
});

test("executive password action validation supports reset and temporary password recovery", () => {
  assert.deepEqual(validateExecutivePasswordAction({
    email: "director@example.com",
  }), []);

  assert.deepEqual(validateExecutivePasswordAction({
    email: "director@example.com",
    password: "short",
  }), ["Temporary passwords must be at least 8 characters."]);
});
