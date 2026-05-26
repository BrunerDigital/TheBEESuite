import {
  Activity,
  BadgeDollarSign,
  Bell,
  BookOpen,
  Bot,
  Building2,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileText,
  HeartHandshake,
  Home,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Workflow,
} from "lucide-react";

export type ModuleSlug =
  | "login"
  | "forgot-password"
  | "onboarding"
  | "dashboard"
  | "multi-location-dashboard"
  | "center-dashboard"
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
  | "compliance"
  | "reputation"
  | "analytics"
  | "ai-command"
  | "parent-portal"
  | "teacher-portal"
  | "agency-admin"
  | "white-label"
  | "team-permissions"
  | "integrations"
  | "billing-settings"
  | "notifications"
  | "audit-logs"
  | "help";

export const centers = [
  {
    name: "Kid City USA",
    region: "North Metro",
    director: "Amara Lewis",
    children: 31,
    capacity: 40,
    staff: 8,
    revenue: "$71.4k",
    compliance: 92,
  },
  {
    name: "Kid City USA",
    region: "West Valley",
    director: "Mateo Chen",
    children: 24,
    capacity: 34,
    staff: 6,
    revenue: "$55.8k",
    compliance: 88,
  },
  {
    name: "Kid City USA",
    region: "South Ridge",
    director: "Nadia Brooks",
    children: 20,
    capacity: 32,
    staff: 6,
    revenue: "$43.9k",
    compliance: 95,
  },
];

export const classrooms = [
  ["Infant Nest", "Infants", 8, 10, "2:8"],
  ["Clover Crawlers", "Infants", 7, 8, "2:7"],
  ["Wiggle Room", "Toddlers", 11, 12, "2:11"],
  ["Acorn Toddlers", "Toddlers", 10, 12, "2:10"],
  ["Sunflower Pre-K", "Preschool", 15, 18, "2:15"],
  ["Maple Studio", "Preschool", 13, 16, "2:13"],
  ["Willow Room", "Pre-K", 7, 10, "1:7"],
  ["Discovery Lab", "Pre-K", 4, 8, "1:4"],
].map(([name, ageGroup, present, capacity, ratio]) => ({
  name,
  ageGroup,
  present: Number(present),
  capacity: Number(capacity),
  ratio: String(ratio),
}));

export const kpis = [
  { label: "Active children", value: "75", trend: "+6 this month", tone: "emerald" },
  { label: "Enrollment capacity", value: "106", trend: "31 open seats", tone: "sky" },
  { label: "Occupancy", value: "70.8%", trend: "+4.2% vs last month", tone: "amber" },
  { label: "New leads", value: "30", trend: "12 high-fit", tone: "violet" },
  { label: "Tours today", value: "5", trend: "2 need prep", tone: "sky" },
  { label: "Outstanding balances", value: "$18.6k", trend: "8 overdue", tone: "rose" },
  { label: "Staff present", value: "18/20", trend: "Ratios healthy", tone: "emerald" },
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
    from: "Willow Room",
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
  "Review incident report for Maple Studio",
  "Send application reminder to Patel Family",
  "Update Infant Nest immunization checklist",
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
  "2 classrooms are within one child of capacity",
  "3 invoices are overdue by more than 10 days",
  "AI recommends prioritizing 4 high-fit tours",
  "1 incident report needs director review",
  "2 staff certifications expire this month",
  "Birthday reminders: Amelie and Theo this week",
  "Meta lead ads sync placeholder is disconnected",
  "White-label domain verification is pending",
];

export const integrations = [
  ["Stripe", "Mock billing and payment intent structure", "Placeholder"],
  ["Twilio", "SMS reminders and emergency alert placeholder", "Not connected"],
  ["SendGrid/Mailgun", "Transactional email and campaign delivery", "Not connected"],
  ["Google Calendar", "Tour and classroom event sync", "Mock connected"],
  ["Google Business Profile", "Review source and response workflow", "Placeholder"],
  ["Meta Lead Ads", "Inquiry source ingestion", "Placeholder"],
  ["OpenAI", "AI suggestions and summaries", "Env-ready mock"],
  ["Zapier/Webhooks", "Workflow actions and external triggers", "Placeholder"],
  ["DocuSign-style signatures", "Form signature capture", "Placeholder"],
  ["Cloud storage", "Documents and media uploads", "Placeholder"],
];

export const roleMatrix = [
  ["Platform owner", "All tenants, feature flags, audit logs, support tools"],
  ["Brand/franchise admin", "Brand settings, organizations, centers, analytics"],
  ["Regional manager", "Assigned center rollups, staffing, enrollment visibility"],
  ["Center director", "Center operations, families, classrooms, billing, compliance"],
  ["Assistant director", "Operational workflows with restricted sensitive access"],
  ["Teacher", "Classroom roster, daily reports, attendance, parent notes"],
  ["Billing/admin staff", "Accounts, invoices, payments, deposits, billing reports"],
  ["Parent/guardian", "Own family portal, messages, invoices, documents"],
  ["Authorized pickup", "Pickup verification placeholder only"],
  ["Read-only auditor", "Export/report views and audit-safe evidence"],
];

export const navGroups = [
  {
    title: "Command",
    items: [
      ["Dashboard", "dashboard", LayoutDashboard],
      ["Multi-location", "multi-location-dashboard", Building2],
      ["Notifications", "notifications", Bell],
      ["AI Command", "ai-command", Bot],
    ],
  },
  {
    title: "Enrollment CRM",
    items: [
      ["CRM leads", "crm-leads", Users],
      ["Pipeline", "enrollment-pipeline", Workflow],
      ["Tours", "tours", CalendarDays],
      ["Waitlist", "waitlist", ClipboardCheck],
      ["Campaigns", "campaigns", Megaphone],
      ["Automations", "automations", Workflow],
    ],
  },
  {
    title: "Operations",
    items: [
      ["Center dashboard", "center-dashboard", Home],
      ["Classroom", "classroom-dashboard", Activity],
      ["Attendance", "attendance", ClipboardCheck],
      ["Daily reports", "daily-reports", BookOpen],
      ["Incidents", "incident-reports", ShieldCheck],
      ["Teachers", "staff", HeartHandshake],
    ],
  },
  {
    title: "Families",
    items: [
      ["Family detail", "family-detail", Users],
      ["Child profile", "child-profile", HeartHandshake],
      ["Messages", "messages", MessageSquare],
      ["Media review", "parent-media-review", ImageIcon],
      ["Parent portal", "parent-portal", Inbox],
      ["Teacher portal", "teacher-portal", Activity],
    ],
  },
  {
    title: "Business",
    items: [
      ["Billing & invoices", "billing-invoices", BadgeDollarSign],
      ["Payments", "payments", CreditCard],
      ["Forms", "forms", FileText],
      ["Documents", "documents", FileText],
      ["Compliance", "compliance", ShieldCheck],
      ["Analytics", "analytics", Activity],
      ["Reputation", "reputation", Star],
    ],
  },
  {
    title: "Platform",
    items: [
      ["Executive admin", "agency-admin", Building2],
      ["White-label", "white-label", Sparkles],
      ["Team permissions", "team-permissions", Users],
      ["Integrations", "integrations", Workflow],
      ["Settings", "billing-settings", CreditCard],
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
    slug: "dashboard",
    title: "Executive Dashboard",
    eyebrow: "Daily command center",
    description:
      "A role-aware operating view for enrollment, ratios, revenue, parent response, safety review, and compliance-ready reminders.",
    owner: "Center director, regional manager, brand admin",
    metrics: ["75 active children", "70.8% occupancy", "$171k monthly revenue", "5 incidents to review"],
    features: ["Platform, brand, regional, center, teacher, and parent dashboard variants", "AI-generated daily center summary", "Capacity and open-seat visibility by age group", "Staff attendance and ratio snapshot"],
    records: ["KPI cards", "Classroom capacity", "Billing aging", "Compliance reminders"],
    ai: "Suggested only: summarizes priorities and recommends follow-up order.",
  },
  {
    slug: "multi-location-dashboard",
    title: "Multi-location Dashboard",
    eyebrow: "Regional visibility",
    description:
      "Roll up enrollment, occupancy, staffing, compliance reminders, and revenue trends across every owned center.",
    owner: "Brand admin, franchise admin, regional manager",
    metrics: ["3 centers", "106 licensed capacity", "20 staff", "91.7% documentation health"],
    features: ["Center comparison table", "Regional occupancy trend", "At-risk enrollment flags", "Open seat forecast"],
    records: centers.map((center) => `${center.name}: ${center.children}/${center.capacity} children`),
    ai: "Highlights centers with preventable enrollment leakage or expiring staff documentation.",
  },
  {
    slug: "center-dashboard",
    title: "Center Dashboard",
    eyebrow: "Today at Kid City USA",
    description:
      "Director-facing view of current children, tours, check-ins, staff coverage, messages, birthdays, incidents, and billing alerts.",
    owner: "Center director, assistant director",
    metrics: ["31 active children", "5 tours today", "18 check-ins", "2 late pickup risks"],
    features: ["Today schedule", "Open tasks", "Message response queue", "Licensing reminder lane"],
    records: notifications.slice(0, 6),
    ai: "Drafts the morning summary and flags workflow bottlenecks for human review.",
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
    title: "Childcare CRM Leads",
    eyebrow: "Inquiry lifecycle",
    description:
      "Childcare-specific lead tracking with age group interest, desired start, center interest, tags, scoring, and follow-up history.",
    owner: "Enrollment director, center director",
    metrics: ["30 leads", "12 high-fit", "17 tours", "8 applications"],
    features: ["Lead source tracking", "Custom fields", "Follow-up tasks", "Family timeline"],
    records: leads.map((lead) => `${lead.family}: ${lead.stage}, score ${lead.score}`),
    ai: "Lead scores and next-step recommendations are suggestions for enrollment teams.",
  },
  {
    slug: "family-detail",
    title: "Family / Contact Detail",
    eyebrow: "Family relationship record",
    description:
      "Unified family profile with guardians, authorized pickups, emergency contacts, billing contact, documents, siblings, and timeline.",
    owner: "Director, assistant director, billing/admin staff",
    metrics: ["2 guardians", "2 children", "4 documents", "1 restricted note"],
    features: ["Guardian profiles", "Communication history", "Document checklist", "Custody note restrictions"],
    records: [familyProfile.address, `Preferred communication: ${familyProfile.preferred}`, `Billing contact: ${familyProfile.billing}`],
    ai: "Produces a family summary for staff handoff after restricted fields are filtered by role.",
    sensitive: true,
  },
  {
    slug: "child-profile",
    title: "Child Profile Detail",
    eyebrow: "Safety-first child record",
    description:
      "Detailed child profile for enrollment, classroom, schedule, allergies, medications, permissions, emergency contacts, and daily history.",
    owner: "Director, teacher, authorized admin",
    metrics: ["Peanut allergy", "2 permissions pending", "10 daily reports", "5 incident records"],
    features: ["Medical and allergy protection", "Photo/video and field trip permissions", "Nap, feeding, potty, developmental notes", "Incident and activity history"],
    records: ["Sofia Rivera, 18 months", "Classroom: Clover Crawlers", "Schedule: Mon-Fri 8:00-4:30"],
    ai: "Sensitive child, medical, custody, billing, and compliance suggestions require human review.",
    sensitive: true,
  },
  {
    slug: "enrollment-pipeline",
    title: "Enrollment Pipeline",
    eyebrow: "Drag-and-drop foundation",
    description:
      "Opportunity-style pipeline for inquiry through enrolled, waitlisted, or lost, with stage tasks and conversion reporting.",
    owner: "Enrollment director, regional manager",
    metrics: ["9 stages active", "$262k pipeline", "42% tour conversion", "8 enrolled YTD"],
    features: ["Drag-and-drop board foundation", "Stage automation hooks", "Deposit/document checkpoints", "Conversion analytics"],
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
    features: ["Tour booking", "Calendar invite placeholder", "Tour checklist", "Post-tour follow-up generator"],
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
    features: ["Google Calendar mock integration", "Center/classroom filters", "Enrollment start dates", "Staff training events"],
    records: ["Emergency drill log review", "Parent night", "Teacher CPR renewal"],
  },
  {
    slug: "messages",
    title: "Parent Messaging Inbox",
    eyebrow: "Communication center",
    description:
      "Unified family and internal messaging with announcements, templates, unread filters, AI suggestions, and sentiment placeholders.",
    owner: "Director, teacher, billing/admin staff",
    metrics: ["15 conversations", "5 unread", "3 priority", "2 AI drafts"],
    features: ["Parent/director messages", "Parent/teacher messages", "Broadcast targeting", "Email, SMS, and push placeholders"],
    records: messages.map((message) => `${message.from}: ${message.subject}`),
    ai: "Reply suggestions are labeled drafts and require staff approval before sending.",
    sensitive: true,
  },
  {
    slug: "announcements",
    title: "Announcements",
    eyebrow: "Center broadcasts",
    description:
      "Warm, professional announcements by center, classroom, age group, family status, or custom tag.",
    owner: "Director, brand admin",
    metrics: ["4 drafts", "2 scheduled", "89% read rate", "1 urgent template"],
    features: ["Classroom targeting", "Emergency alert placeholder", "Read receipts placeholder", "Template library"],
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
    features: ["Campaign templates", "Email builder foundation", "SMS placeholder", "Audience filters by stage/tag/classroom"],
    records: ["New inquiry follow-up", "Tour confirmation", "Waitlist update", "Parent newsletter", "Review request"],
    ai: "Generates campaign copy for human review and brand approval.",
  },
  {
    slug: "automations",
    title: "Workflow Builder",
    eyebrow: "Trigger, condition, action",
    description:
      "Automation foundation with triggers, conditions, actions, delays, execution logs, and childcare workflow templates.",
    owner: "Brand admin, operations admin",
    metrics: ["5 active workflows", "28 runs", "2 paused", "1 failed mock run"],
    features: ["New inquiry trigger", "Missing document reminders", "Overdue invoice tasks", "Parent message notifications"],
    records: ["Tour scheduled -> send reminder", "Missing document -> create task", "Incident created -> notify director"],
    ai: "Recommends workflows but does not enable sensitive automations without admin approval.",
  },
  {
    slug: "forms",
    title: "Forms",
    eyebrow: "Digital forms foundation",
    description:
      "Inquiry, tour request, enrollment application, emergency contact, medical/allergy, authorized pickup, permission, and staff onboarding forms.",
    owner: "Director, enrollment admin, platform admin",
    metrics: ["9 form types", "18 submissions", "7 signatures pending", "5 expirations"],
    features: ["Custom form builder foundation", "Signature placeholder", "Required checklist", "Submission status tracking"],
    records: ["Enrollment application", "Photo/video permission", "Medication authorization placeholder"],
    sensitive: true,
  },
  {
    slug: "documents",
    title: "Documents",
    eyebrow: "Secure file workflow",
    description:
      "Family, child, enrollment, compliance, billing, and staff documents with upload placeholders and expiration reminders.",
    owner: "Director, admin staff, auditor",
    metrics: ["112 documents", "8 expiring", "4 missing", "3 restricted"],
    features: ["Upload placeholder", "Document checklist", "Expiration reminders", "Role-aware visibility"],
    records: ["Immunization record placeholder", "Policy acknowledgment", "Staff certification PDF"],
    sensitive: true,
  },
  {
    slug: "attendance",
    title: "Attendance and Check-In/Out",
    eyebrow: "Kiosk-ready foundation",
    description:
      "Child and staff check-in/out logs, QR/PIN placeholders, signature capture, absences, late pickup flags, and ratio snapshots.",
    owner: "Teacher, director, authorized pickup",
    metrics: ["58 checked in", "17 absent/scheduled off", "2 late pickup flags", "0 ratio warnings"],
    features: ["Authorized pickup verification placeholder", "Signature capture placeholder", "QR/PIN check-in placeholder", "Attendance reports"],
    records: ["Sofia Rivera checked in 8:12", "Theo Martin absent: sick day", "Staff clock-in 7:45"],
    sensitive: true,
  },
  {
    slug: "daily-reports",
    title: "Daily Reports",
    eyebrow: "Parent trust loop",
    description:
      "Daily sheets for meals, bottles, naps, diapers/potty, activities, mood, notes, photos placeholder, supplies, and reminders.",
    owner: "Teacher, parent/guardian",
    metrics: ["10 demo reports", "4 in progress", "6 sent", "2 need supplies"],
    features: ["Meals and bottles", "Nap tracking", "Activities and mood", "Teacher notes and photo placeholder"],
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
    features: ["Private Supabase Storage media", "Photo/video permission confirmation", "Approve or reject sharing", "Teacher notification after review"],
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
    features: ["Photo attachment placeholder", "Parent acknowledgment placeholder", "Incident history by child", "Restricted visibility"],
    records: ["Playground bump - reviewed", "Allergy exposure concern - director review", "Trip/fall - parent notified"],
    ai: "Helps phrase objective descriptions, never determines liability, medical care, or compliance status.",
    sensitive: true,
  },
  {
    slug: "staff",
    title: "Teacher Staff Operations",
    eyebrow: "Team and ratios",
    description:
      "Teacher directory, classroom assignments, schedules, certifications, background check placeholders, training, documents, tasks, PTO, and notes.",
    owner: "Director, assistant director, regional manager",
    metrics: ["20 staff", "18 present", "3 certifications expiring", "0 ratio warnings"],
    features: ["Roles and permissions", "Assigned centers/classrooms", "Time clock placeholder", "Training records"],
    records: ["Amara Lewis - Director", "Jon Bell - Infant teacher", "Priya Shah - Billing admin"],
    sensitive: true,
  },
  {
    slug: "billing-invoices",
    title: "Billing and Invoices",
    eyebrow: "Revenue operations",
    description:
      "Family accounts, tuition plans, fees, deposits, recurring tuition placeholder, discounts, subsidy placeholders, invoices, and reports.",
    owner: "Billing/admin staff, director",
    metrics: ["20 invoices", "$18.6k outstanding", "$4.2k deposits", "3 failed mock payments"],
    features: ["Tuition plans", "Products and one-time charges", "Registration fees", "Stripe mock integration"],
    records: ["Rivera invoice #1042 - due", "Patel deposit - paid", "Morgan subsidy placeholder - pending"],
    sensitive: true,
  },
  {
    slug: "payments",
    title: "Payments Placeholder",
    eyebrow: "Mock only",
    description:
      "Payment method and payment status foundation for future Stripe integration. This v1 does not process real payments.",
    owner: "Billing/admin staff, parent/guardian",
    metrics: ["0 live processors", "3 mock failures", "12 saved method placeholders", "8 autopay placeholders"],
    features: ["Payment method placeholder", "Failed payment placeholder", "Stripe configuration shell", "Payment audit trail"],
    records: ["Mock Visa ending 4242", "ACH placeholder", "No real payment processing enabled"],
    sensitive: true,
  },
  {
    slug: "compliance",
    title: "Compliance-Readiness",
    eyebrow: "Documentation support",
    description:
      "Compliance-ready workflows for licensing checklist placeholders, certifications, immunizations, drills, incidents, medication logs, allergy lists, audit trails, and export-ready reports.",
    owner: "Director, regional manager, auditor",
    metrics: ["92% documentation health", "8 reminders", "2 staff expirations", "1 drill due"],
    features: ["Licensing checklist placeholder", "Emergency drill logs", "Expiring document reminders", "Audit trail"],
    records: ["Immunization tracking placeholder", "Medication log placeholder", "Export-ready reports placeholder"],
    sensitive: true,
  },
  {
    slug: "reputation",
    title: "Reputation and Reviews",
    eyebrow: "Family satisfaction",
    description:
      "Review request campaigns, satisfaction surveys, NPS placeholder, AI review response generator, testimonials, and Google Business mock integration.",
    owner: "Brand admin, director",
    metrics: ["4.8 avg rating", "12 testimonials", "5 surveys open", "3 review drafts"],
    features: ["Review request campaigns", "Testimonial approvals", "Survey placeholder", "Google Business Profile mock"],
    records: ["Tour family review request", "Parent newsletter survey", "Approved testimonial library"],
    ai: "Generates response drafts for brand-approved human review.",
  },
  {
    slug: "analytics",
    title: "Reporting and Analytics",
    eyebrow: "Operator intelligence",
    description:
      "Enrollment funnel, lead sources, tour conversion, occupancy, revenue, balances, attendance, ratios, response time, incidents, compliance, campaigns, reviews, and AI insights.",
    owner: "Brand admin, regional manager, director",
    metrics: ["42% tour conversion", "70.8% occupancy", "2.1h avg response", "8 enrolled this month"],
    features: ["Charts and KPI cards", "Trend indicators", "Center filters", "Export placeholders"],
    records: ["Enrollment funnel", "Capacity utilization", "Incident trends", "Campaign performance"],
    ai: "Explains trends and flags opportunities without replacing operator judgment.",
  },
  {
    slug: "ai-command",
    title: "AI Command Center",
    eyebrow: "Human-reviewed assistance",
    description:
      "AI summaries, contact briefs, lead scoring, next steps, reply suggestions, announcement/campaign copy, workflow recommendations, task prioritization, incident wording, review responses, and compliance reminders.",
    owner: "All roles with scoped permissions",
    metrics: ["14 suggestions", "9 awaiting review", "0 auto-decisions", "100% labeled drafts"],
    features: ["OpenAI env-ready mock", "Role-aware prompt context", "Sensitive output review gates", "AI guardrails documentation"],
    records: ["Daily center summary", "Tour follow-up generator", "Incident wording assistant", "Review response draft"],
    ai: "AI does not make final safety, medical, legal, custody, billing, or compliance decisions.",
    sensitive: true,
  },
  {
    slug: "parent-portal",
    title: "Parent Portal",
    eyebrow: "Warm family experience",
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
    title: "Teacher Portal Mobile View",
    eyebrow: "Classroom quick actions",
    description:
      "Mobile-first teacher workflow for attendance, child cards, logs, notes, incident creation, supply requests, and parent updates.",
    owner: "Teacher",
    metrics: ["11 present", "4 sheets open", "1 incident draft", "2 parent notes"],
    features: ["Large touch targets", "Quick log buttons", "Roster filter", "Offline-ready future structure"],
    records: ["Check in/out", "Meal", "Nap", "Diaper/potty", "Activity", "Incident"],
    sensitive: true,
  },
  {
    slug: "agency-admin",
    title: "Executive / Franchise Admin",
    eyebrow: "White-label enterprise control",
    description:
      "Manage organizations, owner groups, locations, scoped users, temporary passwords, subscriptions placeholders, analytics, feature flags, audit logs, impersonation warning, and support access placeholder.",
    owner: "Platform owner, brand/franchise admin",
    metrics: ["1 brand", "Live centers", "10 roles", "Audit logged"],
    features: ["Location lifecycle", "Owner group containers", "User and password controls", "Impersonation audit warning"],
    records: ["Kid City USA", "North Metro region", "Feature flag: Kiosk preview"],
    sensitive: true,
  },
  {
    slug: "white-label",
    title: "White-Label Settings",
    eyebrow: "Brand-ready SaaS",
    description:
      "Brand name, logo, favicon, primary/accent colors, theme mode, sender, custom domain, parent portal branding, legal footer, and terms/privacy links.",
    owner: "Brand admin, platform owner",
    metrics: ["3 brand surfaces", "2 theme modes", "1 custom domain placeholder", "4 notification templates"],
    features: ["Logo upload placeholder", "Color controls", "Custom domain placeholder", "Login and parent portal branding"],
    records: ["Brand: The Bee Suite", "Primary: Honey Gold", "Domain: portal.example.com placeholder"],
  },
  {
    slug: "team-permissions",
    title: "Team, Users, and Permissions",
    eyebrow: "Role-based access",
    description:
      "Auth-ready users, roles, permissions, center/classroom assignments, parent/guardian access, pickup roles, and read-only auditors.",
    owner: "Platform owner, brand admin, director",
    metrics: ["10 roles", "54 permissions", "20 staff users", "50 family users"],
    features: ["RBAC matrix", "Sensitive field visibility", "Audit logs", "Scoped impersonation placeholder"],
    records: roleMatrix.map((role) => `${role[0]}: ${role[1]}`),
    sensitive: true,
  },
  {
    slug: "integrations",
    title: "Integrations",
    eyebrow: "Credential-ready mocks",
    description:
      "Mock integration shells for payments, SMS, email, calendars, reviews, lead ads, AI, webhooks, signatures, and storage.",
    owner: "Platform owner, brand admin",
    metrics: ["10 integration shells", "0 live credentials", "1 mock connection", "9 placeholders"],
    features: ["Environment variable guide", "Connection status", "Webhook placeholder", "Safe mock defaults"],
    records: integrations.map((integration) => `${integration[0]}: ${integration[2]}`),
  },
  {
    slug: "billing-settings",
    title: "Billing Settings",
    eyebrow: "Plan and account setup",
    description:
      "SaaS billing plan placeholders, family billing defaults, products, tuition plans, discounts, taxes, subsidy fields, and processor settings.",
    owner: "Platform owner, billing/admin staff",
    metrics: ["3 plan placeholders", "6 tuition plans", "4 products/fees", "2 discounts"],
    features: ["Subscription placeholder", "Tuition plan settings", "Payment processor config shell", "Billing policy notes"],
    records: ["Infant full-time tuition", "Registration fee", "Sibling discount", "Agency subsidy placeholder"],
    sensitive: true,
  },
  {
    slug: "notifications",
    title: "Notification Center",
    eyebrow: "Action queue",
    description:
      "Parent messages, enrollment alerts, tours, billing, compliance, incidents, staff certification reminders, capacity warnings, AI actions, and system alerts.",
    owner: "All roles with scoped queues",
    metrics: ["10 notifications", "4 high priority", "3 due today", "2 AI recommended"],
    features: ["Priority filters", "Role-aware routing", "Action buttons", "System alert placeholders"],
    records: notifications,
    ai: "Recommended actions appear as suggestions, never silent automation for sensitive workflows.",
  },
  {
    slug: "audit-logs",
    title: "Audit Logs",
    eyebrow: "Sensitive workflow evidence",
    description:
      "Audit trail for permission changes, restricted child data access, billing changes, incident reviews, impersonation, document updates, and integration events.",
    owner: "Platform owner, auditor, director",
    metrics: ["248 events", "12 sensitive reads", "4 billing changes", "1 impersonation test"],
    features: ["Actor/action/resource", "Before/after metadata placeholder", "Export-ready report placeholder", "Retention policy notes"],
    records: ["Director viewed custody note", "Billing admin updated invoice", "Teacher submitted incident report"],
    sensitive: true,
  },
  {
    slug: "help",
    title: "Help and Documentation",
    eyebrow: "In-app enablement",
    description:
      "Getting started, director, teacher, parent portal, billing, enrollment, automation, AI assistant, white-label, integration setup, FAQ, and support placeholder.",
    owner: "All users",
    metrics: ["10 guides", "18 FAQs", "4 setup checklists", "1 support placeholder"],
    features: ["Role-specific guides", "Go-live checklist", "Integration setup guide", "Compliance-readiness notes"],
    records: ["Director guide", "Teacher guide", "AI assistant guardrails", "Supabase setup"],
  },
];

export function getModule(slug: string) {
  return modules.find((module) => module.slug === slug);
}
