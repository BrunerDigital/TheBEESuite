import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const releaseDate = "2026-07-29";
const releaseVersion = "current";
const publicDir = path.join(
  root,
  "public",
  "brand",
  "the-bee-suite",
  "marketing",
  releaseVersion,
);
const outputDir = path.join(
  root,
  "outputs",
  "marketing",
  "the-bee-suite-social-paid-pack-current",
);
const logoPath = path.join(
  root,
  "public",
  "brand",
  "the-bee-suite",
  "logo-primary-horizontal-white.png",
);
const iconPath = path.join(
  root,
  "public",
  "brand",
  "the-bee-suite",
  "app-icon-yellow.png",
);

const formats = {
  square: {
    width: 1080,
    height: 1080,
    placements: ["Instagram feed", "Facebook feed", "LinkedIn feed"],
  },
  portrait: {
    width: 1080,
    height: 1350,
    placements: ["Instagram portrait feed", "Facebook feed", "LinkedIn feed"],
  },
  story: {
    width: 1080,
    height: 1920,
    placements: [
      "Instagram Stories",
      "Facebook Stories",
      "Instagram Reels",
      "TikTok video end card",
    ],
  },
  landscape: {
    width: 1200,
    height: 628,
    placements: ["LinkedIn sponsored content", "Facebook link ad"],
  },
};

const googleFormats = {
  "google-square-clean": {
    width: 1200,
    height: 1200,
    placements: ["Google Demand Gen image asset", "Google responsive display image asset"],
  },
  "google-landscape-clean": {
    width: 1200,
    height: 628,
    placements: ["Google Demand Gen image asset", "Google responsive display image asset"],
  },
};

const allFormats = { ...formats, ...googleFormats };

const googleCopyByConcept = {
  "one-suite-school-day": {
    shortHeadlines: [
      "One Suite for Childcare",
      "Connect the Whole School Day",
      "Childcare Operations, Clear",
      "One Workspace for Every Role",
      "See The BEE Suite",
    ],
    longHeadline: "Connect the whole childcare day in one role-safe operating workspace",
    descriptions: [
      "Connect directors, classrooms, families, billing readiness, and reporting.",
      "Give every role a clear workspace built around the real childcare day.",
      "Bring school operations and family workflows into one connected suite.",
      "Explore childcare CRM and operations designed around real school roles.",
    ],
  },
  "parents-informed-teachers-focused": {
    shortHeadlines: [
      "Keep Families Informed",
      "Help Teachers Stay Focused",
      "A Clearer Daily Report",
      "Connect Classroom to Family",
      "See the Daily Flow",
    ],
    longHeadline: "Connect classroom documentation with a clear family daily-report workflow",
    descriptions: [
      "Give teachers a practical iPad workflow and families a clear mobile view.",
      "Move daily reports through one school-approved classroom-to-family flow.",
      "Help teachers document the day without losing focus on the classroom.",
      "Give families one clear place to review school-approved daily updates.",
    ],
  },
  "right-view-every-role": {
    shortHeadlines: [
      "The Right View for Every Role",
      "Role-Safe Childcare Tools",
      "Clear Access by School Role",
      "One Suite, Purpose-Built Views",
      "Explore Role-Safe Operations",
    ],
    longHeadline: "Give executives, directors, teachers, and parents the right view for their role",
    descriptions: [
      "Keep each role in the school and family context designed for its work.",
      "Support executive, director, teacher, and parent workflows in one suite.",
      "Build clearer childcare operations around role and school boundaries.",
      "Explore purpose-built views for every role across the childcare day.",
    ],
  },
  "every-school-clearly": {
    shortHeadlines: [
      "See Every School Clearly",
      "Multi-Location Childcare View",
      "Executive Visibility by School",
      "Keep Location Context Clear",
      "Explore the Executive View",
    ],
    longHeadline: "Review multi-location childcare operations without losing school-level context",
    descriptions: [
      "Review organization-wide signals while keeping each school clearly in view.",
      "Bring executive dashboards and FTE reporting into one operating workspace.",
      "See location-level reporting and operational context across the organization.",
      "Explore an executive workspace designed for multi-location childcare teams.",
    ],
  },
  "billing-connected": {
    shortHeadlines: [
      "Connect Childcare Billing",
      "Keep Tuition Context Clear",
      "A Clearer Billing Workflow",
      "Billing in the School Record",
      "Explore Connected Billing",
    ],
    longHeadline: "Keep weekly tuition, invoices, payment status, and family history connected",
    descriptions: [
      "Review tuition, invoices, payment status, and family history in one workflow.",
      "Keep childcare billing connected to the right child and school record.",
      "Give authorized teams clearer school-scoped context around family billing.",
      "Explore a connected billing workflow built into childcare operations.",
    ],
  },
  "launch-by-feature": {
    shortHeadlines: [
      "Launch Childcare Tech Clearly",
      "Roll Out by School and Feature",
      "Use Independent Launch Gates",
      "A School-Ready Rollout",
      "See the Launch Framework",
    ],
    longHeadline: "Use independent readiness gates for every school, feature, and rollout stage",
    descriptions: [
      "Separate setup, parent access, kiosk, billing, payments, and rollout gates.",
      "Give each school and feature a clear readiness decision before launch.",
      "Use a deliberate framework for childcare software implementation.",
      "Explore a school-ready rollout framework built for childcare teams.",
    ],
  },
  "connected-vs-fragmented": {
    shortHeadlines: ["Compare Operating Models", "Connect the School Day", "Move Beyond Tool Sprawl", "One Childcare Workspace", "See the Connected Model"],
    longHeadline: "Compare disconnected childcare tools with one connected operating workspace",
    descriptions: [
      "See how school context changes when workflows share one operating record.",
      "Compare separate tools with role-specific workspaces in one childcare suite.",
      "Keep classroom, family, billing, and reporting context connected by school.",
      "Explore a clearer operating model for childcare teams and families.",
    ],
  },
  "model-fragmentation-cost": {
    shortHeadlines: ["Model Your Software Costs", "Calculate Tool Fragmentation", "Build a Cost Comparison", "Use Your Own Assumptions", "Try the Savings Model"],
    longHeadline: "Model the annual cost of software subscriptions and administrative reconciliation",
    descriptions: [
      "Use your own software, labor, and location assumptions instead of a generic claim.",
      "Compare current and consolidated operating-cost scenarios for your organization.",
      "Estimate software and administrative cost with a transparent input model.",
      "Build a planning scenario for childcare operations without guaranteed savings claims.",
    ],
  },
  "six-connected-workflows": {
    shortHeadlines: ["Six Connected Workflows", "See the Childcare Feature Map", "Connect Daily Operations", "One School Day, One Suite", "Explore BEE Suite Features"],
    longHeadline: "Connect six core childcare workflows across one school operating record",
    descriptions: [
      "Explore enrollment, classrooms, families, billing, reporting, and role-based access.",
      "Bring core childcare workflows into one school-scoped operating workspace.",
      "See how daily operations connect without flattening role boundaries.",
      "Review the BEE Suite feature map built around real school roles.",
    ],
  },
  "meet-mr-bee": {
    shortHeadlines: ["Meet Mr. BEE", "Human-Reviewed AI Help", "AI Drafts, Staff Decides", "Childcare AI With Review", "Explore Mr. BEE"],
    longHeadline: "Use human-reviewed AI assistance for childcare summaries, drafts, and suggestions",
    descriptions: [
      "Draft communications and organize next steps while authorized staff stay in control.",
      "Mr. BEE supports summaries and drafts with human review required before use.",
      "Use AI suggestions without delegating safety, billing, legal, or compliance decisions.",
      "Explore the human-reviewed assistant layer inside The BEE Suite.",
    ],
  },
  "share-your-bee-suite-story": {
    shortHeadlines: ["Share Your BEE Suite Story", "Tell Us What Changed", "Help Operators Learn", "Turn Experience Into Proof", "Start a Customer Story"],
    longHeadline: "Turn approved operator feedback into a clear and evidence-backed customer story",
    descriptions: [
      "Share what became clearer, easier to review, or better connected for your team.",
      "Help other childcare operators learn from an approved customer experience.",
      "Build a customer story without inventing results, quotes, or performance claims.",
      "Start with three practical prompts and approve every quote before publication.",
    ],
  },
  "inquiry-to-enrollment": {
    shortHeadlines: ["Inquiry to Enrollment", "Connect the Family Journey", "Keep Every Handoff Clear", "One Enrollment Path", "See the Journey"],
    longHeadline: "Connect the family journey from first inquiry through enrollment and classroom care",
    descriptions: [
      "Keep leads, tours, applications, enrollment, and family setup in one clear path.",
      "Preserve family and school context as an inquiry becomes an enrolled child.",
      "Give childcare teams a connected journey instead of disconnected handoffs.",
      "Explore an enrollment workflow designed around the real family journey.",
    ],
  },
  "director-daily-command-center": {
    shortHeadlines: ["Run Today From One View", "A Director's Daily View", "See What Needs Attention", "One School Command Center", "Start With Today's Signals"],
    longHeadline: "Bring today's childcare operations and follow-up signals into one director view",
    descriptions: [
      "Review attendance, staffing, families, billing alerts, and daily priorities together.",
      "Give directors a clearer starting point for the work that needs attention today.",
      "Keep school operations visible without rebuilding the day across separate tools.",
      "Explore a daily command center built for childcare directors.",
    ],
  },
  "reporting-with-context": {
    shortHeadlines: ["Reporting With School Context", "Keep Reports Connected", "From Daily Detail to FTE", "See the Reporting Flow", "Review Every School Clearly"],
    longHeadline: "Connect daily school reporting with the multi-location context leaders need",
    descriptions: [
      "Move from daily operational detail to FTE and executive review without losing context.",
      "Keep selected reporting periods, school detail, and executive oversight connected.",
      "Give directors and leaders purpose-built reporting views for their responsibilities.",
      "Explore school-scoped reporting across director and executive workspaces.",
    ],
  },
  "parent-portal-one-place": {
    shortHeadlines: ["One Clear Family Portal", "Daily Updates in One Place", "Keep Family Context Together", "A Better Parent View", "Explore the Parent Portal"],
    longHeadline: "Give families one clear place for daily updates, activities, and billing context",
    descriptions: [
      "Bring approved daily reports, activities, family information, and billing into one view.",
      "Help families find the school-approved information connected to their children.",
      "Keep parent access linked to the right family and school context.",
      "Explore a mobile-first family portal built around the childcare day.",
    ],
  },
  "school-readiness-checklist": {
    shortHeadlines: ["Is Your School Ready?", "Use a Clear Launch Checklist", "Verify Before You Launch", "One School at a Time", "Check School Readiness"],
    longHeadline: "Use a practical school-readiness checklist before each childcare workflow launches",
    descriptions: [
      "Verify people, records, access, providers, training, and support before launch.",
      "Treat each school and workflow as a separate readiness decision.",
      "Turn implementation into a visible checklist with clear owners and evidence.",
      "Explore a deliberate launch model for childcare operations.",
    ],
  },
  "mr-bee-director-briefing": {
    shortHeadlines: ["Ask Mr. BEE What's Next", "A Clearer Director Briefing", "Summarize the School Day", "AI Help With Human Review", "Meet the Director's AI Helper"],
    longHeadline: "Use Mr. BEE to organize priorities and draft next steps for human review",
    descriptions: [
      "Summarize center signals, explain trends, and prepare drafts while staff stay in control.",
      "Help directors organize follow-up without delegating accountable decisions to AI.",
      "Turn operational signals into a reviewable briefing and suggested next steps.",
      "Explore human-reviewed AI assistance for busy childcare directors.",
    ],
  },
};

const concepts = [
  {
    id: "one-suite-school-day",
    eyebrow: "BUILT FOR REAL SCHOOL DAYS",
    headline: "One suite for the whole school day.",
    body: "Connect directors, classrooms, families, billing readiness, and reporting in one role-safe workspace.",
    cta: "See The BEE Suite",
    audience: "Childcare owners, operators, and center directors",
    goal: "Broad awareness and qualified workspace requests",
    accent: "#f5b51b",
    googleAsset: "screenshots/current/director-desktop-dashboard-light.png",
    assets: [
      {
        path: "screenshots/current/director-desktop-dashboard-light.png",
        kind: "desktop",
        label: "DIRECTOR DESKTOP",
      },
      {
        path: "screenshots/current/teacher-ipad-daily-report-light.png",
        kind: "tablet",
        label: "TEACHER IPAD",
      },
      {
        path: "screenshots/current/parent-iphone-overview-light.png",
        kind: "phone",
        label: "PARENT IPHONE",
      },
    ],
    organicCaption:
      "Childcare teams should not have to rebuild the school day across disconnected tabs. The BEE Suite connects director operations, classroom work, parent updates, billing readiness, and reporting in one role-safe workspace.",
    paidPrimary:
      "Bring the school day into one connected operating workspace built for childcare owners, directors, teachers, and families.",
    paidHeadline: "One suite for the whole school day",
    paidDescription: "Childcare CRM and operations built around real roles and real school workflows.",
    hashtags: ["#ChildcareOperations", "#ChildcareCRM", "#EarlyEducation", "#SchoolLeadership"],
  },
  {
    id: "parents-informed-teachers-focused",
    eyebrow: "CLASSROOM TO FAMILY",
    headline: "Parents stay informed. Teachers stay focused.",
    body: "Daily reports and classroom updates move through one clear, school-approved family workflow.",
    cta: "See the daily flow",
    audience: "Center directors, education leaders, and school operators",
    goal: "Feature awareness and teacher-parent workflow interest",
    accent: "#22c7b8",
    googleAsset: "screenshots/current/teacher-ipad-daily-report-light.png",
    assets: [
      {
        path: "screenshots/current/teacher-ipad-daily-report-light.png",
        kind: "tablet feature-tablet",
        label: "TEACHER IPAD",
      },
      {
        path: "screenshots/current/parent-iphone-overview-light.png",
        kind: "phone",
        label: "PARENT IPHONE",
      },
    ],
    organicCaption:
      "The daily report should support the classroom—not interrupt it. Teachers record the day on iPad, and families review clear updates from the same school-approved portal.",
    paidPrimary:
      "Give teachers a practical classroom workflow and families a clearer place to review daily updates.",
    paidHeadline: "Parents informed. Teachers focused.",
    paidDescription: "Connect classroom documentation with the family portal.",
    hashtags: ["#ChildcareTeachers", "#ParentCommunication", "#PreschoolLeadership", "#EdTech"],
  },
  {
    id: "right-view-every-role",
    eyebrow: "ROLE-SAFE BY DESIGN",
    headline: "The right view for every role.",
    body: "Executives, directors, teachers, and parents each work in the scope designed for them.",
    cta: "Explore role-safe operations",
    audience: "Multi-location owners, franchise teams, and operational leaders",
    goal: "Differentiate role-safe, school-scoped operations",
    accent: "#38bdf8",
    googleAsset: "screenshots/current/executive-desktop-dashboard-light.png",
    assets: [
      {
        path: "screenshots/current/executive-desktop-dashboard-light.png",
        kind: "desktop",
        label: "EXECUTIVE",
      },
      {
        path: "screenshots/current/teacher-ipad-daily-report-light.png",
        kind: "tablet",
        label: "TEACHER",
      },
      {
        path: "screenshots/current/parent-iphone-overview-light.png",
        kind: "phone",
        label: "PARENT",
      },
    ],
    organicCaption:
      "Every childcare role needs a different view. Owners need rollups. Directors need school operations. Teachers need classroom tools. Parents need their family portal. The BEE Suite is designed around those boundaries.",
    paidPrimary:
      "Give every role the tools and school context they need—without flattening the organization into one shared view.",
    paidHeadline: "The right view for every role",
    paidDescription: "Role-safe childcare operations from executive oversight to family updates.",
    hashtags: ["#ChildcareLeadership", "#MultiLocation", "#RoleBasedAccess", "#ChildcareTechnology"],
  },
  {
    id: "every-school-clearly",
    eyebrow: "MULTI-LOCATION CLARITY",
    headline: "See every school without losing the details.",
    body: "Executive dashboards and FTE reporting keep location-level truth visible across the organization.",
    cta: "See the executive view",
    audience: "Childcare groups, franchise operators, and executive teams",
    goal: "Generate interest from multi-location buyers",
    accent: "#a78bfa",
    googleAsset: "screenshots/current/executive-desktop-dashboard-light.png",
    assets: [
      {
        path: "screenshots/current/executive-desktop-dashboard-light.png",
        kind: "desktop",
        label: "EXECUTIVE DASHBOARD",
      },
      {
        path: "screenshots/current/executive-desktop-fte-light.png",
        kind: "desktop",
        label: "FTE REPORTING",
      },
    ],
    organicCaption:
      "Multi-location visibility should not erase school-level truth. The BEE Suite helps executive teams review organization-wide signals while keeping each location’s reporting and operating context intact.",
    paidPrimary:
      "Review school-level operations and reporting from one executive workspace built for multi-location childcare.",
    paidHeadline: "See every school clearly",
    paidDescription: "Executive visibility with location-level context.",
    hashtags: ["#ChildcareBusiness", "#FranchiseOperations", "#MultiLocation", "#ExecutiveDashboard"],
  },
  {
    id: "billing-connected",
    eyebrow: "CONNECTED BILLING WORKFLOW",
    headline: "Billing belongs in the same operating record.",
    body: "Review weekly tuition, invoices, payment status, and family history in one school-scoped workflow.",
    cta: "Explore connected billing",
    audience: "Owners, directors, and childcare billing teams",
    goal: "Build consideration for billing and family payment workflows",
    accent: "#f59e0b",
    googleAsset: "screenshots/current/director-desktop-billing-light.png",
    assets: [
      {
        path: "screenshots/current/director-desktop-billing-light.png",
        kind: "desktop",
        label: "DIRECTOR BILLING",
      },
      {
        path: "screenshots/current/parent-iphone-billing-light.png",
        kind: "phone",
        label: "PARENT BILLING",
      },
    ],
    organicCaption:
      "Tuition setup, invoice creation, payment status, and family history work better when they stay connected to the right child and school record.",
    paidPrimary:
      "Keep weekly tuition, family invoices, payment status, and school context connected in one childcare operations workspace.",
    paidHeadline: "A more connected billing workflow",
    paidDescription: "School-scoped billing context from assignment to family history.",
    hashtags: ["#ChildcareBilling", "#ChildcareManagement", "#SchoolOperations", "#ParentPortal"],
  },
  {
    id: "launch-by-feature",
    eyebrow: "SCHOOL-READY ROLLOUT",
    headline: "Launch by feature. Grow with confidence.",
    body: "Use independent readiness gates for setup, parent access, kiosk, billing, payments, and rollout.",
    cta: "See the launch framework",
    audience: "Owners, directors, implementation teams, and childcare brands",
    goal: "Communicate deliberate implementation and rollout control",
    accent: "#84cc16",
    visualType: "gates",
    googleAsset: "screenshots/current/director-desktop-reports-light.png",
    assets: [],
    organicCaption:
      "A software release is not the same as a school launch. The BEE Suite rollout framework keeps setup, parent access, kiosk, billing, payments, and wider rollout as separate readiness decisions.",
    paidPrimary:
      "Roll out childcare operations deliberately with independent readiness gates for each school and feature.",
    paidHeadline: "Launch by feature",
    paidDescription: "A school-ready rollout framework for childcare teams.",
    hashtags: ["#ChildcareImplementation", "#SchoolOperations", "#ChangeManagement", "#ChildcareLeadership"],
  },
  {
    id: "connected-vs-fragmented",
    eyebrow: "COMPARE THE OPERATING MODEL",
    headline: "Connected context changes the whole school day.",
    body: "Compare disconnected tools with one role-safe childcare operating workspace.",
    cta: "Compare the models",
    audience: "Childcare owners, executives, and operations leaders",
    goal: "Clarify the operational difference between tool sprawl and connected context",
    accent: "#22c7b8",
    visualType: "comparison",
    googleAsset: "screenshots/current/director-desktop-dashboard-light.png",
    assets: [],
    organicCaption: "The real cost of disconnected tools is not just another subscription. It is the daily work of rebuilding school, family, classroom, billing, and reporting context across systems. Compare that model with one role-safe operating record.",
    paidPrimary: "Compare disconnected childcare tools with one operating workspace built around school and role context.",
    paidHeadline: "Compare the operating models",
    paidDescription: "Fragmented tools or connected childcare operations.",
    hashtags: ["#ChildcareOperations", "#SoftwareConsolidation", "#ChildcareLeadership", "#OperationalExcellence"],
  },
  {
    id: "model-fragmentation-cost",
    eyebrow: "DYNAMIC COST MODEL",
    headline: "What does software fragmentation cost your team?",
    body: "Use your own subscriptions, labor, and location assumptions—not a generic savings claim.",
    cta: "Use the calculator",
    audience: "Childcare owners, finance leaders, and multi-location operators",
    goal: "Drive engagement with a transparent cost-comparison tool",
    accent: "#f5b51b",
    visualType: "savings",
    googleAsset: "screenshots/current/executive-desktop-dashboard-light.png",
    assets: [],
    organicCaption: "Software cost is more than license fees. Model your current subscriptions and the administrative time spent reconciling disconnected systems, then compare that with a scenario built from your own assumptions.",
    paidPrimary: "Build a transparent annual cost comparison using your own software and administrative assumptions.",
    paidHeadline: "Model software fragmentation",
    paidDescription: "A planning model—not a guaranteed savings claim.",
    hashtags: ["#ChildcareBusiness", "#SoftwareCosts", "#OperationalEfficiency", "#ChildcareTechnology"],
  },
  {
    id: "six-connected-workflows",
    eyebrow: "FEATURE MAP",
    headline: "One school day. Six connected workflows.",
    body: "See how the core work of childcare operations fits into one school-scoped suite.",
    cta: "Explore the feature map",
    audience: "Childcare operators, directors, and implementation teams",
    goal: "Build feature awareness without turning the creative into a feature dump",
    accent: "#38bdf8",
    visualType: "features",
    googleAsset: "screenshots/current/director-desktop-dashboard-light.png",
    assets: [],
    organicCaption: "Enrollment, classrooms, families, billing, reporting, and role-specific access should reinforce one another. The BEE Suite keeps those workflows connected while preserving the scope each role needs.",
    paidPrimary: "Explore six connected childcare workflows built around the same school operating record.",
    paidHeadline: "Six connected workflows",
    paidDescription: "A practical feature map for the whole school day.",
    hashtags: ["#ChildcareManagement", "#ChildcareCRM", "#SchoolOperations", "#EdTech"],
  },
  {
    id: "meet-mr-bee",
    eyebrow: "HUMAN-REVIEWED AI",
    headline: "Meet Mr. BEE. AI assistance with staff still in control.",
    body: "Summaries, drafts, and operational suggestions remain reviewable before use.",
    cta: "Meet Mr. BEE",
    audience: "Childcare executives, directors, and communication teams",
    goal: "Introduce the human-reviewed AI assistant without overstating autonomy",
    accent: "#f5b51b",
    visualType: "mr-bee",
    googleAsset: "screenshots/current/director-desktop-dashboard-light.png",
    assets: [{ path: "mr-bee-profile.png", kind: "mascot", label: "MR. BEE" }],
    organicCaption: "Mr. BEE can help summarize a center, explain trends, draft replies and announcements, suggest lead follow-up, improve wording, prioritize tasks, and draft review responses. Every output remains a draft for human review.",
    paidPrimary: "Use human-reviewed AI assistance for childcare summaries, drafts, and operational suggestions.",
    paidHeadline: "Meet Mr. BEE",
    paidDescription: "AI drafts and suggestions. Authorized staff decide.",
    hashtags: ["#ChildcareAI", "#HumanInTheLoop", "#ChildcareOperations", "#ResponsibleAI"],
  },
  {
    id: "share-your-bee-suite-story",
    eyebrow: "CUSTOMER STORY INTAKE",
    headline: "Let childcare operators tell the story.",
    body: "Turn approved feedback into evidence-backed creative without inventing quotes or results.",
    cta: "Share your BEE Suite story",
    audience: "Current BEE Suite operators and implementation partners",
    goal: "Collect reviewable customer-story material for future testimonial creative",
    accent: "#a78bfa",
    visualType: "testimonial",
    googleAsset: "screenshots/current/director-desktop-dashboard-light.png",
    assets: [],
    organicCaption: "What became clearer for your team? Which workflow changed most? What would you tell another childcare operator? Approved responses can become a customer story after the speaker, wording, and any results are verified.",
    paidPrimary: "Help other childcare operators learn from your approved BEE Suite experience.",
    paidHeadline: "Share your BEE Suite story",
    paidDescription: "Every quote and result is verified before publication.",
    hashtags: ["#ChildcareLeadership", "#CustomerStory", "#ChildcareTechnology", "#OperationalExcellence"],
  },
  {
    id: "inquiry-to-enrollment",
    eyebrow: "CONNECTED FAMILY JOURNEY",
    headline: "From first inquiry to the first classroom day.",
    body: "Keep leads, tours, applications, enrollment, and family setup connected through every handoff.",
    cta: "See the enrollment journey",
    audience: "Childcare enrollment teams, directors, and growth leaders",
    goal: "Show continuity across CRM, enrollment, family, and classroom workflows",
    accent: "#22c7b8",
    visualType: "journey",
    googleAsset: "screenshots/current/director-desktop-dashboard-light.png",
    assets: [],
    organicCaption: "A family should not disappear between an inquiry form, a tour calendar, an application, and the classroom roster. The BEE Suite keeps the journey connected from first interest through enrollment and classroom care.",
    paidPrimary: "Connect the family journey from first inquiry through enrollment and classroom care.",
    paidHeadline: "Inquiry to enrollment, connected",
    paidDescription: "Keep every family handoff in one childcare workflow.",
    hashtags: ["#ChildcareEnrollment", "#ChildcareCRM", "#FamilyJourney", "#SchoolOperations"],
  },
  {
    id: "director-daily-command-center",
    eyebrow: "TODAY AT YOUR SCHOOL",
    headline: "Start the day with the signals that matter.",
    body: "Bring attendance, staffing, families, billing alerts, and daily priorities into one director view.",
    cta: "See the director view",
    audience: "Center directors and school operations leaders",
    goal: "Position the dashboard as a practical daily operating view",
    accent: "#38bdf8",
    visualType: "signals",
    googleAsset: "screenshots/current/director-desktop-dashboard-light.png",
    assets: [],
    organicCaption: "A director's morning should begin with a clear view of the school—not a scavenger hunt. Attendance, staffing, family follow-up, billing alerts, reporting, and today's priorities belong in one operating context.",
    paidPrimary: "Give directors one daily view of the school signals and follow-up that need attention.",
    paidHeadline: "Run today from one director view",
    paidDescription: "A daily command center built for childcare operations.",
    hashtags: ["#CenterDirector", "#ChildcareOperations", "#SchoolLeadership", "#DailyOperations"],
  },
  {
    id: "reporting-with-context",
    eyebrow: "FROM DAILY DETAIL TO FTE",
    headline: "Reporting works better when context travels with it.",
    body: "Connect school-level operational reports with the multi-location review leaders need.",
    cta: "Explore connected reporting",
    audience: "Directors, regional leaders, executives, and reporting teams",
    goal: "Show director and executive reporting continuity with real product proof",
    accent: "#a78bfa",
    googleAsset: "screenshots/current/director-desktop-reports-light.png",
    assets: [
      { path: "screenshots/current/director-desktop-reports-light.png", kind: "desktop", label: "DIRECTOR REPORTS" },
      { path: "screenshots/current/executive-desktop-fte-light.png", kind: "desktop", label: "EXECUTIVE FTE" },
    ],
    organicCaption: "Reporting should preserve the selected period, the school detail, and the reason a number needs attention. The BEE Suite gives directors and executives purpose-built views without disconnecting the underlying school context.",
    paidPrimary: "Connect daily school detail with FTE and multi-location reporting views.",
    paidHeadline: "Reporting with school context",
    paidDescription: "Purpose-built views for directors and executive teams.",
    hashtags: ["#ChildcareReporting", "#FTEReporting", "#MultiLocation", "#SchoolLeadership"],
  },
  {
    id: "parent-portal-one-place",
    eyebrow: "ONE CLEAR FAMILY VIEW",
    headline: "Give families one place to follow the day.",
    body: "Daily reports, activities, family information, and billing stay connected to the right family.",
    cta: "Explore the parent portal",
    audience: "Childcare operators, directors, and family experience leaders",
    goal: "Show the breadth and clarity of the mobile-first parent experience",
    accent: "#22c7b8",
    googleAsset: "screenshots/current/parent-iphone-overview-light.png",
    assets: [
      { path: "screenshots/current/parent-iphone-overview-light.png", kind: "phone", label: "OVERVIEW" },
      { path: "screenshots/current/parent-iphone-daily-reports-light.png", kind: "phone", label: "DAILY REPORTS" },
      { path: "screenshots/current/parent-iphone-billing-light.png", kind: "phone", label: "BILLING" },
    ],
    organicCaption: "Families should not have to search across separate messages and portals to understand the day. The BEE Suite keeps approved daily reports, activities, family information, and billing context together in one family view.",
    paidPrimary: "Give families one mobile-first view for daily updates and school-approved information.",
    paidHeadline: "One clear family portal",
    paidDescription: "Daily reports, activities, and billing in one family view.",
    hashtags: ["#ParentPortal", "#FamilyCommunication", "#ChildcareTechnology", "#ParentExperience"],
  },
  {
    id: "school-readiness-checklist",
    eyebrow: "IMPLEMENTATION CHECKLIST",
    headline: "Ready is a checklist—not a feeling.",
    body: "Verify people, records, access, providers, training, and support before each school launches.",
    cta: "Check school readiness",
    audience: "Implementation teams, owners, directors, and childcare brands",
    goal: "Provide a saveable operational checklist and reinforce deliberate rollout",
    accent: "#84cc16",
    visualType: "checklist",
    googleAsset: "screenshots/current/director-desktop-reports-light.png",
    assets: [],
    organicCaption: "A launch date is useful only when the school is truly ready. Confirm the people, source records, access, provider connections, training, and support path for each workflow before calling it live.",
    paidPrimary: "Use a practical school-readiness checklist before each workflow launches.",
    paidHeadline: "Ready is a checklist",
    paidDescription: "Verify every school and workflow before launch.",
    hashtags: ["#ChildcareImplementation", "#ChangeManagement", "#SchoolReadiness", "#ChildcareLeadership"],
  },
  {
    id: "mr-bee-director-briefing",
    eyebrow: "A REVIEWABLE DAILY BRIEFING",
    headline: "Ask Mr. BEE what needs attention next.",
    body: "Summarize center signals, explain trends, and prepare suggested next steps for staff review.",
    cta: "See the Mr. BEE briefing",
    audience: "Busy childcare directors and operational leaders",
    goal: "Show a concrete, responsible AI use case for the director role",
    accent: "#f5b51b",
    visualType: "mr-bee",
    googleAsset: "screenshots/current/director-desktop-dashboard-light.png",
    assets: [{ path: "mr-bee-profile.png", kind: "mascot", label: "MR. BEE" }],
    organicCaption: "Mr. BEE can turn center signals into a reviewable briefing: what changed, what may need follow-up, and what a draft response could say. Authorized staff still review every suggestion and make every accountable decision.",
    paidPrimary: "Organize center priorities and suggested next steps with human-reviewed AI assistance.",
    paidHeadline: "Ask Mr. BEE what's next",
    paidDescription: "A reviewable briefing for busy childcare directors.",
    hashtags: ["#ChildcareAI", "#CenterDirector", "#ResponsibleAI", "#ChildcareOperations"],
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function imageDataUrl(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  const data = await readFile(filePath);
  return `data:${mime};base64,${data.toString("base64")}`;
}

function mediaMarkup(concept, assetData) {
  if (concept.visualType === "comparison") {
    return `<div class="comparison-board">
      <section class="model-card fragmented">
        <span class="model-kicker">DISCONNECTED TOOLS</span>
        <strong>Context rebuilt by hand</strong>
        <ul><li>Separate family records</li><li>Classroom updates elsewhere</li><li>Billing in another system</li><li>Reporting pieced together</li></ul>
      </section>
      <div class="model-vs">VS</div>
      <section class="model-card connected">
        <span class="model-kicker">CONNECTED WORKSPACE</span>
        <strong>Context stays with the school</strong>
        <ul><li>Shared school context</li><li>Role-specific workspaces</li><li>Billing tied to family records</li><li>School-scoped reporting</li></ul>
      </section>
    </div>`;
  }
  if (concept.visualType === "savings") {
    return `<div class="savings-board">
      <div class="savings-inputs">
        <div><span>MONTHLY SOFTWARE</span><strong>Your amount</strong></div>
        <div><span>ADMIN HOURS / WEEK</span><strong>Your estimate</strong></div>
        <div><span>LOADED HOURLY COST</span><strong>Your amount</strong></div>
        <div><span>LOCATIONS</span><strong>Your count</strong></div>
      </div>
      <div class="savings-equals">× 12 + × 52</div>
      <div class="savings-result"><span>USER-MODELED ANNUAL COST</span><strong>Calculated from your inputs</strong><small>Planning scenario · not a guaranteed result</small></div>
    </div>`;
  }
  if (concept.visualType === "features") {
    const features = [
      ["01", "Enrollment CRM"], ["02", "Classrooms + daily reports"],
      ["03", "Families + communication"], ["04", "Billing + payments"],
      ["05", "FTE + reporting"], ["06", "Role-specific portals"],
    ];
    return `<div class="feature-board">${features.map(([number, label]) => `<div class="feature-card"><span>${number}</span><strong>${label}</strong><i aria-hidden="true"></i></div>`).join("")}</div>`;
  }
  if (concept.visualType === "mr-bee") {
    const mascot = assetData.get("mr-bee-profile.png");
    const briefing = concept.id === "mr-bee-director-briefing";
    return `<div class="mr-bee-board">
      <div class="mr-bee-halo"><img src="${mascot}" alt="Mr. BEE" /></div>
      <div class="ai-suggestions">
        ${briefing
          ? `<div><span>WHAT CHANGED?</span><strong>Summarize center signals</strong></div>
             <div><span>WHAT NEEDS REVIEW?</span><strong>Explain trends and priorities</strong></div>
             <div><span>WHAT COMES NEXT?</span><strong>Suggest follow-up and draft replies</strong></div>`
          : `<div><span>SUMMARIZE</span><strong>Center trends and priorities</strong></div>
             <div><span>DRAFT</span><strong>Replies and announcements</strong></div>
             <div><span>SUGGEST</span><strong>Lead follow-up and next steps</strong></div>`}
        <div class="human-review"><span>HUMAN REVIEW REQUIRED</span><strong>Authorized staff decide before use</strong></div>
      </div>
    </div>`;
  }
  if (concept.visualType === "testimonial") {
    return `<div class="story-intake-board">
      <div class="quote-mark">“</div>
      <div class="story-prompts">
        <div><span>01</span><strong>What became clearer for your team?</strong></div>
        <div><span>02</span><strong>Which workflow changed most?</strong></div>
        <div><span>03</span><strong>What would you tell another operator?</strong></div>
      </div>
      <div class="proof-gate">SPEAKER + WORDING + RESULTS VERIFIED BEFORE PUBLICATION</div>
    </div>`;
  }
  if (concept.visualType === "gates") {
    return `
      <div class="gate-system" aria-label="Independent rollout gates">
        <div class="gate-path" aria-hidden="true"></div>
        ${["Setup", "Parent access", "Kiosk", "Billing", "Payments", "Rollout"]
          .map(
            (label, index) => `
              <div class="gate-card gate-${index + 1}">
                <span class="gate-number">${String(index + 1).padStart(2, "0")}</span>
                <strong>${escapeHtml(label)}</strong>
                <span class="gate-state">VERIFY</span>
              </div>`,
          )
          .join("")}
        <div class="gate-center">
          <img src="${assetData.get("screenshots/current/director-desktop-reports-light.png")}" alt="" />
          <span>ONE SCHOOL AT A TIME</span>
        </div>
      </div>`;
  }
  if (concept.visualType === "journey") {
    const steps = ["Inquiry", "Tour", "Application", "Enrollment", "Family setup", "Classroom"];
    return `<div class="journey-board">
      <div class="journey-line" aria-hidden="true"></div>
      ${steps.map((label, index) => `<div class="journey-step"><span>${String(index + 1).padStart(2, "0")}</span><strong>${label}</strong><small>${index === steps.length - 1 ? "READY FOR THE DAY" : "CONTEXT MOVES FORWARD"}</small></div>`).join("")}
    </div>`;
  }
  if (concept.visualType === "signals") {
    const screenshot = assetData.get("screenshots/current/director-desktop-dashboard-light.png");
    return `<div class="signals-board">
      <div class="signal-screen"><img src="${screenshot}" alt="" /></div>
      <div class="signal-stack">
        <div><span>01</span><strong>Attendance + ratios</strong></div>
        <div><span>02</span><strong>Families + follow-up</strong></div>
        <div><span>03</span><strong>Billing + reporting alerts</strong></div>
        <div><span>04</span><strong>Today's priorities</strong></div>
      </div>
    </div>`;
  }
  if (concept.visualType === "checklist") {
    const items = ["People assigned", "Source records reviewed", "Role access verified", "Providers confirmed", "Training completed", "Support path ready"];
    return `<div class="checklist-board">
      ${items.map((label, index) => `<div class="check-item"><span>${index < 3 ? "✓" : String(index + 1).padStart(2, "0")}</span><strong>${label}</strong><small>${index < 3 ? "EVIDENCE READY" : "VERIFY"}</small></div>`).join("")}
    </div>`;
  }
  return concept.assets
    .map((asset, index) => {
      const dataUrl = assetData.get(asset.path);
      return `
        <figure class="media ${asset.kind} media-${index + 1}" data-layout-item="true">
          <div class="device-screen">
            <img src="${dataUrl}" alt="" />
            <span class="device-sensor" aria-hidden="true"></span>
          </div>
          <span class="device-base" aria-hidden="true"></span>
        </figure>`;
    })
    .join("");
}

function creativeHtml(concept, formatName, format, brandAssets, assetData) {
  const isLandscape = formatName === "landscape";
  const isStory = formatName === "story";
  const isPortrait = formatName === "portrait";
  const deviceCount = concept.visualType ? 0 : concept.assets.length;
  const bodyClass = `${formatName} assets-${deviceCount} visual-${concept.visualType ?? "product"} concept-${concept.id}`;
  const media = mediaMarkup(concept, assetData);
  const headlineSize = isLandscape ? 54 : isStory ? 84 : isPortrait ? 69 : 60;
  const bodySize = isLandscape ? 22 : isStory ? 30 : isPortrait ? 27 : 24;
  const logoWidth = isLandscape ? 210 : isStory ? 292 : 250;
  const safeX = isLandscape ? 52 : isStory ? 78 : 64;
  const safeY = isLandscape ? 42 : isStory ? 108 : 58;
  const safeBottom = isStory ? 210 : isLandscape ? 40 : 52;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${format.width}, initial-scale=1" />
  <title>${escapeHtml(concept.headline)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: ${format.width}px;
      height: ${format.height}px;
      overflow: hidden;
      background: #05070a;
      color: white;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .canvas {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background:
        radial-gradient(circle at 88% 10%, color-mix(in srgb, ${concept.accent} 22%, transparent), transparent 31%),
        radial-gradient(circle at 4% 82%, rgba(245,181,27,.14), transparent 28%),
        linear-gradient(145deg, #101820 0%, #070b10 48%, #030507 100%);
    }
    .honeycomb {
      position: absolute;
      inset: 0;
      opacity: .16;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='56' viewBox='0 0 64 56'%3E%3Cg fill='none' stroke='%23f5b51b' stroke-opacity='.34' stroke-width='.8'%3E%3Cpath d='M16 .5H48L63.5 28 48 55.5H16L.5 28Z'/%3E%3Cpath d='M-16-27.5H16L31.5 0 16 27.5H-16L-31.5 0Z'/%3E%3Cpath d='M48-27.5H80L95.5 0 80 27.5H48L32.5 0Z'/%3E%3Cpath d='M-16 28.5H16L31.5 56 16 83.5H-16L-31.5 56Z'/%3E%3Cpath d='M48 28.5H80L95.5 56 80 83.5H48L32.5 56Z'/%3E%3C/g%3E%3C/svg%3E");
      background-size: 64px 56px;
      mask-image: linear-gradient(115deg, rgba(0,0,0,.95), transparent 76%);
    }
    .safe {
      position: absolute;
      inset: ${safeY}px ${safeX}px ${safeBottom}px;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 15px;
      flex: 0 0 auto;
    }
    .brand-icon {
      width: ${isStory ? 64 : isLandscape ? 42 : 52}px;
      height: ${isStory ? 64 : isLandscape ? 42 : 52}px;
      flex: 0 0 auto;
      border-radius: ${isStory ? 17 : 13}px;
      object-fit: contain;
      box-shadow: 0 12px 34px rgba(245,181,27,.22);
    }
    .brand-logo {
      width: ${logoWidth}px;
      height: ${isStory ? 64 : isLandscape ? 42 : 52}px;
      flex: 0 0 auto;
      display: block;
      object-fit: contain;
      object-position: left center;
    }
    .platform-label {
      margin-left: auto;
      color: rgba(255,255,255,.58);
      font-size: ${isLandscape ? 12 : isStory ? 18 : 14}px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .main {
      display: ${isLandscape ? "grid" : "flex"};
      grid-template-columns: ${isLandscape ? "51% 49%" : "none"};
      flex-direction: column;
      gap: ${isLandscape ? 24 : isStory ? 44 : 28}px;
      flex: 1 1 auto;
      min-height: 0;
      margin-top: ${isLandscape ? 28 : isStory ? 96 : 52}px;
    }
    .copy {
      position: relative;
      z-index: 3;
      align-self: ${isLandscape ? "center" : "stretch"};
      min-width: 0;
    }
    .eyebrow {
      display: flex;
      align-items: center;
      gap: 13px;
      color: ${concept.accent};
      font-size: ${isLandscape ? 15 : isStory ? 21 : 17}px;
      line-height: 1.1;
      font-weight: 900;
      letter-spacing: .1em;
    }
    .eyebrow::before {
      content: "";
      width: ${isStory ? 58 : 42}px;
      height: 3px;
      flex: 0 0 auto;
      border-radius: 999px;
      background: ${concept.accent};
    }
    h1 {
      max-width: ${isLandscape ? 570 : isStory ? 900 : 890}px;
      margin: ${isStory ? 34 : 24}px 0 0;
      font-size: ${headlineSize}px;
      line-height: ${isLandscape ? .98 : 1.01};
      font-weight: 830;
      letter-spacing: -.035em;
      text-wrap: balance;
    }
    .body-copy {
      max-width: ${isLandscape ? 530 : isStory ? 850 : 850}px;
      margin: ${isStory ? 32 : 24}px 0 0;
      color: rgba(244,247,250,.78);
      font-size: ${bodySize}px;
      line-height: 1.34;
      font-weight: 500;
      text-wrap: balance;
    }
    .visual-stage {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: ${isStory ? 24 : isLandscape ? 16 : 20}px;
      min-width: 0;
      min-height: 0;
      flex: 1 1 auto;
      padding: ${isLandscape ? "8px 0 6px 18px" : isStory ? "20px 0" : "12px 0"};
    }
    .media {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      height: auto;
      min-width: 0;
      max-height: 100%;
      margin: 0;
      overflow: visible;
      filter: drop-shadow(0 28px 34px rgba(0,0,0,.42));
    }
    .device-screen {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #090d12;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.18);
    }
    .media img {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
      object-fit: cover;
      object-position: top center;
      background: #fffdf7;
    }
    .media.desktop {
      aspect-ratio: 1.58 / 1;
      padding: ${isStory ? "12px 12px 17px" : "8px 8px 12px"};
      border: 1px solid rgba(255,255,255,.25);
      border-radius: ${isStory ? 24 : 17}px;
      background: linear-gradient(145deg, #303943, #0c1015 72%);
    }
    .media.desktop .device-screen { border-radius: ${isStory ? 13 : 9}px; }
    .media.desktop .device-base {
      position: absolute;
      z-index: -1;
      left: 50%;
      bottom: ${isStory ? -24 : -16}px;
      width: 100%;
      height: ${isStory ? 28 : 19}px;
      transform: translateX(-50%);
      clip-path: polygon(3% 0, 97% 0, 100% 68%, 94% 100%, 6% 100%, 0 68%);
      border-radius: 0 0 18px 18px;
      background: linear-gradient(180deg, #7c858f, #2b3239 45%, #11161b);
      box-shadow: inset 0 1px rgba(255,255,255,.44), 0 10px 20px rgba(0,0,0,.34);
    }
    .media.desktop .device-base::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 43%;
      width: 14%;
      height: 4px;
      border-radius: 0 0 8px 8px;
      background: rgba(18,23,28,.52);
    }
    .media.tablet {
      aspect-ratio: .75 / 1;
      padding: ${isStory ? 15 : 10}px;
      border: 1px solid rgba(255,255,255,.27);
      border-radius: ${isStory ? 31 : 22}px;
      background: linear-gradient(145deg, #303943, #0b0f14 72%);
    }
    .media.tablet .device-screen { border-radius: ${isStory ? 18 : 13}px; }
    .media.phone {
      aspect-ratio: .462 / 1;
      padding: ${isStory ? 11 : 8}px;
      border: 1px solid rgba(255,255,255,.26);
      border-radius: ${isStory ? 38 : 27}px;
      background: linear-gradient(145deg, #323b45, #090d12 72%);
    }
    .media.phone .device-screen { border-radius: ${isStory ? 29 : 20}px; }
    .media.phone .device-sensor {
      position: absolute;
      z-index: 4;
      top: ${isStory ? 8 : 6}px;
      left: 50%;
      width: 36%;
      height: ${isStory ? 20 : 14}px;
      transform: translateX(-50%);
      border-radius: 999px;
      background: #05070a;
    }
    .media.tablet .device-sensor {
      position: absolute;
      z-index: 4;
      top: ${isStory ? 7 : 5}px;
      left: 50%;
      width: ${isStory ? 8 : 6}px;
      height: ${isStory ? 8 : 6}px;
      transform: translateX(-50%);
      border-radius: 50%;
      background: #020304;
    }
    .assets-2 .visual-stage:has(.feature-tablet) {
      width: 100%;
      max-width: ${isLandscape ? 500 : isStory ? 720 : 640}px;
      align-self: center;
    }
    .assets-2 .media.feature-tablet { flex: .78 1 0; }
    .assets-2 .media.feature-tablet + .media.phone { flex: .48 1 0; }
    .media.feature-tablet img {
      object-position: center top;
    }
    .media-label {
      position: absolute;
      z-index: 2;
      top: ${isStory ? 27 : 21}px;
      left: ${isStory ? 27 : 21}px;
      max-width: calc(100% - 42px);
      padding: ${isStory ? "10px 15px" : "8px 12px"};
      overflow: hidden;
      border-radius: 999px;
      background: rgba(10,16,24,.88);
      color: white;
      font-size: ${isLandscape ? 10 : isStory ? 14 : 12}px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: .08em;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .media.graphic .media-label { display: none; }
    .media.phone .media-label {
      top: 18px;
      left: 14px;
      max-width: calc(100% - 28px);
      padding: 7px 8px;
      font-size: ${isStory ? 12 : isLandscape ? 9 : 10}px;
      letter-spacing: .04em;
    }
    .media.desktop { flex: 1.65 1 0; }
    .media.tablet { flex: 1.12 1 0; }
    .media.phone { flex: .58 1 0; }
    .media.graphic { flex: 2 1 0; }
    .assets-1 .media { flex: 1 1 100%; }
    .assets-1 .visual-stage { max-width: ${isLandscape ? 570 : isStory ? 920 : 950}px; width: 100%; align-self: center; }
    .assets-2 .media.graphic { flex: 2.2 1 0; }
    .assets-2 .media.phone { flex: .72 1 0; }
    .assets-2 .media.desktop { flex: 1.35 1 0; }
    .gate-system {
      position: relative;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: ${isStory ? 22 : isLandscape ? 12 : 16}px;
      width: 100%;
      height: 100%;
      min-height: 0;
      padding: ${isStory ? 36 : 24}px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: ${isStory ? 30 : 22}px;
      background: rgba(4,9,12,.72);
      box-shadow: 0 28px 80px rgba(0,0,0,.42);
      isolation: isolate;
    }
    .gate-path {
      position: absolute;
      z-index: -1;
      inset: 0;
      background:
        linear-gradient(90deg, transparent 8%, color-mix(in srgb, ${concept.accent} 25%, transparent) 50%, transparent 92%),
        radial-gradient(circle at 50% 45%, color-mix(in srgb, ${concept.accent} 26%, transparent), transparent 46%);
    }
    .gate-center {
      position: absolute;
      z-index: -1;
      inset: 0;
      overflow: hidden;
    }
    .gate-center img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: saturate(.72) contrast(1.08) brightness(.34);
      opacity: .48;
    }
    .gate-center::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(3,7,10,.28), rgba(3,7,10,.82));
    }
    .gate-center span {
      position: absolute;
      z-index: 2;
      left: 50%;
      bottom: ${isStory ? 18 : 12}px;
      transform: translateX(-50%);
      color: rgba(255,255,255,.52);
      font-size: ${isStory ? 15 : isLandscape ? 9 : 11}px;
      font-weight: 900;
      letter-spacing: .14em;
      white-space: nowrap;
    }
    .gate-card {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      padding: ${isStory ? "26px 24px" : isLandscape ? "14px 13px" : "20px 18px"};
      border: 1px solid rgba(255,255,255,.17);
      border-radius: ${isStory ? 22 : 16}px;
      background: linear-gradient(145deg, rgba(23,31,37,.92), rgba(8,13,17,.84));
      box-shadow: inset 0 1px rgba(255,255,255,.08), 0 16px 35px rgba(0,0,0,.24);
      backdrop-filter: blur(14px);
    }
    .gate-card::before {
      content: "";
      position: absolute;
      top: 0;
      left: 16px;
      right: 16px;
      height: 3px;
      border-radius: 0 0 999px 999px;
      background: ${concept.accent};
      box-shadow: 0 0 18px color-mix(in srgb, ${concept.accent} 58%, transparent);
    }
    .gate-number {
      color: ${concept.accent};
      font-size: ${isStory ? 17 : isLandscape ? 10 : 12}px;
      font-weight: 900;
      letter-spacing: .12em;
    }
    .gate-card strong {
      margin-top: ${isStory ? 11 : 7}px;
      color: white;
      font-size: ${isStory ? 25 : isLandscape ? 14 : 18}px;
      line-height: 1.05;
      letter-spacing: -.02em;
    }
    .gate-state {
      margin-top: ${isStory ? 14 : 9}px;
      color: rgba(255,255,255,.52);
      font-size: ${isStory ? 13 : isLandscape ? 8 : 10}px;
      font-weight: 900;
      letter-spacing: .14em;
    }
    .visual-gates .visual-stage {
      width: 100%;
      max-width: ${isLandscape ? 580 : isStory ? 920 : 950}px;
      align-self: center;
    }
    .comparison-board,
    .savings-board,
    .feature-board,
    .mr-bee-board,
    .story-intake-board,
    .journey-board,
    .signals-board,
    .checklist-board {
      width: 100%;
      height: 100%;
      min-height: 0;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: ${isStory ? 30 : 22}px;
      background: rgba(5,10,14,.76);
      box-shadow: 0 28px 80px rgba(0,0,0,.42), inset 0 1px rgba(255,255,255,.06);
      backdrop-filter: blur(18px);
    }
    .visual-comparison .visual-stage,
    .visual-savings .visual-stage,
    .visual-features .visual-stage,
    .visual-mr-bee .visual-stage,
    .visual-testimonial .visual-stage,
    .visual-journey .visual-stage,
    .visual-signals .visual-stage,
    .visual-checklist .visual-stage {
      width: 100%;
      max-width: ${isLandscape ? 590 : isStory ? 920 : 950}px;
      align-self: center;
    }
    .comparison-board {
      display: grid;
      grid-template-columns: ${isLandscape ? "1fr" : "1fr auto 1fr"};
      grid-template-rows: ${isLandscape ? "1fr auto 1fr" : "1fr"};
      align-items: stretch;
      gap: ${isStory ? 22 : 14}px;
      padding: ${isStory ? 28 : isLandscape ? 16 : 20}px;
    }
    .model-card {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      padding: ${isStory ? 28 : isLandscape ? 16 : 22}px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: ${isStory ? 22 : 17}px;
      background: linear-gradient(145deg, rgba(24,33,40,.94), rgba(10,15,19,.88));
    }
    .model-card.connected { border-color: color-mix(in srgb, ${concept.accent} 50%, transparent); box-shadow: inset 0 3px ${concept.accent}; }
    .model-card.fragmented { opacity: .78; }
    .model-kicker { color: ${concept.accent}; font-size: ${isStory ? 14 : isLandscape ? 9 : 11}px; font-weight: 900; letter-spacing: .12em; }
    .model-card strong { margin-top: ${isStory ? 12 : 8}px; color: white; font-size: ${isStory ? 25 : isLandscape ? 15 : 19}px; line-height: 1.1; }
    .model-card ul { display: grid; gap: ${isStory ? 11 : 7}px; margin: ${isStory ? 22 : 14}px 0 0; padding: 0; list-style: none; }
    .model-card li { color: rgba(255,255,255,.7); font-size: ${isStory ? 17 : isLandscape ? 10 : 13}px; line-height: 1.25; }
    .model-card li::before { content: ""; display: inline-block; width: 7px; height: 7px; margin-right: 9px; border-radius: 50%; background: ${concept.accent}; }
    .model-vs { align-self: center; justify-self: center; display: grid; place-items: center; width: ${isStory ? 62 : 42}px; height: ${isStory ? 62 : 42}px; border-radius: 50%; background: ${concept.accent}; color: #071016; font-size: ${isStory ? 17 : 12}px; font-weight: 950; box-shadow: 0 0 34px color-mix(in srgb, ${concept.accent} 35%, transparent); }
    .savings-board {
      display: grid;
      grid-template-columns: ${isLandscape ? "1fr" : "1.3fr auto 1fr"};
      grid-template-rows: ${isLandscape ? "1fr auto 1fr" : "1fr"};
      align-items: stretch;
      gap: ${isStory ? 24 : 16}px;
      padding: ${isStory ? 30 : isLandscape ? 16 : 22}px;
    }
    .savings-inputs { display: grid; grid-template-columns: repeat(2, 1fr); gap: ${isStory ? 16 : 10}px; }
    .savings-inputs div { display: flex; flex-direction: column; justify-content: center; min-width: 0; padding: ${isStory ? 20 : isLandscape ? 11 : 15}px; border: 1px solid rgba(255,255,255,.14); border-radius: ${isStory ? 18 : 13}px; background: rgba(255,255,255,.055); }
    .savings-inputs span, .savings-result span { color: ${concept.accent}; font-size: ${isStory ? 13 : isLandscape ? 8 : 10}px; font-weight: 900; letter-spacing: .1em; }
    .savings-inputs strong { margin-top: 8px; color: rgba(255,255,255,.72); font-size: ${isStory ? 18 : isLandscape ? 11 : 14}px; }
    .savings-equals { align-self: center; justify-self: center; color: ${concept.accent}; font-size: ${isStory ? 22 : isLandscape ? 12 : 16}px; font-weight: 950; }
    .savings-result { display: flex; flex-direction: column; justify-content: center; padding: ${isStory ? 28 : isLandscape ? 16 : 22}px; border: 1px solid color-mix(in srgb, ${concept.accent} 48%, transparent); border-radius: ${isStory ? 22 : 16}px; background: linear-gradient(145deg, color-mix(in srgb, ${concept.accent} 17%, #101820), #091015); box-shadow: inset 0 3px ${concept.accent}; }
    .savings-result strong { margin-top: 12px; color: white; font-size: ${isStory ? 27 : isLandscape ? 16 : 21}px; line-height: 1.08; }
    .savings-result small { margin-top: 15px; color: rgba(255,255,255,.58); font-size: ${isStory ? 14 : isLandscape ? 9 : 11}px; }
    .feature-board { display: grid; grid-template-columns: repeat(${isLandscape ? 2 : 3}, minmax(0,1fr)); gap: ${isStory ? 18 : isLandscape ? 10 : 13}px; padding: ${isStory ? 28 : isLandscape ? 15 : 21}px; }
    .feature-card { position: relative; display: flex; flex-direction: column; justify-content: center; min-width: 0; padding: ${isStory ? 25 : isLandscape ? 13 : 19}px; overflow: hidden; border: 1px solid rgba(255,255,255,.14); border-radius: ${isStory ? 20 : 15}px; background: linear-gradient(145deg, rgba(26,36,43,.94), rgba(9,14,18,.9)); }
    .feature-card span { color: ${concept.accent}; font-size: ${isStory ? 14 : isLandscape ? 9 : 11}px; font-weight: 950; letter-spacing: .12em; }
    .feature-card strong { position: relative; z-index: 2; max-width: 85%; margin-top: ${isStory ? 14 : 9}px; color: white; font-size: ${isStory ? 21 : isLandscape ? 12 : 16}px; line-height: 1.12; }
    .feature-card i { position: absolute; right: -22px; bottom: -26px; width: ${isStory ? 100 : 72}px; height: ${isStory ? 86 : 62}px; border: 2px solid color-mix(in srgb, ${concept.accent} 34%, transparent); clip-path: polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%); }
    .mr-bee-board { display: grid; grid-template-columns: ${isLandscape ? "38% 62%" : "42% 58%"}; align-items: center; gap: ${isStory ? 26 : 16}px; padding: ${isStory ? 28 : isLandscape ? 14 : 20}px; overflow: hidden; }
    .mr-bee-halo { position: relative; display: grid; place-items: center; height: 100%; min-height: 0; border-radius: ${isStory ? 24 : 18}px; background: radial-gradient(circle, color-mix(in srgb, ${concept.accent} 28%, transparent), transparent 68%); }
    .mr-bee-halo::before { content: ""; position: absolute; width: 80%; aspect-ratio: 1; border: 1px solid color-mix(in srgb, ${concept.accent} 36%, transparent); clip-path: polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%); }
    .mr-bee-halo img { position: relative; z-index: 2; width: 92%; height: 92%; object-fit: contain; }
    .ai-suggestions { display: grid; gap: ${isStory ? 15 : isLandscape ? 8 : 11}px; min-width: 0; }
    .ai-suggestions div { padding: ${isStory ? 18 : isLandscape ? 10 : 14}px; border: 1px solid rgba(255,255,255,.14); border-radius: ${isStory ? 18 : 13}px; background: rgba(255,255,255,.055); }
    .ai-suggestions span { color: ${concept.accent}; font-size: ${isStory ? 12 : isLandscape ? 8 : 10}px; font-weight: 950; letter-spacing: .11em; }
    .ai-suggestions strong { display: block; margin-top: ${isStory ? 8 : 5}px; color: white; font-size: ${isStory ? 18 : isLandscape ? 10 : 14}px; line-height: 1.15; }
    .ai-suggestions .human-review { border-color: color-mix(in srgb, ${concept.accent} 50%, transparent); background: color-mix(in srgb, ${concept.accent} 12%, #0b1116); }
    .story-intake-board { position: relative; display: grid; grid-template-columns: ${isLandscape ? "24% 76%" : "25% 75%"}; align-items: center; padding: ${isStory ? 30 : isLandscape ? 16 : 22}px; overflow: hidden; }
    .quote-mark { align-self: start; color: ${concept.accent}; font-family: Georgia, serif; font-size: ${isStory ? 180 : isLandscape ? 90 : 125}px; line-height: .8; opacity: .92; }
    .story-prompts { display: grid; gap: ${isStory ? 17 : isLandscape ? 9 : 12}px; }
    .story-prompts div { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: ${isStory ? 16 : 10}px; padding: ${isStory ? 20 : isLandscape ? 11 : 15}px; border: 1px solid rgba(255,255,255,.15); border-radius: ${isStory ? 18 : 13}px; background: rgba(255,255,255,.055); }
    .story-prompts span { display: grid; place-items: center; width: ${isStory ? 42 : 30}px; height: ${isStory ? 42 : 30}px; border-radius: 50%; background: ${concept.accent}; color: #071016; font-size: ${isStory ? 13 : 9}px; font-weight: 950; }
    .story-prompts strong { color: white; font-size: ${isStory ? 19 : isLandscape ? 11 : 15}px; line-height: 1.15; }
    .proof-gate { position: absolute; left: ${isStory ? 30 : 22}px; right: ${isStory ? 30 : 22}px; bottom: ${isStory ? 20 : 14}px; color: rgba(255,255,255,.46); font-size: ${isStory ? 11 : isLandscape ? 7 : 9}px; font-weight: 900; letter-spacing: .11em; text-align: center; }
    .journey-board { position: relative; display: grid; grid-template-columns: repeat(${isLandscape ? 3 : 2}, minmax(0,1fr)); gap: ${isStory ? 18 : isLandscape ? 10 : 13}px; padding: ${isStory ? 30 : isLandscape ? 16 : 22}px; overflow: hidden; }
    .journey-line { position: absolute; left: 9%; right: 9%; top: 50%; height: 2px; background: linear-gradient(90deg, transparent, ${concept.accent}, transparent); opacity: .32; }
    .journey-step { position: relative; z-index: 2; display: flex; flex-direction: column; justify-content: center; min-width: 0; padding: ${isStory ? 24 : isLandscape ? 13 : 18}px; border: 1px solid rgba(255,255,255,.14); border-radius: ${isStory ? 20 : 15}px; background: linear-gradient(145deg, rgba(25,35,42,.96), rgba(8,13,17,.94)); box-shadow: inset 0 2px color-mix(in srgb, ${concept.accent} 55%, transparent); }
    .journey-step span { color: ${concept.accent}; font-size: ${isStory ? 13 : isLandscape ? 8 : 10}px; font-weight: 950; letter-spacing: .12em; }
    .journey-step strong { margin-top: ${isStory ? 10 : 7}px; color: white; font-size: ${isStory ? 21 : isLandscape ? 12 : 16}px; line-height: 1.1; }
    .journey-step small { margin-top: ${isStory ? 14 : 9}px; color: rgba(255,255,255,.42); font-size: ${isStory ? 9 : isLandscape ? 6 : 7}px; font-weight: 900; letter-spacing: .1em; }
    .signals-board { display: grid; grid-template-columns: ${isLandscape ? "58% 42%" : "62% 38%"}; gap: ${isStory ? 22 : isLandscape ? 12 : 16}px; padding: ${isStory ? 28 : isLandscape ? 14 : 20}px; overflow: hidden; }
    .signal-screen { position: relative; min-width: 0; overflow: hidden; border: ${isStory ? 8 : 6}px solid #1e2730; border-radius: ${isStory ? 24 : 17}px; background: #e8edf5; box-shadow: 0 18px 44px rgba(0,0,0,.4); }
    .signal-screen img { width: 100%; height: 100%; object-fit: cover; object-position: left top; }
    .signal-stack { display: grid; gap: ${isStory ? 14 : isLandscape ? 7 : 10}px; min-width: 0; }
    .signal-stack div { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: ${isStory ? 14 : 9}px; min-width: 0; padding: ${isStory ? 18 : isLandscape ? 9 : 13}px; border: 1px solid rgba(255,255,255,.14); border-radius: ${isStory ? 18 : 13}px; background: rgba(255,255,255,.055); }
    .signal-stack span { display: grid; place-items: center; width: ${isStory ? 38 : 27}px; height: ${isStory ? 38 : 27}px; border-radius: 9px; background: ${concept.accent}; color: #071016; font-size: ${isStory ? 11 : isLandscape ? 7 : 9}px; font-weight: 950; }
    .signal-stack strong { min-width: 0; color: white; font-size: ${isStory ? 17 : isLandscape ? 9 : 13}px; line-height: 1.12; }
    .checklist-board { display: grid; grid-template-columns: repeat(${isLandscape ? 2 : 2}, minmax(0,1fr)); gap: ${isStory ? 17 : isLandscape ? 9 : 12}px; padding: ${isStory ? 29 : isLandscape ? 15 : 21}px; }
    .check-item { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; align-items: center; column-gap: ${isStory ? 15 : 10}px; min-width: 0; padding: ${isStory ? 22 : isLandscape ? 11 : 16}px; border: 1px solid rgba(255,255,255,.14); border-radius: ${isStory ? 19 : 14}px; background: linear-gradient(145deg, rgba(25,35,42,.94), rgba(8,13,17,.9)); }
    .check-item span { grid-row: 1 / 3; display: grid; place-items: center; width: ${isStory ? 44 : 31}px; height: ${isStory ? 44 : 31}px; border-radius: 50%; background: color-mix(in srgb, ${concept.accent} 18%, #121a20); border: 1px solid color-mix(in srgb, ${concept.accent} 55%, transparent); color: ${concept.accent}; font-size: ${isStory ? 16 : isLandscape ? 9 : 12}px; font-weight: 950; }
    .check-item strong { color: white; font-size: ${isStory ? 19 : isLandscape ? 10 : 14}px; line-height: 1.1; }
    .check-item small { margin-top: ${isStory ? 7 : 4}px; color: ${concept.accent}; font-size: ${isStory ? 9 : isLandscape ? 6 : 7}px; font-weight: 950; letter-spacing: .11em; }
    .footer {
      position: relative;
      z-index: 4;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 22px;
      flex: 0 0 auto;
      margin-top: ${isLandscape ? 18 : isStory ? 48 : 24}px;
    }
    .cta {
      display: inline-flex;
      align-items: center;
      min-height: ${isStory ? 68 : isLandscape ? 46 : 56}px;
      padding: 0 ${isStory ? 28 : 22}px;
      border-radius: ${isStory ? 18 : 14}px;
      background: ${concept.accent};
      color: #071016;
      font-size: ${isLandscape ? 15 : isStory ? 21 : 17}px;
      font-weight: 900;
      box-shadow: 0 16px 38px color-mix(in srgb, ${concept.accent} 24%, transparent);
    }
    .url {
      color: rgba(255,255,255,.78);
      font-size: ${isLandscape ? 14 : isStory ? 21 : 17}px;
      font-weight: 800;
      white-space: nowrap;
    }
    .story .main { margin-top: 88px; }
    .story .visual-stage { max-height: 800px; }
    .portrait .visual-stage { max-height: 580px; }
    .square .visual-stage { max-height: 430px; }
    .concept-one-suite-school-day.story .visual-stage,
    .concept-one-suite-school-day.portrait .visual-stage,
    .concept-one-suite-school-day.square .visual-stage {
      position: relative;
      display: block;
      width: 100%;
      align-self: center;
      overflow: visible;
    }
    .concept-one-suite-school-day.story .visual-stage {
      flex: 0 0 760px;
      max-height: none;
    }
    .concept-one-suite-school-day.story .media.desktop {
      position: absolute;
      z-index: 1;
      left: 0;
      top: 142px;
      width: 76%;
      transform: rotate(-4deg);
    }
    .concept-one-suite-school-day.story .media.tablet {
      position: absolute;
      z-index: 3;
      right: 82px;
      top: 10px;
      width: 38%;
      transform: rotate(4.5deg);
    }
    .concept-one-suite-school-day.story .media.phone {
      position: absolute;
      z-index: 5;
      right: 4px;
      bottom: 10px;
      width: 23%;
      transform: rotate(6deg);
    }
    .concept-one-suite-school-day.portrait .visual-stage {
      flex: 0 0 540px;
      max-height: none;
    }
    .concept-one-suite-school-day.portrait .media.desktop,
    .concept-one-suite-school-day.square .media.desktop {
      position: absolute;
      z-index: 1;
      left: 0;
      top: 86px;
      width: 72%;
      transform: rotate(-3.5deg);
    }
    .concept-one-suite-school-day.portrait .media.tablet,
    .concept-one-suite-school-day.square .media.tablet {
      position: absolute;
      z-index: 3;
      right: 74px;
      top: 4px;
      width: 34%;
      transform: rotate(4deg);
    }
    .concept-one-suite-school-day.portrait .media.phone,
    .concept-one-suite-school-day.square .media.phone {
      position: absolute;
      z-index: 5;
      right: 2px;
      bottom: 2px;
      width: 19%;
      transform: rotate(5.5deg);
    }
    .concept-one-suite-school-day.square .visual-stage {
      flex: 0 0 410px;
      max-height: none;
    }
    .concept-one-suite-school-day.square .media.phone {
      bottom: -20px;
    }
    .landscape .visual-stage { height: 100%; max-height: 468px; }
    .landscape .media.graphic {
      height: auto;
      aspect-ratio: 1.6 / 1;
      align-self: center;
    }
    .landscape .media-label { top: 16px; left: 16px; }
    .landscape.assets-2 .visual-stage,
    .landscape.assets-3 .visual-stage { gap: 11px; }
    .landscape.assets-3 .media-label { display: none; }
  </style>
</head>
<body class="${bodyClass}">
  <main class="canvas">
    <div class="honeycomb"></div>
    <section
      class="safe"
      data-safe-box="true"
      data-safe-x="${safeX}"
      data-safe-y="${safeY}"
      data-safe-width="${format.width - safeX * 2}"
      data-safe-height="${format.height - safeY - safeBottom}"
    >
      <header class="brand" data-layout-item="true">
        <img class="brand-icon" src="${brandAssets.icon}" alt="" />
        <img class="brand-logo" src="${brandAssets.logo}" alt="The BEE Suite" />
        <span class="platform-label">Childcare CRM + Operations</span>
      </header>
      <div class="main">
        <div class="copy" data-layout-item="true">
          <div class="eyebrow">${escapeHtml(concept.eyebrow)}</div>
          <h1>${escapeHtml(concept.headline)}</h1>
          <p class="body-copy">${escapeHtml(concept.body)}</p>
        </div>
        <div class="visual-stage" data-layout-item="true">${media}</div>
      </div>
      <footer class="footer" data-layout-item="true">
        <div class="cta">${escapeHtml(concept.cta)}</div>
        <div class="url">TheBeeSuite.io</div>
      </footer>
    </section>
  </main>
</body>
</html>`;
}

function googleCleanCreativeHtml(concept, format, assetData) {
  const sourceAssets = concept.assets.length && !concept.visualType
    ? concept.assets
    : [{ path: concept.googleAsset, kind: "desktop", label: "PRODUCT SCREEN" }];
  const devices = sourceAssets
    .map((asset, index) => {
      const kind = asset.kind.includes("phone")
        ? "phone"
        : asset.kind.includes("tablet")
          ? "tablet"
          : "desktop";
      return `<div class="device ${kind} device-${index + 1}">
        <div class="screen"><img src="${assetData.get(asset.path)}" alt="" /></div>
        <span class="sensor" aria-hidden="true"></span>
        <span class="base" aria-hidden="true"></span>
      </div>`;
    })
    .join("");
  const allDesktop = sourceAssets.length === 2 && sourceAssets.every((asset) => asset.kind.includes("desktop"));
  const allPhones = sourceAssets.length === 3 && sourceAssets.every((asset) => asset.kind === "phone");
  const isSquare = format.width === format.height;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${format.width}, initial-scale=1" />
  <title>${escapeHtml(concept.headline)} clean image asset</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: ${format.width}px;
      height: ${format.height}px;
      overflow: hidden;
      background: #05070a;
    }
    main {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background:
        radial-gradient(circle at 82% 12%, color-mix(in srgb, ${concept.accent} 24%, transparent), transparent 35%),
        radial-gradient(circle at 8% 88%, rgba(245,181,27,.18), transparent 32%),
        linear-gradient(145deg, #111a23, #06090d 52%, #020406);
    }
    main::before {
      content: "";
      position: absolute;
      inset: 0;
      opacity: .16;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='56' viewBox='0 0 64 56'%3E%3Cg fill='none' stroke='%23f5b51b' stroke-opacity='.34' stroke-width='.8'%3E%3Cpath d='M16 .5H48L63.5 28 48 55.5H16L.5 28Z'/%3E%3Cpath d='M-16-27.5H16L31.5 0 16 27.5H-16L-31.5 0Z'/%3E%3Cpath d='M48-27.5H80L95.5 0 80 27.5H48L32.5 0Z'/%3E%3Cpath d='M-16 28.5H16L31.5 56 16 83.5H-16L-31.5 56Z'/%3E%3Cpath d='M48 28.5H80L95.5 56 80 83.5H48L32.5 56Z'/%3E%3C/g%3E%3C/svg%3E");
      background-size: 64px 56px;
      mask-image: linear-gradient(120deg, black, transparent 78%);
    }
    .device {
      position: absolute;
      filter: drop-shadow(0 34px 40px rgba(0,0,0,.48));
    }
    .screen {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #fffdf7;
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
    }
    .desktop {
      aspect-ratio: 1.58 / 1;
      padding: ${isSquare ? "14px 14px 20px" : "10px 10px 15px"};
      border: 1px solid rgba(255,255,255,.28);
      border-radius: ${isSquare ? 26 : 20}px;
      background: linear-gradient(145deg, #3d4650, #0a0e13 72%);
    }
    .desktop .screen { border-radius: ${isSquare ? 14 : 10}px; }
    .desktop .base {
      position: absolute;
      z-index: -1;
      left: 50%;
      bottom: ${isSquare ? -26 : -19}px;
      width: 100%;
      height: ${isSquare ? 31 : 23}px;
      transform: translateX(-50%);
      clip-path: polygon(3% 0, 97% 0, 100% 68%, 94% 100%, 6% 100%, 0 68%);
      border-radius: 0 0 20px 20px;
      background: linear-gradient(180deg, #8a939c, #30383f 45%, #11161b);
      box-shadow: inset 0 1px rgba(255,255,255,.45), 0 12px 25px rgba(0,0,0,.35);
    }
    .tablet {
      aspect-ratio: .75 / 1;
      padding: ${isSquare ? 15 : 11}px;
      border: 1px solid rgba(255,255,255,.28);
      border-radius: ${isSquare ? 34 : 26}px;
      background: linear-gradient(145deg, #3a444e, #090d12 72%);
    }
    .tablet .screen { border-radius: ${isSquare ? 20 : 15}px; }
    .tablet .sensor {
      position: absolute;
      top: ${isSquare ? 7 : 5}px;
      left: 50%;
      width: ${isSquare ? 8 : 6}px;
      height: ${isSquare ? 8 : 6}px;
      transform: translateX(-50%);
      border-radius: 50%;
      background: #010203;
    }
    .phone {
      aspect-ratio: .462 / 1;
      padding: ${isSquare ? 11 : 8}px;
      border: 1px solid rgba(255,255,255,.28);
      border-radius: ${isSquare ? 40 : 30}px;
      background: linear-gradient(145deg, #3b4550, #080c11 72%);
    }
    .phone .screen { border-radius: ${isSquare ? 30 : 23}px; }
    .phone .sensor {
      position: absolute;
      z-index: 3;
      top: ${isSquare ? 8 : 6}px;
      left: 50%;
      width: 36%;
      height: ${isSquare ? 20 : 15}px;
      transform: translateX(-50%);
      border-radius: 999px;
      background: #05070a;
    }
    .count-3 .device-1 { left: ${isSquare ? 5 : 6}%; bottom: ${isSquare ? 17 : 16}%; width: ${isSquare ? 72 : 58}%; transform: rotate(-4deg); }
    .count-3 .device-2 { right: ${isSquare ? 13 : 16}%; top: ${isSquare ? 9 : 8}%; width: ${isSquare ? 34 : 25}%; transform: rotate(4deg); }
    .count-3 .device-3 { right: ${isSquare ? 4 : 4}%; bottom: ${isSquare ? 8 : 9}%; width: ${isSquare ? 19 : 13}%; transform: rotate(6deg); }
    .three-phones .device-1 { left: ${isSquare ? 8 : 18}%; top: ${isSquare ? 25 : 10}%; width: ${isSquare ? 22 : 16}%; transform: rotate(-5deg); }
    .three-phones .device-2 { left: ${isSquare ? 39 : 42}%; top: ${isSquare ? 15 : 6}%; width: ${isSquare ? 22 : 16}%; transform: rotate(0deg); }
    .three-phones .device-3 { right: ${isSquare ? 8 : 18}%; top: ${isSquare ? 25 : 10}%; width: ${isSquare ? 22 : 16}%; transform: rotate(5deg); }
    .count-2:not(.two-desktops) .desktop { left: ${isSquare ? 7 : 7}%; bottom: ${isSquare ? 18 : 16}%; width: ${isSquare ? 72 : 62}%; transform: rotate(-3deg); }
    .count-2:not(.two-desktops) .tablet { left: ${isSquare ? 15 : 15}%; top: ${isSquare ? 8 : 7}%; width: ${isSquare ? 43 : 31}%; transform: rotate(-3deg); }
    .count-2:not(.two-desktops) .phone { right: ${isSquare ? 10 : 10}%; bottom: ${isSquare ? 10 : 9}%; width: ${isSquare ? 25 : 17}%; transform: rotate(5deg); }
    .two-desktops .device-1 { left: 3%; top: ${isSquare ? 16 : 14}%; width: ${isSquare ? 63 : 57}%; transform: rotate(-4deg); }
    .two-desktops .device-2 { right: 3%; bottom: ${isSquare ? 16 : 14}%; width: ${isSquare ? 63 : 57}%; transform: rotate(4deg); }
    .count-1 .device { left: 50%; top: 50%; width: ${isSquare ? 82 : 70}%; transform: translate(-50%, -50%) rotate(-2deg); }
    .count-1 .desktop .base { transform: translateX(-50%); }
    .glow {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 62%;
      height: 44%;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: color-mix(in srgb, ${concept.accent} 22%, transparent);
      filter: blur(70px);
    }
  </style>
</head>
<body>
  <main class="count-${sourceAssets.length} ${allDesktop ? "two-desktops" : ""} ${allPhones ? "three-phones" : ""}" data-layout-item="true">
    <div class="glow" aria-hidden="true"></div>
    ${devices}
  </main>
</body>
</html>`;
}

async function validatePage(page, fileName, format) {
  const result = await page.evaluate(({ width, height }) => {
    const root = document.documentElement;
    const images = [...document.images].map((image) => ({
      alt: image.alt,
      loaded: image.complete && image.naturalWidth > 0,
    }));
    const tolerance = 1;
    const outside = [...document.querySelectorAll("[data-layout-item]")].flatMap((element) => {
      const box = element.getBoundingClientRect();
      return box.left < -tolerance ||
        box.top < -tolerance ||
        box.right > width + tolerance ||
        box.bottom > height + tolerance
        ? [
            {
              element: element.className,
              box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
            },
          ]
        : [];
    });
    const overflow = [...document.querySelectorAll(".copy, h1, .body-copy, .visual-stage, .footer")].flatMap(
      (element) => {
        const textElement = element.matches("h1, .body-copy");
        const intentionalFloatingStage =
          element.matches(".visual-stage") &&
          document.body.classList.contains("concept-one-suite-school-day");
        const hasOverflow = !intentionalFloatingStage &&
          element.scrollWidth > element.clientWidth + tolerance ||
          (!intentionalFloatingStage && !textElement && element.scrollHeight > element.clientHeight + tolerance);
        return hasOverflow
          ? [
              {
                element: element.className || element.localName,
                scroll: [element.scrollWidth, element.scrollHeight],
                client: [element.clientWidth, element.clientHeight],
              },
            ]
          : [];
      },
    );
    return {
      root: root.localName,
      dimensions: [root.scrollWidth, root.scrollHeight],
      images,
      outside,
      overflow,
    };
  }, format);

  const failedImages = result.images.filter((image) => !image.loaded);
  if (
    result.root !== "html" ||
    result.dimensions[0] !== format.width ||
    result.dimensions[1] !== format.height ||
    failedImages.length ||
    result.outside.length ||
    result.overflow.length
  ) {
    throw new Error(
      `${fileName} failed layout validation:\n${JSON.stringify(
        { ...result, failedImages },
        null,
        2,
      )}`,
    );
  }
}

async function settleImagePaint(page) {
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images].map(async (image) => {
        if (!image.complete) {
          await new Promise((resolve) => image.addEventListener("load", resolve, { once: true }));
        }
        if (typeof image.decode === "function") {
          await image.decode().catch(() => undefined);
        }
      }),
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function writeFileWithRetry(filePath, data, attempts = 12) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await writeFile(filePath, data);
      return;
    } catch (error) {
      if (attempt === attempts || !["EBUSY", "EPERM", "UNKNOWN"].includes(error?.code)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }
}

function manifest() {
  return {
    title: "The BEE Suite Social and Paid Creative Pack",
    createdAt: releaseDate,
    releaseVersion,
    strategy: "Warm Command Center with current product proof",
    landingPage: "https://thebeesuite.io",
    concepts: concepts.map((concept) => ({
      id: concept.id,
      landingPage: concept.id === "model-fragmentation-cost"
        ? "https://thebeesuite.io/brand/the-bee-suite/marketing/current/savings-calculator.html"
        : "https://thebeesuite.io",
      audience: concept.audience,
      goal: concept.goal,
      copy: {
        eyebrow: concept.eyebrow,
        headline: concept.headline,
        body: concept.body,
        cta: concept.cta,
        organicCaption: concept.organicCaption,
        paidPrimary: concept.paidPrimary,
        paidHeadline: concept.paidHeadline,
        paidDescription: concept.paidDescription,
        hashtags: concept.hashtags,
        platformCopy: {
          meta: {
            primaryText: concept.paidPrimary,
            headline: concept.paidHeadline,
            description: concept.paidDescription,
          },
          linkedin: {
            introText: concept.paidPrimary,
            headline: concept.paidHeadline,
          },
          tiktok: {
            hook: concept.headline,
            caption: `${concept.paidDescription} ${concept.hashtags.slice(0, 3).join(" ")}`,
          },
          google: {
            businessName: "The BEE Suite",
            ...googleCopyByConcept[concept.id],
          },
        },
      },
      sourceAssets: concept.assets.map((asset) => ({
        path: `public/brand/the-bee-suite/${asset.path}`,
        deviceOrType: asset.label,
      })).concat({
        path: `public/brand/the-bee-suite/${concept.googleAsset}`,
        deviceOrType: "GOOGLE CLEAN IMAGE SOURCE",
      }),
      exports: Object.entries(allFormats).map(([formatName, format]) => ({
        format: formatName,
        dimensions: `${format.width}x${format.height}`,
        placements: format.placements,
        file: `${concept.id}--${formatName}.png`,
      })),
    })),
    guardrails: [
      "All user-facing copy, logos, dimensions, and safe zones are deterministic.",
      "Every product image comes from the approved current light-mode screenshot and SOP graphic set.",
      "Google clean image candidates use intact light-mode product screens inside a single device composition with no added logo, headline, CTA, or button.",
      "No customer results, prices, testimonials, certifications, or compliance guarantees are claimed.",
      "Sensitive decisions remain with authorized staff; creative does not imply autonomous legal, medical, safety, custody, billing, licensing, or compliance decisions.",
      "Campaign activation, budgets, targeting, and destination tracking require separate approval.",
    ],
  };
}

function copyMarkdown() {
  const sections = concepts
    .map(
      (concept) => {
        const googleCopy = googleCopyByConcept[concept.id];
        return `## ${concept.headline}

**Campaign ID:** \`${concept.id}\`
**Audience:** ${concept.audience}
**Goal:** ${concept.goal}
**Landing page:** ${concept.id === "model-fragmentation-cost" ? "https://thebeesuite.io/brand/the-bee-suite/marketing/current/savings-calculator.html" : "https://thebeesuite.io"}

### Organic social caption

${concept.organicCaption}

${concept.hashtags.join(" ")}

### Paid-ad copy

**Primary text:** ${concept.paidPrimary}

**Headline:** ${concept.paidHeadline}

**Description:** ${concept.paidDescription}

**CTA:** ${concept.cta}

### Google asset-field copy

**Business name:** The BEE Suite

**Short headlines (30 characters maximum):**

${googleCopy.shortHeadlines.map((headline) => `- ${headline}`).join("\n")}

**Long headline (90 characters maximum):** ${googleCopy.longHeadline}

**Descriptions (90 characters maximum):**

${googleCopy.descriptions.map((description) => `- ${description}`).join("\n")}

### Recommended files

- Meta and Instagram: square, portrait, and story exports.
- LinkedIn: landscape or portrait export.
- Google responsive display and Demand Gen: \`google-square-clean\` and \`google-landscape-clean\` image candidates, paired with the Google copy fields above.
- TikTok and Reels: use the story export as a video-production end card or animate the product frames without changing the copy; export the final video to the selected placement specification.
`;
      },
    )
    .join("\n");

  return `# The BEE Suite Social and Paid Campaign Library

Updated: July 29, 2026

This pack turns the approved light-mode product screenshots and SOP graphics into platform-ready organic and paid creative. It is a creative library, not authorization to activate campaigns or spend budget.

## Platform export map

| Export | Dimensions | Primary use |
| --- | ---: | --- |
| Square | 1080 x 1080 | Instagram, Facebook, LinkedIn |
| Portrait | 1080 x 1350 | Instagram and Facebook feed, LinkedIn |
| Story | 1080 x 1920 | Instagram Stories, Facebook Stories, Reels, TikTok video end card |
| Landscape | 1200 x 628 | LinkedIn sponsored content and Facebook link ads |
| Google square clean | 1200 x 1200 | Google Demand Gen and responsive display image candidate |
| Google landscape clean | 1200 x 628 | Google Demand Gen and responsive display image candidate |

## Campaign rules

- Keep headlines and CTAs exactly as exported unless a replacement is reviewed for fit.
- Use \`https://thebeesuite.io\` as the default destination.
- Add platform-specific UTM parameters at campaign setup; do not bake tracking parameters into creative.
- Do not add unsupported performance claims, testimonials, prices, certifications, or compliance guarantees.
- Keep product screenshots intact. Do not crop away role, school, family, or reporting context that explains the screen.
- Pair story exports with motion only when the first and final frames preserve the exact headline and CTA.
- Use the clean Google files with the supplied Google text fields. Final acceptance remains subject to Google Ads review and account policy.

${sections}
`.trimEnd() + "\n";
}

function reviewHtml() {
  const sections = concepts
    .map((concept) => {
      const cards = Object.entries(allFormats)
        .map(
          ([formatName, format]) => `<article>
            <a href="${concept.id}--${formatName}.png">
              <img src="${concept.id}--${formatName}.png" alt="${escapeHtml(
                `${concept.headline} ${formatName} creative`,
              )}" loading="lazy" />
            </a>
            <div class="meta">
              <strong>${escapeHtml(formatName.toUpperCase())}</strong>
              <span>${format.width} × ${format.height}</span>
            </div>
          </article>`,
        )
        .join("");
      return `<section>
        <div class="section-copy">
          <span>${escapeHtml(concept.eyebrow)}</span>
          <h2>${escapeHtml(concept.headline)}</h2>
          <p>${escapeHtml(concept.audience)}</p>
        </div>
        <div class="grid">${cards}</div>
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>The BEE Suite Social and Paid Creative Library</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #05070a;
      color: white;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      padding: 54px clamp(24px, 5vw, 72px);
      border-bottom: 1px solid rgba(255,255,255,.1);
      background:
        radial-gradient(circle at 10% 0%, rgba(245,181,27,.22), transparent 30rem),
        linear-gradient(135deg, #101820, #05070a);
    }
    h1 { max-width: 900px; margin: 0; font-size: clamp(38px, 6vw, 72px); line-height: .98; }
    header p { max-width: 780px; margin: 22px 0 0; color: rgba(255,255,255,.7); font-size: 18px; line-height: 1.55; }
    .tool-link { display: inline-flex; margin-top: 24px; padding: 13px 18px; border-radius: 999px; background: #f5b51b; color: #07101a; font-weight: 900; text-decoration: none; }
    section { padding: 44px clamp(24px, 5vw, 72px); border-bottom: 1px solid rgba(255,255,255,.08); }
    .section-copy span { color: #f5b51b; font-size: 13px; font-weight: 900; letter-spacing: .1em; }
    h2 { margin: 10px 0 0; font-size: clamp(28px, 4vw, 48px); }
    .section-copy p { margin: 10px 0 0; color: rgba(255,255,255,.62); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-top: 28px; align-items: start; }
    article { overflow: hidden; border: 1px solid rgba(255,255,255,.12); border-radius: 16px; background: rgba(255,255,255,.05); }
    article a { display: block; background: #0b1118; }
    article img { display: block; width: 100%; height: auto; }
    .meta { display: flex; justify-content: space-between; gap: 16px; padding: 14px 16px; color: rgba(255,255,255,.68); font-size: 13px; }
    .meta strong { color: white; }
  </style>
</head>
<body>
  <header>
    <h1>Social and paid creative built from real product proof.</h1>
    <p>${concepts.length} campaign directions with branded Meta, Instagram, LinkedIn, TikTok, and Reels creative plus clean Google image candidates and platform-specific copy fields.</p>
    <a class="tool-link" href="savings-calculator.html">Open the dynamic savings model</a>
  </header>
  ${sections}
</body>
</html>`;
}

function savingsCalculatorHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>The BEE Suite | Dynamic Savings Model</title>
  <style>
    * { box-sizing: border-box; }
    :root { color-scheme: dark; }
    body { margin: 0; min-height: 100vh; background: #050a10; color: #f8fbff; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body::before { content: ""; position: fixed; inset: 0; pointer-events: none; opacity: .2; background: radial-gradient(circle at 82% 10%, rgba(245,181,27,.5), transparent 28rem), radial-gradient(circle at 8% 70%, rgba(27,201,188,.32), transparent 26rem); }
    main { position: relative; width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 40px 0 64px; }
    nav { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 48px; }
    nav a { color: #f8fbff; text-decoration: none; font-weight: 800; }
    .brand { display: flex; align-items: center; gap: 11px; }
    .mark { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; background: #f5b51b; color: #07101a; }
    .back { color: rgba(248,251,255,.68); font-size: 14px; }
    header { max-width: 800px; }
    .eyebrow { display: inline-flex; color: #f5b51b; font-size: 13px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 14px 0 16px; font-size: clamp(42px, 7vw, 78px); line-height: .95; letter-spacing: -.045em; }
    header p { margin: 0; max-width: 700px; color: rgba(248,251,255,.7); font-size: clamp(17px, 2vw, 21px); line-height: 1.55; }
    .workspace { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(330px, .92fr); gap: 22px; margin-top: 40px; }
    .panel { border: 1px solid rgba(255,255,255,.12); border-radius: 26px; background: rgba(11,18,26,.86); box-shadow: 0 30px 80px rgba(0,0,0,.28); overflow: hidden; }
    .panel-head { padding: 24px 26px 18px; border-bottom: 1px solid rgba(255,255,255,.08); }
    .panel-head h2 { margin: 0; font-size: 22px; }
    .panel-head p { margin: 7px 0 0; color: rgba(248,251,255,.58); line-height: 1.45; }
    form { padding: 24px 26px 28px; }
    fieldset { margin: 0 0 26px; padding: 0; border: 0; }
    legend { width: 100%; margin-bottom: 15px; color: #1bc9bc; font-size: 13px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    label { display: grid; gap: 8px; color: rgba(248,251,255,.72); font-size: 13px; font-weight: 700; line-height: 1.35; }
    input { width: 100%; border: 1px solid rgba(255,255,255,.14); border-radius: 13px; padding: 14px 15px; background: rgba(255,255,255,.055); color: white; font: inherit; font-size: 17px; font-weight: 800; outline: none; }
    input:focus { border-color: #f5b51b; box-shadow: 0 0 0 3px rgba(245,181,27,.15); }
    .results { display: grid; align-content: start; gap: 14px; padding: 26px; }
    .result { padding: 20px; border: 1px solid rgba(255,255,255,.1); border-radius: 18px; background: rgba(255,255,255,.04); }
    .result span { display: block; color: rgba(248,251,255,.58); font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
    .result strong { display: block; margin-top: 7px; font-size: clamp(28px, 5vw, 44px); letter-spacing: -.04em; }
    .result.primary { border-color: rgba(245,181,27,.35); background: linear-gradient(145deg, rgba(245,181,27,.18), rgba(245,181,27,.05)); }
    .result.primary strong { color: #f5b51b; }
    .result.negative strong { color: #ff8f8f; }
    .assumptions { margin: 6px 0 0; padding: 17px 18px; border-radius: 16px; background: rgba(27,201,188,.08); color: rgba(248,251,255,.68); font-size: 13px; line-height: 1.55; }
    .assumptions strong { color: #1bc9bc; }
    .fine-print { margin: 20px 0 0; color: rgba(248,251,255,.45); font-size: 12px; line-height: 1.55; }
    @media (max-width: 800px) { .workspace { grid-template-columns: 1fr; } .fields { grid-template-columns: 1fr; } main { padding-top: 24px; } nav { margin-bottom: 34px; } }
  </style>
</head>
<body>
  <main>
    <nav>
      <a class="brand" href="/"><span class="mark">⬡</span><span>The BEE Suite</span></a>
      <a class="back" href="/">← Product site</a>
    </nav>
    <header>
      <span class="eyebrow">Interactive planning model</span>
      <h1>Model the cost of fragmented operations.</h1>
      <p>Enter your own software and administrative-work assumptions to compare a current-state scenario with a more connected one.</p>
    </header>
    <div class="workspace">
      <section class="panel">
        <div class="panel-head">
          <h2>Your assumptions</h2>
          <p>Use combined monthly totals across the locations you want to model.</p>
        </div>
        <form id="model-form">
          <fieldset>
            <legend>Current fragmented model</legend>
            <div class="fields">
              <label>Monthly software total ($)<input id="current-software" type="number" min="0" step="25" value="1600" /></label>
              <label>Admin reconciliation hours / week<input id="current-hours" type="number" min="0" step="0.5" value="18" /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Modeled connected scenario</legend>
            <div class="fields">
              <label>Monthly software total ($)<input id="modeled-software" type="number" min="0" step="25" value="1100" /></label>
              <label>Admin reconciliation hours / week<input id="modeled-hours" type="number" min="0" step="0.5" value="8" /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Planning context</legend>
            <div class="fields">
              <label>Loaded admin labor cost / hour ($)<input id="hourly-cost" type="number" min="0" step="1" value="32" /></label>
              <label>Locations in this scenario<input id="locations" type="number" min="1" step="1" value="3" /></label>
            </div>
          </fieldset>
          <p class="fine-print">This browser-only model does not send or store the values you enter. Location count is shown as context; software and labor inputs should already represent the combined totals for those locations.</p>
        </form>
      </section>
      <aside class="panel results" aria-live="polite">
        <div class="result"><span>Current annual modeled cost</span><strong id="current-total">$0</strong></div>
        <div class="result"><span>Connected annual modeled cost</span><strong id="modeled-total">$0</strong></div>
        <div class="result primary" id="difference-card"><span id="difference-label">Modeled annual difference</span><strong id="difference">$0</strong></div>
        <div class="result"><span>Locations modeled</span><strong id="location-output">0</strong></div>
        <p class="assumptions"><strong>Planning estimate only.</strong> Results reflect only the values entered here. They are not a quote, ROI promise, guarantee, or representation of actual BEE Suite pricing or customer outcomes.</p>
      </aside>
    </div>
  </main>
  <script>
    const ids = ["current-software", "current-hours", "modeled-software", "modeled-hours", "hourly-cost", "locations"];
    const value = (id) => Math.max(0, Number(document.getElementById(id).value) || 0);
    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    function calculate() {
      const hourly = value("hourly-cost");
      const current = value("current-software") * 12 + value("current-hours") * hourly * 52;
      const modeled = value("modeled-software") * 12 + value("modeled-hours") * hourly * 52;
      const difference = current - modeled;
      document.getElementById("current-total").textContent = money.format(current);
      document.getElementById("modeled-total").textContent = money.format(modeled);
      document.getElementById("difference").textContent = money.format(Math.abs(difference));
      document.getElementById("difference-label").textContent = difference >= 0 ? "Modeled annual difference" : "Modeled annual increase";
      document.getElementById("difference-card").classList.toggle("negative", difference < 0);
      document.getElementById("location-output").textContent = String(Math.max(1, Math.round(value("locations"))));
    }
    ids.forEach((id) => document.getElementById(id).addEventListener("input", calculate));
    calculate();
  </script>
</body>
</html>`;
}

async function main() {
  await mkdir(publicDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const brandAssets = {
    logo: await imageDataUrl(logoPath),
    icon: await imageDataUrl(iconPath),
  };
  const uniqueAssets = [
    ...new Set(
      concepts.flatMap((concept) => [
        ...concept.assets.map((asset) => asset.path),
        concept.googleAsset,
      ]),
    ),
  ];
  const assetData = new Map(
    await Promise.all(
      uniqueAssets.map(async (relativePath) => [
        relativePath,
        await imageDataUrl(path.join(root, "public", "brand", "the-bee-suite", relativePath)),
      ]),
    ),
  );

  const requestedConceptIds = new Set(process.argv.slice(2));
  const renderConcepts = requestedConceptIds.size
    ? concepts.filter((concept) => requestedConceptIds.has(concept.id))
    : concepts;
  const unknownConceptIds = [...requestedConceptIds].filter(
    (id) => !concepts.some((concept) => concept.id === id),
  );
  if (unknownConceptIds.length) {
    throw new Error(`Unknown concept IDs: ${unknownConceptIds.join(", ")}`);
  }

  const browser = await chromium.launch();
  try {
    for (const concept of renderConcepts) {
      for (const [formatName, format] of Object.entries(formats)) {
        const page = await browser.newPage({
          viewport: { width: format.width, height: format.height },
          deviceScaleFactor: 1,
        });
        const fileName = `${concept.id}--${formatName}.png`;
        try {
          await page.setContent(
            creativeHtml(concept, formatName, format, brandAssets, assetData),
            { waitUntil: "networkidle" },
          );
          await settleImagePaint(page);
          await validatePage(page, fileName, format);
          const screenshot = await page.screenshot({ type: "png" });
          await writeFileWithRetry(path.join(publicDir, fileName), screenshot);
          console.log(`Rendered ${fileName}`);
        } finally {
          await page.close();
        }
      }
      for (const [formatName, format] of Object.entries(googleFormats)) {
        const page = await browser.newPage({
          viewport: { width: format.width, height: format.height },
          deviceScaleFactor: 1,
        });
        const fileName = `${concept.id}--${formatName}.png`;
        try {
          await page.setContent(
            googleCleanCreativeHtml(concept, format, assetData),
            { waitUntil: "networkidle" },
          );
          await settleImagePaint(page);
          await validatePage(page, fileName, format);
          const screenshot = await page.screenshot({ type: "png" });
          await writeFileWithRetry(path.join(publicDir, fileName), screenshot);
          console.log(`Rendered ${fileName}`);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const manifestContent = `${JSON.stringify(manifest(), null, 2)}\n`;
  const copyContent = copyMarkdown();
  const reviewContent = reviewHtml();
  const savingsCalculatorContent = savingsCalculatorHtml();
  await writeFileWithRetry(path.join(publicDir, "manifest.json"), manifestContent);
  await writeFileWithRetry(path.join(publicDir, "index.html"), reviewContent);
  await writeFileWithRetry(
    path.join(publicDir, "savings-calculator.html"),
    savingsCalculatorContent,
  );
  await writeFileWithRetry(path.join(outputDir, "manifest.json"), manifestContent);
  await writeFileWithRetry(path.join(outputDir, "campaign-copy.md"), copyContent);
  await writeFileWithRetry(path.join(outputDir, "review-board.html"), reviewContent);
  await writeFileWithRetry(
    path.join(root, "docs", "BEE_SUITE_SOCIAL_AND_PAID_CAMPAIGN_LIBRARY.md"),
    copyContent,
  );

  console.log(`Rendered ${renderConcepts.length * Object.keys(allFormats).length} assets.`);
  console.log(`Public review: ${path.relative(root, path.join(publicDir, "index.html"))}`);
}

await main();
