import { PrismaClient, UserRole, EnrollmentStage, PaymentStatus, DocumentStatus } from "@prisma/client";

const prisma = new PrismaClient();

const firstNames = [
  "Ari", "Sofia", "Mia", "Eli", "Theo", "Amelie", "Noah", "Lena", "Milo", "Ivy",
  "Ezra", "Nora", "Kai", "Luca", "Zoe", "Finn", "Ava", "Leo", "Ruby", "Jude",
  "Cora", "Owen", "Maya", "Remy", "Isla",
];

const lastNames = [
  "Rivera", "Patel", "Morgan", "Nguyen", "Brooks", "Chen", "Lewis", "Shah", "Martin", "Reed",
  "Kim", "Garcia", "Thomas", "Bell", "Carter", "Diaz", "Wright", "Foster", "Bennett", "Adams",
];

const classroomNames = [
  ["Infant Hive", "Infant", 10, "2:8"],
  ["Toddler Hive", "Toddler", 15, "2:12"],
  ["3's Hive", "3's", 14, "2:11"],
  ["Pre-K Hive", "Pre-K", 18, "2:14"],
  ["Afterschool Hive", "Afterschool", 22, "1:12"],
] as const;
const classroomRosterTargets = [8, 12, 11, 14, 12] as const;
const childClassroomAssignments = classroomRosterTargets.flatMap((children, classroomIndex) =>
  Array.from({ length: children }, () => classroomIndex),
);

function requireDestructiveSeedConfirmation() {
  const databaseUrl = process.env.DATABASE_URL || "";
  const allowDestructiveSeed = process.env.ALLOW_DESTRUCTIVE_SEED === "true";
  const localDatabase = /localhost|127\.0\.0\.1|host\.docker\.internal/i.test(databaseUrl);
  if (allowDestructiveSeed || localDatabase) return;

  throw new Error(
    "Refusing to run destructive seed against a non-local database. Set ALLOW_DESTRUCTIVE_SEED=true only after confirming this is an approved empty/staging database.",
  );
}

async function main() {
  requireDestructiveSeedConfirmation();

  await prisma.auditLog.deleteMany();
  await prisma.aiSuggestion.deleteMany();
  await prisma.aiSummary.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.billingAccount.deleteMany();
  await prisma.incidentReport.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.diaperPottyLog.deleteMany();
  await prisma.nap.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.dailyReport.deleteMany();
  await prisma.checkInOutLog.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.document.deleteMany();
  await prisma.formSubmission.deleteMany();
  await prisma.form.deleteMany();
  await prisma.automationRun.deleteMany();
  await prisma.automation.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.message.deleteMany();
  await prisma.note.deleteMany();
  await prisma.task.deleteMany();
  await prisma.tour.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.allergy.deleteMany();
  await prisma.childMedicalNote.deleteMany();
  await prisma.authorizedPickup.deleteMany();
  await prisma.emergencyContact.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.child.deleteMany();
  await prisma.family.deleteMany();
  await prisma.certification.deleteMany();
  await prisma.staffSchedule.deleteMany();
  await prisma.staffProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.classroom.deleteMany();
  await prisma.center.deleteMany();
  await prisma.whiteLabelSettings.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: { name: "The Bee Suite Platform", slug: "bee-suite-demo" },
  });

  const brand = await prisma.brand.create({
    data: {
      tenantId: tenant.id,
      name: "Kid City USA Enterprises",
      slug: "kid-city-usa-enterprises-demo",
      settings: {
        create: {
          brandName: "Kid City USA Enterprises",
          logoUrlPlaceholder: "/brand/kid-city-usa/logo-horizontal.png",
          faviconUrlPlaceholder: "/brand/kid-city-usa/logo-square.jpg",
          primaryColor: "#f6bf35",
          accentColor: "#2fbf8f",
          themeMode: "dark",
          customDomainPlaceholder: "portal.kidcityusa-demo.example",
          legalFooterText: "Compliance-ready documentation support. Not legal or licensing advice.",
        },
      },
    },
  });

  const organization = await prisma.organization.create({
    data: { tenantId: tenant.id, brandId: brand.id, name: "Kid City USA Enterprises" },
  });

  const centerSeeds = [
    ["Kid City USA - Demo", 79],
  ] as const;

  const centers = [];
  for (const [name, licensedCapacity] of centerSeeds) {
    centers.push(
      await prisma.center.create({
        data: {
          organizationId: organization.id,
          name,
          licensedCapacity,
          address: `${100 + centers.length * 24} Garden Lane`,
          phone: `555-010${centers.length}`,
        },
      }),
    );
  }

  const classrooms = [];
  for (let i = 0; i < classroomNames.length; i++) {
    const [name, ageGroup, capacity, ratioRule] = classroomNames[i];
    classrooms.push(
      await prisma.classroom.create({
        data: {
          centerId: centers[i % centers.length].id,
          name,
          ageGroup,
          capacity,
          ratioRule,
        },
      }),
    );
  }

  const users = [];
  users.push(await prisma.user.create({ data: { tenantId: tenant.id, organizationId: organization.id, name: "Parker Wells", email: "platform@beesuite.example", role: UserRole.PLATFORM_OWNER } }));
  users.push(await prisma.user.create({ data: { tenantId: tenant.id, organizationId: organization.id, name: "Jordan Vale", email: "brand@kidcityusa-demo.example", role: UserRole.BRAND_ADMIN } }));
  for (const name of ["Riley Stone", "Morgan Lee"]) {
    users.push(await prisma.user.create({ data: { tenantId: tenant.id, organizationId: organization.id, name, email: `${name.toLowerCase().replace(" ", ".")}@kidcityusa-demo.example`, role: UserRole.REGIONAL_MANAGER } }));
  }

  for (let i = 0; i < 20; i++) {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        organizationId: organization.id,
        name: `Staff ${i + 1} ${lastNames[i % lastNames.length]}`,
        email: `staff${i + 1}@kidcityusa-demo.example`,
        role: i < 3 ? UserRole.CENTER_DIRECTOR : i < 5 ? UserRole.BILLING_ADMIN : UserRole.TEACHER,
      },
    });
    users.push(user);
    await prisma.staffProfile.create({
      data: {
        userId: user.id,
        centerId: centers[i % centers.length].id,
        classroomId: classrooms[i % classrooms.length].id,
        title: i < 3 ? "Center Director" : i < 5 ? "Billing/Admin Staff" : "Teacher",
        backgroundCheckStatus: "placeholder_clear",
        certifications: {
          create: [
            { name: "CPR / First Aid", status: i % 4 === 0 ? "expires_soon" : "active", expiresAt: new Date("2026-06-30") },
          ],
        },
      },
    });
  }

  const families = [];
  const children = [];
  let childIndex = 0;
  for (let i = 0; i < 50; i++) {
    const last = lastNames[i % lastNames.length];
    const family = await prisma.family.create({
      data: {
        centerId: centers[i % centers.length].id,
        name: `${last} Family`,
        address: `${1800 + i} Meadow Street`,
        billingEmail: `${last.toLowerCase()}@example.com`,
        custodyNotes: i % 12 === 0 ? "Restricted custody note visible to director/admin roles only." : null,
        guardians: {
          create: [
            { fullName: `${firstNames[i % firstNames.length]} ${last}`, email: `${last.toLowerCase()}1@example.com`, phone: "555-1200", relation: "Guardian", isBillingContact: true, preferredCommunication: "Portal + SMS" },
            { fullName: `${firstNames[(i + 5) % firstNames.length]} ${last}`, email: `${last.toLowerCase()}2@example.com`, phone: "555-1201", relation: "Guardian" },
          ],
        },
        emergencyContacts: { create: [{ fullName: `Emergency ${last}`, phone: "555-1300", relation: "Grandparent" }] },
        pickups: { create: [{ fullName: `Pickup ${last}`, phone: "555-1400", relation: "Aunt/Uncle", verificationNotes: "ID verification placeholder" }] },
        billingAccount: { create: { balanceCents: i % 5 === 0 ? 125000 : 0, autopayPlaceholder: i % 2 === 0 } },
      },
      include: { billingAccount: true },
    });
    families.push(family);

    const childCount = i < 7 ? 2 : 1;
    for (let j = 0; j < childCount; j++) {
      const classroomIndex = childClassroomAssignments[childIndex] ?? (childIndex % classrooms.length);
      const birthYear = [2025, 2023, 2022, 2021, 2018][classroomIndex] ?? 2021;
      const child = await prisma.child.create({
        data: {
          familyId: family.id,
          classroomId: classrooms[classroomIndex].id,
          fullName: `${firstNames[childIndex % firstNames.length]} ${last}`,
          preferredName: firstNames[childIndex % firstNames.length],
          dateOfBirth: new Date(birthYear, childIndex % 12, 8),
          ageGroup: classroomNames[classroomIndex][1],
          enrollmentStatus: "active",
          startDate: new Date("2026-05-01"),
          schedule: { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], start: "08:00", end: "16:30" },
          photoVideoPermission: i % 3 !== 0,
          fieldTripPermission: i % 4 !== 0,
          medicalNotes: i % 9 === 0 ? { create: [{ category: "medical", note: "Medication details restricted to authorized roles.", restricted: true }] } : undefined,
          allergies: i % 10 === 0 ? { create: [{ allergen: "Peanut", severity: "High", actionPlan: "Emergency action plan placeholder." }] } : undefined,
        },
      });
      children.push(child);
      childIndex += 1;
    }
  }

  for (let i = 0; i < 30; i++) {
    await prisma.lead.create({
      data: {
        centerId: centers[i % centers.length].id,
        familyName: `${lastNames[(i + 4) % lastNames.length]} Lead Family`,
        childName: firstNames[(i + 7) % firstNames.length],
        leadSource: ["Website", "Referral", "Open house", "Meta lead ad"][i % 4],
        ageGroupInterest: classroomNames[i % classroomNames.length][1],
        desiredStartDate: new Date("2026-08-15"),
        programInterest: "Full-time care",
        stage: Object.values(EnrollmentStage)[i % Object.values(EnrollmentStage).length],
        score: 55 + (i % 45),
        tasks: { create: [{ title: "Follow up with family", dueAt: new Date("2026-05-15") }] },
      },
    });
  }

  for (let i = 0; i < 12; i++) {
    await prisma.tour.create({ data: { centerId: centers[i % centers.length].id, startsAt: new Date(2026, 4, 12 + i, 9 + (i % 6), 30), status: i % 4 === 0 ? "needs_confirmation" : "scheduled" } });
  }

  for (let i = 0; i < 10; i++) {
    await prisma.waitlistEntry.create({ data: { familyName: `${lastNames[i]} Family`, childName: firstNames[i], ageGroup: classroomNames[i % classroomNames.length][1], desiredStartDate: new Date("2026-09-01"), priority: i % 3 } });
  }

  for (let i = 0; i < 20; i++) {
    const account = families[i].billingAccount;
    if (!account) continue;
    await prisma.invoice.create({
      data: {
        billingAccountId: account.id,
        number: `INV-${1000 + i}`,
        status: i % 4 === 0 ? PaymentStatus.OPEN : PaymentStatus.PAID,
        dueDate: new Date("2026-05-15"),
        totalCents: 180000,
        items: { create: [{ description: "Monthly tuition", amountCents: 180000 }] },
      },
    });
  }

  for (let i = 0; i < 15; i++) {
    await prisma.message.create({ data: { familyId: families[i].id, senderId: users[(i + 4) % users.length].id, subject: "Parent conversation", body: "Demo parent message with warm professional tone.", channel: "portal", priority: i % 5 === 0 ? "high" : "normal", sentiment: i % 5 === 0 ? "sensitive" : "warm" } });
  }

  for (let i = 0; i < 10; i++) {
    const report = await prisma.dailyReport.create({ data: { childId: children[i].id, classroomId: classrooms[i % classrooms.length].id, date: new Date("2026-05-11"), mood: "Cheerful", teacherNote: "Enjoyed sensory play and outdoor time.", suppliesNeeded: i % 3 === 0 ? "Extra clothes" : null } });
    await prisma.meal.create({ data: { dailyReportId: report.id, mealType: "Lunch", food: "Pasta, peas, fruit", amount: "Most" } });
    await prisma.nap.create({ data: { dailyReportId: report.id, startsAt: new Date("2026-05-11T12:30:00"), endsAt: new Date("2026-05-11T13:45:00") } });
  }

  for (let i = 0; i < 5; i++) {
    await prisma.incidentReport.create({ data: { childId: children[i].id, classroomId: classrooms[i % classrooms.length].id, staffMember: users[6 + i].name, occurredAt: new Date("2026-05-10T10:30:00"), type: "Minor injury", description: "Objective incident description placeholder.", actionTaken: "Comfort provided and director notified.", parentNotified: true, adminReviewStatus: i % 2 === 0 ? "pending" : "reviewed", followUpTasks: ["Parent acknowledgment"] } });
  }

  for (const name of ["New inquiry follow-up", "Tour reminder", "Waitlist update", "Parent newsletter", "Review request", "Lost lead reactivation"]) {
    await prisma.campaign.create({ data: { brandId: brand.id, name, type: "email", status: "draft", metrics: { openRate: 0.42, clickRate: 0.18 } } });
  }

  for (const name of ["New inquiry nurture", "Missing document reminder", "Invoice overdue", "Incident review alert", "Birthday upcoming"]) {
    await prisma.automation.create({ data: { brandId: brand.id, name, trigger: name, action: { type: "create_task" }, status: "active" } });
  }

  for (const provider of ["stripe", "twilio", "sendgrid", "google_calendar", "google_business", "meta_lead_ads", "openai", "zapier", "signature", "cloud_storage"]) {
    await prisma.integration.create({ data: { tenantId: tenant.id, provider, status: provider === "google_calendar" ? "mock_connected" : "placeholder", configPlaceholder: { env: provider.toUpperCase() } } });
  }

  for (let i = 0; i < 10; i++) {
    await prisma.notification.create({ data: { userId: users[i % users.length].id, title: `Notification ${i + 1}`, body: "Demo operational alert.", type: ["message", "billing", "compliance", "incident"][i % 4], priority: i % 3 === 0 ? "high" : "normal" } });
  }

  for (let i = 0; i < 8; i++) {
    await prisma.document.create({ data: { childId: children[i].id, name: `Compliance reminder ${i + 1}`, type: "compliance", status: DocumentStatus.REQUESTED, expiresAt: new Date("2026-06-15"), restricted: true } });
  }

  await prisma.aiSummary.create({ data: { scope: "center", scopeId: centers[0].id, title: "Daily center summary", body: "Ratios are healthy. Prioritize tours, incident review, and overdue billing outreach." } });
  await prisma.aiSuggestion.create({ data: { type: "parent_reply", suggestion: "Draft a warm reply confirming the enrollment packet.", guardrailNote: "Human review required before sending." } });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
