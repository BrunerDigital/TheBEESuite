import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { canAccessCenter, canManageBilling, canManageCrmLeads, canManageOperations, type CurrentUser } from "../src/lib/auth";
import { planFamilyRefundAllocations } from "../src/lib/billing-workflows";
import { isFteCenterInVisibleScope } from "../src/lib/fte-report-guardrails";
import { centerScopedAccessGuard } from "../src/lib/operations-guardrails";
import { canAccessModule } from "../src/lib/rbac";

function director(centerIds = ["school_a"]) {
  return { role: UserRole.CENTER_DIRECTOR, centerIds, accessScope: "center" } as CurrentUser;
}

test("director authorization covers the complete operating workspace without tenant-wide access", () => {
  const user = director();
  const modules = ["school-setup", "crm-leads", "family-detail", "staff", "attendance", "incident-reports", "documents", "fte-reports", "analytics", "notifications", "billing-invoices"] as const;
  for (const moduleSlug of modules) assert.equal(canAccessModule(user, moduleSlug), true, `Director should access ${moduleSlug}`);
  assert.equal(canManageOperations(user), true);
  assert.equal(canManageCrmLeads(user), true);
  assert.equal(canManageBilling(user), true);
  assert.equal(canAccessCenter(user, "school_a"), true);
  assert.equal(canAccessCenter(user, "school_b"), false);
});

test("director cross-school object access fails closed across operational, billing, FTE, and report scope", () => {
  const user = director();
  assert.deepEqual(centerScopedAccessGuard({ centerId: "school_b", hasTenantWideAccess: false, hasCenterAccess: canAccessCenter(user, "school_b"), resourceLabel: "Record" }), {
    ok: false, status: 403, error: "You do not have access to this record.",
  });
  assert.equal(isFteCenterInVisibleScope(["school_a"], "school_b"), false);
  assert.equal(isFteCenterInVisibleScope(["school_a"], "school_a"), true);
});

test("critical Director APIs expose authentication, role, missing-object, and scope recovery responses", () => {
  const routes = [
    ["src/app/api/school-setup/route.ts", /Authentication required/, /not allowed for this role/, /do not have access/, /School not found/],
    ["src/app/api/incidents/[id]/review/route.ts", /Authentication required/, /not allowed for this role/, /centerScopedAccessGuard/, /Incident not found/],
    ["src/app/api/documents/[id]/review/route.ts", /Authentication required/, /not allowed for this role/, /do not have access/, /Document not found/],
    ["src/app/api/fte-reports/route.ts", /Authentication required/, /not allowed for this role/, /do not have access/, /report not found/i],
    ["src/app/api/reports/export/route.ts", /Authentication required/, /not allowed for this role/],
    ["src/app/api/billing/invoices/route.ts", /Authentication required/, /not allowed for this role/, /do not have access/, /Invoice not found/],
  ] as const;
  for (const [file, ...patterns] of routes) {
    const source = readFileSync(file, "utf8");
    for (const pattern of patterns) assert.match(source, pattern, `${file} must preserve ${pattern}`);
  }
});

test("family refund recovery never represents unrefundable value as a Stripe refund", () => {
  const plan = planFamilyRefundAllocations([{ id: "payment_a", refundableCents: 2_500 }, { id: "payment_b", refundableCents: 1_500 }], 5_000, ["payment_b"]);
  assert.equal(plan.availableCents, 4_000);
  assert.equal(plan.remainingCents, 1_000);
  assert.deepEqual(plan.allocations.map((item) => [item.payment.id, item.amountCents]), [["payment_b", 1_500], ["payment_a", 2_500]]);
  const route = readFileSync("src/app/api/billing/invoices/route.ts", "utf8");
  assert.match(route, /family credit or manual reimbursement/i);
  assert.match(route, /Refund could not be issued/);
  assert.match(route, /partial: totalCents < amountCents/);
});

test("Director alert surfaces require authentication and preserve not-found recovery", () => {
  const summary = readFileSync("src/app/api/notifications/summary/route.ts", "utf8");
  const preferences = readFileSync("src/app/api/notifications/preferences/route.ts", "utf8");
  assert.match(summary, /Authentication required/);
  assert.match(summary, /Notification not found/);
  assert.match(preferences, /Authentication required/);
  assert.match(preferences, /canManageOperations/);
});

test("director setup edits are included in the main save and reconciled after persistence", () => {
  const editableField = readFileSync("src/components/ui/editable-display-field.tsx", "utf8");
  const setupComponent = readFileSync("src/components/school-setup-command-center.tsx", "utf8");
  const setupRoute = readFileSync("src/app/api/school-setup/route.ts", "utf8");
  const setupPage = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const checklistComponent = readFileSync("src/components/setup-checklist-panel.tsx", "utf8");
  const checklistRoute = readFileSync("src/app/api/setup-checklist/route.ts", "utf8");

  assert.match(editableField, /function updateDraft[\s\S]*onChange\(nextValue\)/);
  assert.match(setupComponent, /setSavedValues\(canonicalValues\)/);
  assert.match(setupComponent, /setSavedSchoolEin\(canonicalEin\)/);
  assert.match(setupComponent, /router\.refresh\(\)/);
  assert.match(setupComponent, /Unsaved changes/);
  assert.match(setupRoute, /updateMany/);
  assert.match(setupRoute, /updatedAt: center\.updatedAt/);
  assert.match(setupRoute, /status: 409/);
  assert.match(setupRoute, /sections: setup \? responseSections\(setup\)/);
  assert.match(setupPage, /key=\{data\.centerId \?\? "no-school"\}/);
  assert.match(checklistComponent, /disabled=\{automatic \|\| isPending\}/);
  assert.match(checklistComponent, /Checklist progress saved/);
  assert.match(checklistRoute, /updateMany/);
  assert.match(checklistRoute, /updatedAt: existingUser\.updatedAt/);
  assert.match(checklistRoute, /status: 409/);
});
