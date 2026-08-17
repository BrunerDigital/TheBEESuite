import { STAFF_MESSAGING_HREF } from "@/lib/messaging-navigation";
import { PAYOUT_SETUP_SETTINGS_PATH } from "@/lib/stripe-payout-setup-flow";

export type SetupChecklistKey = "director_launch" | "teacher_profile";

export type SetupChecklistTask = {
  id: string;
  title: string;
  description: string;
  href?: string;
};

export type PayoutSetupChecklistFlow = {
  href: string;
  replacementInProgress: boolean;
};

export const directorLaunchChecklistTasks: SetupChecklistTask[] = [
  {
    id: "login-school-profile",
    title: "Log in and confirm school profile",
    description: "Sign in with the school email, reset the password if prompted, and confirm school contact details, hours, timezone, capacity, and launch owner.",
    href: "/billing-settings?view=setup",
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
    title: "Review imported families and children",
    description: "Import approved source data, review duplicate matches, and confirm families, guardians, children, contacts, allergies, schedules, and classroom assignments.",
    href: "/family-detail",
  },
  {
    id: "required-documents",
    title: "Complete required documents",
    description: "Review family, child, and staff document checklists, upload missing files, verify signatures, and confirm expiration dates.",
    href: "/forms?view=documents",
  },
  {
    id: "tuition-billing-rules",
    title: "Configure tuition, fees, and billing rules",
    description: "Enter tuition plans, registration fees, deposits, discounts, subsidy/copay rules, opening balance policy, invoice cadence, and fee disclosures.",
    href: "/billing-settings",
  },
  {
    id: "payout-bank-account",
    title: "Finish the school's Stripe account setup",
    description: "The Stripe account already exists. Sign in to The BEE Suite with the school login, open this school-specific step, then use the school email and its existing Stripe password—or create the Stripe login if no password was set—to finish payout verification.",
    href: PAYOUT_SETUP_SETTINGS_PATH,
  },
  {
    id: "parent-portal",
    title: "Configure parent portal access",
    description: "Verify guardian emails, family links, child visibility, custody restrictions, payment access, document access, and invite order.",
    href: "/family-detail#family-guardians",
  },
  {
    id: "attendance-kiosk",
    title: "Test attendance, kiosk, QR, and PIN workflows",
    description: "Verify guardian check-in/out, authorized pickups, staff clock-in/out, classroom attendance, late pickup flags, and ratio snapshots.",
    href: "/classroom-dashboard?view=attendance",
  },
  {
    id: "messages-notifications",
    title: "Configure messages and notifications",
    description: "Review templates, broadcast segments, sender rules, email/SMS delivery, notification preferences, and AI draft review expectations.",
    href: STAFF_MESSAGING_HREF,
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
    href: "/forms?view=compliance",
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

export function directorLaunchChecklistTasksForPayoutSetup(flow?: PayoutSetupChecklistFlow) {
  if (!flow) return directorLaunchChecklistTasks;
  return directorLaunchChecklistTasks.map((task) => task.id === "payout-bank-account"
    ? {
        ...task,
        title: flow.replacementInProgress ? "Finish the school's existing Stripe account" : task.title,
        description: flow.replacementInProgress
          ? "Sign in to The BEE Suite with the school login, confirm the exact school, then open its account-specific Stripe page. Use the school email and existing Stripe password, or create the Stripe login if no password was set. Parent payments remain on the current verified account until a controlled cutover."
          : task.description,
        href: flow.href,
      }
    : task);
}

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
    href: STAFF_MESSAGING_HREF,
  },
  {
    id: "schedule-coverage",
    title: "Confirm schedule and coverage",
    description: "Confirm your shift, classroom coverage, ratio expectations, and who to notify when you float, call out, arrive late, or leave early.",
    href: "/teacher-portal",
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

