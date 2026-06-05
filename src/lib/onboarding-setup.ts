export const schoolOnboardingSetupSections = [
  {
    field: "classroomSetup",
    storageKey: "classrooms",
    label: "Classrooms and ratios",
    placeholder: "Infants - 8 spots - 1:4\nToddlers - 12 spots - 1:6\nPreschool - 18 spots - 1:11",
  },
  {
    field: "tuitionRateSetup",
    storageKey: "tuitionRates",
    label: "Tuition rates and fees",
    placeholder: "Weekly infant tuition $250\nRegistration fee $100\nSibling discount 10%",
  },
  {
    field: "subsidyRules",
    storageKey: "subsidyRules",
    label: "Subsidy rules",
    placeholder: "ELC and VPK accepted\nParent copays due weekly\nAgency invoices submitted monthly",
  },
  {
    field: "balanceRules",
    storageKey: "balanceRules",
    label: "Balances and ledger rules",
    placeholder: "Import open balances as of launch date\nCredits carry forward\nRefunds require director approval",
  },
  {
    field: "invoiceRules",
    storageKey: "invoiceRules",
    label: "Invoice and payment rules",
    placeholder: "Invoices sent Fridays\nDue Mondays\nLate fee after Tuesday\nACH/card accepted",
  },
  {
    field: "licensingSetup",
    storageKey: "licensingConfiguration",
    label: "State licensing configuration",
    placeholder: "State agency and license number\nInspection and renewal dates\nRequired drills, child documents, staff credentials, medication rules",
  },
] as const;

export type SchoolOnboardingSetupField = (typeof schoolOnboardingSetupSections)[number]["field"];
export type SchoolOnboardingSetupStorageKey = (typeof schoolOnboardingSetupSections)[number]["storageKey"];
export type SchoolOnboardingSetupInput = Partial<Record<SchoolOnboardingSetupField, unknown>>;

type SchoolOnboardingSetupSection = {
  label: string;
  value: string;
  items: string[];
  completed: boolean;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\r\n/g, "\n") : "";
}

function splitSetupItems(value: string) {
  return value
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeSchoolOnboardingSetup(input: SchoolOnboardingSetupInput) {
  const sectionEntries = schoolOnboardingSetupSections.map((definition) => {
    const value = clean(input[definition.field]);
    const section: SchoolOnboardingSetupSection = {
      label: definition.label,
      value,
      items: splitSetupItems(value),
      completed: value.length > 0,
    };
    return [definition.storageKey, section] as const;
  });
  const sections = Object.fromEntries(sectionEntries) as Record<SchoolOnboardingSetupStorageKey, SchoolOnboardingSetupSection>;
  const completedSections = schoolOnboardingSetupSections
    .filter((definition) => sections[definition.storageKey].completed)
    .map((definition) => definition.storageKey);
  const missingSections = schoolOnboardingSetupSections
    .filter((definition) => !sections[definition.storageKey].completed)
    .map((definition) => definition.storageKey);

  return {
    version: 1,
    status: missingSections.length ? "needs_director_input" : "ready_for_review",
    completedSections,
    missingSections,
    sections,
  };
}
