import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const routePath = new URL("../src/app/api/registration/share/route.ts", import.meta.url);
const dashboardPath = new URL("../src/app/dashboard/page.tsx", import.meta.url);
const formPath = new URL("../src/components/online-registration-form.tsx", import.meta.url);
const shareCardPath = new URL("../src/components/registration-share-card.tsx", import.meta.url);
const crmWorkspacePath = new URL("../src/components/crm/crm-workspace.tsx", import.meta.url);
const mrBeePath = new URL("../src/app/api/ai/mr-bee/route.ts", import.meta.url);

test("registration sharing endpoint is authenticated, role-gated, and school-scoped", async () => {
  const source = await readFile(routePath, "utf8");

  assert.match(source, /getCurrentUser\(\)/);
  assert.match(source, /canManageCrmLeads\(user\)/);
  assert.match(source, /center\.organization\.tenantId !== user\.tenantId/);
  assert.match(source, /canAccessCenter\(user, center\.id\)/);
  assert.match(source, /disableClickTracking: true/);
  assert.match(source, /registration\.share_email\.attempted/);
  assert.match(source, /leadId: lead\?\.id \?\? null/);
  assert.match(source, /stageAfterRegistrationShare/);
  assert.match(source, /School-specific registration form sent to the CRM lead/);
});

test("CRM can send, copy, and preview the selected lead's school registration form", async () => {
  const source = await readFile(crmWorkspacePath, "utf8");

  assert.match(source, /fetch\("\/api\/registration\/share"/);
  assert.match(source, /leadId: selectedLead\.id/);
  assert.match(source, /Send registration form/);
  assert.match(source, /Copy registration link/);
  assert.match(source, /Preview school application/);
});

test("Mr. Bee considers school-specific registration in lead response options", async () => {
  const source = await readFile(mrBeePath, "utf8");

  assert.match(source, /buildRegistrationLeadSuggestion/);
  assert.match(source, /buildRegistrationShareUrl/);
  assert.match(source, /registrationSuggestionIncluded/);
  assert.match(source, /Registration links are school-specific and do not confirm enrollment/);
});

test("dashboard exposes school-specific registration separately from inquiry embeds", async () => {
  const source = await readFile(dashboardPath, "utf8");
  const shareCardSource = await readFile(shareCardPath, "utf8");

  assert.match(source, /const registrationShares = canManageCrmLeads\(user\)/);
  assert.match(source, /buildRegistrationShareUrl\(getAppBaseUrl\(\), center\.id\)/);
  assert.match(source, /const inquiryEmbeds = canManageCrmLeads\(user\)/);
  assert.match(shareCardSource, /buildRegistrationFormCode/);
  assert.match(shareCardSource, /Registration form code for/);
  assert.match(shareCardSource, /Copy website code/);
});

test("a valid dashboard registration link locks the family form to its school", async () => {
  const source = await readFile(formPath, "utf8");

  assert.match(source, /const lockedCenter = centers\.find/);
  assert.match(source, /type="hidden" name="centerId" value=\{lockedCenter\.id\}/);
  assert.match(source, /Submitted details route only to this school/);
});
