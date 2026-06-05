export const licensingConfigurationTextareaFields = [
  "ratioRules",
  "childDocumentRules",
  "staffCredentialRules",
  "emergencyPreparednessRules",
  "medicationRules",
] as const;

export type LicensingConfigurationTextareaField = (typeof licensingConfigurationTextareaFields)[number];
export type LicensingConfigurationStatus = "needs_director_input" | "ready_for_review";

export type LicensingRuleSection = {
  label: string;
  value: string;
  items: string[];
  completed: boolean;
};

export type LicensingConfiguration = {
  version: 1;
  status: LicensingConfigurationStatus;
  state: string;
  licensingAgency: string;
  licenseNumber: string;
  licenseType: string;
  licensedCapacity: number | null;
  renewalDueDate: string;
  inspectionDueDate: string;
  ratioRules: LicensingRuleSection;
  childDocumentRules: LicensingRuleSection;
  staffCredentialRules: LicensingRuleSection;
  emergencyPreparednessRules: LicensingRuleSection;
  medicationRules: LicensingRuleSection;
  notes: string;
  completedFields: string[];
  missingFields: string[];
  updatedAt?: string;
  updatedByUserId?: string;
};

export type LicensingConfigurationInput = {
  state?: unknown;
  licensingAgency?: unknown;
  licenseNumber?: unknown;
  licenseType?: unknown;
  licensedCapacity?: unknown;
  renewalDueDate?: unknown;
  inspectionDueDate?: unknown;
  ratioRules?: unknown;
  childDocumentRules?: unknown;
  staffCredentialRules?: unknown;
  emergencyPreparednessRules?: unknown;
  medicationRules?: unknown;
  notes?: unknown;
};

const sectionLabels: Record<LicensingConfigurationTextareaField, string> = {
  ratioRules: "Ratio rules",
  childDocumentRules: "Required child documents",
  staffCredentialRules: "Required staff credentials",
  emergencyPreparednessRules: "Emergency preparedness",
  medicationRules: "Medication administration",
};

export const licensingConfigurationFieldLabels: Record<string, string> = {
  state: "State",
  licensingAgency: "Licensing agency",
  licenseNumber: "License number",
  licenseType: "License type",
  licensedCapacity: "Licensed capacity",
  renewalDueDate: "Renewal due date",
  inspectionDueDate: "Inspection due date",
  ...sectionLabels,
};

const requiredScalarFields = [
  "state",
  "licensingAgency",
  "licenseNumber",
  "licenseType",
  "licensedCapacity",
  "renewalDueDate",
  "inspectionDueDate",
] as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\r\n/g, "\n") : "";
}

function splitItems(value: string) {
  return value
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function dateOnly(value: unknown) {
  const text = clean(value);
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function ruleSection(field: LicensingConfigurationTextareaField, value: unknown): LicensingRuleSection {
  const cleaned = clean(value);
  return {
    label: sectionLabels[field],
    value: cleaned,
    items: splitItems(cleaned),
    completed: cleaned.length > 0,
  };
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function savedRuleValue(value: unknown) {
  const object = objectValue(value);
  return clean(object.value) || clean(value);
}

export function normalizeLicensingConfiguration(
  input: LicensingConfigurationInput,
  options: {
    fallbackState?: string | null;
    fallbackLicensedCapacity?: number | null;
    updatedAt?: string;
    updatedByUserId?: string;
  } = {},
): LicensingConfiguration {
  const licensedCapacity = numberOrNull(input.licensedCapacity) ?? options.fallbackLicensedCapacity ?? null;
  const configuration: LicensingConfiguration = {
    version: 1,
    status: "needs_director_input",
    state: clean(input.state) || clean(options.fallbackState),
    licensingAgency: clean(input.licensingAgency),
    licenseNumber: clean(input.licenseNumber),
    licenseType: clean(input.licenseType),
    licensedCapacity,
    renewalDueDate: dateOnly(input.renewalDueDate),
    inspectionDueDate: dateOnly(input.inspectionDueDate),
    ratioRules: ruleSection("ratioRules", input.ratioRules),
    childDocumentRules: ruleSection("childDocumentRules", input.childDocumentRules),
    staffCredentialRules: ruleSection("staffCredentialRules", input.staffCredentialRules),
    emergencyPreparednessRules: ruleSection("emergencyPreparednessRules", input.emergencyPreparednessRules),
    medicationRules: ruleSection("medicationRules", input.medicationRules),
    notes: clean(input.notes),
    completedFields: [],
    missingFields: [],
    ...(options.updatedAt ? { updatedAt: options.updatedAt } : {}),
    ...(options.updatedByUserId ? { updatedByUserId: options.updatedByUserId } : {}),
  };

  const completedFields = [
    ...requiredScalarFields.filter((field) => {
      const value = configuration[field];
      return typeof value === "number" ? value > 0 : String(value || "").length > 0;
    }),
    ...licensingConfigurationTextareaFields.filter((field) => configuration[field].completed),
  ];
  const requiredFields = [...requiredScalarFields, ...licensingConfigurationTextareaFields];
  const missingFields = requiredFields.filter((field) => !completedFields.includes(field));

  return {
    ...configuration,
    status: missingFields.length ? "needs_director_input" : "ready_for_review",
    completedFields,
    missingFields,
  };
}

export function readCenterLicensingConfiguration(
  customFields: unknown,
  options: { centerState?: string | null; licensedCapacity?: number | null } = {},
) {
  const fields = objectValue(customFields);
  const saved = objectValue(fields.licensingConfiguration);
  const setup = objectValue(fields.schoolOnboardingSetup);
  const setupSections = objectValue(setup.sections);
  const setupLicensing = objectValue(setupSections.licensingConfiguration);
  const setupValue = clean(setupLicensing.value);

  return normalizeLicensingConfiguration(
    {
      state: saved.state || options.centerState,
      licensingAgency: saved.licensingAgency,
      licenseNumber: saved.licenseNumber,
      licenseType: saved.licenseType,
      licensedCapacity: saved.licensedCapacity ?? options.licensedCapacity,
      renewalDueDate: saved.renewalDueDate,
      inspectionDueDate: saved.inspectionDueDate,
      ratioRules: savedRuleValue(saved.ratioRules) || setupValue,
      childDocumentRules: savedRuleValue(saved.childDocumentRules),
      staffCredentialRules: savedRuleValue(saved.staffCredentialRules),
      emergencyPreparednessRules: savedRuleValue(saved.emergencyPreparednessRules),
      medicationRules: savedRuleValue(saved.medicationRules),
      notes: saved.notes || setupValue,
    },
    {
      fallbackState: options.centerState,
      fallbackLicensedCapacity: options.licensedCapacity,
      updatedAt: clean(saved.updatedAt) || undefined,
      updatedByUserId: clean(saved.updatedByUserId) || undefined,
    },
  );
}
