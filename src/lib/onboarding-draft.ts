export const ONBOARDING_DRAFT_STORAGE_KEY = "bee-suite:onboarding-intake:v1";

export type OnboardingDraftFields = {
  brandName: string;
  workEmail: string;
  centerCount: string;
  state: string;
  locationRoster: string;
  timeline: string;
  priority: string;
  payoutAdminName: string;
  payoutAdminEmail: string;
  payoutReadiness: string;
  softwarePlan: string;
  addOnBundle: string;
  merchantFeeStrategy: string;
  dataSetupPath: string;
  dataSourceSystem: string;
  noCurrentFamiliesExpected: boolean;
};

const stringFields = [
  "brandName", "workEmail", "centerCount", "state", "locationRoster", "timeline", "priority",
  "payoutAdminName", "payoutAdminEmail", "payoutReadiness", "softwarePlan", "addOnBundle",
  "merchantFeeStrategy", "dataSetupPath", "dataSourceSystem",
] as const satisfies ReadonlyArray<keyof OnboardingDraftFields>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function serializeOnboardingDraft(form: OnboardingDraftFields, activeStep: number, now = new Date()) {
  return JSON.stringify({
    version: 1,
    savedAt: now.toISOString(),
    activeStep: Math.max(0, Math.min(5, Math.trunc(activeStep))),
    form: Object.fromEntries([
      ...stringFields.map((field) => [field, form[field].slice(0, field === "locationRoster" ? 50_000 : 2_000)]),
      ["noCurrentFamiliesExpected", form.noCurrentFamiliesExpected],
    ]),
  });
}

export function parseOnboardingDraft(value: unknown): { form: Partial<OnboardingDraftFields>; activeStep: number } | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return null; }
  }
  const draft = record(parsed);
  if (draft.version !== 1) return null;
  const storedForm = record(draft.form);
  const form: Partial<OnboardingDraftFields> = {};
  for (const field of stringFields) {
    if (typeof storedForm[field] === "string") form[field] = storedForm[field].slice(0, field === "locationRoster" ? 50_000 : 2_000);
  }
  if (typeof storedForm.noCurrentFamiliesExpected === "boolean") {
    form.noCurrentFamiliesExpected = storedForm.noCurrentFamiliesExpected;
  }
  const activeStep = typeof draft.activeStep === "number" && Number.isFinite(draft.activeStep)
    ? Math.max(0, Math.min(5, Math.trunc(draft.activeStep)))
    : 0;
  return { form, activeStep };
}
