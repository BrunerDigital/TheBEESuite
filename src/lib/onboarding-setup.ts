export const schoolOnboardingSetupSections = [
  {
    field: "schoolProfileSetup",
    storageKey: "schoolProfile",
    label: "School profile and launch ownership",
    owner: "Director or owner",
    href: "/center-dashboard",
    description: "Confirm school identity, contacts, operating hours, timezone, launch date, and who signs off on go-live.",
    placeholder: "School name and director contact\nOperating hours and timezone\nGo-live date and launch approver",
  },
  {
    field: "classroomSetup",
    storageKey: "classrooms",
    label: "Classrooms and ratios",
    owner: "Director",
    href: "/classroom-dashboard",
    description: "Define every classroom, age group, licensed capacity, desired enrollment, and ratio rule before classroom workflows go live.",
    placeholder: "Infants - 8 spots - 1:4\nToddlers - 12 spots - 1:6\nPreschool - 18 spots - 1:11",
  },
  {
    field: "programSetup",
    storageKey: "programs",
    label: "Programs, schedules, and age groups",
    owner: "Director",
    href: "/calendar",
    description: "List program names, age groups, schedules, holidays, closure days, and any half-day/after-school options.",
    placeholder: "Infants full-time Mon-Fri\nVPK 9:00-12:00\nAfter-school pickup schedule\nHoliday/closure calendar",
  },
  {
    field: "staffSetup",
    storageKey: "staff",
    label: "Teachers, staff, schedules, and credentials",
    owner: "Director",
    href: "/staff",
    description: "Add staff users, teacher classroom assignments, schedules, time clock expectations, certifications, and background checks.",
    placeholder: "Teacher roster with emails and titles\nClassroom assignments\nCredential/background check dates\nSchedule/time clock rules",
  },
  {
    field: "familyImportSetup",
    storageKey: "familyImport",
    label: "Family, parent, and student import",
    owner: "Director or admin",
    href: "/family-detail",
    description: "Import families, guardians, children, authorized pickups, emergency contacts, allergies, schedules, and classroom assignments.",
    placeholder: "Unencrypted Procare export files\nFamily/guardian/child field mapping\nClassroom assignment rules\nMissing parent emails to collect",
  },
  {
    field: "tuitionRateSetup",
    storageKey: "tuitionRates",
    label: "Tuition rates and fees",
    owner: "Director or billing owner",
    href: "/billing-settings",
    description: "Configure tuition plans, program fees, registration/deposit charges, sibling discounts, late fees, and recurring billing cadence.",
    placeholder: "Weekly infant tuition $250\nRegistration fee $100\nSibling discount 10%",
  },
  {
    field: "subsidyRules",
    storageKey: "subsidyRules",
    label: "Subsidy rules",
    owner: "Billing owner",
    href: "/billing-invoices",
    description: "Document subsidy programs, copays, agency invoicing cadence, and how subsidy balances appear to parents.",
    placeholder: "ELC and VPK accepted\nParent copays due weekly\nAgency invoices submitted monthly",
  },
  {
    field: "balanceRules",
    storageKey: "balanceRules",
    label: "Balances and ledger rules",
    owner: "Billing owner",
    href: "/billing-invoices",
    description: "Define opening balance import rules, credits, refunds, ledger adjustments, and cutover date.",
    placeholder: "Import open balances as of launch date\nCredits carry forward\nRefunds require director approval",
  },
  {
    field: "invoiceRules",
    storageKey: "invoiceRules",
    label: "Invoice and payment rules",
    owner: "Billing owner",
    href: "/payments",
    description: "Confirm invoice timing, payment methods, autopay expectations, dunning rules, and parent-facing fee disclosures.",
    placeholder: "Invoices sent Fridays\nDue Mondays\nLate fee after Tuesday\nACH/card accepted",
  },
  {
    field: "parentPortalSetup",
    storageKey: "parentPortal",
    label: "Parent portal access and guardian linking",
    owner: "Director",
    href: "/parent-portal",
    description: "Decide which guardians receive portal invites, payment method setup, document upload, messages, and incident/media acknowledgement.",
    placeholder: "Invite billing contacts first\nAll parents with emails get portal access\nCollect missing emails before go-live",
  },
  {
    field: "communicationSetup",
    storageKey: "communications",
    label: "Messages, announcements, and notifications",
    owner: "Director",
    href: "/messages",
    description: "Configure message templates, announcement approval rules, notification preferences, SMS/email sender identity, and response ownership.",
    placeholder: "Director approves announcements\nTeachers can message assigned classrooms\nSMS only for urgent reminders\nSender email/domain to use",
  },
  {
    field: "formsDocumentsSetup",
    storageKey: "formsDocuments",
    label: "Registration forms, documents, and e-signatures",
    owner: "Director or compliance owner",
    href: "/forms",
    description: "Load registration packets, policy acknowledgements, medical forms, media releases, staff onboarding documents, and signature requirements.",
    placeholder: "Registration packet\nTuition policy\nPhoto/media release\nMedication/allergy forms\nStaff onboarding forms",
  },
  {
    field: "licensingSetup",
    storageKey: "licensingConfiguration",
    label: "State licensing configuration",
    owner: "Director or compliance owner",
    href: "/compliance",
    description: "Confirm license details, drill cadence, inspections, medication logs, document retention, and state-specific compliance rules.",
    placeholder: "State agency and license number\nInspection and renewal dates\nRequired drills, child documents, staff credentials, medication rules",
  },
  {
    field: "fteReportingSetup",
    storageKey: "fteReporting",
    label: "FTE, attendance, and operational reporting",
    owner: "Director",
    href: "/fte-reports",
    description: "Confirm weekly FTE workflow, attendance cutoffs, reporting owners, export cadence, and correction/approval expectations.",
    placeholder: "Director submits FTE every Friday\nAttendance closes daily at 6 PM\nRegional manager approves corrections",
  },
  {
    field: "integrationSetup",
    storageKey: "integrations",
    label: "External accounts and integrations",
    owner: "Owner, director, or admin",
    href: "/integrations",
    description: "Connect or verify payout processor, SendGrid/email sender, Twilio/SMS, Google Sheets/Calendar, storage, and signature provider readiness.",
    placeholder: "Payout owner\nSendGrid sender/domain\nTwilio phone/sender\nGoogle Calendar/Sheets access\nStorage/signature provider",
  },
  {
    field: "launchSmokeTestSetup",
    storageKey: "launchSmokeTest",
    label: "Launch smoke test and sign-off",
    owner: "Director",
    href: "/dashboard",
    description: "Run role-by-role checks for director, teacher, parent, billing, kiosk, documents, payments, reports, and notifications before launch.",
    placeholder: "Director login tested\nTeacher tablet tested\nParent portal invite tested\nKiosk check-in tested\nBilling/payment dry run complete",
  },
] as const;

export type SchoolOnboardingSetupField = (typeof schoolOnboardingSetupSections)[number]["field"];
export type SchoolOnboardingSetupStorageKey = (typeof schoolOnboardingSetupSections)[number]["storageKey"];
export type SchoolOnboardingSetupInput = Partial<Record<SchoolOnboardingSetupField, unknown>>;

type SchoolOnboardingSetupSection = {
  label: string;
  owner: string;
  href: string;
  description: string;
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
      owner: definition.owner,
      href: definition.href,
      description: definition.description,
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
