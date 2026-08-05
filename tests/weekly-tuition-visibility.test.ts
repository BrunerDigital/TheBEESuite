import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("weekly tuition uses the child assignment across family, enrollment, billing, and route payloads", () => {
  const page = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  const familyEditor = readFileSync(new URL("../src/components/family-record-editor.tsx", import.meta.url), "utf8");
  const enrollment = readFileSync(new URL("../src/components/enrollment-visibility-panels.tsx", import.meta.url), "utf8");
  const billing = readFileSync(new URL("../src/components/billing-workbench.tsx", import.meta.url), "utf8");
  const billingPage = readFileSync(new URL("../src/components/live-ops-pages.tsx", import.meta.url), "utf8");

  assert.match(page, /tuitionAssignment:\s*tuitionAssignmentFromCustomFields\(child\.customFields\)/);
  assert.match(familyEditor, /label="Family weekly tuition"/);
  assert.match(familyEditor, /label="Weekly tuition rate"/);
  assert.match(enrollment, /child\.tuitionAssignment\.amountCents/);
  assert.match(billing, /label="Customer weekly tuition"/);
  assert.match(billing, /label="Family weekly total"/);
  assert.match(billing, /applyFamilyTuitionContext\(nextFamily, locationTuitionPlans\)/);
  assert.match(billing, /setAssignmentTuitionPlanId\(assignedPlan\?\.id \?\? ""\)/);
  assert.match(billing, /Tuition rate setup\{selectedFamily \? ` · \$\{selectedFamily\.name\}` : ""\}/);
  assert.match(billing, /const \[billingAction, setBillingAction\] = useState\("recurring"\)/);
  assert.match(billing, /<Tabs value=\{billingAction\} onValueChange=\{setBillingAction\}>/);
  assert.match(billing, /Set each child’s weekly tuition/);
  assert.match(billing, /Whole family \(one-time charge only\)/);
  assert.match(billing, /the family ledger receives the combined total while each child keeps an individual rate/);
  assert.doesNotMatch(billing, /assignment\?\.tuitionPlanId \|\| locationTuitionPlans\[0\]/);
  assert.match(billing, /typeof selectedAssignment\.amountCents === "number"/);
  assert.match(familyEditor, /typeof selectedChild\.tuitionAssignment\.amountCents === "number"/);
  assert.match(enrollment, /typeof child\.tuitionAssignment\.amountCents === "number"/);
  assert.match(familyEditor, /params\.set\("childId", child\.id\)/);
  assert.match(page, /searchParams\.childId/);
  assert.match(billingPage, /initialChildId=\{data\.initialSelection\?\.childId\}/);
});
