import assert from "node:assert/strict";
import test from "node:test";
import { workspaceVisualDomain } from "../src/lib/workspace-visual-domain";

test("maps role dashboards to the appropriate visual domain", () => {
  assert.equal(workspaceVisualDomain("/dashboard", "CENTER_DIRECTOR"), "operations");
  assert.equal(workspaceVisualDomain("/dashboard", "ASSISTANT_DIRECTOR"), "operations");
  assert.equal(workspaceVisualDomain("/dashboard", "PLATFORM_OWNER"), "executive");
  assert.equal(workspaceVisualDomain("/dashboard", "BRAND_ADMIN"), "executive");
  assert.equal(workspaceVisualDomain("/dashboard", "REGIONAL_MANAGER"), "executive");
  assert.equal(workspaceVisualDomain("/dashboard", "READ_ONLY_AUDITOR"), "executive");
  assert.equal(workspaceVisualDomain("/dashboard", "TEACHER"), "classroom");
  assert.equal(workspaceVisualDomain("/dashboard", "BILLING_ADMIN"), "billing");
  assert.equal(workspaceVisualDomain("/dashboard", "PARENT_GUARDIAN"), "family");
  assert.equal(workspaceVisualDomain("/dashboard", "AUTHORIZED_PICKUP"), "family");
});

test("route context takes precedence over the role default", () => {
  assert.equal(workspaceVisualDomain("/billing-invoices", "CENTER_DIRECTOR"), "billing");
  assert.equal(workspaceVisualDomain("/crm-leads", "BRAND_ADMIN"), "enrollment");
  assert.equal(workspaceVisualDomain("/attendance", "CENTER_DIRECTOR"), "classroom");
  assert.equal(workspaceVisualDomain("/documents", "TEACHER"), "compliance");
  assert.equal(workspaceVisualDomain("/messages", "PARENT_GUARDIAN"), "communication");
  assert.equal(workspaceVisualDomain("/check-in/center-1", "CENTER_DIRECTOR"), "kiosk");
});
