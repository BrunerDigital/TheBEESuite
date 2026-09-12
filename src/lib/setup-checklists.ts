import { STAFF_MESSAGING_HREF } from "@/lib/messaging-navigation";
import { PAYOUT_SETUP_SETTINGS_PATH } from "@/lib/stripe-payout-setup-flow";

export type SetupChecklistKey = "director_launch" | "teacher_profile";

export type SetupChecklistTask = {
  id: string;
  title: string;
  description: string;
  href?: string;
  requiresVerifiedEvidence?: boolean;
};

export type PayoutSetupChecklistFlow = {
  href: string;
  replacementInProgress: boolean;
};

export const directorLaunchChecklistTasks: SetupChecklistTask[] = [
  {
    id: "login-school-profile",
    title: "Review and confirm the prepared school profile",
    description: "Review the prefilled school contact details, timezone, and capacity; correct only what changed, then save one explicit confirmation.",
    href: "/billing-settings?view=setup#school-business-profile",
  },
  {
    id: "classrooms-ratios",
    title: "Review classrooms, capacity, and ratios",
    description: "Review any prepared rooms, then add or correct age groups, licensed capacity, desired capacity, ratio rules, and assigned coverage.",
    href: "/classroom-dashboard",
  },
  {
    id: "teachers-staff",
    title: "Review teachers and staff",
    description: "Review prepared or imported staff, then add or correct teacher profiles, classroom assignments, schedules, credentials, background checks, and onboarding documents.",
    href: "/staff",
  },
  {
    id: "procare-import",
    title: "Load and confirm family & child data",
    description: "Choose the guarded import path or a clean start, then confirm families, guardians, children, contacts, safety details, schedules, and classroom assignments.",
    href: "/billing-settings?view=setup#school-data-setup",
    requiresVerifiedEvidence: true,
  },
  {
    id: "required-documents",
    title: "Complete required documents",
    description: "Review family, child, and staff document checklists, upload missing files, verify signatures, and confirm expiration dates.",
    href: "/forms?view=documents",
  },
  {
    id: "tuition-billing-rules",
    title: "Review tuition, fees, and billing rules",
    description: "Review the prepared plans and policies, then confirm or correct tuition, fees, discounts, subsidy/copay rules, opening balances, invoice cadence, and disclosures.",
    href: "/billing-settings",
  },
  {
    id: "payout-bank-account",
    title: "Finish the school's Stripe account setup",
    description: "The Stripe account already exists. Sign in to The BEE Suite with the school login, open this school-specific step, then use the school email and its existing Stripe password—or create the Stripe login if no password was set—to finish payout verification.",
    href: PAYOUT_SETUP_SETTINGS_PATH,
    requiresVerifiedEvidence: true,
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
    title: "Review messages and notifications",
    description: "Review prepared templates and sender rules, then confirm broadcast segments, email/SMS delivery, notification preferences, and AI draft review expectations.",
    href: STAFF_MESSAGING_HREF,
  },
  {
    id: "calendar-fte",
    title: "Review calendar, closures, and FTE workflow",
    description: "Review prepared calendar and reporting defaults, then confirm events, closures, sync, the reporting owner, cutoff, and reminder/escalation expectations.",
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

export function readCompletedSetupChecklistIds(
  customFields: unknown,
  key: SetupChecklistKey,
  options: { centerId?: string | null; allowLegacyFallback?: boolean } = {},
) {
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) return [];
  const fields = customFields as Record<string, unknown>;
  const setupChecklists = fields.setupChecklists;
  if (!setupChecklists || typeof setupChecklists !== "object" || Array.isArray(setupChecklists)) return [];
  const entry = (setupChecklists as Record<string, unknown>)[key];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
  const entryRecord = entry as Record<string, unknown>;
  const centerEntries = entryRecord.centers;
  const centerEntry = key === "director_launch"
    && options.centerId
    && centerEntries
    && typeof centerEntries === "object"
    && !Array.isArray(centerEntries)
      ? (centerEntries as Record<string, unknown>)[options.centerId]
      : null;
  const centerCompletedIds = centerEntry && typeof centerEntry === "object" && !Array.isArray(centerEntry)
    ? (centerEntry as Record<string, unknown>).completedIds
    : null;
  const completedIds = Array.isArray(centerCompletedIds)
    ? centerCompletedIds
    : options.allowLegacyFallback || key === "teacher_profile"
      ? entryRecord.completedIds
      : [];
  return Array.isArray(completedIds)
    ? completedIds.filter((value): value is string => typeof value === "string")
    : [];
}

