import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOnboardingDraft, serializeOnboardingDraft, type OnboardingDraftFields } from "../src/lib/onboarding-draft";

const form: OnboardingDraftFields = {
  brandName: "Example Schools",
  workEmail: "owner@example.com",
  centerCount: "2",
  state: "FL",
  locationRoster: "Downtown | 100 Main St | Orlando | FL | 32801 | | owner@example.com | 100",
  timeline: "This quarter",
  priority: "Operations dashboard",
  payoutAdminName: "Avery Owner",
  payoutAdminEmail: "finance@example.com",
  payoutReadiness: "Need school owner verification",
  softwarePlan: "Enterprise franchise agreement",
  addOnBundle: "Full platform with billing",
  merchantFeeStrategy: "Enterprise negotiated merchant services",
  dataSetupPath: "start_clean",
  dataSourceSystem: "",
  noCurrentFamiliesExpected: true,
};

test("onboarding draft restores safe business setup fields and the current step", () => {
  const serialized = serializeOnboardingDraft(form, 3, new Date("2026-09-11T12:00:00.000Z"));
  const restored = parseOnboardingDraft(serialized);
  assert.ok(restored);
  assert.deepEqual(restored.form, form);
  assert.equal(restored.activeStep, 3);
  assert.doesNotMatch(serialized, /password|routing|bank account/i);
});

test("onboarding draft fails closed for invalid or unsupported storage", () => {
  assert.equal(parseOnboardingDraft("not json"), null);
  assert.equal(parseOnboardingDraft({ version: 2, form }), null);
});
