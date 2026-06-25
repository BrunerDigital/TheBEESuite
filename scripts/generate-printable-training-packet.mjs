import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const dateStamp = "2026-06-25";
const packName = `bee-suite-paper-training-pack-${dateStamp}`;
const packDir = path.join(root, "output", "printables", packName);
const assetDir = path.join(packDir, "source-graphics");
const previewDir = path.join(packDir, "preview");
const pdfDir = path.join(root, "output", "pdf");
const htmlPath = path.join(packDir, `${packName}.html`);
const pdfPath = path.join(pdfDir, `${packName}.pdf`);
const manifestPath = path.join(packDir, "manifest.json");

const sourceGraphics = [
  {
    id: "childcare-operating-system",
    title: "Childcare Operating System",
    source: "public/brand/the-bee-suite/explainers/BEE_SUITE_EXPLAINER_01-childcare-operating-system_2026-06-08.png",
    use: "Opening product overview and sales/training explanation.",
  },
  {
    id: "inquiry-to-enrolled-family",
    title: "Inquiry To Enrolled Family",
    source: "public/brand/the-bee-suite/explainers/BEE_SUITE_EXPLAINER_02-inquiry-to-enrolled-family_2026-06-08.png",
    use: "Enrollment CRM, website form routing, and family handoff.",
  },
  {
    id: "permission-safe-data-model",
    title: "Permission-Safe Data Model",
    source: "public/brand/the-bee-suite/explainers/BEE_SUITE_EXPLAINER_03-permission-safe-data-model_2026-06-08.png",
    use: "Role training, trust review, and privacy explanation.",
  },
  {
    id: "school-go-live-setup-path",
    title: "School Go-Live Setup Path",
    source: "public/brand/the-bee-suite/explainers/BEE_SUITE_EXPLAINER_04-school-go-live-setup-path_2026-06-08.png",
    use: "Director onboarding and launch planning.",
  },
  {
    id: "daily-operating-loop",
    title: "Daily Operating Loop",
    source: "public/brand/the-bee-suite/explainers/BEE_SUITE_EXPLAINER_05-daily-operating-loop_2026-06-08.png",
    use: "Daily school rhythm training for directors, teachers, and parents.",
  },
  {
    id: "user-dashboard-views",
    title: "User Dashboard Views",
    source: "docs/USER_DASHBOARD_VIEWS_GRAPHIC_2026-06-08.png",
    use: "Role dashboard expectation setting.",
  },
  {
    id: "payments-architecture",
    title: "Payments Architecture",
    source: "docs/BEE_SUITE_PAYMENTS_ARCHITECTURE_VISUAL_2026-06-08.png",
    use: "Billing, Stripe Connect, payout readiness, and payment support.",
  },
  {
    id: "director-roadmap",
    title: "Kid City Director Setup Roadmap",
    source: "public/brand/the-bee-suite/explainers/kid-city-director-setup-roadmap.svg",
    use: "Director implementation and school setup.",
  },
  {
    id: "teacher-roadmap",
    title: "Kid City Teacher Profile Setup Roadmap",
    source: "public/brand/the-bee-suite/explainers/kid-city-teacher-profile-setup-roadmap.svg",
    use: "Teacher profile, classroom assignment, and launch sign-off.",
  },
  {
    id: "pricing-model-options",
    title: "Pricing Model Options",
    source: "docs/assets/pricing/01-pricing-model-options.png",
    use: "Operator pricing and revenue model explanation.",
  },
  {
    id: "charge-flow-maps",
    title: "Charge Flow Maps",
    source: "docs/assets/pricing/02-charge-flow-maps.png",
    use: "Fee, tuition, and charge flow explanation.",
  },
  {
    id: "revenue-stack-and-plans",
    title: "Revenue Stack And Plans",
    source: "docs/assets/pricing/03-revenue-stack-and-plans.png",
    use: "Executive billing strategy discussion.",
  },
  {
    id: "payment-revenue-1",
    title: "Payment Revenue Visual 1",
    source: "docs/assets/payment-revenue/01-payment-revenue-1.png",
    use: "Payment processing revenue meeting reference.",
  },
  {
    id: "payment-revenue-2",
    title: "Payment Revenue Visual 2",
    source: "docs/assets/payment-revenue/02-payment-revenue-2.png",
    use: "Payment processing revenue meeting reference.",
  },
  {
    id: "payment-revenue-3",
    title: "Payment Revenue Visual 3",
    source: "docs/assets/payment-revenue/03-payment-revenue-3.png",
    use: "Payment processing revenue meeting reference.",
  },
  {
    id: "payment-revenue-4",
    title: "Payment Revenue Visual 4",
    source: "docs/assets/payment-revenue/04-payment-revenue-4.png",
    use: "Payment processing revenue meeting reference.",
  },
  {
    id: "marketing-real-school-days",
    title: "Real School Days Campaign Graphic",
    source: "outputs/marketing/the-bee-suite-creative-pack-2026-06-16/exports/real-school-days.png",
    use: "Brand story and handout cover reference.",
  },
  {
    id: "marketing-role-safe-operations",
    title: "Role-Safe Operations Campaign Graphic",
    source: "outputs/marketing/the-bee-suite-creative-pack-2026-06-16/exports/role-safe-operations.png",
    use: "Access model and trust reference.",
  },
  {
    id: "marketing-helpful-drafts",
    title: "Helpful Drafts, Human Decisions",
    source: "outputs/marketing/the-bee-suite-creative-pack-2026-06-16/exports/helpful-drafts-human-decisions.png",
    use: "AI guardrails and training reference.",
  },
  {
    id: "usage-lobby-check-in",
    title: "Lobby Check-In Usage Scene",
    source: "public/brand/the-bee-suite/usage/bee-suite-lobby-check-in.png",
    use: "Kiosk and parent pickup training reference.",
  },
  {
    id: "usage-classroom-daily-updates",
    title: "Classroom Daily Updates Usage Scene",
    source: "public/brand/the-bee-suite/usage/bee-suite-classroom-daily-updates.png",
    use: "Teacher daily reports and classroom tablet training.",
  },
  {
    id: "usage-director-operations",
    title: "Director Operations Usage Scene",
    source: "public/brand/the-bee-suite/usage/bee-suite-director-operations.png",
    use: "Director command-center training reference.",
  },
  {
    id: "payment-revenue-pdf",
    title: "Payment Revenue Meeting Visuals PDF",
    source: "docs/assets/payment-revenue/payment-revenue-meeting-visuals.pdf",
    use: "Existing printable payment packet.",
  },
  {
    id: "completion-checklist-pdf",
    title: "App Completion Checklist Print PDF",
    source: "docs/APP_COMPLETION_CHECKLIST_PRINT.pdf",
    use: "Existing print-ready build completion checklist.",
  },
];

const logoAssets = [
  {
    id: "bee-suite-app-icon-dark",
    title: "The BEE Suite App Icon",
    source: "public/brand/the-bee-suite/app-icon-dark.png",
    use: "Packet logo.",
  },
  {
    id: "bee-suite-app-icon-yellow",
    title: "The BEE Suite Yellow App Icon",
    source: "public/brand/the-bee-suite/app-icon-yellow.png",
    use: "Alternate packet mark.",
  },
  {
    id: "kid-city-logo-horizontal",
    title: "Kid City USA Horizontal Logo",
    source: "public/brand/kid-city-usa/logo-horizontal.png",
    use: "Customer-specific appendix reference.",
  },
];

const productExplainers = [
  {
    label: "Graphic 1",
    title: "The Childcare Operating System In One View",
    subtitle:
      "The BEE Suite connects enrollment, operations, classrooms, parent communication, billing, compliance, and executive visibility around one center record.",
    map: [
      ["Enrollment", "Website inquiries, CRM leads, tours, waitlist, registration packets"],
      ["Operations", "Classrooms, attendance, daily reports, incidents, staffing, FTE"],
      ["Families", "Guardians, children, authorized pickups, messages, documents"],
      ["Business", "Tuition, invoices, payments, deposits, balances, exports"],
      ["Platform", "White-label brand, role access, integrations, audit logs, AI drafts"],
    ],
    footer: "Use this page to explain the full product before opening individual modules.",
  },
  {
    label: "Graphic 2",
    title: "From Website Inquiry To Enrolled Family",
    subtitle:
      "A prospective parent enters through a form or registration packet, gets routed to the right school, and becomes an operational family record.",
    steps: [
      ["Website inquiry", "Parent selects a location and submits interest."],
      ["School CRM", "The lead lands in the correct school pipeline."],
      ["Tour and nurture", "Staff schedule tours, reminders, and follow-up."],
      ["Enrollment decision", "Family is enrolled, waitlisted, or closed out."],
      ["Family setup", "Guardians, children, PINs, documents, and billing are created."],
      ["School operations", "The record powers classrooms, attendance, invoices, and reports."],
    ],
    footer: "Use this page for enrollment teams, directors, and website inquiry support.",
  },
  {
    label: "Graphic 3",
    title: "Permission-Safe Data Model",
    subtitle:
      "Each role sees the right scope: executives see rollups, directors run schools, teachers manage classrooms, and parents see their own family.",
    map: [
      ["Platform / brand", "Platform owner, brand admin, regional manager"],
      ["School", "Center director, assistant director, billing admin, auditor"],
      ["Classroom", "Teacher roster, attendance, daily reports, incident submissions"],
      ["Family", "Parent/guardian portal, own children, own invoices, own messages"],
      ["Pickup", "Authorized pickup check-in/out only for approved children"],
    ],
    footer: "Use this page whenever privacy, role access, or support access is discussed.",
  },
  {
    label: "Graphic 4",
    title: "School Go-Live Setup Path",
    subtitle:
      "A center should not go live until the local settings, people, records, payments, and role smoke tests are complete.",
    steps: [
      ["School profile", "Confirm location ID, contacts, hours, timezone, and approver."],
      ["Classrooms", "Add rooms, capacities, age groups, ratios, and teacher assignments."],
      ["Staff", "Create users, roles, schedules, documents, and kiosk codes."],
      ["Families", "Import or add families, children, guardians, pickups, and documents."],
      ["Billing", "Set tuition, fees, balances, disclosures, and payout readiness."],
      ["Smoke test", "Validate executive, director, teacher, parent, billing, and kiosk flows."],
    ],
    footer: "Use this page as the printed rollout checklist for each school.",
  },
  {
    label: "Graphic 5",
    title: "The Daily Operating Loop",
    subtitle:
      "The app follows the rhythm of a childcare center: morning command check, drop-off, classroom logs, parent communication, billing, and closeout.",
    steps: [
      ["Morning", "Review tours, messages, staffing, ratios, incidents, and reminders."],
      ["Drop-off", "Use kiosk/PIN, verify pickups, track attendance, and watch ratios."],
      ["Classroom day", "Teachers record care logs, photos, supplies, and incidents."],
      ["Family loop", "Parents see reports, messages, invoices, documents, and acknowledgments."],
      ["Closeout", "Leaders review billing, compliance, FTE, exports, and follow-up tasks."],
    ],
    footer: "Use this page to connect every role to the school day workflow.",
  },
];

const roleSheets = [
  {
    title: "Executive / Brand Admin",
    subtitle: "Runs the multi-location business and controls platform-wide setup.",
    modules: "Dashboard, Multi-location, Agency admin, CRM, FTE, Billing, Reports, Integrations, Audit logs",
    learn: [
      "How tenant, brand, owner group, center, and classroom scopes work.",
      "How to add or archive centers and assign location users.",
      "How to review FTE, CRM, billing readiness, compliance, and exports.",
      "How to confirm inquiry embeds and active school routing.",
    ],
    daily: [
      "Review dashboard rollups and missing-school alerts.",
      "Check new inquiries, tours, FTE submissions, and payment readiness.",
      "Approve sensitive setup changes through audit-aware workflows.",
    ],
    dontSkip: [
      "Never rely on user role alone; confirm access scope.",
      "Do not enable parent payments until payout and disclosure readiness are approved.",
    ],
  },
  {
    title: "Center Director / Assistant Director",
    subtitle: "Runs school-level setup, families, staff, classrooms, compliance, and daily operations.",
    modules: "School setup, Center dashboard, CRM, Families, Classrooms, Attendance, Documents, Compliance, Messages",
    learn: [
      "How to complete the school profile, classrooms, staff, tuition, documents, and parent portal readiness.",
      "How to manage leads, tours, waitlist, registration, and manual inquiries.",
      "How to review teacher daily reports, media, incidents, medication logs, and parent acknowledgments.",
      "How to reset PINs, review authorized pickups, and troubleshoot kiosk flow.",
    ],
    daily: [
      "Start with dashboard notifications and today view.",
      "Review new leads, tours, missing documents, incidents, messages, and billing exceptions.",
      "Close the day with attendance, reports, FTE reminders, and unresolved tasks.",
    ],
    dontSkip: [
      "Do not invite parents until family links, custody restrictions, and guardian emails are correct.",
      "Do not let teachers use the wrong classroom assignment.",
    ],
  },
  {
    title: "Teacher",
    subtitle: "Manages assigned classroom attendance, care logs, notes, photos, and incident submissions.",
    modules: "Teacher portal, Classroom, Attendance, Daily reports, Incidents, Messages, Documents",
    learn: [
      "How to confirm the correct classroom roster before recording anything.",
      "How to mark attendance, add meals, naps, bottles, diapers, activities, supplies, and notes.",
      "How photo review works and when media permissions block sharing.",
      "How to submit objective incident reports for director review.",
    ],
    daily: [
      "Confirm roster and restrictions at the start of the day.",
      "Record logs throughout the day instead of reconstructing them after pickup.",
      "Review daily reports before sending parent-facing notes.",
    ],
    dontSkip: [
      "Stop if a child appears in the wrong room or a restriction looks wrong.",
      "AI wording help is draft-only; teachers still verify facts.",
    ],
  },
  {
    title: "Parent / Guardian",
    subtitle: "Uses the family portal for their own children, messages, documents, incidents, and payments.",
    modules: "Parent portal, Messages, Documents, Notifications, Billing, Check-in",
    learn: [
      "How to set up login from the invitation email.",
      "Where to see daily reports, photos, invoices, balances, documents, and announcements.",
      "How to submit documents, acknowledge incidents, and request contact or pickup changes.",
      "How PIN or QR check-in works when enabled by the school.",
    ],
    daily: [
      "Check child updates, messages, documents, and invoice reminders.",
      "Use school-approved contact requests for record changes.",
      "Contact the director if a child, invoice, or pickup person looks wrong.",
    ],
    dontSkip: [
      "Parent accounts should only show their own family.",
      "Payment buttons depend on school payout readiness and may stay disabled until approved.",
    ],
  },
  {
    title: "Billing Admin",
    subtitle: "Handles family accounts, invoices, balances, payment methods, checkout readiness, and billing messages.",
    modules: "Billing & invoices, Payments, Billing settings, Messages, Reports",
    learn: [
      "How tuition plans, fees, discounts, deposits, subsidies, balances, and invoice cadence are configured.",
      "How Stripe Connect payout readiness controls parent checkout.",
      "How to review failed payments, payment method requests, and billing reminders.",
      "How to export billing reports without exposing unrelated child/family data.",
    ],
    daily: [
      "Check overdue invoices, failed payments, upcoming due dates, and unresolved payment method requests.",
      "Send billing messages through approved templates.",
      "Document exceptions before changing balances or credits.",
    ],
    dontSkip: [
      "Do not turn on live tuition checkout until payout onboarding and disclosures are approved.",
      "Treat billing screenshots as sensitive data.",
    ],
  },
  {
    title: "Authorized Pickup / Kiosk",
    subtitle: "Uses limited check-in/check-out actions for approved children only.",
    modules: "Kiosk check-in, Parent portal limited view, Notifications, Help",
    learn: [
      "How authorized pickup status is reviewed by the school.",
      "How to use PIN or QR check-in/check-out on the lobby device.",
      "What to do when the child, guardian, or pickup list is incorrect.",
      "Why pickup access is intentionally limited.",
    ],
    daily: [
      "Use the center-specific kiosk page.",
      "Verify the correct child before completing check-in or pickup.",
      "Ask the director to resolve failed PIN, wrong child, or missing authorization issues.",
    ],
    dontSkip: [
      "Never bypass a missing authorization record.",
      "Do not use another person's PIN or account.",
    ],
  },
  {
    title: "Read-Only Auditor / Support",
    subtitle: "Reviews scoped records, reports, and evidence without changing operational data.",
    modules: "Dashboards, FTE, Family/child views, Documents, Compliance, Analytics, Audit logs",
    learn: [
      "Which school, tenant, brand, and time period are in scope.",
      "How to review reports, compliance records, documents, incidents, and audit logs.",
      "How to capture support context without exposing unnecessary sensitive data.",
      "When to escalate a possible data exposure or cross-location visibility issue.",
    ],
    daily: [
      "Use read-only views and exports only for approved purposes.",
      "Capture school, user, URL, timestamp, expected result, and actual result for issues.",
      "Escalate P0/P1 issues immediately.",
    ],
    dontSkip: [
      "Do not edit production records from support review context.",
      "Do not paste secrets or sensitive child/family data into tickets.",
    ],
  },
];

const sopSheets = [
  {
    title: "SOP: Login And Password Reset",
    use: "A user cannot access the app, sees the wrong role, or needs first-login help.",
    owner: "Director for school users, executive/admin for tenant-wide users.",
    steps: [
      "Confirm the user is using the correct login email or generated username.",
      "Confirm the account is active and assigned to the correct role.",
      "Confirm the user has the intended center, classroom, family, or tenant scope.",
      "Use password reset or setup flow instead of sharing passwords in plain text.",
      "Ask the user to sign out and back in after role or scope changes.",
      "If the wrong data appears, stop and escalate as a data safety issue.",
    ],
    check: ["Correct role visible in header/account area.", "Navigation matches role.", "User sees only expected school, classroom, or family records."],
    escalate: "Escalate immediately if one user can see another center, child, family, billing account, or custody/medical detail.",
  },
  {
    title: "SOP: New School Go-Live Setup",
    use: "A new center is moving from setup to live school operations.",
    owner: "Executive admin and center director.",
    steps: [
      "Create/confirm the active school and CRM Location ID.",
      "Complete school profile: address, contacts, hours, timezone, approver, and go-live date.",
      "Load classrooms, age groups, capacities, ratio rules, and teacher assignments.",
      "Load staff accounts, schedules, credentials, and staff kiosk codes.",
      "Import or manually add families, children, guardians, pickups, documents, and balances.",
      "Configure tuition, fees, billing cadence, payment readiness, integrations, and parent portal access.",
      "Run role smoke tests for executive, director, teacher, parent, billing, and kiosk.",
    ],
    check: ["No unresolved duplicate imports.", "Payout readiness reviewed before checkout.", "Director signs off on family, staff, classroom, and billing accuracy."],
    escalate: "Escalate if location routing, user scope, Stripe status, or required child/staff records are unclear.",
  },
  {
    title: "SOP: Inquiry Routing And New Leads",
    use: "A parent inquiry, website embed, registration packet, or manual lead needs to reach the correct school.",
    owner: "Director or enrollment admin; executive/admin for embed setup.",
    steps: [
      "Confirm the selected location ID matches the intended school.",
      "Submit or enter the inquiry with parent, child, program interest, desired start, and source.",
      "Confirm the lead appears in the school CRM.",
      "Assign owner, stage, next task, tour status, and follow-up date.",
      "Confirm notifications and Google Sheet backup if enabled.",
      "Use Mr. Bee only for draft follow-up; review before sending.",
    ],
    check: ["Lead belongs to correct center.", "Another center user cannot see the lead.", "Stage does not move unless family actually progressed."],
    escalate: "Escalate if form submissions are missing, routed to wrong location, or visible across centers.",
  },
  {
    title: "SOP: Tour And Enrollment Follow-Up",
    use: "A lead is ready for tour, application, waitlist, or enrollment decision.",
    owner: "Director, assistant director, or enrollment admin.",
    steps: [
      "Review child age, desired start date, schedule, classroom fit, and source.",
      "Schedule the tour and confirm the family receives the details.",
      "Record tour outcome and next step in the CRM.",
      "Move the lead only to the accurate stage: application, waitlist, deposit, enrolled, or closed/lost.",
      "Create follow-up tasks for missing documents, deposits, start date, or capacity review.",
      "Before enrollment, confirm child profile, guardian links, documents, classroom, and billing setup.",
    ],
    check: ["Pipeline stage matches real status.", "Waitlist/capacity decision is documented.", "Family handoff is not hidden in email or text threads."],
    escalate: "Escalate if capacity, custody, medical, or payment readiness is uncertain.",
  },
  {
    title: "SOP: Family, Child, And Document Records",
    use: "A family is added, imported, corrected, or prepared for parent portal access.",
    owner: "Director, assistant director, or authorized admin.",
    steps: [
      "Confirm family name, billing contact, guardians, phone/email, emergency contacts, and authorized pickups.",
      "Confirm each child has classroom, schedule, enrollment status, DOB, restrictions, allergies, medications, and permissions.",
      "Upload or request missing family, child, staff, enrollment, and compliance documents.",
      "Review document expiration dates and mark reviewed only after authorized verification.",
      "Use contact/pickup change requests for parent-submitted changes.",
      "Keep restricted notes visible only to appropriate roles.",
    ],
    check: ["Guardian emails are correct before invite.", "Child is linked to the right family and classroom.", "Custody/media/medical restrictions are accurate."],
    escalate: "Escalate if documents conflict with operating records or sensitive restrictions are unclear.",
  },
  {
    title: "SOP: Parent Portal Invitation",
    use: "A school is ready to invite a guardian to the family portal.",
    owner: "Director or authorized admin.",
    steps: [
      "Confirm the family profile exists and each child is linked to the correct family and classroom.",
      "Confirm the guardian email, phone, custody status, and family link.",
      "Set or confirm the guardian PIN if lobby check-in is active.",
      "Open Parent Portal Access and send the invitation.",
      "Ask the parent to set their password and sign in to the parent portal.",
      "Confirm they see only their family, children, invoices, documents, messages, reports, and acknowledgments.",
    ],
    check: ["Portal account maps to the correct guardian.", "No unrelated child, invoice, or message is visible.", "Payment actions match Stripe readiness."],
    escalate: "Escalate any parent seeing no family or the wrong family.",
  },
  {
    title: "SOP: Kiosk Check-In, Pickup, And PIN Reset",
    use: "A parent/guardian or authorized pickup is checking a child in/out or reports PIN trouble.",
    owner: "Director, assistant director, or front desk lead.",
    steps: [
      "Open the center-specific kiosk page on the lobby device.",
      "Search for the child/family and verify the matched record.",
      "Confirm the adult is a guardian or authorized pickup for that child.",
      "Use PIN/QR check-in or check-out as configured by the school.",
      "If PIN fails, reset it from the guardian/family workflow after identity verification.",
      "Confirm the attendance log updates the correct center and classroom.",
    ],
    check: ["Child and adult match the authorized record.", "Attendance status updates once.", "No cross-location families appear in search."],
    escalate: "Escalate failed kiosk, wrong family search results, or authorization mismatches.",
  },
  {
    title: "SOP: Teacher Daily Reports And Photos",
    use: "Teachers need to record classroom care and share parent updates.",
    owner: "Teacher for entries; director for review and corrections.",
    steps: [
      "Confirm the assigned classroom and roster before entering logs.",
      "Record meals, bottles, naps, diaper/potty, activities, mood, supplies, and notes during the day.",
      "Use selected child, present children, or all visible only when that target is correct.",
      "Review parent-facing notes before sending.",
      "Upload photos only when permission allows and route them for director media review.",
      "Resolve offline queue messages before re-entering actions.",
    ],
    check: ["Report target is correct.", "Media restrictions are respected.", "Queued actions sync before duplicate entries are made."],
    escalate: "Escalate wrong roster, missing child, media restriction conflict, or unsynced offline queue.",
  },
  {
    title: "SOP: Incidents, Medication Logs, And Compliance Tasks",
    use: "A classroom or director needs to document a safety, health, drill, licensing, or compliance workflow.",
    owner: "Teacher submits facts; director reviews, follows up, and exports when needed.",
    steps: [
      "Confirm child, classroom, date/time, staff involved, and incident/medication/compliance type.",
      "Write objective facts and action taken. Avoid legal, medical, custody, or compliance conclusions.",
      "Submit for director review and parent acknowledgment if required.",
      "Attach supporting photos/documents only when appropriate and permission-safe.",
      "Update compliance tasks, drill logs, medication records, or export package as needed.",
      "Track follow-up until reviewed/closed.",
    ],
    check: ["Facts are complete and objective.", "Director review status is visible.", "Parent acknowledgment is tracked when required."],
    escalate: "Escalate urgent medical, custody, data exposure, or licensing-sensitive questions immediately.",
  },
  {
    title: "SOP: Billing, Invoices, And Payments",
    use: "A family balance, invoice, payment method, checkout, payout, or failed payment needs attention.",
    owner: "Billing admin, director, or executive/admin depending on scope.",
    steps: [
      "Confirm family account, billing contact, tuition plan, fees, discounts, subsidies, and opening balance.",
      "Review invoice cadence, due dates, late fee rules, and disclosures before sending invoices.",
      "Confirm Stripe Connect payout onboarding before live parent checkout.",
      "Use payment method request flow when a family needs to add/update a method.",
      "Review failed payment/dunning messages before sending.",
      "Export reports before large billing corrections.",
    ],
    check: ["Checkout remains blocked if payout is not ready.", "Invoice belongs to correct family and center.", "Processing recovery settings match approval status."],
    escalate: "Escalate production payment, payout, refund, dispute, or data visibility problems as high severity.",
  },
  {
    title: "SOP: FTE Reporting",
    use: "Weekly school FTE submission, executive review, correction, or missing report follow-up.",
    owner: "Director submits; executive/admin reviews.",
    steps: [
      "Director opens FTE Reports and enters the current week data before cutoff.",
      "Review full-time, part-time, age group, enrollment, and notes before submitting.",
      "Executive reviews submitted and missing schools.",
      "Correct mistakes through the approved correction flow or executive review.",
      "Export CSV/PDF reports for offline backup when needed.",
      "Follow missing-report escalation timing.",
    ],
    check: ["Submission is tied to correct school/week.", "Totals match school record.", "Missing report alerts are resolved."],
    escalate: "Escalate if a school cannot submit or a report appears under the wrong center.",
  },
  {
    title: "SOP: Messages, Notifications, And AI Drafts",
    use: "Staff need to communicate with parents, classrooms, leads, or internal teams.",
    owner: "Director, teacher, billing admin, or executive/admin by scope.",
    steps: [
      "Confirm audience: family, classroom, center, lead stage, billing group, or staff group.",
      "Choose approved template or write the message.",
      "Use AI/Mr. Bee only for draft copy, summary, or wording help.",
      "Review all sensitive content before sending.",
      "Confirm channel: portal, email, SMS, push, or announcement.",
      "Check delivery/read status and follow-up tasks.",
    ],
    check: ["Audience is scoped correctly.", "Sensitive decisions remain human-reviewed.", "Urgent messages use approved school policy."],
    escalate: "Escalate any message sent to the wrong audience or containing sensitive data.",
  },
  {
    title: "SOP: Support Escalation And Data Safety",
    use: "A user reports a live issue, wrong data, broken workflow, or security concern.",
    owner: "Support lead, executive/admin, or developer depending on severity.",
    steps: [
      "Capture school/location, user email, role, URL, timestamp/timezone, steps, expected result, actual result, and screenshot if safe.",
      "Classify severity: P0 data exposure/system down, P1 critical workflow broken, P2 workaround exists, P3 cosmetic/future.",
      "Check account role/scope, center assignment, record ownership, health endpoint, readiness endpoint, and recent deployment/logs.",
      "Avoid moving data manually across centers unless location and tenant are confirmed.",
      "Use rollback, disablement, or workaround only when appropriate.",
      "Document resolution and follow-up.",
    ],
    check: ["No secrets in screenshots/tickets.", "Minimum sensitive data shared.", "P0/P1 issues confirmed with production smoke test after fix."],
    escalate: "Escalate immediately for cross-location visibility, child/medical/custody/billing exposure, payment defects, or system-wide login failure.",
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugFileName(item) {
  const ext = path.extname(item.source);
  return `${item.id}${ext}`;
}

function assetSrc(item) {
  return `source-graphics/${slugFileName(item)}`;
}

function list(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function brandHeader(label) {
  return `<header class="brand-header">
    <div class="brand-lockup">
      <img src="source-graphics/bee-suite-app-icon-dark.png" alt="" />
      <div>
        <strong>The BEE Suite</strong>
        <span>Printable Training Packet</span>
      </div>
    </div>
    <div class="doc-label">${escapeHtml(label)}</div>
  </header>`;
}

function page(title, body, opts = {}) {
  const klass = opts.className ? ` ${opts.className}` : "";
  return `<section class="sheet${klass}">
    ${brandHeader(opts.label ?? "Paper guide")}
    ${opts.kicker ? `<p class="kicker">${escapeHtml(opts.kicker)}</p>` : ""}
    <h1>${escapeHtml(title)}</h1>
    ${body}
    ${opts.footer ? `<footer class="sheet-footer">${escapeHtml(opts.footer)}</footer>` : ""}
  </section>`;
}

function coverPage() {
  return page(
    "Paper-ready guides for every BEE Suite role",
    `<div class="cover-grid">
      <div>
        <p class="lead">A light-background print packet that gathers the existing product graphics and turns the web app workflows into paper SOPs, role setup sheets, and daily training references.</p>
        <div class="pill-row">
          <span>Light print theme</span>
          <span>Role-based setup</span>
          <span>SOPs</span>
          <span>Source assets collected</span>
        </div>
      </div>
      <div class="cover-card">
        <div class="big-mark">B</div>
        <h2>Designed for paper</h2>
        <p>Uses the brand mark, honey accent, teal/green support colors, thin lines, and mostly white/cream space to avoid heavy dark-blue or dark-gray ink coverage.</p>
      </div>
    </div>
    <div class="summary-strip">
      <div><b>${sourceGraphics.length}</b><span>source graphics gathered</span></div>
      <div><b>${productExplainers.length}</b><span>light explainer rebuilds</span></div>
      <div><b>${roleSheets.length}</b><span>role setup sheets</span></div>
      <div><b>${sopSheets.length}</b><span>SOP handouts</span></div>
    </div>
    <div class="note-box">
      <strong>Included file set</strong>
      <p>Final PDF, source HTML, collected image/PDF assets, preview screenshots, and a machine-readable manifest.</p>
    </div>`,
    {
      label: "Cover",
      kicker: `Generated ${dateStamp}`,
      footer: "Print single-sided for handouts or double-sided as a training binder.",
    },
  );
}

function sourceGraphicsPage(slice, pageNumber) {
  const cards = slice
    .map((item) => {
      const ext = path.extname(item.source).toLowerCase();
      const canPreview = [".png", ".jpg", ".jpeg", ".svg"].includes(ext);
      return `<article class="asset-card">
        <div class="asset-thumb">${canPreview ? `<img src="${assetSrc(item)}" alt="${escapeHtml(item.title)}" />` : `<div class="file-badge">${escapeHtml(ext.replace(".", "").toUpperCase())}</div>`}</div>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.use)}</p>
          <code>${escapeHtml(item.source)}</code>
        </div>
      </article>`;
    })
    .join("");
  return page(
    `Collected printable graphics ${pageNumber}`,
    `<p class="lead small">These are the existing graphics and print-ready files copied into this packet's <code>source-graphics</code> folder. The new pages that follow rebuild the training content in a lighter print theme.</p>
    <div class="asset-grid">${cards}</div>`,
    {
      label: "Source graphics",
      footer: "Dark originals are preserved for reference; use the light rebuilds for low-ink classroom/office printing.",
    },
  );
}

function roleOverviewPage() {
  const rows = [
    ["Executive / brand admin", "Scope, locations, users, rollups, reports, payments, integrations"],
    ["Director / assistant director", "School setup, CRM, families, staff, classrooms, compliance, daily operations"],
    ["Teacher", "Roster, attendance, daily reports, photos, incidents, parent-facing notes"],
    ["Parent / guardian", "Portal setup, messages, invoices, documents, daily reports, acknowledgments"],
    ["Billing admin", "Invoices, balances, payment methods, Stripe readiness, billing communication"],
    ["Authorized pickup", "Limited kiosk check-in/check-out for approved children"],
    ["Auditor / support", "Read-only evidence review, issue capture, data safety escalation"],
  ]
    .map(([role, needs], index) => `<tr><td>${index + 1}</td><td>${escapeHtml(role)}</td><td>${escapeHtml(needs)}</td></tr>`)
    .join("");

  return page(
    "What each user type needs to learn",
    `<p class="lead small">Use this as the first page in any printed binder. It sets training expectations before handing out role-specific sheets.</p>
    <table class="role-table">
      <thead><tr><th>#</th><th>User type</th><th>Training focus</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="three-cards">
      <article><h3>First 30 minutes</h3><p>Login, role/scope check, navigation, dashboard, and where to ask for help.</p></article>
      <article><h3>First live day</h3><p>Daily workflow, notifications, records that must be checked, and escalation triggers.</p></article>
      <article><h3>First week</h3><p>Reports, cleanup, exception handling, support tickets, and role-specific sign-off.</p></article>
    </div>`,
    { label: "Role map", footer: "Every workflow remains tenant-, center-, classroom-, family-, or child-scoped." },
  );
}

function productExplainerPage(item, index) {
  const body = item.steps
    ? `<p class="lead small">${escapeHtml(item.subtitle)}</p>
      <div class="step-flow">${item.steps
        .map(([title, detail], stepIndex) => `<article><span>${stepIndex + 1}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></article>`)
        .join("")}</div>`
    : `<p class="lead small">${escapeHtml(item.subtitle)}</p>
      <div class="layer-list">${item.map
        .map(([title, detail]) => `<article><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></article>`)
        .join("")}</div>`;

  return page(item.title, body, {
    label: item.label,
    kicker: "Light print rebuild of the existing product explainer graphic",
    footer: item.footer,
    className: index === 0 ? "explainer-cover" : "",
  });
}

function rolePage(item) {
  return page(
    `${item.title} setup sheet`,
    `<p class="lead small">${escapeHtml(item.subtitle)}</p>
    <div class="module-band"><strong>Primary modules</strong><span>${escapeHtml(item.modules)}</span></div>
    <div class="two-col">
      <article class="info-panel"><h2>Learn before go-live</h2>${list(item.learn)}</article>
      <article class="info-panel"><h2>Daily habit</h2>${list(item.daily)}</article>
    </div>
    <div class="warning-panel"><h2>Do not skip</h2>${list(item.dontSkip)}</div>`,
    {
      label: "Role setup",
      footer: "Use this sheet with the role smoke test before allowing live operational use.",
    },
  );
}

function sopPage(item, index) {
  return page(
    item.title,
    `<div class="sop-meta">
      <div><strong>Use when</strong><span>${escapeHtml(item.use)}</span></div>
      <div><strong>Owner</strong><span>${escapeHtml(item.owner)}</span></div>
    </div>
    <div class="two-col">
      <article class="info-panel"><h2>Steps</h2>${list(item.steps)}</article>
      <article class="info-panel">
        <h2>Quality check</h2>${list(item.check)}
        <div class="escalate"><strong>Escalate</strong><p>${escapeHtml(item.escalate)}</p></div>
      </article>
    </div>`,
    {
      label: `SOP ${index + 1}`,
      footer: "Sensitive child, family, custody, medical, billing, and compliance decisions require authorized human review.",
    },
  );
}

function signoffPage() {
  const rows = roleSheets
    .map((role) => `<tr><td>${escapeHtml(role.title)}</td><td></td><td></td><td></td></tr>`)
    .join("");
  return page(
    "Training sign-off",
    `<p class="lead small">Use this final page after the role sheets and SOPs have been reviewed with each live-school team.</p>
    <table class="signoff-table">
      <thead><tr><th>Role / group</th><th>Name</th><th>Date</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="note-box"><strong>Launch reminder</strong><p>Do not treat printed SOPs as permission to bypass app guardrails. The live app remains the source of truth for current permissions, records, payment readiness, and compliance workflow status.</p></div>`,
    { label: "Sign-off", footer: "Keep signed copies with the school launch packet." },
  );
}

function css() {
  return `<style>
    :root {
      color-scheme: light;
      --paper: #fff8ec;
      --paper-2: #fffcf5;
      --card: #ffffff;
      --ink: #17202a;
      --muted: #586270;
      --soft: #eef2f4;
      --line: #d8cdb6;
      --gold: #f5b51b;
      --gold-2: #ffe6a6;
      --teal: #0f8b8d;
      --green: #2f855a;
      --rose: #b42318;
      --navy: #223244;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #ece7da; color: var(--ink); font-family: Arial, Helvetica, sans-serif; }
    body { padding: 24px 0; }
    code { font-family: "Geist Mono", "SFMono-Regular", Consolas, monospace; font-size: 7.5pt; color: #475569; overflow-wrap: anywhere; }
    .sheet {
      position: relative;
      width: 8.5in;
      min-height: 11in;
      margin: 0 auto 24px;
      padding: 0.42in 0.48in 0.46in;
      overflow: hidden;
      break-after: page;
      background:
        linear-gradient(180deg, rgba(245,181,27,0.12), rgba(255,255,255,0) 1.8in),
        radial-gradient(circle at 93% 8%, rgba(15,139,141,0.12), transparent 1.8in),
        var(--paper);
      box-shadow: 0 18px 60px rgba(23,32,42,0.18);
    }
    .sheet::after {
      content: "";
      position: absolute;
      inset: auto 0 0 0;
      height: 0.15in;
      background: linear-gradient(90deg, var(--gold), var(--teal), var(--green));
      opacity: 0.85;
    }
    .brand-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 0.28in;
      padding-bottom: 0.14in;
      border-bottom: 1px solid var(--line);
    }
    .brand-lockup { display: flex; align-items: center; gap: 10px; }
    .brand-lockup img { width: 0.42in; height: 0.42in; object-fit: contain; }
    .brand-lockup strong { display: block; font-size: 12pt; letter-spacing: 0; }
    .brand-lockup span { display: block; margin-top: 2px; color: var(--muted); font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.12em; }
    .doc-label {
      border: 1px solid rgba(245,181,27,0.9);
      border-radius: 999px;
      padding: 6px 10px;
      background: rgba(255,230,166,0.55);
      color: #5b4103;
      font-size: 8pt;
      font-weight: 700;
    }
    .kicker {
      margin: 0 0 0.1in;
      color: var(--teal);
      font-size: 8.5pt;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      max-width: 7.2in;
      font-size: 26pt;
      line-height: 1.03;
      letter-spacing: 0;
      color: var(--ink);
    }
    h2 { margin: 0; font-size: 12pt; line-height: 1.2; letter-spacing: 0; }
    h3 { margin: 0; font-size: 10.5pt; line-height: 1.18; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); font-size: 9pt; line-height: 1.42; }
    .lead { margin-top: 0.16in; color: #334155; font-size: 13pt; line-height: 1.42; }
    .lead.small { font-size: 10pt; max-width: 7.1in; }
    .sheet-footer {
      position: absolute;
      left: 0.48in;
      right: 0.48in;
      bottom: 0.28in;
      color: #64748b;
      font-size: 7.4pt;
      line-height: 1.3;
    }
    .cover-grid { display: grid; grid-template-columns: 1fr 2.35in; gap: 0.28in; align-items: stretch; margin-top: 0.3in; }
    .cover-card, .note-box, .info-panel, .warning-panel, .asset-card, .step-flow article, .layer-list article, .three-cards article {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,0.82);
      box-shadow: 0 8px 20px rgba(23,32,42,0.06);
    }
    .cover-card { padding: 0.22in; }
    .big-mark {
      display: grid;
      place-items: center;
      width: 0.88in;
      height: 0.76in;
      margin-bottom: 0.16in;
      clip-path: polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%);
      background: linear-gradient(135deg, #ffd95d, var(--gold));
      color: #111827;
      font-size: 26pt;
      font-weight: 900;
    }
    .pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 0.22in; }
    .pill-row span {
      padding: 7px 10px;
      border-radius: 999px;
      border: 1px solid #d8cdb6;
      background: #fffdf7;
      color: #334155;
      font-size: 8.5pt;
      font-weight: 700;
    }
    .summary-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.12in;
      margin-top: 0.35in;
    }
    .summary-strip div {
      border-top: 4px solid var(--gold);
      padding: 0.14in;
      background: #fff;
      border-radius: 8px;
    }
    .summary-strip b { display: block; font-size: 24pt; line-height: 1; color: var(--navy); }
    .summary-strip span { display: block; margin-top: 5px; color: var(--muted); font-size: 8pt; line-height: 1.25; }
    .note-box { margin-top: 0.28in; padding: 0.16in; }
    .note-box strong, .module-band strong, .sop-meta strong, .escalate strong { display: block; color: var(--ink); font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em; }
    .asset-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.12in; margin-top: 0.22in; }
    .asset-card { display: grid; grid-template-columns: 1.08in 1fr; gap: 0.12in; min-height: 1in; padding: 0.1in; }
    .asset-thumb { display: grid; place-items: center; overflow: hidden; min-height: 0.76in; border-radius: 6px; background: #f8fafc; border: 1px solid #e2e8f0; }
    .asset-thumb img { width: 100%; height: 0.82in; object-fit: contain; display: block; }
    .asset-card p { margin-top: 4px; font-size: 7.7pt; }
    .file-badge { font-size: 14pt; font-weight: 800; color: var(--teal); }
    .role-table, .signoff-table { width: 100%; border-collapse: collapse; margin-top: 0.22in; background: #fff; border-radius: 8px; overflow: hidden; }
    th, td { border: 1px solid #e2d8c4; padding: 0.1in; text-align: left; vertical-align: top; font-size: 8.7pt; line-height: 1.35; }
    th { background: #fff0c2; color: #3b2a05; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; }
    .three-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.14in; margin-top: 0.24in; }
    .three-cards article { padding: 0.14in; }
    .three-cards p { margin-top: 6px; }
    .step-flow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.14in; margin-top: 0.28in; }
    .step-flow article { min-height: 1.34in; padding: 0.15in; position: relative; }
    .step-flow span {
      display: grid;
      place-items: center;
      width: 0.32in;
      height: 0.32in;
      margin-bottom: 0.08in;
      border-radius: 8px;
      background: var(--gold);
      color: #111827;
      font-weight: 900;
      font-size: 10pt;
    }
    .step-flow p, .layer-list p { margin-top: 6px; }
    .layer-list { display: grid; gap: 0.12in; margin-top: 0.25in; }
    .layer-list article {
      display: grid;
      grid-template-columns: 1.35in 1fr;
      gap: 0.16in;
      align-items: center;
      padding: 0.14in;
      border-left: 5px solid var(--teal);
    }
    .module-band {
      display: grid;
      grid-template-columns: 1.35in 1fr;
      gap: 0.15in;
      align-items: start;
      margin-top: 0.18in;
      padding: 0.13in 0.15in;
      border-radius: 8px;
      background: #fff0c2;
      border: 1px solid #e5c75b;
    }
    .module-band span { color: #3b2a05; font-size: 8.8pt; line-height: 1.4; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0.16in; margin-top: 0.2in; align-items: start; }
    .info-panel { padding: 0.16in; }
    .warning-panel { margin-top: 0.16in; padding: 0.16in; border-left: 5px solid var(--rose); }
    ul { list-style: none; margin: 0.1in 0 0; padding: 0; }
    li {
      position: relative;
      margin-top: 0.06in;
      padding-left: 0.17in;
      color: #3b4654;
      font-size: 8.4pt;
      line-height: 1.35;
    }
    li::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0.42em;
      width: 0.07in;
      height: 0.07in;
      border-radius: 99px;
      background: var(--teal);
    }
    .sop-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0.14in; margin-top: 0.18in; }
    .sop-meta div {
      min-height: 0.72in;
      padding: 0.13in;
      border-radius: 8px;
      border: 1px solid #d8cdb6;
      background: #fff;
    }
    .sop-meta span { display: block; margin-top: 6px; color: var(--muted); font-size: 8.4pt; line-height: 1.35; }
    .escalate { margin-top: 0.16in; padding-top: 0.14in; border-top: 1px solid #e2d8c4; }
    .escalate p { margin-top: 6px; color: var(--rose); font-weight: 700; }
    .signoff-table td { height: 0.55in; }
    @page { size: Letter; margin: 0; }
    @media print {
      body { padding: 0; background: white; }
      .sheet { margin: 0; box-shadow: none; break-after: page; }
      .sheet:last-child { break-after: auto; }
    }
  </style>`;
}

function html() {
  const assetPages = [];
  const allGraphics = [...sourceGraphics];
  for (let index = 0; index < allGraphics.length; index += 8) {
    assetPages.push(sourceGraphicsPage(allGraphics.slice(index, index + 8), `${assetPages.length + 1} of ${Math.ceil(allGraphics.length / 8)}`));
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>The BEE Suite Paper Training Pack</title>
  ${css()}
</head>
<body>
  ${coverPage()}
  ${assetPages.join("\n")}
  ${roleOverviewPage()}
  ${productExplainers.map(productExplainerPage).join("\n")}
  ${roleSheets.map(rolePage).join("\n")}
  ${sopSheets.map(sopPage).join("\n")}
  ${signoffPage()}
</body>
</html>`;
}

async function copyAssets() {
  await mkdir(assetDir, { recursive: true });
  const copied = [];
  const missing = [];
  for (const item of [...logoAssets, ...sourceGraphics]) {
    const sourcePath = path.join(root, item.source);
    const targetPath = path.join(assetDir, slugFileName(item));
    if (!existsSync(sourcePath)) {
      missing.push(item);
      continue;
    }
    await copyFile(sourcePath, targetPath);
    copied.push({ ...item, copiedTo: path.relative(root, targetPath).replaceAll("\\", "/") });
  }
  return { copied, missing };
}

async function renderOutputs() {
  await mkdir(packDir, { recursive: true });
  await mkdir(previewDir, { recursive: true });
  await mkdir(pdfDir, { recursive: true });

  const { copied, missing } = await copyAssets();
  await writeFile(htmlPath, html(), "utf8");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.pdf({
    path: pdfPath,
    format: "Letter",
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });

  for (const [index, sheetIndex] of [0, 1, 4, 10, 18].entries()) {
    const sheet = page.locator(".sheet").nth(sheetIndex);
    await sheet.screenshot({ path: path.join(previewDir, `preview-${String(index + 1).padStart(2, "0")}.png`) });
  }

  await browser.close();

  const manifest = {
    title: "The BEE Suite Paper Training Pack",
    createdAt: dateStamp,
    purpose: "Light-background printable packet for role setup, SOP training, and source graphic collection.",
    html: path.relative(root, htmlPath).replaceAll("\\", "/"),
    pdf: path.relative(root, pdfPath).replaceAll("\\", "/"),
    previewDirectory: path.relative(root, previewDir).replaceAll("\\", "/"),
    sourceGraphicsDirectory: path.relative(root, assetDir).replaceAll("\\", "/"),
    counts: {
      sourceGraphics: sourceGraphics.length,
      lightProductExplainers: productExplainers.length,
      roleSetupSheets: roleSheets.length,
      sopSheets: sopSheets.length,
    },
    copied,
    missing: missing.map((item) => ({ id: item.id, title: item.title, source: item.source })),
    printNotes: [
      "Use the generated PDF for the low-ink paper packet.",
      "Dark original graphics are copied for reference, but the training pages are rebuilt with a light print theme.",
      "Sensitive child, family, custody, medical, billing, and compliance workflows remain human-reviewed.",
    ],
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`HTML: ${htmlPath}`);
  console.log(`PDF: ${pdfPath}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Copied assets: ${copied.length}`);
  if (missing.length) console.log(`Missing assets: ${missing.map((item) => item.source).join(", ")}`);
}

await renderOutputs();
