import type {
  AnnouncementsPageData,
  ClassroomDashboardData,
  DailyReportsPageData,
  MessagesPageData,
} from "@/components/live-ops-pages";

const today = new Date();
const demoCenter = { name: "Kid City USA - Demo", crmLocationId: "Kid City USA - Demo" };

function isoWithOffset(days: number, hour = 9, minute = 0) {
  const date = new Date(today);
  date.setDate(today.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export const executiveClassroomDemoRows: ClassroomDashboardData["classrooms"] = [
  {
    id: "exec-demo-classroom-infant-hive",
    name: "Infant Hive",
    ageGroup: "Infant",
    capacity: 10,
    ratioRule: "1:4 target",
    center: demoCenter,
    _count: { children: 8, staff: 2, dailyReports: 8, incidents: 0 },
  },
  {
    id: "exec-demo-classroom-toddler-hive",
    name: "Toddler Hive",
    ageGroup: "Toddler",
    capacity: 15,
    ratioRule: "1:6 target",
    center: demoCenter,
    _count: { children: 12, staff: 2, dailyReports: 11, incidents: 1 },
  },
  {
    id: "exec-demo-classroom-threes-hive",
    name: "3's Hive",
    ageGroup: "3's",
    capacity: 14,
    ratioRule: "1:9 target",
    center: demoCenter,
    _count: { children: 11, staff: 2, dailyReports: 10, incidents: 0 },
  },
  {
    id: "exec-demo-classroom-prek-hive",
    name: "Pre-K Hive",
    ageGroup: "Pre-K",
    capacity: 18,
    ratioRule: "1:12 target",
    center: demoCenter,
    _count: { children: 14, staff: 2, dailyReports: 12, incidents: 0 },
  },
  {
    id: "exec-demo-classroom-afterschool-hive",
    name: "Afterschool Hive",
    ageGroup: "Afterschool",
    capacity: 22,
    ratioRule: "1:18 target",
    center: demoCenter,
    _count: { children: 12, staff: 1, dailyReports: 9, incidents: 0 },
  },
];

export const executiveParentMessageDemoRows: MessagesPageData["messages"] = [
  {
    id: "exec-demo-message-tour-follow-up",
    subject: "Tour follow-up and enrollment packet",
    body:
      "Thanks again for the tour. We would love to move forward and wanted to confirm the next steps for the toddler room.",
    channel: "portal",
    priority: "high",
    sentiment: "warm",
    readAt: null,
    createdAt: isoWithOffset(0, 8, 35),
    family: { name: "Executive Demo Family", billingEmail: "demo-parent@example.com", centerId: null },
    sender: null,
  },
  {
    id: "exec-demo-message-supplies",
    subject: "Supplies needed",
    body: "Please send two extra changes of clothes and a labeled water bottle tomorrow.",
    channel: "email",
    priority: "normal",
    sentiment: "neutral",
    readAt: isoWithOffset(0, 10, 10),
    createdAt: isoWithOffset(0, 9, 45),
    family: { name: "Executive Demo Family", billingEmail: "demo-parent@example.com", centerId: null },
    sender: { name: "Mr. Bee Draft Assistant", email: "mrbee@thebeesuite.io" },
  },
  {
    id: "exec-demo-message-incident-ack",
    subject: "Incident acknowledgment reminder",
    body:
      "A minor classroom incident report was shared for review. Please acknowledge receipt in the parent portal after reading the note.",
    channel: "portal",
    priority: "urgent",
    sentiment: "sensitive",
    readAt: null,
    createdAt: isoWithOffset(-1, 16, 20),
    family: { name: "Executive Demo Family", billingEmail: "demo-parent@example.com", centerId: null },
    sender: null,
  },
];

export const executiveAnnouncementDemoRows: AnnouncementsPageData["announcements"] = [
  {
    id: "exec-demo-announcement-picture-day",
    title: "Picture Day Reminder",
    body:
      "Picture day is this Thursday. Please send your child in their preferred outfit and include any classroom-specific notes for teachers.",
    audience: { centers: "Kid City USA - Demo", classrooms: ["Infant Hive", "Toddler Hive", "3's Hive"] },
    status: "scheduled",
    sendAt: isoWithOffset(2, 7, 30),
    center: null,
  },
  {
    id: "exec-demo-announcement-weather",
    title: "Weather Watch Update",
    body:
      "We are monitoring tomorrow morning's weather and will send any schedule updates through the portal and email.",
    audience: { centers: "Regional group", tags: ["families", "staff"] },
    status: "draft",
    sendAt: null,
    center: demoCenter,
  },
  {
    id: "exec-demo-announcement-newsletter",
    title: "May Family Newsletter",
    body:
      "This month's newsletter highlights classroom learning themes, staff spotlights, birthdays, and upcoming family events.",
    audience: { centers: "All demo centers", familyStatus: "Enrolled" },
    status: "sent",
    sendAt: isoWithOffset(-4, 8, 0),
    center: null,
  },
];

export const executiveDailyReportDemoRows: DailyReportsPageData["reports"] = [
  {
    id: "exec-demo-daily-report-infant",
    date: isoWithOffset(0, 12, 0),
    mood: "Calm and curious",
    teacherNote: "Enjoyed sensory play, finished most of lunch, and rested after outdoor stroller time.",
    suppliesNeeded: "Diapers",
    sentAt: isoWithOffset(0, 15, 35),
    child: { fullName: "Demo Child A", ageGroup: "Infant" },
    classroom: {
      name: "Infant Hive",
      center: demoCenter,
    },
    _count: { meals: 2, naps: 2, diapers: 4, activities: 3 },
  },
  {
    id: "exec-demo-daily-report-toddler",
    date: isoWithOffset(0, 12, 0),
    mood: "Happy and social",
    teacherNote: "Participated in circle time and practiced sharing during block play.",
    suppliesNeeded: null,
    sentAt: null,
    child: { fullName: "Demo Child B", ageGroup: "Toddler" },
    classroom: {
      name: "Toddler Hive",
      center: demoCenter,
    },
    _count: { meals: 2, naps: 1, diapers: 3, activities: 4 },
  },
  {
    id: "exec-demo-daily-report-prek",
    date: isoWithOffset(-1, 12, 0),
    mood: "Focused",
    teacherNote: "Worked on early literacy centers and helped lead cleanup after art.",
    suppliesNeeded: "Extra clothes",
    sentAt: isoWithOffset(-1, 15, 20),
    child: { fullName: "Demo Child C", ageGroup: "Pre-K" },
    classroom: {
      name: "Pre-K Hive",
      center: demoCenter,
    },
    _count: { meals: 1, naps: 0, diapers: 0, activities: 5 },
  },
];

export const executiveParentPortalDemo = {
  family: {
    id: "exec-demo-family",
    name: "Executive Demo Family",
    billingEmail: "demo-parent@example.com",
    guardians: [
      {
        id: "exec-demo-guardian-a",
        userId: null,
        fullName: "Jordan Demo",
        email: "demo-parent@example.com",
        phone: "(555) 014-1200",
        relation: "Mother",
        preferredCommunication: "email",
      },
      {
        id: "exec-demo-guardian-b",
        userId: null,
        fullName: "Taylor Demo",
        email: "demo-guardian@example.com",
        phone: "(555) 014-1201",
        relation: "Father",
        preferredCommunication: "sms",
      },
    ],
    children: [
      {
        id: "exec-demo-child-a",
        fullName: "Demo Child A",
        preferredName: "Ari",
        ageGroup: "Infant",
        enrollmentStatus: "enrolled",
        startDate: isoWithOffset(-30, 9, 0),
        schedule: { weekly: "Mon-Fri 8:00 AM - 4:30 PM" },
        photoVideoPermission: true,
        fieldTripPermission: false,
        classroom: { name: "Infant Hive", ageGroup: "Infant" },
      },
      {
        id: "exec-demo-child-b",
        fullName: "Demo Child B",
        preferredName: "Mia",
        ageGroup: "Toddler",
        enrollmentStatus: "enrolled",
        startDate: isoWithOffset(-45, 9, 0),
        schedule: { weekly: "Mon, Wed, Fri 8:30 AM - 3:30 PM" },
        photoVideoPermission: true,
        fieldTripPermission: true,
        classroom: { name: "Toddler Hive", ageGroup: "Toddler" },
      },
    ],
  },
  billingAccount: {
    id: "exec-demo-billing-account",
    balanceCents: 124500,
    autopayPlaceholder: false,
  },
  invoices: [
    {
      id: "exec-demo-invoice",
      number: "DEMO-1042",
      status: "OPEN",
      dueDate: isoWithOffset(7, 9, 0),
      totalCents: 124500,
    },
  ],
  payments: [
    {
      id: "exec-demo-payment",
      amountCents: 118000,
      status: "PAID",
      provider: "stripe",
      paidAt: isoWithOffset(-21, 10, 15),
    },
  ],
  ledgerEntries: [
    {
      id: "exec-demo-ledger-charge",
      type: "tuition_charge",
      description: "Weekly tuition",
      amountCents: 124500,
      balanceAfterCents: 124500,
      effectiveAt: isoWithOffset(0, 8, 0),
    },
    {
      id: "exec-demo-ledger-payment",
      type: "payment",
      description: "Card payment",
      amountCents: -118000,
      balanceAfterCents: 0,
      effectiveAt: isoWithOffset(-21, 10, 15),
    },
  ],
  dailyReports: executiveDailyReportDemoRows.slice(0, 2).map((report) => ({
    id: report.id,
    date: report.date,
    mood: report.mood,
    teacherNote: report.teacherNote,
    suppliesNeeded: report.suppliesNeeded,
    child: { fullName: report.child.fullName },
    meals: [{ id: `${report.id}-meal`, mealType: "Lunch", food: "Pasta, peas, and fruit", amount: "Most" }],
    naps: [{ id: `${report.id}-nap`, startsAt: isoWithOffset(0, 12, 30), endsAt: isoWithOffset(0, 14, 0) }],
    diapers: [{ id: `${report.id}-potty`, type: "Dry", occurredAt: isoWithOffset(0, 10, 15), notes: null }],
    activities: [{ id: `${report.id}-activity`, title: "Sensory bins", notes: "Practiced sharing and color sorting." }],
  })),
  incidents: [
    {
      id: "exec-demo-incident",
      occurredAt: isoWithOffset(-1, 10, 45),
      type: "Minor classroom bump",
      description: "Child bumped knee during indoor gross motor play. No visible injury after comfort and observation.",
      actionTaken: "Teacher comforted child, notified director, and shared report for parent acknowledgment.",
      parentAcknowledgedAt: null,
      child: { fullName: "Demo Child B" },
    },
  ],
  messages: executiveParentMessageDemoRows.map((message) => ({
    id: message.id,
    subject: message.subject,
    body: message.body,
    createdAt: message.createdAt,
  })),
  documents: [
    {
      id: "exec-demo-document-allergy",
      name: "Emergency Contact Form",
      type: "family",
      status: "RECEIVED",
      expiresAt: isoWithOffset(60, 9, 0),
    },
    {
      id: "exec-demo-document-policy",
      name: "Policy Acknowledgment",
      type: "enrollment",
      status: "PENDING",
      expiresAt: isoWithOffset(14, 9, 0),
    },
  ],
  announcements: [
    {
      id: "exec-demo-announcement",
      title: "Family picnic Friday",
      body: "Pack a labeled water bottle and sunscreen. Pickup remains at the regular classroom door.",
      sendAt: isoWithOffset(2, 8, 0),
    },
  ],
  currentGuardianId: null,
  notificationPreferences: null,
};
