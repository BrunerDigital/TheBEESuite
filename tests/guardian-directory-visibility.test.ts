import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the family editor defaults to a family with guardian contacts", () => {
  const familyEditor = readFileSync(new URL("../src/components/family-record-editor.tsx", import.meta.url), "utf8");

  assert.match(
    familyEditor,
    /return families\.find\(\(family\) => family\.guardians\.length > 0\) \?\? families\[0\] \?\? null;/,
  );
  assert.match(familyEditor, /These contacts belong to the selected family/);
});

test("the school-scoped family page lists guardians without requiring portal links", () => {
  const enrollmentPanel = readFileSync(new URL("../src/components/enrollment-visibility-panels.tsx", import.meta.url), "utf8");

  assert.match(enrollmentPanel, /<CardTitle as="h2">Parent \/ Guardian Directory<\/CardTitle>/);
  assert.match(enrollmentPanel, /Billing contacts need their own email and phone before an invitation can be reviewed/);
  assert.match(enrollmentPanel, /visibleFamilies[\s\S]*?\.flatMap\(\(family\) => family\.guardians\.map/);
  assert.doesNotMatch(enrollmentPanel, /guardianDirectoryRows[\s\S]{0,300}\.filter\(\(guardian\) => guardian\.userId\)/);
  assert.match(enrollmentPanel, /Search guardian, family, relationship, email, or phone/);
  assert.match(enrollmentPanel, /contactsWithoutEmailOrPhone/);
  assert.match(enrollmentPanel, /billingGuardiansMissingEmail/);
  assert.match(enrollmentPanel, /Email required for payer/);
  assert.match(enrollmentPanel, /Contact ready/);
  assert.match(enrollmentPanel, /No parent or guardian contacts are visible for this school scope/);
});

test("billing contacts require a valid email before portal preparation", () => {
  const familyEditor = readFileSync(new URL("../src/components/family-record-editor.tsx", import.meta.url), "utf8");
  const operationsRoute = readFileSync(new URL("../src/app/api/operations/records/route.ts", import.meta.url), "utf8");

  assert.match(familyEditor, /Billing contact email required/);
  assert.match(familyEditor, /isBillingContact && !isValidGuardianEmail\(guardianEmail\)/);
  assert.match(operationsRoute, /A billing contact needs a valid email address before parent portal access can be prepared/);
});

test("linked parent email changes preserve the existing account and billing history", () => {
  const familyEditor = readFileSync(new URL("../src/components/family-record-editor.tsx", import.meta.url), "utf8");
  const operationsRoute = readFileSync(new URL("../src/app/api/operations/records/route.ts", import.meta.url), "utf8");
  const parentLogins = readFileSync(new URL("../src/lib/parent-portal-logins.ts", import.meta.url), "utf8");
  const supabaseAuth = readFileSync(new URL("../src/lib/supabase-auth.ts", import.meta.url), "utf8");

  assert.match(familyEditor, /Changing this email updates the existing parent login/);
  assert.match(operationsRoute, /changeParentPortalLoginEmail/);
  assert.match(operationsRoute, /billingAndPaymentHistoryPreserved: true/);
  assert.match(parentLogins, /sessionVersion: \{ increment: 1 \}/);
  assert.match(parentLogins, /billingEmail: normalizedNewEmail/);
  assert.doesNotMatch(parentLogins, /billingAccount\.(?:update|delete)|payment\.(?:update|delete)|invoice\.(?:update|delete)/);
  assert.match(supabaseAuth, /updateSupabaseAuthUserEmailByCurrentEmail/);
  assert.match(parentLogins, /parent_portal_email_change_rollback/);
  assert.match(parentLogins, /linked_guardian_tenant_mismatch/);
  assert.match(parentLogins, /linkedGuardians\.some\(\(item\) => !item\.family\.centerId \|\| !tenantCenterIds\.has\(item\.family\.centerId\)\)/);
});
