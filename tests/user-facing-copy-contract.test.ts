import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const productionCopySurfaces = [
  "scripts/render-kokomo-actual-app-walkthrough-videos.mjs",
  "src/app/resources/page.tsx",
  "src/components/automation-workflow-builder.tsx",
  "src/components/campaign-workspace.tsx",
  "src/components/crm/crm-workspace.tsx",
  "src/components/dashboard.tsx",
  "src/components/data-readiness-center.tsx",
  "src/components/device-session-panel.tsx",
  "src/components/executive-admin-console.tsx",
  "src/components/integration-setup-panel.tsx",
  "src/components/live-ops-pages.tsx",
  "src/components/login-form.tsx",
  "src/components/message-conversation-inbox.tsx",
  "src/components/notification-preferences-panel.tsx",
  "src/components/onboarding-flow.tsx",
  "src/components/parent-portal-invite-button.tsx",
  "src/components/reputation-workspace.tsx",
  "src/components/tenant-controls-panel.tsx",
  "src/lib/communications-kit.ts",
  "src/lib/dashboard-widgets.ts",
  "src/lib/demo-data.ts",
  "src/lib/executive-admin-validation.ts",
  "src/lib/integration-setup.ts",
].map(source).join("\n");

const importSetupStaticCopySurfaces = [
  "src/app/[slug]/page.tsx",
  "src/app/resources/page.tsx",
  "src/components/data-readiness-center.tsx",
  "src/components/live-ops-pages.tsx",
  "src/components/procare-import-panel.tsx",
  "src/lib/data-readiness.ts",
  "src/lib/demo-data.ts",
  "src/lib/onboarding-setup.ts",
  "src/lib/parent-invitation-readiness.ts",
  "src/lib/procare-duplicate-matching.ts",
  "src/lib/procare-import-fields.ts",
  "src/lib/setup-checklists.ts",
  "scripts/render-current-instruction-graphics.mjs",
  "public/brand/the-bee-suite/explainers/current/school-launch-gates.svg",
].map(source).join("\n");

test("production copy avoids pilot and internal approval jargon", () => {
  assert.doesNotMatch(
    productionCopySurfaces,
    /live pilot|role-gated|human-reviewed|tenant-wide|tenant workflows|provider accepted/i,
  );
  assert.doesNotMatch(
    productionCopySurfaces,
    /Ready for pilot workflows|health indicators for the pilot|>Pilot only<|>Multi-location pilot|>Enterprise pilot/i,
  );
  assert.doesNotMatch(
    productionCopySurfaces,
    /No tenant campaigns|Internal thread · tenant scoped|using this tenant account data|tenant-specific encrypted credentials|Tenant Credentials|Enter tenant credential|Human review required/i,
  );
  assert.match(productionCopySurfaces, /value: "human_required", label: "Staff review required"/);
});

test("authored import and setup UI copy omits the legacy vendor name", () => {
  assert.doesNotMatch(importSetupStaticCopySurfaces, /\b(?:ProCare|Procare)\b/);
  assert.match(importSetupStaticCopySurfaces, /previous-system cutover/);
  assert.match(importSetupStaticCopySurfaces, /source-file archival/);
  assert.match(importSetupStaticCopySurfaces, /Enrollment, ParentInfo, Relationships, and ChildInfo/);
  const dataReadinessCenter = source("src/components/data-readiness-center.tsx");
  assert.match(dataReadinessCenter, /"Previous-system cutover", "Source-file archival"/);
  assert.doesNotMatch(dataReadinessCenter, /Legacy-system archival/);
});

test("stored values, lookup keys, and import provenance remain exact", () => {
  const route = source("src/app/api/imports/procare/route.ts");
  const familyEditor = source("src/components/family-record-editor.tsx");
  const billingWorkbench = source("src/components/billing-workbench.tsx");
  const liveOps = source("src/components/live-ops-pages.tsx");
  const dataReadinessCenter = source("src/components/data-readiness-center.tsx");
  const dataReadinessContext = source("src/lib/data-readiness-context.ts");
  const multiReport = source("src/lib/procare-multi-report-import.ts");
  const renderedReport = source("src/lib/procare-rendered-report-import.ts");
  const dynamicSurfaces = [familyEditor, billingWorkbench, liveOps, dataReadinessCenter].join("\n");

  assert.doesNotMatch(dynamicSurfaces, /removeLegacySourceBrandFromUserView|formatLegacySourceLabel/);
  assert.match(familyEditor, /useState\(selectedFamily\?\.name \?\? ""\)/);
  assert.match(familyEditor, /useState\(selectedFamily\?\.notes \?\? ""\)/);
  assert.match(billingWorkbench, /Textarea value=\{invoiceEditDescription\}/);
  assert.match(liveOps, /crmLeadSearchHref\(lead\.familyName\)/);
  assert.match(dataReadinessContext, /tab: "overview" \| "queue" \| "procare"/);
  assert.match(dataReadinessCenter, /TabsTrigger value="procare"[^\n]+Data onboarding/);

  assert.match(route, /sourceSystem:\s*"procare"/);
  assert.match(route, /filename: "pasted-procare-import\.csv"/);
  assert.match(route, /notes: "Imported from ProCare export\."/);
  assert.match(route, /center: autoMap \? "Auto-mapped from source data" : defaultCenter/);
  assert.match(route, /center: autoMap \? "Auto-mapped from ProCare export" : center/);
  assert.match(route, /note: rows\.length < 2 \? "No data rows were found\." : "No supported ProCare import columns were recognized\."/);
  assert.match(multiReport, /retainedAs: "procare relationship source records and procare relationship records\[\]\.sourceFields"/);
  assert.match(renderedReport, /`ProCare \$\{accountId\}`/);
  const importPanel = source("src/components/procare-import-panel.tsx");
  assert.match(importPanel, /\/api\/imports\/procare/);
  assert.match(importPanel, /rows from \$\{summary\?\.sourceType \?\? "the reviewed source package"\}/);
});

test("limited-rollout values and accurate AI labels remain intact", () => {
  const onboarding = source("src/components/onboarding-flow.tsx");
  const tenantControls = source("src/components/tenant-controls-panel.tsx");
  const aiSurfaces = [
    source("src/components/automation-workflow-builder.tsx"),
    source("src/components/live-ops-pages.tsx"),
    source("src/lib/dashboard-widgets.ts"),
  ].join("\n");

  assert.match(onboarding, /value="Multi-location pilot - all features included">Multi-location plan - all features included/);
  assert.match(onboarding, /value="Enterprise pilot configuration">Enterprise launch configuration/);
  assert.match(tenantControls, /value="pilot">Limited rollout/);
  assert.match(tenantControls, /row\.rollout === "disabled" \? "pilot"/);
  assert.match(aiSurfaces, /Generate AI summary/);
  assert.match(aiSurfaces, /AI assist/);
  assert.match(aiSurfaces, /Staff must verify every fact before completing a report/);
  assert.doesNotMatch(aiSurfaces, /AI can help draft wording/);
  assert.match(aiSurfaces, /AI daily brief/);
});

test("delivery and account-scope copy explains outcomes in plain language", () => {
  const resources = source("src/app/resources/page.tsx");
  const inviteButton = source("src/components/parent-portal-invite-button.tsx");
  const notificationPreferences = source("src/components/notification-preferences-panel.tsx");
  const login = source("src/components/login-form.tsx");

  assert.match(resources, /Accepted means the email service received it for delivery/);
  assert.match(inviteButton, /Accepted for delivery/);
  assert.match(inviteButton, /The welcome email was accepted for delivery/);
  assert.match(notificationPreferences, /Role defaults apply across this account/);
  assert.match(notificationPreferences, /device notification center/);
  assert.match(login, /only shows locations assigned to your account/);
});

test("the current parent invitation guide sources match the existing invitation password policy", () => {
  const guideGraphicSources = [
    source("scripts/render-current-instruction-graphics.mjs"),
    source("public/brand/the-bee-suite/explainers/current/parent-access-install.svg"),
    source("public/brand/the-bee-suite/explainers/current/director-daily-flow.svg"),
  ].join("\n");

  assert.match(guideGraphicSources, /password from the invitation/);
  assert.match(guideGraphicSources, /email, and password/);
  assert.doesNotMatch(
    guideGraphicSources,
    /temporary password|first-login password|human-reviewed/i,
  );
  assert.match(guideGraphicSources, /School staff must review custody, pickup, medical, incident, billing, and compliance decisions/);
});

test("parent invitation and document errors do not expose server exceptions", () => {
  const invitationRoute = source("src/app/api/parent/invitations/route.ts");
  const documentRoute = source("src/app/api/parent/documents/[id]/submit/route.ts");

  assert.doesNotMatch(invitationRoute, /error instanceof Error \? error\.message/);
  assert.doesNotMatch(documentRoute, /error instanceof Error \? error\.message/);
  assert.match(invitationRoute, /We couldn't confirm whether the invitation finished/);
  assert.match(invitationRoute, /Refresh this family before trying again/);
  assert.match(invitationRoute, /password issued in the school invitation/);
  assert.doesNotMatch(invitationRoute, /temporary password|first-login password/i);
  assert.match(documentRoute, /It has not been submitted\. Try again\./);
});

test("public registration and onboarding copy does not expose implementation details", () => {
  const registration = [
    source("src/app/registration/page.tsx"),
    source("src/components/online-registration-form.tsx"),
  ].join("\n");
  const onboarding = source("src/components/onboarding-flow.tsx");

  assert.doesNotMatch(
    registration,
    /CRM connected|CRM follow-up task|database connection|director review task/i,
  );
  assert.doesNotMatch(
    onboarding,
    /trial workspace|Trial safeguards|Supabase Auth|ownership container|primary center profile|live checkout/i,
  );
  assert.match(registration, /School staff will review it and contact you with next steps/);
  assert.match(onboarding, /Your workspace is ready/);
});

test("parent payment guidance uses the current portal labels", () => {
  const guidance = [
    source("src/app/resources/page.tsx"),
    source("src/lib/parent-portal-invitations.ts"),
    source("docs/sops/PARENT_ACH_PAYMENT_GUIDE.md"),
    source("docs/sops/PARENT_PORTAL_SOP.md"),
    source("scripts/render-current-instruction-graphics.mjs"),
  ].join("\n");

  assert.match(guidance, /Open Payments/);
  assert.match(guidance, /Debit or credit card/);
  assert.match(guidance, /Pay with Link/);
  assert.doesNotMatch(guidance, /Bank account \(instant verification\)/);
  assert.match(guidance, /Connect bank account/);
  assert.match(guidance, /Save card/);
  assert.doesNotMatch(
    guidance,
    /Open Billing|One-Time Bank|Instant Bank|Pay by Bank|Debit\/Credit Card|Set Up Instant Bank|Set Up Card Autopay|quick-start SOP|approved card recovery|separate recovery line/i,
  );
  assert.match(guidance, /no processing fee is added to the parent payment/i);
});

test("authentication copy consistently calls the action sign in", () => {
  const login = source("src/components/login-form.tsx");
  const reset = source("src/components/reset-password-form.tsx");

  assert.match(login, /Teacher sign-in/);
  assert.match(login, /Director sign-in/);
  assert.match(login, /Executive sign-in/);
  assert.match(login, /Signing in…/);
  assert.doesNotMatch(login, /Log in to your|Log in as a|Forgot Password\?/);
  assert.match(reset, /Back to sign in/);
  assert.match(reset, /Request a new reset link/);
});
