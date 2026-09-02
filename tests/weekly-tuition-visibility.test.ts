import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("recurring tuition uses the child assignment and cadence across family, enrollment, billing, and route payloads", () => {
  const page = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  const familyEditor = readFileSync(new URL("../src/components/family-record-editor.tsx", import.meta.url), "utf8");
  const enrollment = readFileSync(new URL("../src/components/enrollment-visibility-panels.tsx", import.meta.url), "utf8");
  const billing = readFileSync(new URL("../src/components/billing-workbench.tsx", import.meta.url), "utf8");
  const billingPage = readFileSync(new URL("../src/components/live-ops-pages.tsx", import.meta.url), "utf8");

  assert.match(page, /tuitionAssignment:\s*tuitionAssignmentFromCustomFields\(child\.customFields\)/);
  assert.match(familyEditor, /label="Family recurring tuition"/);
  assert.match(familyEditor, /tuitionCadenceLabel\(selectedTuitionAssignment\.cadence\)/);
  assert.match(familyEditor, /tuitionCadenceUnit\(child\.tuitionAssignment\?\.cadence\)/);
  assert.match(familyEditor, /familyTuitionCadences\.size === 1/);
  assert.match(familyEditor, /"Multiple cadences"/);
  assert.match(enrollment, /child\.tuitionAssignment\.amountCents/);
  assert.match(billing, /label=\{`Customer \$\{effectiveRateCadence\} tuition`\}/);
  assert.match(billing, /label=\{`Family \$\{effectiveRateCadence\} total`\}/);
  assert.match(billing, /applyFamilyTuitionContext\(nextFamily, locationTuitionPlans\)/);
  assert.match(billing, /setAssignmentTuitionPlanId\(assignedPlan\?\.id \?\? ""\)/);
  assert.match(billing, /Tuition rate setup\{selectedFamily \? ` · \$\{selectedFamily\.name\}` : ""\}/);
  assert.match(billing, /const \[billingAction, setBillingAction\] = useState\("recurring"\)/);
  assert.match(billing, /<Tabs[\s\S]*id="billing-actions"[\s\S]*value=\{billingAction\}[\s\S]*onValueChange=\{\(value\) =>/);
  assert.match(billing, /Set each child’s recurring tuition/);
  assert.match(billing, /Whole family \(one-time charge only\)/);
  assert.match(billing, /combine with other rates using the same cadence/);
  assert.doesNotMatch(billing, /assignment\?\.tuitionPlanId \|\| locationTuitionPlans\[0\]/);
  assert.match(billing, /typeof selectedAssignment\.amountCents === "number"/);
  assert.match(familyEditor, /typeof selectedChild\.tuitionAssignment\.amountCents === "number"/);
  assert.match(enrollment, /typeof child\.tuitionAssignment\.amountCents === "number"/);
  assert.match(familyEditor, /params\.set\("childId", child\.id\)/);
  assert.match(page, /searchParams\.childId/);
  assert.match(billingPage, /initialChildId=\{data\.initialSelection\?\.childId\}/);
});
