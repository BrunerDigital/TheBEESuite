export type SetupChecklistKey = "director_launch" | "teacher_profile";

export type SetupChecklistTask = {
  id: string;
  title: string;
  description: string;
  href?: string;
};

export const directorLaunchChecklistTasks: SetupChecklistTask[] = [
  {
    id: "login-school-profile",
    title: "Log in and confirm school profile",
    description: "Sign in with the school email, reset the password if prompted, and confirm school contact details, hours, timezone, capacity, and launch owner.",
    href: "/school-setup",
  },
  {
    id: "classrooms-ratios",
    title: "Add classrooms, capacity, and ratios",
    description: "Create every room with age group, licensed capacity, desired capacity, ratio rule, and assigned coverage.",
    href: "/classroom-dashboard",
  },
  {
    id: "teachers-staff",
    title: "Add teachers and staff",
    description: "Add active teacher profiles, classroom assignments, schedules, kiosk codes, credentials, background checks, and onboarding documents.",
    href: "/staff",
  },
  {
    id: "procare-import",
    title: "Import ProCare families and children",
    description: "Import unencrypted ProCare data, review duplicate matches, and confirm families, guardians, children, contacts, allergies, schedules, and classroom assignments.",
    href: "/family-detail",
  },
  {
    id: "required-documents",
    title: "Complete required documents",
    description: "Review family, child, and staff document checklists, upload missing files, verify signatures, and confirm expiration dates.",
    href: "/documents",
  },
  {
    id: "tuition-billing-rules",
    title: "Configure tuition, fees, and billing rules",
    description: "Enter tuition plans, registration fees, deposits, discounts, subsidy/copay rules, opening balance policy, invoice cadence, and fee disclosures.",
    href: "/billing-settings",
  },
  {
    id: "payout-bank-account",
    title: "Connect the school bank account",
    description: "Directors and executives open Billing Settings to complete Stripe Connect payout onboarding so tuition funds can route to the school account once parent checkout is enabled.",
    href: "/billing-settings",
  },
  {
    id: "parent-portal",
    title: "Configure parent portal access",
    description: "Verify guardian emails, family links, child visibility, custody restrictions, payment access, document access, and invite order.",
    href: "/parent-portal",
  },
  {
    id: "attendance-kiosk",
    title: "Test attendance, kiosk, QR, and PIN workflows",
    description: "Verify guardian check-in/out, authorized pickups, staff clock-in/out, classroom attendance, late pickup flags, and ratio snapshots.",
    href: "/attendance",
  },
  {
    id: "messages-notifications",
    title: "Configure messages and notifications",
    description: "Review templates, broadcast segments, sender rules, email/SMS delivery, notification preferences, and AI draft review expectations.",
    href: "/messages",
  },
  {
    id: "calendar-fte",
    title: "Set calendar, closures, and FTE workflow",
    description: "Add events, holidays, closures, Google Calendar sync, reporting owner, Friday noon FTE cutoff, and Friday reminder/escalation expectations.",
    href: "/fte-reports",
  },
  {
    id: "compliance-incidents",
    title: "Configure compliance, incidents, and medication logs",
    description: "Enter licensing details, drill cadence, medication rules, compliance tasks, incident admin review, parent acknowledgement, and export readiness.",
    href: "/compliance",
  },
  {
    id: "enrollment-registration",
    title: "Review enrollment, waitlist, tours, and registration",
    description: "Confirm CRM records, tour statuses, waitlist priority, registration packets, document/signature collection, and application review workflow.",
    href: "/crm-leads",
  },
  {
    id: "reports-dashboard",
    title: "Review reports and dashboard widgets",
    description: "Configure dashboard widgets and review enrollment, attendance, billing, AR, communication, compliance, and export reports.",
    href: "/analytics",
  },
  {
    id: "launch-smoke-test",
    title: "Run final launch smoke test",
    description: "Test director, teacher, parent, kiosk, billing, documents, payments, notifications, reports, compliance, and FTE before go-live.",
    href: "/dashboard",
  },
];

export const teacherProfileChecklistTasks: SetupChecklistTask[] = [
  {
    id: "teacher-login",
    title: "Log in with your teacher account",
    description: "Use your teacher username or work email and password, then reset the password if prompted.",
    href: "/teacher-portal",
  },
  {
    id: "teacher-profile",
    title: "Confirm name, email, school, and role",
    description: "Verify your account shows your name, teacher role, correct school, title, and active status.",
    href: "/dashboard",
  },
  {
    id: "classroom-assignment",
    title: "Confirm classroom assignment",
    description: "Make sure the teacher portal shows your assigned classroom because roster, attendance, messages, reports, photos, incidents, and ratios depend on it.",
    href: "/teacher-portal",
  },
  {
    id: "roster-review",
    title: "Review your classroom roster",
    description: "Confirm every visible child belongs in your classroom and no enrolled child is missing.",
    href: "/teacher-portal",
  },
  {
    id: "safety-notes",
    title: "Review safety and restriction warnings",
    description: "Check custody, allergy, medication, and media restriction warnings for children you are allowed to see.",
    href: "/teacher-portal",
  },
  {
    id: "staff-kiosk-code",
    title: "Verify staff kiosk code",
    description: "Use your work email or teacher username and 4 digit staff code to confirm kiosk identity and clock status.",
    href: "/check-in",
  },
  {
    id: "attendance-test",
    title: "Test attendance controls",
    description: "With director approval, confirm present, absent, sick, vacation, check-in, and check-out controls update child cards correctly.",
    href: "/teacher-portal",
  },
  {
    id: "daily-report-test",
    title: "Test daily report workflow",
    description: "Confirm meals, naps, diaper/potty, activities, mood, supplies, notes, report targets, and parent-send behavior.",
    href: "/teacher-portal",
  },
  {
    id: "photo-review",
    title: "Confirm photo review routing",
    description: "Verify classroom photos route to director media review and that media restrictions are respected.",
    href: "/teacher-portal",
  },
  {
    id: "incident-review",
    title: "Confirm incident report workflow",
    description: "Verify incidents link to the correct child and classroom and route to the director for review.",
    href: "/teacher-portal",
  },
  {
    id: "offline-queue",
    title: "Know the offline queue process",
    description: "Confirm you know how queued tablet actions sync when the connection returns and not to duplicate queued actions.",
    href: "/teacher-portal",
  },
  {
    id: "message-access",
    title: "Confirm classroom message access",
    description: "Verify you only see families connected to your assigned classroom and know when to involve the director.",
    href: "/messages",
  },
  {
    id: "schedule-coverage",
    title: "Confirm schedule and coverage",
    description: "Confirm your shift, classroom coverage, ratio expectations, and who to notify when you float, call out, arrive late, or leave early.",
    href: "/staff",
  },
];

export function setupChecklistTasksForKey(key: SetupChecklistKey) {
  return key === "director_launch" ? directorLaunchChecklistTasks : teacherProfileChecklistTasks;
}

export function readCompletedSetupChecklistIds(customFields: unknown, key: SetupChecklistKey) {
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) return [];
  const fields = customFields as Record<string, unknown>;
  const setupChecklists = fields.setupChecklists;
  if (!setupChecklists || typeof setupChecklists !== "object" || Array.isArray(setupChecklists)) return [];
  const entry = (setupChecklists as Record<string, unknown>)[key];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
  const completedIds = (entry as Record<string, unknown>).completedIds;
  return Array.isArray(completedIds)
    ? completedIds.filter((value): value is string => typeof value === "string")
    : [];
}

