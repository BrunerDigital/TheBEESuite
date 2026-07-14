import "./load-env";
import { DocumentStatus, EnrollmentStage, PaymentStatus, UserRole } from "@prisma/client";
import { hashGuardianPin } from "@/lib/kiosk";
import { prisma } from "@/lib/prisma";
import { directorLaunchChecklistTasks } from "@/lib/setup-checklists";

const SOURCE = "bee_suite_demo";
const CENTER_EXTERNAL_ID = "demo-center-little-harbor";
const TARGET_ENROLLMENT = 69;

const additions = [
  ["Infant", "Infant Hive"],
  ["Toddler", "Toddler Hive"],
  ["3's", "3's Hive"],
  ["Pre-K", "Pre-K Hive"],
  ["Pre-K", "Pre-K Hive"],
  ...Array.from({ length: 7 }, () => ["Afterschool", "Afterschool Hive"]),
] as const;

const firstNames = ["Addison", "Beau", "Clara", "Dylan", "Eliana", "Felix", "Gia", "Holden", "Iris", "Jonah", "Keira", "Micah"];
const lastNames = ["Adams", "Bishop", "Cruz", "Drake", "Ellis", "Fields", "Grant", "Hayes", "Irwin", "James", "King", "Lane"];

function dateAt(offsetDays: number, hour = 12) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function birthDate(ageGroup: string, index: number) {
  const year = ageGroup === "Infant" ? 2025 : ageGroup === "Toddler" ? 2023 : ageGroup === "3's" ? 2022 : ageGroup === "Pre-K" ? 2021 : 2018;
  return new Date(`${year}-${String((index % 9) + 1).padStart(2, "0")}-${String((index % 20) + 5).padStart(2, "0")}T12:00:00.000Z`);
}

async function ensureAdditionalFamily(input: {
  index: number;
  centerId: string;
  classroomId: string;
  ageGroup: string;
  teacherId: string | null;
}) {
  const number = String(input.index + 1).padStart(2, "0");
  const externalKey = `presentation-${number}`;
  const firstName = firstNames[input.index];
  const lastName = lastNames[input.index];
  const family = await prisma.family.findFirst({ where: { centerId: input.centerId, sourceSystem: SOURCE, externalId: `demo-family-${externalKey}` } })
    ?? await prisma.family.create({
      data: {
        centerId: input.centerId,
        name: `${lastName} Family`,
        address: `${720 + input.index} Demo Garden Way, Port Orange, FL 32129`,
        billingEmail: `${lastName.toLowerCase()}.${number}.demo@example.com`,
        notes: "Complete demo family record for school presentation and enrollment reporting.",
        sourceSystem: SOURCE,
        externalId: `demo-family-${externalKey}`,
        customFields: { demoWorkspace: true, registrationStatus: "complete", portalInviteStatus: "sent" },
      },
    });

  await prisma.guardian.deleteMany({ where: { familyId: family.id, sourceSystem: SOURCE, externalId: { startsWith: `demo-guardian-${externalKey}` } } });
  await prisma.guardian.createMany({
    data: [
      { familyId: family.id, fullName: `Morgan ${lastName}`, email: family.billingEmail, phone: `(386) 555-6${number.padStart(3, "0")}`, relation: "Parent / Guardian", isBillingContact: true, preferredCommunication: "Email + portal notification", checkInPinHash: hashGuardianPin(`demo-guardian-${externalKey}-primary`, "2468"), checkInPinSetAt: dateAt(-7), sourceSystem: SOURCE, externalId: `demo-guardian-${externalKey}-primary`, customFields: { demoWorkspace: true } },
      { familyId: family.id, fullName: `Taylor ${lastName}`, email: `secondary.${lastName.toLowerCase()}.${number}.demo@example.com`, phone: `(386) 555-7${number.padStart(3, "0")}`, relation: "Parent / Guardian", isBillingContact: false, preferredCommunication: "Portal notification", checkInPinHash: hashGuardianPin(`demo-guardian-${externalKey}-secondary`, "1357"), checkInPinSetAt: dateAt(-7), sourceSystem: SOURCE, externalId: `demo-guardian-${externalKey}-secondary`, customFields: { demoWorkspace: true } },
    ],
  });
  const guardian = await prisma.guardian.findFirstOrThrow({ where: { familyId: family.id, externalId: `demo-guardian-${externalKey}-primary` } });

  const child = await prisma.child.findFirst({ where: { familyId: family.id, sourceSystem: SOURCE, externalId: `demo-child-${externalKey}` } })
    ?? await prisma.child.create({
      data: {
        familyId: family.id,
        classroomId: input.classroomId,
        fullName: `${firstName} ${lastName}`,
        preferredName: firstName,
        dateOfBirth: birthDate(input.ageGroup, input.index),
        ageGroup: input.ageGroup,
        enrollmentStatus: "enrolled",
        startDate: dateAt(-60 - input.index),
        schedule: {},
        photoVideoPermission: true,
        fieldTripPermission: true,
        napNotes: `${firstName} follows the classroom rest routine.`,
        feedingNotes: "Family-approved meals and snacks; water offered throughout the day.",
        pottyNotes: input.ageGroup === "Infant" ? "Diaper care logged throughout the day." : "Follows classroom bathroom routine.",
        developmentalNotes: "Age-appropriate social, language, and motor milestones documented for the demo.",
        sourceSystem: SOURCE,
        externalId: `demo-child-${externalKey}`,
        customFields: { demoWorkspace: true, registrationPacket: "complete", sunscreenPermission: true },
      },
    });

  await prisma.enrollment.deleteMany({ where: { childId: child.id } });
  await prisma.enrollment.create({ data: { childId: child.id, stage: EnrollmentStage.ENROLLED, desiredStartDate: child.startDate, depositDueCents: 15000, depositPaidCents: 15000, checklist: { registrationPacket: "complete", emergencyContacts: "complete", medicalForm: "complete", immunizationRecord: "on_file", billingAccount: "created", parentPortalInvite: "sent" } } });
  await prisma.document.deleteMany({ where: { OR: [{ familyId: family.id }, { childId: child.id }] } });
  await prisma.document.createMany({ data: [
    { familyId: family.id, name: "Enrollment Agreement", type: "registration", status: DocumentStatus.APPROVED, storageKey: `demo-docs/${family.id}/enrollment-agreement.pdf` },
    { childId: child.id, name: "Medical and Allergy Form", type: "medical", status: DocumentStatus.APPROVED, restricted: true, expiresAt: dateAt(240), storageKey: `demo-docs/${child.id}/medical-form.pdf` },
    { childId: child.id, name: "Photo / Video Permission", type: "permission", status: DocumentStatus.APPROVED, storageKey: `demo-docs/${child.id}/photo-permission.pdf` },
  ] });

  const account = await prisma.billingAccount.upsert({ where: { familyId: family.id }, update: { balanceCents: 0, autopayPlaceholder: true, ledgerSyncedAt: dateAt(-1), sourceSystem: SOURCE, customFields: { demoWorkspace: true, tuitionPlan: `${input.ageGroup} weekly tuition`, subsidyPending: false } }, create: { familyId: family.id, balanceCents: 0, autopayPlaceholder: true, ledgerSyncedAt: dateAt(-1), sourceSystem: SOURCE, externalId: `demo-billing-${externalKey}`, customFields: { demoWorkspace: true, tuitionPlan: `${input.ageGroup} weekly tuition`, subsidyPending: false } } });
  const invoiceNumber = `DEMO-P${number}`;
  await prisma.invoice.upsert({ where: { number: invoiceNumber }, update: { billingAccountId: account.id, status: PaymentStatus.PAID, dueDate: dateAt(-3), totalCents: 32500, sourceSystem: SOURCE, customFields: { demoWorkspace: true, paymentMethodOptions: ["ACH", "Card"] } }, create: { billingAccountId: account.id, number: invoiceNumber, status: PaymentStatus.PAID, dueDate: dateAt(-3), totalCents: 32500, sourceSystem: SOURCE, externalId: invoiceNumber, customFields: { demoWorkspace: true, paymentMethodOptions: ["ACH", "Card"] } } });

  const report = await prisma.dailyReport.findFirst({ where: { childId: child.id } }) ?? await prisma.dailyReport.create({ data: { childId: child.id, classroomId: input.classroomId, date: dateAt(0, 0), mood: "Happy and engaged", teacherNote: `${firstName} enjoyed literacy centers, outdoor play, and small-group learning.`, suppliesNeeded: "None", sentAt: dateAt(0, 16) } });
  const mediaUrl = `https://placehold.co/900x600/f5b51b/111827?text=${encodeURIComponent(firstName)}+classroom+moment`;
  const media = await prisma.childMedia.findFirst({ where: { childId: child.id, url: mediaUrl } });
  if (!media) await prisma.childMedia.create({ data: { childId: child.id, classroomId: input.classroomId, uploadedById: input.teacherId, dailyReportId: report.id, url: mediaUrl, storageKey: `demo-media/${child.id}/classroom-moment.jpg`, caption: `${firstName} participating in a classroom activity.`, mediaType: "photo", status: "shared", sharedWithParents: true, takenAt: dateAt(0, 10) } });

  const attendanceExternalId = `attendance-${child.id}-${new Date().toISOString().slice(0, 10)}`;
  const attendance = await prisma.attendanceRecord.findFirst({ where: { sourceSystem: SOURCE, externalId: attendanceExternalId } });
  if (attendance) await prisma.attendanceRecord.update({ where: { id: attendance.id }, data: { classroomId: input.classroomId, date: dateAt(0, 0), status: "present" } });
  else await prisma.attendanceRecord.create({ data: { childId: child.id, classroomId: input.classroomId, date: dateAt(0, 0), status: "present", sourceSystem: SOURCE, externalId: attendanceExternalId, metadata: { demoWorkspace: true, checkedBy: "Lobby kiosk" } } });
  return child.id;
}

async function refreshRealisticAttendance(centerId: string) {
  const dayStart = dateAt(0, 0);
  const dayEnd = dateAt(1, 0);
  const children = await prisma.child.findMany({
    where: { family: { centerId }, enrollmentStatus: "enrolled" },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      classroomId: true,
      family: { select: { guardians: { orderBy: { isBillingContact: "desc" }, take: 1, select: { id: true } } } },
    },
  });
  const absentIds = children.filter((_, index) => index % 14 === 0).map((child) => child.id);
  const earlyCheckoutIds = children.filter((_, index) => index % 23 === 0 && index % 14 !== 0).map((child) => child.id);
  const presentIds = children.filter((child) => !absentIds.includes(child.id)).map((child) => child.id);

  await prisma.checkInOutLog.deleteMany({ where: { centerId, sourceSystem: SOURCE, occurredAt: { gte: dayStart, lt: dayEnd } } });
  await prisma.attendanceRecord.updateMany({ where: { childId: { in: presentIds }, date: { gte: dayStart, lt: dayEnd } }, data: { status: "present", absenceReason: null } });
  await prisma.attendanceRecord.updateMany({ where: { childId: { in: absentIds }, date: { gte: dayStart, lt: dayEnd } }, data: { status: "absent", absenceReason: "Family reported absence through the parent portal" } });

  const logs = children.flatMap((child, index) => {
    if (absentIds.includes(child.id)) return [];
    const guardianId = child.family.guardians[0]?.id ?? null;
    const checkInAt = dateAt(0, 7 + (index % 3));
    checkInAt.setMinutes(28 + (index % 27));
    const rows = [{
      childId: child.id,
      centerId,
      classroomId: child.classroomId,
      guardianId,
      type: "check_in",
      occurredAt: checkInAt,
      signaturePlaceholder: true,
      verificationStatus: "pin_verified",
      pinVerified: true,
      notes: `${child.fullName} arrived with an authorized guardian.`,
      sourceSystem: SOURCE,
      externalId: `presentation-attendance-${child.id}-${dayStart.toISOString().slice(0, 10)}-in`,
      metadata: { demoWorkspace: true, kioskMode: true },
    }];
    if (earlyCheckoutIds.includes(child.id)) {
      const checkOutAt = dateAt(0, 10 + (index % 2));
      checkOutAt.setMinutes(5 + (index % 35));
      rows.push({
        ...rows[0],
        type: "check_out",
        occurredAt: checkOutAt,
        pickupName: "Primary guardian",
        notes: `${child.fullName} left early with an authorized guardian.`,
        externalId: `presentation-attendance-${child.id}-${dayStart.toISOString().slice(0, 10)}-out`,
      } as typeof rows[number]);
    }
    return rows;
  });
  await prisma.checkInOutLog.createMany({ data: logs });
  return { present: presentIds.length - earlyCheckoutIds.length, absent: absentIds.length, checkedOut: earlyCheckoutIds.length };
}

async function refreshRealisticBilling(centerId: string) {
  const openBalances = [5500, 8000, 11000, 14500, 19000, 24000];
  const openIndexes = new Map([6, 17, 28, 39, 50, 61].map((index, position) => [index, openBalances[position]]));
  const accounts = await prisma.billingAccount.findMany({
    where: { family: { centerId } },
    orderBy: { family: { name: "asc" } },
    include: { invoices: { orderBy: { dueDate: "desc" }, take: 1 } },
  });

  for (const [index, account] of accounts.entries()) {
    const balance = openIndexes.get(index) ?? 0;
    const invoice = account.invoices[0];
    if (!invoice) throw new Error(`Missing demo invoice for billing account ${account.id}`);
    const totalCents = 21800 + (index % 5) * 2700;
    const paidAmount = totalCents - balance;
    await prisma.billingAccount.update({ where: { id: account.id }, data: { balanceCents: balance, autopayPlaceholder: index % 4 !== 1, ledgerSyncedAt: dateAt(-1) } });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: balance > 0 ? PaymentStatus.OPEN : PaymentStatus.PAID, totalCents, dueDate: dateAt(balance > 0 ? 3 : -3) } });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
    await prisma.invoiceItem.createMany({ data: [
      { invoiceId: invoice.id, description: "Weekly tuition", amountCents: totalCents - 2500 },
      { invoiceId: invoice.id, description: "Activity and materials fee", amountCents: 2500 },
    ] });
    const paymentKey = `demo-payment-${invoice.number}`;
    const existingPayment = await prisma.payment.findFirst({ where: { billingAccountId: account.id, externalIdPlaceholder: paymentKey } });
    const paymentData = { billingAccountId: account.id, amountCents: paidAmount, status: PaymentStatus.PAID, provider: "stripe_mock", externalIdPlaceholder: paymentKey, paidAt: dateAt(balance > 0 ? -1 : -3), customFields: { demoWorkspace: true, method: index % 3 === 0 ? "ACH" : "Card", partialPayment: balance > 0 } };
    if (existingPayment) await prisma.payment.update({ where: { id: existingPayment.id }, data: paymentData });
    else await prisma.payment.create({ data: paymentData });
    await prisma.ledgerEntry.upsert({ where: { sourceSystem_externalId: { sourceSystem: SOURCE, externalId: `ledger-${invoice.number}-charge` } }, update: { billingAccountId: account.id, invoiceId: invoice.id, type: "charge", description: "Weekly tuition charge", amountCents: totalCents, balanceAfterCents: totalCents, effectiveAt: dateAt(-7), metadata: { demoWorkspace: true } }, create: { billingAccountId: account.id, invoiceId: invoice.id, type: "charge", description: "Weekly tuition charge", amountCents: totalCents, balanceAfterCents: totalCents, effectiveAt: dateAt(-7), sourceSystem: SOURCE, externalId: `ledger-${invoice.number}-charge`, metadata: { demoWorkspace: true } } });
    await prisma.ledgerEntry.upsert({ where: { sourceSystem_externalId: { sourceSystem: SOURCE, externalId: `ledger-${invoice.number}-payment` } }, update: { billingAccountId: account.id, invoiceId: invoice.id, type: "payment", description: balance > 0 ? "Partial tuition payment" : "Tuition payment", amountCents: -paidAmount, balanceAfterCents: balance, effectiveAt: dateAt(balance > 0 ? -1 : -3), metadata: { demoWorkspace: true } }, create: { billingAccountId: account.id, invoiceId: invoice.id, type: "payment", description: balance > 0 ? "Partial tuition payment" : "Tuition payment", amountCents: -paidAmount, balanceAfterCents: balance, effectiveAt: dateAt(balance > 0 ? -1 : -3), sourceSystem: SOURCE, externalId: `ledger-${invoice.number}-payment`, metadata: { demoWorkspace: true } } });
  }
  return { accounts: accounts.length, paid: accounts.length - openIndexes.size, open: openIndexes.size, outstandingCents: openBalances.reduce((sum, value) => sum + value, 0) };
}

async function ensureRatioCoverage(input: { centerId: string; tenantId: string; organizationId: string; classrooms: Array<{ id: string; name: string }> }) {
  const staff = [
    ["Olivia Stone", "Infant Teacher", "Infant Hive"],
    ["Ethan Reed", "Infant Teacher", "Infant Hive"],
    ["Sophie Martin", "Toddler Teacher", "Toddler Hive"],
    ["Lucas Green", "Toddler Teacher", "Toddler Hive"],
    ["Emma Wilson", "3's Teacher", "3's Hive"],
    ["Mason Clark", "Afterschool Teacher", "Afterschool Hive"],
  ] as const;
  for (const [name, title, classroomName] of staff) {
    const classroom = input.classrooms.find((item) => item.name === classroomName);
    if (!classroom) throw new Error(`Missing demo classroom: ${classroomName}`);
    const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@thebeesuite.io`;
    const user = await prisma.user.upsert({ where: { email }, update: { tenantId: input.tenantId, organizationId: input.organizationId, name, role: UserRole.TEACHER, isActive: true }, create: { tenantId: input.tenantId, organizationId: input.organizationId, email, name, role: UserRole.TEACHER, isActive: true, mustResetPassword: true } });
    const profile = await prisma.staffProfile.upsert({ where: { userId: user.id }, update: { centerId: input.centerId, classroomId: classroom.id, title, backgroundCheckStatus: "cleared", sourceSystem: SOURCE, customFields: { demoWorkspace: true, trainingLevel: "Classroom" } }, create: { userId: user.id, centerId: input.centerId, classroomId: classroom.id, title, phone: "(386) 555-0188", backgroundCheckStatus: "cleared", sourceSystem: SOURCE, externalId: `demo-ratio-teacher-${user.id}`, customFields: { demoWorkspace: true, trainingLevel: "Classroom" } } });
    const grant = await prisma.userAccessGrant.findFirst({ where: { userId: user.id, tenantId: input.tenantId, centerId: input.centerId, isActive: true } });
    if (!grant) await prisma.userAccessGrant.create({ data: { userId: user.id, tenantId: input.tenantId, organizationId: input.organizationId, centerId: input.centerId, role: UserRole.TEACHER, scopeType: "CENTER", isActive: true, permissions: { demoWorkspace: true, seededBy: "scripts/complete-demo-school.ts" } } });
    await prisma.staffSchedule.deleteMany({ where: { staffId: profile.id, centerId: input.centerId } });
    await prisma.staffSchedule.createMany({ data: [{ staffId: profile.id, centerId: input.centerId, startsAt: dateAt(0, 7), endsAt: dateAt(0, 15), status: "scheduled" }, { staffId: profile.id, centerId: input.centerId, startsAt: dateAt(1, 8), endsAt: dateAt(1, 16), status: "scheduled" }] });
    await prisma.certification.deleteMany({ where: { staffId: profile.id } });
    await prisma.certification.createMany({ data: [{ staffId: profile.id, name: "CPR / First Aid", status: "current", expiresAt: dateAt(180) }, { staffId: profile.id, name: "Child Development Training", status: "current", expiresAt: dateAt(320) }] });
  }
}

async function main() {
  const center = await prisma.center.findFirstOrThrow({ where: { sourceSystem: SOURCE, externalId: CENTER_EXTERNAL_ID }, include: { organization: { select: { tenantId: true } }, classrooms: true } });
  if (process.argv.includes("--billing-only")) {
    const billing = await refreshRealisticBilling(center.id);
    console.log(JSON.stringify({ ok: true, center: center.name, billing }, null, 2));
    return;
  }
  const schoolUser = await prisma.user.findUniqueOrThrow({ where: { email: "demoschool@kidcityusa.com" } });
  const teacher = await prisma.staffProfile.findFirst({ where: { centerId: center.id, user: { role: "TEACHER", isActive: true } }, select: { userId: true } });
  await ensureRatioCoverage({ centerId: center.id, tenantId: center.organization.tenantId, organizationId: center.organizationId, classrooms: center.classrooms });
  await Promise.all(additions.map(([ageGroup, classroomName], index) => {
    const classroom = center.classrooms.find((item) => item.name === classroomName);
    if (!classroom) throw new Error(`Missing demo classroom: ${classroomName}`);
    return ensureAdditionalFamily({ index, centerId: center.id, classroomId: classroom.id, ageGroup, teacherId: teacher?.userId ?? null });
  }));
  const billing = await refreshRealisticBilling(center.id);
  const attendance = await refreshRealisticAttendance(center.id);

  await prisma.$executeRawUnsafe(`WITH ranked AS (SELECT c.id, row_number() OVER (ORDER BY md5(c.id)) AS rn FROM "Child" c JOIN "Family" f ON f.id=c."familyId" WHERE f."centerId"='${center.id}' AND c."sourceSystem"='${SOURCE}' AND c."enrollmentStatus"='enrolled') UPDATE "Child" c SET "customFields"=CASE WHEN jsonb_typeof(c."customFields")='object' THEN c."customFields" ELSE '{}'::jsonb END || jsonb_build_object('careScheduleType',CASE WHEN ((ranked.rn * 37 + 11) % 69) < 17 THEN 'part_time' ELSE 'full_time' END), schedule=CASE WHEN ((ranked.rn * 37 + 11) % 69) < 17 THEN jsonb_build_object('days',jsonb_build_array('Monday','Wednesday','Friday'),'monday','8:30 AM - 3:00 PM','wednesday','8:30 AM - 3:00 PM','friday','8:30 AM - 3:00 PM') ELSE jsonb_build_object('days',jsonb_build_array('Monday','Tuesday','Wednesday','Thursday','Friday'),'monday','7:45 AM - 5:15 PM','tuesday','7:45 AM - 5:15 PM','wednesday','7:45 AM - 5:15 PM','thursday','7:45 AM - 5:15 PM','friday','8:00 AM - 4:30 PM') END FROM ranked WHERE c.id=ranked.id`);

  const now = new Date();
  const setupValues: Record<string, string> = {
    schoolProfile: "Kid City USA - Demo; Director: Demo School Director; Hours 7:00 AM-6:00 PM ET; presentation workspace approved",
    classrooms: "Five classrooms configured with age groups, capacity, ratios, rosters, and assigned teachers",
    programs: "Full-time Monday-Friday and part-time Monday/Wednesday/Friday; afterschool care; closures loaded on calendar",
    staff: "Director and teacher roster active; classroom assignments, schedules, background checks, and credentials complete",
    familyImport: "69 families and children verified with guardians, emergency contacts, schedules, enrollment, and classroom assignments",
    tuitionRates: "Weekly tuition, registration fees, deposits, sibling discounts, and recurring billing demo records loaded",
    subsidyRules: "ELC/VPK agency billing monthly; parent copays weekly; subsidy balances shown separately",
    balanceRules: "Opening balances reconciled; credits carry forward; refunds and adjustments require director approval",
    invoiceRules: "Invoices Friday; due Monday; ACH/card supported; autopay and fee disclosures enabled",
    parentPortal: "Billing contacts invited; family links, custody visibility, documents, messages, and payment access verified",
    communications: "Director-approved announcements; classroom messaging; email/SMS templates and response ownership configured",
    formsDocuments: "Enrollment, medical, immunization, permission, policy, and staff onboarding records approved with demo media",
    licensingConfiguration: "Florida license, ratios, inspections, drills, medication, child documents, and staff credentials reviewed",
    fteReporting: "Director submits Friday; attendance closes daily; 69 enrolled; executive correction and approval workflow verified",
    integrations: "Demo payment, email, SMS, calendar, storage, FTE export, and signature integrations marked ready",
    launchSmokeTest: "Director, teacher, parent, kiosk, enrollment, billing, documents, media, compliance, reporting, and FTE smoke tests passed",
  };
  const sections = Object.fromEntries(Object.entries(setupValues).map(([key, value]) => [key, { value, completed: true }]));
  const licensingConfiguration = {
    version: 1, status: "ready_for_review", state: "FL", licensingAgency: "Florida Department of Children and Families", licenseNumber: "DEMO-FL-079", licenseType: "Child Care Facility", licensedCapacity: 79,
    renewalDueDate: dateAt(300).toISOString().slice(0, 10), inspectionDueDate: dateAt(150).toISOString().slice(0, 10),
    ratioRules: { value: "Infant 1:4; Toddler 1:6; 3's 1:9; Pre-K 1:12; Afterschool 1:18", completed: true },
    childDocumentRules: { value: "Enrollment, medical, immunization, emergency contact, and permission forms required", completed: true },
    staffCredentialRules: { value: "Background screening, CPR/First Aid, and annual child development training required", completed: true },
    emergencyPreparednessRules: { value: "Monthly fire drills; quarterly severe-weather drills; annual emergency plan review", completed: true },
    medicationRules: { value: "Written authorization, labeled medication, witnessed administration, and parent notification required", completed: true },
    notes: "Complete demo licensing configuration for presentation.", completedFields: [], missingFields: [], updatedAt: now.toISOString(), updatedByUserId: schoolUser.id,
  };
  const currentFields = center.customFields && typeof center.customFields === "object" && !Array.isArray(center.customFields) ? center.customFields as Record<string, unknown> : {};
  await prisma.center.update({ where: { id: center.id }, data: { customFields: { ...currentFields, schoolEin: "12-3456789", schoolOnboardingSetup: { version: 1, status: "ready_for_review", sections, capturedAt: now.toISOString() }, licensingConfiguration } } });
  const userFields = schoolUser.customFields && typeof schoolUser.customFields === "object" && !Array.isArray(schoolUser.customFields) ? schoolUser.customFields as Record<string, unknown> : {};
  await prisma.user.update({ where: { id: schoolUser.id }, data: { customFields: { ...userFields, setupChecklists: { ...((userFields.setupChecklists as Record<string, unknown>) ?? {}), director_launch: { completedIds: directorLaunchChecklistTasks.map((task) => task.id), updatedAt: now.toISOString() } } } } });

  for (const template of [
    ["Welcome and enrollment next steps", "Welcome to Kid City USA - Demo", "Your enrollment is complete. Here are your classroom and portal next steps."],
    ["Classroom daily update", "Today in your child's classroom", "Your child's daily report and classroom media are ready in the family portal."],
    ["FTE reporting reminder", "Weekly FTE is ready", "Enrollment and attendance totals are ready for Friday review."],
  ]) await prisma.messageTemplate.upsert({ where: { tenantId_centerId_name: { tenantId: center.organization.tenantId, centerId: center.id, name: template[0] } }, update: { subject: template[1], body: template[2], isActive: true }, create: { tenantId: center.organization.tenantId, centerId: center.id, name: template[0], subject: template[1], body: template[2], category: "demo", channel: "portal", isActive: true, createdById: schoolUser.id } });
  for (const form of ["Enrollment Packet", "Medical and Allergy Authorization", "Photo and Media Release"]) {
    const existing = await prisma.form.findFirst({ where: { name: form } });
    if (!existing) await prisma.form.create({ data: { name: form, type: "registration", status: "active", schema: { demoWorkspace: true, fields: ["guardian_signature", "reviewed_at"] } } });
  }
  for (const provider of ["stripe_demo", "sendgrid_demo", "twilio_demo", "google_calendar_demo", "supabase_storage_demo", "signature_demo"]) {
    const existing = await prisma.integration.findFirst({ where: { tenantId: center.organization.tenantId, provider } });
    if (existing) await prisma.integration.update({ where: { id: existing.id }, data: { status: "ready", lastSyncAt: now, configPlaceholder: { demoWorkspace: true, verified: true } } });
    else await prisma.integration.create({ data: { tenantId: center.organization.tenantId, provider, status: "ready", lastSyncAt: now, configPlaceholder: { demoWorkspace: true, verified: true } } });
  }
  if (!await prisma.calendarEvent.findFirst({ where: { centerId: center.id, title: "Demo Family Open House" } })) await prisma.calendarEvent.create({ data: { tenantId: center.organization.tenantId, centerId: center.id, title: "Demo Family Open House", eventType: "family_event", startsAt: dateAt(14, 17), endsAt: dateAt(14, 19), status: "scheduled", visibility: "families", notes: "Complete demo calendar event with family communications prepared.", createdById: schoolUser.id } });
  if (!await prisma.complianceTask.findFirst({ where: { centerId: center.id, title: "Demo licensing readiness review" } })) await prisma.complianceTask.create({ data: { centerId: center.id, title: "Demo licensing readiness review", category: "licensing", priority: "normal", status: "completed", dueAt: dateAt(-2), assignedToId: schoolUser.id, createdById: schoolUser.id, notes: "License, ratios, drills, staff credentials, and child files reviewed.", completedAt: now } });

  await prisma.task.updateMany({ where: { lead: { centerId: center.id }, status: { notIn: ["completed", "closed", "done"] } }, data: { status: "completed" } });
  await prisma.document.updateMany({ where: { OR: [{ family: { centerId: center.id } }, { child: { family: { centerId: center.id } } }] }, data: { status: DocumentStatus.APPROVED } });
  await prisma.incidentReport.updateMany({ where: { classroom: { centerId: center.id } }, data: { adminReviewStatus: "reviewed", parentNotified: true, parentAcknowledgedAt: now } });
  await prisma.notification.updateMany({ where: { userId: schoolUser.id, readAt: null }, data: { readAt: now } });

  const currentFte = await prisma.fteReport.findFirst({ where: { centerId: center.id }, orderBy: { weekStart: "desc" } });
  if (currentFte) await prisma.fteReport.update({ where: { id: currentFte.id }, data: { enrolledCount: TARGET_ENROLLMENT, fullTimeCount: 52, partTimeCount: 17, fteCount: 60.5, infants: 9, toddlers: 13, twos: 0, preschool: 12, preK: 16, schoolAge: 19, status: "submitted", notes: "Demo weekly FTE aligned to 87% licensed occupancy and current child records." } });

  console.log(JSON.stringify({ ok: true, center: center.name, targetEnrollment: TARGET_ENROLLMENT, attendance, billing }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
