import {
  Activity,
  BadgeDollarSign,
  BookOpen,
  Bot,
  Building2,
  Code2,
  ClipboardCheck,
  CreditCard,
  FileText,
  FolderOpen,
  HeartHandshake,
  LayoutDashboard,
  Megaphone,
  ShieldCheck,
  Users,
} from "lucide-react";

export type ModuleSlug =
  | "login"
  | "forgot-password"
  | "onboarding"
  | "school-setup"
  | "data-readiness"
  | "dashboard"
  | "multi-location-dashboard"
  | "center-dashboard"
  | "fte-reports"
  | "classroom-dashboard"
  | "crm-leads"
  | "family-detail"
  | "child-profile"
  | "enrollment-pipeline"
  | "waitlist"
  | "tours"
  | "calendar"
  | "messages"
  | "parent-media-review"
  | "announcements"
  | "campaigns"
  | "automations"
  | "forms"
  | "documents"
  | "attendance"
  | "daily-reports"
  | "incident-reports"
  | "staff"
  | "billing-invoices"
  | "payments"
  | "terminal-store"
  | "asset-hub"
  | "corporate-billing"
  | "compliance"
  | "reputation"
  | "analytics"
  | "ai-command"
  | "parent-portal"
  | "teacher-portal"
  | "agency-admin"
  | "developer-dashboard"
  | "white-label"
  | "team-permissions"
  | "integrations"
  | "billing-settings"
  | "notifications"
  | "audit-logs"
  | "help";

export const centers = [
  {
    name: "Kid City USA - Little Harbor",
    region: "Central Florida",
    director: "School Director",
    children: 57,
    capacity: 79,
    staff: 14,
    revenue: "$131.1k",
    compliance: 94,
  },
];

export const classrooms = [
  ["Infant Hive", "Infant", 8, 10, "2:8"],
  ["Toddler Hive", "Toddler", 12, 15, "2:12"],
  ["3's Hive", "3's", 11, 14, "2:11"],
  ["Pre-K Hive", "Pre-K", 14, 18, "2:14"],
  ["Afterschool Hive", "Afterschool", 12, 22, "1:12"],
].map(([name, ageGroup, present, capacity, ratio]) => ({
  name,
  ageGroup,
  present: Number(present),
  capacity: Number(capacity),
  ratio: String(ratio),
}));

export const kpis = [
  { label: "Active children", value: "57", trend: "+4 this month", tone: "emerald" },
  { label: "Enrollment capacity", value: "79", trend: "22 open seats", tone: "sky" },
  { label: "Occupancy", value: "72.2%", trend: "+3.1% vs last month", tone: "amber" },
  { label: "New leads", value: "30", trend: "12 high-fit", tone: "violet" },
  { label: "Tours today", value: "5", trend: "2 need prep", tone: "sky" },
  { label: "Outstanding balances", value: "$18.6k", trend: "Current family balances", tone: "rose" },
  { label: "Staff present", value: "13/14", trend: "Ratios healthy", tone: "emerald" },
  { label: "Incidents to review", value: "5", trend: "3 parent acks", tone: "amber" },
];

export const pipelineStages = [
  ["New Inquiry", 7, "$42k"],
  ["Contacted", 5, "$31k"],
  ["Tour Scheduled", 6, "$38k"],
  ["Tour Completed", 4, "$27k"],
  ["Application Sent", 3, "$21k"],
  ["Documents Pending", 2, "$16k"],
  ["Deposit Pending", 1, "$8k"],
  ["Enrolled", 2, "$15k"],
  ["Waitlisted", 10, "$64k"],
].map(([name, count, value]) => ({ name, count: Number(count), value }));

export const leads = [
  {
    family: "Rivera Family",
    child: "Sofia, 18 months",
    source: "Open house",
    stage: "Tour Scheduled",
    score: 91,
    desiredStart: "Jun 3",
    tags: ["Toddler", "High intent"],
  },
  {
    family: "Patel Family",
    child: "Ari, 4 years",
    source: "Meta lead ad",
    stage: "Application Started",
    score: 84,
    desiredStart: "Aug 19",
    tags: ["Pre-K", "Sibling"],
  },
  {
    family: "Morgan Family",
    child: "Eli, infant",
    source: "Referral",
    stage: "Documents Pending",
    score: 76,
    desiredStart: "Jul 8",
    tags: ["Infant", "Tour done"],
  },
  {
    family: "Nguyen Family",
    child: "Mia, 2 years",
    source: "Website",
    stage: "New Inquiry",
    score: 68,
    desiredStart: "Sep 2",
    tags: ["Toddler", "Needs call"],
  },
];

export const familyProfile = {
  family: "Rivera Family",
  guardians: ["Elena Rivera", "Marco Rivera"],
  children: ["Sofia Rivera", "Lucas Rivera"],
  preferred: "Text + portal",
  billing: "Elena Rivera",
  address: "1848 Garden Lane, Brookford, MA",
  restricted:
    "Custody note restricted to director and authorized admin roles. Do not disclose without verified permission.",
  medical:
    "Sofia has a peanut allergy and carries an emergency action plan. Medication details require authorized role access.",
};

export const messages = [
  {
    from: "Elena Rivera",
    subject: "Tour follow-up and toddler schedule",
    status: "Priority",
    preview: "We loved the Clover room. Could you send the enrollment packet?",
    sentiment: "Warm",
  },
  {
    from: "Toddler Hive",
    subject: "Supplies needed",
    status: "Open",
    preview: "Three children need extra clothes added to cubbies today.",
    sentiment: "Neutral",
  },
  {
    from: "Billing queue",
    subject: "Failed payment outreach",
    status: "Needs review",
    preview: "AI suggestion drafted, human approval required before sending.",
    sentiment: "Sensitive",
  },
];

export const tasks = [
  "Confirm authorized pickup list for Rivera Family",
  "Review incident report for Pre-K Hive",
  "Send application reminder to Patel Family",
  "Update Infant Hive immunization checklist",
  "Prepare Google Calendar tour invite for Thursday",
  "Audit assistant director permissions",
  "Approve AI newsletter draft",
  "Call waitlist families for August toddler seats",
  "Review background check expiration report",
  "Export billing aging snapshot",
  "Schedule emergency drill log review",
  "Finalize white-label parent portal colors",
];

export const analytics = [
  { month: "Jan", leads: 16, tours: 9, enrolled: 4, revenue: 136 },
  { month: "Feb", leads: 20, tours: 11, enrolled: 5, revenue: 142 },
  { month: "Mar", leads: 24, tours: 15, enrolled: 7, revenue: 151 },
  { month: "Apr", leads: 22, tours: 13, enrolled: 6, revenue: 158 },
  { month: "May", leads: 30, tours: 17, enrolled: 8, revenue: 171 },
  { month: "Jun", leads: 28, tours: 16, enrolled: 9, revenue: 183 },
];

export const notifications = [
  "5 parent messages need a response",
  "8 compliance reminders due within 14 days",
  "5 classrooms have 22 total open seats",
  "3 invoices are overdue by more than 10 days",
  "AI suggests reviewing 4 high-priority tours",
  "1 incident report needs director review",
  "2 staff certifications expire this month",
  "Birthday reminders: Amelie and Theo this week",
  "Meta lead ads sync needs credential review",
  "Custom domain verification is pending",
];

export const integrations = [
  ["Payment processor", "Payments, invoices, and payouts", "Configure"],
  ["Twilio", "SMS reminders and emergency alert delivery", "Not connected"],
  ["SendGrid/Mailgun", "Transactional email and campaign delivery", "Not connected"],
  ["Google Calendar", "Tour, closure, and classroom event sync", "Configure"],
  ["Google Business Profile", "Reviews and response management", "Configure"],
  ["Meta Lead Ads", "New inquiry import", "Configure"],
  ["OpenAI", "AI suggestions and summaries", "Configured"],
  ["Zapier/Webhooks", "Connected actions and external triggers", "Configure"],
  ["DocuSign-style signatures", "Form signature capture", "Configure"],
  ["Cloud storage", "Documents and media uploads", "Configure"],
];

export const roleMatrix = [
  ["Platform owner", "All organizations, system settings, activity history, and support tools"],
  ["Brand/franchise admin", "Brand settings, organizations, centers, analytics"],
  ["Regional manager", "Assigned center rollups, staffing, enrollment visibility"],
  ["Center director", "Center operations, families, classrooms, billing, compliance"],
  ["Assistant director", "Authorized school operations, families, classrooms, and staff"],
  ["Teacher", "Classroom roster, daily reports, attendance, parent notes"],
  ["Billing/admin staff", "Accounts, invoices, payments, deposits, billing reports"],
  ["Parent/guardian", "Family information, messages, payments, and documents"],
  ["Authorized pickup", "Pickup verification and kiosk credential access"],
  ["Read-only auditor", "Reports, exports, and recorded activity without editing access"],
];

export const navGroups = [
  {
    title: "Command",
    items: [
      ["Dashboard", "dashboard", LayoutDashboard],
      ["Data readiness", "data-readiness", ClipboardCheck],
      ["Multi-location", "multi-location-dashboard", Building2],
      ["AI Command", "ai-command", Bot],
    ],
  },
  {
    title: "School Day",
    items: [
      ["FTE reports", "fte-reports", ClipboardCheck],
      ["School Operations", "classroom-dashboard", Activity],
    ],
  },
  {
    title: "People",
    items: [
      ["Families & Communication", "family-detail", Users],
      ["Staff & Access", "staff", HeartHandshake],
      ["Billing & Payments", "billing-invoices", BadgeDollarSign],
      ["Records & Compliance", "forms", FileText],
    ],
  },
  {
    title: "Administration",
    items: [
      ["Executive admin", "agency-admin", Building2],
      ["Developer", "developer-dashboard", Code2],
      ["Software invoice", "corporate-billing", CreditCard],
    ],
  },
  {
    title: "Growth",
    items: [
      ["Enrollment CRM", "crm-leads", Users],
      ["Campaigns & Automations", "campaigns", Megaphone],
      ["Insights & Reputation", "analytics", Activity],
    ],
  },
  {
    title: "Utilities",
    items: [
      ["Settings & Setup", "billing-settings", CreditCard],
      ["Terminal store", "terminal-store", CreditCard],
      ["Asset Hub", "asset-hub", FolderOpen],
      ["Audit logs", "audit-logs", ShieldCheck],
      ["Help", "help", BookOpen],
    ],
  },
] as const;

export type ModuleDefinition = {
  slug: ModuleSlug;
  title: string;
  eyebrow: string;
  description: string;
  owner: string;
  metrics: string[];
  features: string[];
  records: string[];
  ai?: string;
  sensitive?: boolean;
};

export const modules: ModuleDefinition[] = [
  {
    slug: "data-readiness",
    title: "Data import review",
    eyebrow: "Prepare school records",
    description:
      "Review imported records, resolve differences, record decisions, and confirm each school before launch.",
    owner: "Center director, assistant director, regional manager, brand admin",
    metrics: ["7 shared statuses", "7 risk priorities", "Append-only decisions", "Separate launch gates"],
    features: ["Prioritized action queue", "Focused review drawers", "Safe low-risk bulk confirmation", "CSV audit export"],
    records: ["Source rows", "Import batches", "Review fingerprints", "Reconciliation evidence"],
    sensitive: true,
  },
  {
    slug: "school-setup",
    title: "School setup",
    eyebrow: "Launch readiness",
    description:
      "Set up classrooms, staff, billing, family access, required records, integrations, and final launch approval.",
    owner: "Center director, assistant director, brand admin",
    metrics: ["15 setup areas", "Director input tracker", "Record readiness", "Launch blockers"],
    features: ["Setup progress by feature area", "Director input capture", "Action links to live modules", "External-data needs panel"],
    records: ["Center profile", "Classrooms", "Staff", "Families", "Tuition", "Forms", "Integrations"],
    sensitive: true,
  },
  {
    slug: "dashboard",
    title: "Operations overview",
    eyebrow: "Current school activity",
    description:
      "Review enrollment, classroom ratios, revenue, family messages, safety follow-ups, and required records.",
    owner: "Center director, regional manager, brand admin",
    metrics: ["57 active children", "72.2% occupancy", "$131k monthly revenue", "5 incidents to review"],
    features: ["Platform, brand, regional, center, teacher, and parent dashboard variants", "AI-generated daily center summary", "Capacity and open-seat visibility by age group", "Staff attendance and ratio snapshot"],
    records: ["KPI cards", "Classroom capacity", "Billing aging", "Compliance reminders"],
    ai: "Suggested only: summarizes priorities and recommends follow-up order.",
  },
  {
    slug: "multi-location-dashboard",
    title: "Multi-location Dashboard",
    eyebrow: "Regional visibility",
    description:
      "Compare enrollment, occupancy, staffing, required records, and revenue across authorized locations.",
    owner: "Brand admin, franchise admin, regional manager",
    metrics: ["1 location", "79 licensed capacity", "14 staff", "94% documentation health"],
    features: ["Center comparison table", "Regional occupancy trend", "At-risk enrollment flags", "Open seat forecast"],
    records: centers.map((center) => `${center.name}: ${center.children}/${center.capacity} children`),
    ai: "Highlights centers with preventable enrollment leakage or expiring staff documentation.",
  },
  {
    slug: "center-dashboard",
    title: "School overview",
    eyebrow: "Today at Kid City USA",
    description:
      "Review children present, tours, staff coverage, messages, birthdays, incidents, and billing alerts.",
    owner: "Center director, assistant director",
    metrics: ["57 active children", "5 tours today", "43 check-ins", "2 late pickup risks"],
    features: ["Today schedule", "Open tasks", "Message response queue", "Licensing reminder lane"],
    records: notifications.slice(0, 6),
    ai: "Drafts the morning summary and highlights items for staff to confirm.",
  },
  {
    slug: "fte-reports",
    title: "FTE Reports",
    eyebrow: "Weekly reporting",
    description:
      "Director weekly full-time-equivalent submissions, executive review, missing-school tracking, corrections, approvals, and CSV export.",
    owner: "Center director, regional manager, brand admin",
    metrics: ["Weekly FTE", "Submitted schools", "Due schools", "Approved corrections"],
    features: ["Director submission form", "Executive rollup", "Current-week tracker", "CSV export"],
    records: ["Week start", "Enrollment", "Full-time", "Part-time", "Age group counts", "Notes"],
    sensitive: true,
  },
  {
    slug: "classroom-dashboard",
    title: "Classroom Dashboard",
    eyebrow: "Teacher workflow",
    description:
      "A fast classroom home base for roster, attendance, meals, naps, diaper/potty logs, activities, supplies, and parent notes.",
    owner: "Teacher, assistant director",
    metrics: ["11 children present", "2 teachers checked in", "4 daily sheets open", "1 supply request"],
    features: ["Touch-friendly child cards", "Meal/nap/bottle/diaper logging", "Incident creation", "Staff-to-admin notes"],
    records: classrooms.slice(0, 4).map((room) => `${room.name}: ${room.ratio} ratio`),
    ai: "Can help word daily notes and incident descriptions, never decide safety outcomes.",
    sensitive: true,
  },
  {
    slug: "crm-leads",
    title: "Enrollment inquiries",
    eyebrow: "Family follow-up",
    description:
      "Track each family’s age-group needs, preferred start date, school interest, and follow-up history.",
    owner: "Enrollment director, center director",
    metrics: ["30 leads", "12 high-fit", "17 tours", "8 applications"],
    features: ["Lead source tracking", "Custom fields", "Follow-up tasks", "Family timeline"],
    records: leads.map((lead) => `${lead.family}: ${lead.stage}, score ${lead.score}`),
    ai: "Lead scores and next-step recommendations are suggestions for enrollment teams.",
  },
  {
    slug: "family-detail",
    title: "Family profile",
    eyebrow: "Family and guardian details",
    description:
      "Review guardians, authorized pickups, emergency contacts, billing contacts, documents, siblings, and recent activity.",
    owner: "Director, assistant director, billing/admin staff",
    metrics: ["2 guardians", "2 children", "4 documents", "1 restricted note"],
    features: ["Guardian profiles", "Communication history", "Document checklist", "Custody note restrictions"],
    records: [familyProfile.address, `Preferred communication: ${familyProfile.preferred}`, `Billing contact: ${familyProfile.billing}`],
    ai: "Produces a family summary for staff handoff after restricted fields are filtered by role.",
    sensitive: true,
  },
  {
    slug: "child-profile",
    title: "Child profile",
    eyebrow: "Care and enrollment details",
    description:
      "Detailed child profile for enrollment, classroom, schedule, allergies, medications, permissions, emergency contacts, and daily history.",
    owner: "Director, teacher, authorized admin",
    metrics: ["Peanut allergy", "2 permissions pending", "10 daily reports", "5 incident records"],
    features: ["Medical and allergy protection", "Photo/video and field trip permissions", "Nap, feeding, potty, developmental notes", "Incident and activity history"],
    records: ["Sofia Rivera, infant", "Classroom: Infant Hive", "Schedule: Mon-Fri 8:00-4:30"],
    ai: "Staff make all final decisions about child safety, medical care, custody, billing, and compliance.",
    sensitive: true,
  },
  {
    slug: "enrollment-pipeline",
    title: "Enrollment Pipeline",
    eyebrow: "Enrollment workflow",
    description:
      "Track families from inquiry through enrollment, waitlist, or closure, with follow-up tasks and reporting.",
    owner: "Enrollment director, regional manager",
    metrics: ["9 stages active", "$262k pipeline", "42% tour conversion", "8 enrolled YTD"],
    features: ["Stage board", "Stage automation hooks", "Deposit/document checkpoints", "Conversion analytics"],
    records: pipelineStages.map((stage) => `${stage.name}: ${stage.count} families`),
    ai: "Recommends stage movement and follow-up wording, never auto-enrolls a child.",
  },
  {
    slug: "waitlist",
    title: "Waitlist Management",
    eyebrow: "Capacity planning",
    description:
      "Age-group waitlist board with desired dates, sibling priority, center preferences, and follow-up tasks.",
    owner: "Enrollment director, center director",
    metrics: ["10 waitlist entries", "4 infant requests", "3 sibling priorities", "2 August openings"],
    features: ["Age group availability", "Classroom assignment planning", "Start date forecasting", "Automated waitlist updates"],
    records: ["Infants: 4 waiting", "Toddlers: 3 waiting", "Preschool: 2 waiting", "Pre-K: 1 waiting"],
  },
  {
    slug: "tours",
    title: "Tours",
    eyebrow: "Tour booking and follow-up",
    description:
      "Tour calendar, preparation checklist, family context, reminders, and post-tour application follow-up workflows.",
    owner: "Enrollment director, center director",
    metrics: ["12 scheduled tours", "5 today", "2 no-show risks", "6 reminders queued"],
    features: ["Tour booking", "Calendar invites", "Tour checklist", "Post-tour follow-up generator"],
    records: ["Rivera Family - Thu 9:30", "Patel Family - Thu 11:00", "Morgan Family - Fri 10:15"],
    ai: "Drafts warm tour follow-up notes using approved templates.",
  },
  {
    slug: "calendar",
    title: "Calendar and Scheduling",
    eyebrow: "Operational calendar",
    description:
      "Tours, child schedules, events, staff schedules, closures, billing due dates, birthdays, trainings, and compliance reminders.",
    owner: "All operational roles",
    metrics: ["5 tours", "2 birthdays", "3 billing due dates", "1 drill reminder"],
    features: ["Google Calendar sync", "Center/classroom filters", "Enrollment start dates", "Staff training events"],
    records: ["Emergency drill log review", "Parent night", "Teacher CPR renewal"],
  },
  {
    slug: "messages",
    title: "Family messages",
    eyebrow: "Conversations and announcements",
    description:
      "Read and send family or staff messages, use approved templates, and filter unread conversations.",
    owner: "Director, teacher, billing/admin staff",
    metrics: ["15 conversations", "5 unread", "3 priority", "2 AI drafts"],
    features: ["Parent/director messages", "Parent/teacher messages", "Broadcast targeting", "Email, SMS, and push delivery settings"],
    records: messages.map((message) => `${message.from}: ${message.subject}`),
    ai: "Reply suggestions are labeled drafts and require staff approval before sending.",
    sensitive: true,
  },
  {
    slug: "announcements",
    title: "Announcements",
    eyebrow: "Center broadcasts",
    description:
      "Create announcements by school, classroom, age group, family status, or custom tag.",
    owner: "Director, brand admin",
    metrics: ["4 drafts", "2 scheduled", "89% read rate", "1 urgent template"],
    features: ["Classroom targeting", "Emergency alert workflow", "Read receipt tracking", "Template library"],
    records: ["Spring picture day", "Weather closure reminder", "Policy acknowledgment due"],
  },
  {
    slug: "campaigns",
    title: "Marketing Campaigns",
    eyebrow: "Enrollment growth",
    description:
      "Childcare-specific email campaigns, nurture sequences, tour reminders, open houses, newsletters, review requests, and lost lead reactivation.",
    owner: "Brand admin, enrollment director",
    metrics: ["6 campaigns", "42% open rate", "18% click rate", "11 applications influenced"],
    features: ["Campaign templates", "Email builder", "SMS channel setup", "Audience filters by stage/tag/classroom"],
    records: ["New inquiry follow-up", "Tour confirmation", "Waitlist update", "Parent newsletter", "Review request"],
    ai: "Produces campaign drafts that staff approve before sending.",
  },
  {
    slug: "automations",
    title: "Workflow Builder",
    eyebrow: "Trigger, condition, action",
    description:
      "Automation builder with triggers, conditions, actions, delays, execution logs, and childcare workflow templates.",
    owner: "Brand admin, operations admin",
    metrics: ["5 active workflows", "28 runs", "2 paused", "1 failed run"],
    features: ["New inquiry trigger", "Missing document reminders", "Overdue invoice tasks", "Parent message notifications"],
    records: ["Tour scheduled -> send reminder", "Missing document -> create task", "Incident created -> notify director"],
    ai: "Recommends workflows but does not enable sensitive automations without admin approval.",
  },
  {
    slug: "forms",
    title: "Forms",
    eyebrow: "Digital forms",
    description:
      "Inquiry, tour request, enrollment application, emergency contact, medical/allergy, authorized pickup, permission, and staff onboarding forms.",
    owner: "Director, enrollment admin, platform admin",
    metrics: ["9 form types", "18 submissions", "7 signatures pending", "5 expirations"],
    features: ["Custom form builder", "Signature capture", "Required checklist", "Submission status tracking"],
    records: ["Enrollment application", "Photo/video permission", "Medication authorization"],
    sensitive: true,
  },
  {
    slug: "documents",
    title: "Documents",
    eyebrow: "Secure file workflow",
    description:
      "Family, child, enrollment, compliance, billing, and staff documents with uploads and expiration reminders.",
    owner: "Director, admin staff, auditor",
    metrics: ["112 documents", "8 expiring", "4 missing", "3 restricted"],
    features: ["File upload", "Document checklist", "Expiration reminders", "Access-controlled visibility"],
    records: ["Immunization record", "Policy acknowledgment", "Staff certification PDF"],
    sensitive: true,
  },
  {
    slug: "attendance",
    title: "Attendance and Check-In/Out",
    eyebrow: "Kiosk-ready workflow",
    description:
      "Child and staff check-in/out logs, QR/PIN credentials, signature capture, absences, late pickup flags, and ratio snapshots.",
    owner: "Teacher, director, authorized pickup",
    metrics: ["43 checked in", "14 absent/scheduled off", "2 late pickup flags", "0 ratio warnings"],
    features: ["Authorized pickup verification", "Signature capture", "QR/PIN check-in", "Attendance reports"],
    records: ["Sofia Rivera checked in 8:12", "Theo Martin absent: sick day", "Staff clock-in 7:45"],
    sensitive: true,
  },
  {
    slug: "daily-reports",
    title: "Daily Reports",
    eyebrow: "Parent trust loop",
    description:
      "Daily sheets for meals, bottles, naps, diapers/potty, activities, mood, notes, photos, supplies, and reminders.",
    owner: "Teacher, parent/guardian",
    metrics: ["10 reports", "4 in progress", "6 sent", "2 need supplies"],
    features: ["Meals and bottles", "Nap tracking", "Activities and mood", "Teacher notes and photos"],
    records: ["Sofia: cheerful, 1 nap, lunch finished", "Ari: needs extra clothes", "Mia: potty progress note"],
    ai: "Can polish parent-facing notes while preserving teacher intent.",
  },
  {
    slug: "parent-media-review",
    title: "Parent Media Review",
    eyebrow: "Permission-aware photo sharing",
    description:
      "Director review queue for teacher-uploaded photos that require human permission confirmation before parent portal sharing.",
    owner: "Director, assistant director, regional manager",
    metrics: ["Permission review queue", "Signed private media previews", "Parent visibility decision", "Audit trail"],
    features: ["Private photo and video storage", "Photo/video permission confirmation", "Approve or reject sharing", "Teacher notification after review"],
    records: ["Classroom photo held for review", "Director approval with permission update", "Rejected sharing kept internal"],
    sensitive: true,
  },
  {
    slug: "incident-reports",
    title: "Incident Reports",
    eyebrow: "Review and acknowledgment",
    description:
      "Incident creation, child involved, classroom, staff, type, description, action taken, parent notified, review status, and follow-up tasks.",
    owner: "Teacher, director, parent/guardian",
    metrics: ["5 incidents", "3 parent acknowledgments", "1 admin review", "2 follow-ups"],
    features: ["Photo attachments", "Parent acknowledgment", "Incident history by child", "Restricted visibility"],
    records: ["Playground bump - reviewed", "Allergy exposure concern - director review", "Trip/fall - parent notified"],
    ai: "Helps phrase objective descriptions, never determines liability, medical care, or compliance status.",
    sensitive: true,
  },
  {
    slug: "staff",
    title: "Teacher Staff Operations",
    eyebrow: "Team and ratios",
    description:
      "Teacher directory, classroom assignments, schedules, certifications, background checks, training, documents, tasks, PTO, and notes.",
    owner: "Director, assistant director, regional manager",
    metrics: ["20 staff", "18 present", "3 certifications expiring", "0 ratio warnings"],
    features: ["Roles and permissions", "Assigned centers/classrooms", "Time clock", "Training records"],
    records: ["Amara Lewis - Director", "Jon Bell - Infant teacher", "Priya Shah - Billing admin"],
    sensitive: true,
  },
  {
    slug: "billing-invoices",
    title: "Billing and Invoices",
    eyebrow: "Revenue operations",
    description:
      "Family accounts, tuition plans, fees, deposits, recurring tuition, discounts, subsidy tracking, invoices, and reports.",
    owner: "Billing/admin staff, director",
    metrics: ["20 invoices", "$18.6k outstanding", "$4.2k deposits", "3 failed payments"],
    features: ["Tuition plans", "Products and one-time charges", "Registration fees", "Bee Suite-branded checkout integration"],
    records: ["Rivera invoice #1042 - due", "Patel deposit - paid", "Morgan subsidy - pending"],
    sensitive: true,
  },
  {
    slug: "terminal-store",
    title: "Terminal Store",
    eyebrow: "Hardware purchasing",
    description:
      "Director and executive storefront for card readers, docks, hubs, cases, and mounts purchased through The BEE Suite platform account.",
    owner: "Center director, assistant director, executive team",
    metrics: ["20% Bee Suite markup", "Platform checkout", "Shipping collected", "Processor receipt"],
    features: ["Hardware catalog for authorized users", "Quantity-based cart", "Bee Suite-branded hosted checkout", "Audit trail for created purchases"],
    records: ["Terminal catalog", "Checkout session", "Purchaser metadata", "School association"],
    sensitive: true,
  },
  {
    slug: "asset-hub",
    title: "Corporate Asset Hub",
    eyebrow: "Brand resources",
    description: "Search, preview, and download approved social media, brand, training, and school resources.",
    owner: "Executive team and school directors",
    metrics: ["Private corporate library", "Fast search", "Common file formats", "Secure downloads"],
    features: ["Executive multi-file uploads", "Category and type filters", "Grid and list views", "Director downloads"],
    records: ["Social media graphics", "Brand files", "Flyers", "Training documents"],
  },
  {
    slug: "corporate-billing",
    title: "Software Invoice",
    eyebrow: "Corporate billing",
    description:
      "Kid City USA Enterprises monthly software fee view for The BEE Suite access, billed at a fixed amount per active school.",
    owner: "Kid City USA accounting, platform owner, brand admin",
    metrics: ["$99 per active school", "Monthly subscription", "School-authorized payment", "Audit logged"],
    features: ["Current invoice preview", "Active school-user count", "Bee Suite-branded hosted invoice link", "Corporate billing audit trail"],
    records: ["Kid City USA Enterprises monthly software access invoice"],
    sensitive: true,
  },
  {
    slug: "payments",
    title: "Payments",
    eyebrow: "Checkout and payouts",
    description:
      "Payment method management, checkout readiness, failed payment follow-up, payout status, and reconciliation support.",
    owner: "Billing/admin staff, parent/guardian",
    metrics: ["Payout readiness", "3 failed payments", "12 saved methods", "8 autopay plans"],
    features: ["Payment method management", "Failed payment workflow", "Payout account status", "Payment audit trail"],
    records: ["Visa ending 4242", "ACH account", "Payout onboarding status"],
    sensitive: true,
  },
  {
    slug: "compliance",
    title: "Licensing and compliance",
    eyebrow: "Required records",
    description:
      "Track licensing checklists, certifications, immunizations, drills, incidents, medication logs, allergy lists, and required reports.",
    owner: "Director, regional manager, auditor",
    metrics: ["92% documentation health", "8 reminders", "2 staff expirations", "1 drill due"],
    features: ["Licensing checklist", "Emergency drill logs", "Expiring document reminders", "Audit trail"],
    records: ["Immunization tracking", "Medication logs", "Export-ready reports"],
    sensitive: true,
  },
  {
    slug: "reputation",
    title: "Reputation and Reviews",
    eyebrow: "Family satisfaction",
    description:
      "Review request campaigns, satisfaction surveys, NPS collection, AI review response generator, testimonials, and Google Business setup.",
    owner: "Brand admin, director",
    metrics: ["4.8 avg rating", "12 testimonials", "5 surveys open", "3 review drafts"],
    features: ["Review request campaigns", "Testimonial approvals", "Survey collection", "Google Business Profile setup"],
    records: ["Tour family review request", "Parent newsletter survey", "Approved testimonial library"],
    ai: "Produces response drafts that staff approve before publishing.",
  },
  {
    slug: "analytics",
    title: "Reports and analytics",
    eyebrow: "School performance",
    description:
      "Enrollment funnel, lead sources, tour conversion, occupancy, revenue, balances, attendance, ratios, response time, incidents, compliance, campaigns, reviews, and AI insights.",
    owner: "Brand admin, regional manager, director",
    metrics: ["42% tour conversion", "72.2% occupancy", "2.1h avg response", "8 enrolled this month"],
    features: ["Charts and KPI cards", "Trend indicators", "Center filters", "CSV/PDF exports"],
    records: ["Enrollment funnel", "Capacity utilization", "Incident trends", "Campaign performance"],
    ai: "Explains trends and flags opportunities without replacing operator judgment.",
  },
  {
    slug: "ai-command",
    title: "AI assistant",
    eyebrow: "AI assistance",
    description:
      "Draft summaries, replies, announcements, campaign copy, follow-up suggestions, incident wording, and review responses with AI assistance.",
    owner: "Authorized staff",
    metrics: ["14 suggestions", "9 awaiting review", "0 auto-decisions", "100% labeled drafts"],
    features: ["AI service setup", "Uses only information the signed-in user can view", "Staff confirmation for sensitive drafts", "AI use guidance"],
    records: ["Daily center summary", "Tour follow-up generator", "Incident wording assistant", "Review response draft"],
    ai: "AI does not make final safety, medical, legal, custody, billing, or compliance decisions.",
    sensitive: true,
  },
  {
    slug: "parent-portal",
    title: "Parent Portal",
    eyebrow: "Family account",
    description:
      "Family dashboard, child profile, daily reports, messages, announcements, calendar, invoices, documents, incident acknowledgments, authorized pickups, emergency contact requests, and preferences.",
    owner: "Parent/guardian",
    metrics: ["2 children", "1 invoice due", "3 unread updates", "1 form pending"],
    features: ["Daily reports", "Billing and documents", "Messages", "Emergency contact change request flow"],
    records: ["Today: lunch finished, nap 12:30-1:45", "Invoice due May 15", "Picture day announcement"],
    sensitive: true,
  },
  {
    slug: "teacher-portal",
    title: "Teacher portal",
    eyebrow: "Classroom quick actions",
    description:
      "Mobile-first teacher workflow for attendance, child cards, logs, notes, incident creation, supply requests, and parent updates.",
    owner: "Teacher",
    metrics: ["11 present", "4 sheets open", "1 incident draft", "2 parent notes"],
    features: ["Large touch targets", "Quick log buttons", "Roster filter", "Offline queue for classroom logs"],
    records: ["Check in/out", "Meal", "Nap", "Diaper/potty", "Activity", "Incident"],
    sensitive: true,
  },
  {
    slug: "agency-admin",
    title: "Executive administration",
    eyebrow: "Organizations and locations",
    description:
      "Manage organizations, owner groups, locations, authorized users, subscriptions, reports, settings, activity history, and support access.",
    owner: "Platform owner, brand/franchise admin",
    metrics: ["1 brand", "Live centers", "10 roles", "Audit logged"],
    features: ["Location lifecycle", "Owner group containers", "User and password controls", "Impersonation audit warning"],
    records: ["Kid City USA Enterprises", "Kid City USA - Little Harbor", "Feature flag: Kiosk preview"],
    sensitive: true,
  },
  {
    slug: "white-label",
    title: "Brand settings",
    eyebrow: "Appearance and identity",
    description:
      "Brand name, logo, favicon, primary/accent colors, theme mode, sender, custom domain, parent portal branding, legal footer, and terms/privacy links.",
    owner: "Brand admin, platform owner",
    metrics: ["3 brand surfaces", "2 theme modes", "1 custom domain request", "4 notification templates"],
    features: ["Logo upload", "Color controls", "Custom domain setup", "Login and parent portal branding"],
    records: ["Brand: Kid City USA Enterprises", "Primary: Honey Gold", "Domain: portal.schoolbrand.com"],
  },
  {
    slug: "team-permissions",
    title: "Users and access",
    eyebrow: "Accounts and permissions",
    description:
      "Manage user accounts, roles, permissions, school and classroom assignments, family access, pickup roles, and read-only reviewers.",
    owner: "Platform owner, brand admin, director",
    metrics: ["10 roles", "54 permissions", "20 staff users", "50 family users"],
    features: ["Access matrix", "Sensitive field visibility", "Activity history", "Authorized support access"],
    records: roleMatrix.map((role) => `${role[0]}: ${role[1]}`),
    sensitive: true,
  },
  {
    slug: "integrations",
    title: "Integrations",
    eyebrow: "Credential setup",
    description:
      "Connect payments, SMS, email, calendars, reviews, lead ads, AI tools, signatures, and file storage.",
    owner: "Platform owner, brand admin",
    metrics: ["10 integration records", "Credential review", "Connection status", "Setup tasks"],
    features: ["Setup instructions", "Connection status", "Webhook configuration", "School connection settings"],
    records: integrations.map((integration) => `${integration[0]}: ${integration[2]}`),
  },
  {
    slug: "billing-settings",
    title: "Billing Settings",
    eyebrow: "Plan and account setup",
    description:
      "Set software plans, family billing defaults, products, tuition, discounts, taxes, subsidies, and payment settings.",
    owner: "Platform owner, billing/admin staff",
    metrics: ["3 plan models", "6 tuition plans", "4 products/fees", "2 discounts"],
    features: ["Subscription settings", "Tuition plan settings", "Payment processor configuration", "Billing policy notes"],
    records: ["Infant full-time tuition", "Registration fee", "Sibling discount", "Agency subsidy"],
    sensitive: true,
  },
  {
    slug: "notifications",
    title: "Notifications",
    eyebrow: "Items that need attention",
    description:
      "Parent messages, enrollment alerts, tours, billing, compliance, incidents, staff certification reminders, capacity warnings, AI actions, and system alerts.",
    owner: "Users with access to each notification type",
    metrics: ["10 notifications", "4 high priority", "3 due today", "2 AI recommended"],
    features: ["Priority filters", "Notifications open the appropriate page", "Action buttons", "System alerts"],
    records: notifications,
    ai: "AI suggestions are labeled, and staff choose whether to act on them.",
  },
  {
    slug: "audit-logs",
    title: "Activity history",
    eyebrow: "Recorded account activity",
    description:
      "Audit trail for permission changes, restricted child data access, billing changes, incident reviews, impersonation, document updates, and integration events.",
    owner: "Platform owner, auditor, director",
    metrics: ["248 events", "12 sensitive reads", "4 billing changes", "1 impersonation test"],
    features: ["Actor/action/resource", "Before/after metadata", "Export-ready reports", "Retention policy notes"],
    records: ["Director viewed custody note", "Billing admin updated invoice", "Teacher submitted incident report"],
    sensitive: true,
  },
  {
    slug: "help",
    title: "Help and guides",
    eyebrow: "Instructions and support",
    description:
      "Find instructions for setup, school operations, teacher and parent access, billing, enrollment, automation, AI tools, branding, and integrations.",
    owner: "All users",
    metrics: ["10 guides", "18 FAQs", "4 setup checklists", "Support workflow"],
    features: ["Role-specific guides", "Launch checklist", "Integration setup guide", "Required-record guidance"],
    records: ["Director guide", "Teacher guide", "AI assistant guidance", "Account setup"],
  },
];

export function getModule(slug: string) {
  return modules.find((module) => module.slug === slug);
}
