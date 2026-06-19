import "./load-env";
import { DocumentStatus, EnrollmentStage, PaymentStatus, UserRole } from "@prisma/client";
import { demoAccountEmails } from "@/lib/demo-accounts";
import { KID_CITY_USA_BRANDING } from "@/lib/brand-assets";
import { hashGuardianPin } from "@/lib/kiosk";
import { prisma } from "@/lib/prisma";
import { upsertSupabaseAuthUserWithPassword } from "@/lib/supabase-auth";
import { buildTeacherLoginEmail, getDefaultTeacherInitialPassword } from "@/lib/teacher-login";

const DEMO_SOURCE = "bee_suite_demo";
const DEMO_TENANT_SLUG = "bee-suite-isolated-demo";
const DEMO_BRAND_SLUG = "kid-city-usa-enterprises-demo";
const LEGACY_DEMO_BRAND_SLUG = "brightpath-demo";
const DEMO_BRAND_NAME = "Kid City USA Enterprises";
const DEMO_ORG_NAME = "Kid City USA Enterprises";
const LEGACY_DEMO_ORG_NAME = "BrightPath Early Learning Group";
const DEMO_LOCATION_NAME = "Kid City USA - Demo";
const DEMO_OWNER_GROUP_SLUG = "kid-city-usa-enterprises-demo";
const LEGACY_DEMO_OWNER_GROUP_SLUG = "brightpath-corporate-demo";
const demoPassword = process.env.DEMO_PASSWORD ?? "";

if (!demoPassword) {
  throw new Error("Set DEMO_PASSWORD before running this script.");
}

function money(cents: number) {
  return cents;
}

function dateAt(offsetDays: number, hour = 12, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function fixedDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function startOfWeek(offsetWeeks = 0) {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + 1 + offsetWeeks * 7;
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function weekEnd(weekStart: Date) {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + 4);
  date.setHours(23, 59, 59, 999);
  return date;
}

async function upsertTenant() {
  return prisma.tenant.upsert({
    where: { slug: DEMO_TENANT_SLUG },
    update: { name: "The BEE Suite Demo Workspace" },
    create: { slug: DEMO_TENANT_SLUG, name: "The BEE Suite Demo Workspace" },
  });
}

async function upsertBrand(tenantId: string) {
  const existing =
    (await prisma.brand.findFirst({ where: { tenantId, slug: DEMO_BRAND_SLUG } })) ??
    (await prisma.brand.findFirst({ where: { tenantId, slug: LEGACY_DEMO_BRAND_SLUG } }));

  const data = { name: DEMO_BRAND_NAME, slug: DEMO_BRAND_SLUG };
  if (existing) return prisma.brand.update({ where: { id: existing.id }, data });
  return prisma.brand.create({ data: { tenantId, ...data } });
}

async function upsertOrganization(tenantId: string, brandId: string) {
  const existing = await prisma.organization.findFirst({
    where: {
      tenantId,
      brandId,
      OR: [{ name: DEMO_ORG_NAME }, { name: LEGACY_DEMO_ORG_NAME }],
    },
  });

  if (existing) {
    return prisma.organization.update({
      where: { id: existing.id },
      data: { tenantId, brandId, name: DEMO_ORG_NAME },
    });
  }

  return prisma.organization.create({
    data: { tenantId, brandId, name: DEMO_ORG_NAME },
  });
}

async function upsertOwnerGroup(input: {
  tenantId: string;
  brandId: string;
  organizationId: string;
}) {
  const existing =
    (await prisma.ownerGroup.findFirst({ where: { tenantId: input.tenantId, slug: DEMO_OWNER_GROUP_SLUG } })) ??
    (await prisma.ownerGroup.findFirst({ where: { tenantId: input.tenantId, slug: LEGACY_DEMO_OWNER_GROUP_SLUG } }));
  const data = {
    brandId: input.brandId,
    organizationId: input.organizationId,
    slug: DEMO_OWNER_GROUP_SLUG,
    name: "Kid City USA Enterprises Demo",
    ownerType: "corporate",
    billingEmail: "billing.demo@thebeesuite.io",
    contactName: "Kid City USA Demo Team",
    phone: "(555) 014-2118",
    status: "active",
    customFields: {
      demoWorkspace: true,
      paymentPlan: "brand_sponsored_trial",
    },
  };

  if (existing) return prisma.ownerGroup.update({ where: { id: existing.id }, data });
  return prisma.ownerGroup.create({ data: { tenantId: input.tenantId, ...data } });
}

async function upsertCenter(input: {
  organizationId: string;
  ownerGroupId: string;
  externalId: string;
  name: string;
  crmLocationId: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  licensedCapacity: number;
}) {
  const existing = await prisma.center.findFirst({
    where: { sourceSystem: DEMO_SOURCE, externalId: input.externalId },
  });

  const data = {
    organizationId: input.organizationId,
    ownerGroupId: input.ownerGroupId,
    name: input.name,
    crmLocationId: input.crmLocationId,
    locationId: input.crmLocationId,
    address: input.address,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    phone: input.phone,
    email: input.email,
    status: "active",
    sourceSystem: DEMO_SOURCE,
    externalId: input.externalId,
    licensedCapacity: input.licensedCapacity,
    timezone: "America/New_York",
    customFields: {
      demoWorkspace: true,
      operatingHours: "7:00 AM - 6:00 PM",
      licensingAgency: `${input.state} Child Care Licensing`,
      directorCanEdit: true,
    },
  };

  if (existing) return prisma.center.update({ where: { id: existing.id }, data });
  return prisma.center.create({ data });
}

async function upsertClassroom(centerId: string, input: {
  externalId: string;
  name: string;
  ageGroup: string;
  capacity: number;
  ratioRule: string;
}) {
  const existing = await prisma.classroom.findFirst({
    where: { centerId, sourceSystem: DEMO_SOURCE, externalId: input.externalId },
  });
  const data = {
    centerId,
    name: input.name,
    ageGroup: input.ageGroup,
    capacity: input.capacity,
    ratioRule: input.ratioRule,
    sourceSystem: DEMO_SOURCE,
    externalId: input.externalId,
    customFields: {
      demoWorkspace: true,
      curriculumTheme: "Community helpers and early literacy",
      roomPhoneExtension: input.externalId.slice(-2),
    },
  };

  if (existing) return prisma.classroom.update({ where: { id: existing.id }, data });
  return prisma.classroom.create({ data });
}

async function upsertUser(input: {
  tenantId: string;
  organizationId?: string | null;
  email: string;
  name: string;
  role: UserRole;
  mustResetPassword?: boolean;
}) {
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      tenantId: input.tenantId,
      organizationId: input.organizationId ?? null,
      name: input.name,
      role: input.role,
      isActive: true,
      ...(input.mustResetPassword === undefined ? {} : { mustResetPassword: input.mustResetPassword }),
    },
    create: {
      tenantId: input.tenantId,
      organizationId: input.organizationId ?? null,
      email: input.email,
      name: input.name,
      role: input.role,
      isActive: true,
      ...(input.mustResetPassword === undefined ? {} : { mustResetPassword: input.mustResetPassword }),
    },
  });
}

async function ensureAccessGrant(input: {
  userId: string;
  tenantId: string;
  role: UserRole;
  scopeType: string;
  brandId?: string | null;
  organizationId?: string | null;
  ownerGroupId?: string | null;
  centerId?: string | null;
}) {
  const existing = await prisma.userAccessGrant.findFirst({
    where: {
      userId: input.userId,
      tenantId: input.tenantId,
      role: input.role,
      scopeType: input.scopeType,
      brandId: input.brandId ?? null,
      organizationId: input.organizationId ?? null,
      ownerGroupId: input.ownerGroupId ?? null,
      centerId: input.centerId ?? null,
    },
  });
  const data = {
    userId: input.userId,
    tenantId: input.tenantId,
    role: input.role,
    scopeType: input.scopeType,
    brandId: input.brandId ?? null,
    organizationId: input.organizationId ?? null,
    ownerGroupId: input.ownerGroupId ?? null,
    centerId: input.centerId ?? null,
    isActive: true,
    startsAt: null,
    endsAt: null,
    permissions: {
      demoWorkspace: true,
      seededBy: "scripts/seed-demo-accounts.ts",
    },
  };

  if (existing) return prisma.userAccessGrant.update({ where: { id: existing.id }, data });
  return prisma.userAccessGrant.create({ data });
}

async function ensureBrandAsset(input: {
  tenantId: string;
  brandId: string;
  assetType: string;
  url: string;
  altText: string;
}) {
  const existing = await prisma.brandAsset.findFirst({
    where: {
      tenantId: input.tenantId,
      brandId: input.brandId,
      assetType: input.assetType,
    },
    select: { id: true },
  });
  const data = {
    url: input.url,
    altText: input.altText,
    metadata: { source: DEMO_SOURCE },
  };

  if (existing) return prisma.brandAsset.update({ where: { id: existing.id }, data });

  return prisma.brandAsset.create({
    data: {
      tenantId: input.tenantId,
      brandId: input.brandId,
      assetType: input.assetType,
      ...data,
    },
  });
}

async function upsertStaffProfile(input: {
  userId: string;
  centerId: string;
  classroomId?: string | null;
  title: string;
  phone: string;
  externalId: string;
}) {
  return prisma.staffProfile.upsert({
    where: { userId: input.userId },
    update: {
      centerId: input.centerId,
      classroomId: input.classroomId ?? null,
      title: input.title,
      phone: input.phone,
      backgroundCheckStatus: "cleared",
      performanceNotesPlaceholder: "Demo profile: quarterly coaching notes and goals would appear here.",
      ptoAvailabilityPlaceholder: { status: "available", nextUnavailable: dateAt(14).toISOString() },
      sourceSystem: DEMO_SOURCE,
      externalId: input.externalId,
      customFields: {
        demoWorkspace: true,
        trainingLevel: input.title.includes("Director") ? "Leadership" : "Classroom",
      },
    },
    create: {
      userId: input.userId,
      centerId: input.centerId,
      classroomId: input.classroomId ?? null,
      title: input.title,
      phone: input.phone,
      backgroundCheckStatus: "cleared",
      performanceNotesPlaceholder: "Demo profile: quarterly coaching notes and goals would appear here.",
      ptoAvailabilityPlaceholder: { status: "available", nextUnavailable: dateAt(14).toISOString() },
      sourceSystem: DEMO_SOURCE,
      externalId: input.externalId,
      customFields: {
        demoWorkspace: true,
        trainingLevel: input.title.includes("Director") ? "Leadership" : "Classroom",
      },
    },
  });
}

async function refreshDemoStaffReadiness(userId: string, centerId: string) {
  const staff = await prisma.staffProfile.findUnique({ where: { userId } });
  if (!staff) return;

  await prisma.certification.deleteMany({ where: { staffId: staff.id } });
  await prisma.certification.createMany({
    data: [
      { staffId: staff.id, name: "CPR / First Aid", status: "current", expiresAt: dateAt(150) },
      { staffId: staff.id, name: "Child Development Training", status: "current", expiresAt: dateAt(310) },
    ],
  });
  await prisma.staffSchedule.deleteMany({ where: { staffId: staff.id, centerId } });
  await prisma.staffSchedule.createMany({
    data: [
      { staffId: staff.id, centerId, startsAt: dateAt(0, 7, 30), endsAt: dateAt(0, 15, 30), status: "scheduled" },
      { staffId: staff.id, centerId, startsAt: dateAt(1, 8), endsAt: dateAt(1, 16), status: "scheduled" },
    ],
  });
}

async function upsertFamily(centerId: string, input: {
  externalId: string;
  name: string;
  address: string;
  billingEmail: string;
  notes: string;
  custodyNotes?: string;
}) {
  const existing = await prisma.family.findFirst({
    where: { centerId, sourceSystem: DEMO_SOURCE, externalId: input.externalId },
  });
  const data = {
    centerId,
    name: input.name,
    address: input.address,
    billingEmail: input.billingEmail,
    notes: input.notes,
    custodyNotes: input.custodyNotes ?? null,
    sourceSystem: DEMO_SOURCE,
    externalId: input.externalId,
    customFields: {
      demoWorkspace: true,
      preferredBillingCadence: "weekly",
      registrationStatus: "complete",
      portalInviteStatus: "sent",
    },
  };

  if (existing) return prisma.family.update({ where: { id: existing.id }, data });
  return prisma.family.create({ data });
}

async function upsertGuardian(familyId: string, input: {
  externalId: string;
  fullName: string;
  email: string;
  phone: string;
  employer: string;
  relation: string;
  isBillingContact: boolean;
  pin: string;
}) {
  const existing = await prisma.guardian.findFirst({
    where: { familyId, sourceSystem: DEMO_SOURCE, externalId: input.externalId },
  });
  const data = {
    familyId,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    employer: input.employer,
    relation: input.relation,
    preferredCommunication: "Email + portal notification",
    isBillingContact: input.isBillingContact,
    checkInPinHash: hashGuardianPin(input.externalId, input.pin),
    checkInPinSetAt: dateAt(-7),
    checkInPinSetById: null,
    sourceSystem: DEMO_SOURCE,
    externalId: input.externalId,
    customFields: {
      demoWorkspace: true,
      notificationPreferences: ["daily_reports", "billing", "emergency_alerts"],
    },
  };

  if (existing) return prisma.guardian.update({ where: { id: existing.id }, data });
  return prisma.guardian.create({ data });
}

async function upsertChild(familyId: string, classroomId: string, input: {
  externalId: string;
  fullName: string;
  preferredName: string;
  dateOfBirth: Date;
  ageGroup: string;
  startDate: Date;
  photoVideoPermission: boolean;
  fieldTripPermission: boolean;
  allergies?: Array<{ allergen: string; severity: string; actionPlan: string }>;
}) {
  const existing = await prisma.child.findFirst({
    where: { familyId, sourceSystem: DEMO_SOURCE, externalId: input.externalId },
  });
  const data = {
    familyId,
    classroomId,
    fullName: input.fullName,
    preferredName: input.preferredName,
    dateOfBirth: input.dateOfBirth,
    ageGroup: input.ageGroup,
    enrollmentStatus: "enrolled",
    startDate: input.startDate,
    schedule: {
      monday: "7:45 AM - 5:15 PM",
      tuesday: "7:45 AM - 5:15 PM",
      wednesday: "7:45 AM - 5:15 PM",
      thursday: "7:45 AM - 5:15 PM",
      friday: "8:00 AM - 4:30 PM",
    },
    photoVideoPermission: input.photoVideoPermission,
    fieldTripPermission: input.fieldTripPermission,
    napNotes: `${input.preferredName} rests best with a quiet story and soft music.`,
    feedingNotes: `${input.preferredName} is offered water throughout the day and family-approved snacks only.`,
    pottyNotes: input.ageGroup === "Infant" ? "Diaper changes logged every two hours or as needed." : "Uses classroom bathroom routine with reminders.",
    developmentalNotes: "Demo child record includes language, social-emotional, and motor development notes for staff review.",
    sourceSystem: DEMO_SOURCE,
    externalId: input.externalId,
    customFields: {
      demoWorkspace: true,
      tshirtSize: input.ageGroup === "Infant" ? "12-18M" : "4T",
      sunscreenPermission: true,
      registrationPacket: "complete",
    },
  };

  const child = existing
    ? await prisma.child.update({ where: { id: existing.id }, data })
    : await prisma.child.create({ data });

  await prisma.childMedicalNote.deleteMany({ where: { childId: child.id } });
  await prisma.childMedicalNote.createMany({
    data: [
      {
        childId: child.id,
        category: "medical",
        note: input.allergies?.length ? "Allergy action plan on file and reviewed by director." : "No active medical alerts reported by guardian.",
        restricted: true,
      },
      {
        childId: child.id,
        category: "developmental",
        note: "Demo observation note: enjoys small-group reading and outdoor sensory play.",
        restricted: false,
      },
    ],
  });

  await prisma.allergy.deleteMany({ where: { childId: child.id } });
  if (input.allergies?.length) {
    await prisma.allergy.createMany({
      data: input.allergies.map((allergy) => ({
        childId: child.id,
        allergen: allergy.allergen,
        severity: allergy.severity,
        actionPlan: allergy.actionPlan,
      })),
    });
  }

  await prisma.enrollment.deleteMany({ where: { childId: child.id } });
  await prisma.enrollment.create({
    data: {
      childId: child.id,
      stage: EnrollmentStage.ENROLLED,
      desiredStartDate: input.startDate,
      depositDueCents: 15000,
      depositPaidCents: 15000,
      checklist: {
        demoWorkspace: true,
        registrationPacket: "complete",
        emergencyContacts: "complete",
        medicalForm: "complete",
        immunizationRecord: "on_file",
        billingAccount: "created",
        parentPortalInvite: "sent",
      },
    },
  });

  return child;
}

async function upsertLead(centerId: string, input: {
  externalId: string;
  familyName: string;
  parentFirstName: string;
  parentLastName: string;
  email: string;
  phone: string;
  childName: string;
  ageGroupInterest: string;
  programInterest: string;
  stage: EnrollmentStage;
  score: number;
  desiredStartDate: Date;
}) {
  const lead = await prisma.lead.upsert({
    where: { centerId_externalId: { centerId, externalId: input.externalId } },
    update: {
      familyName: input.familyName,
      parentFirstName: input.parentFirstName,
      parentLastName: input.parentLastName,
      email: input.email,
      phone: input.phone,
      childName: input.childName,
      leadSource: "Demo website inquiry",
      ageGroupInterest: input.ageGroupInterest,
      desiredStartDate: input.desiredStartDate,
      programInterest: input.programInterest,
      stage: input.stage,
      score: input.score,
      status: input.stage === EnrollmentStage.LOST_NOT_A_FIT ? "closed" : "open",
      customFields: {
        demoWorkspace: true,
        selectedLocationId: centerId,
        sourcePage: "demo landing page",
        aiNextStep: "Suggested follow-up drafted by Mr. Bee for human review.",
      },
    },
    create: {
      centerId,
      externalId: input.externalId,
      familyName: input.familyName,
      parentFirstName: input.parentFirstName,
      parentLastName: input.parentLastName,
      email: input.email,
      phone: input.phone,
      childName: input.childName,
      leadSource: "Demo website inquiry",
      ageGroupInterest: input.ageGroupInterest,
      desiredStartDate: input.desiredStartDate,
      programInterest: input.programInterest,
      stage: input.stage,
      score: input.score,
      status: input.stage === EnrollmentStage.LOST_NOT_A_FIT ? "closed" : "open",
      customFields: {
        demoWorkspace: true,
        selectedLocationId: centerId,
        sourcePage: "demo landing page",
        aiNextStep: "Suggested follow-up drafted by Mr. Bee for human review.",
      },
    },
  });

  await prisma.task.deleteMany({ where: { leadId: lead.id } });
  await prisma.task.createMany({
    data: [
      {
        leadId: lead.id,
        title: input.stage === EnrollmentStage.NEW_INQUIRY ? "Call family within 15 minutes" : "Send warm follow-up with next step",
        dueAt: dateAt(1, 10),
        status: "open",
        assignedTo: "Demo School Director",
      },
      {
        leadId: lead.id,
        title: "Mr. Bee: review suggested parent reply before sending",
        dueAt: dateAt(2, 14),
        status: "open",
        assignedTo: "Demo School Director",
      },
    ],
  });

  await prisma.note.deleteMany({ where: { leadId: lead.id } });
  await prisma.note.create({
    data: {
      leadId: lead.id,
      body: "Demo note: family asked about classroom openings, teacher tenure, daily reports, and tuition schedule.",
      restricted: false,
    },
  });

  const stagesWithTours = new Set<EnrollmentStage>([
    EnrollmentStage.TOUR_SCHEDULED,
    EnrollmentStage.TOUR_COMPLETED,
    EnrollmentStage.APPLICATION_SENT,
  ]);
  if (stagesWithTours.has(input.stage)) {
    const existingTour = await prisma.tour.findFirst({ where: { centerId, leadId: lead.id } });
    const tourData = {
      centerId,
      leadId: lead.id,
      startsAt: input.stage === EnrollmentStage.TOUR_COMPLETED ? dateAt(-2, 9, 30) : dateAt(3, 10, 30),
      status: input.stage === EnrollmentStage.TOUR_COMPLETED ? "completed" : "scheduled",
      notes: "Tour includes lobby check-in, classroom walk-through, tuition conversation, and registration packet review.",
    };
    if (existingTour) await prisma.tour.update({ where: { id: existingTour.id }, data: tourData });
    else await prisma.tour.create({ data: tourData });
  }

  return lead;
}

async function upsertBilling(familyId: string, index: number) {
  const balance = [0, 18500, 32450, 9200][index % 4];
  const account = await prisma.billingAccount.upsert({
    where: { familyId },
    update: {
      balanceCents: balance,
      autopayPlaceholder: index % 3 === 0,
      ledgerSyncedAt: dateAt(-1),
      sourceSystem: DEMO_SOURCE,
      externalId: `demo-billing-${familyId}`,
      customFields: {
        demoWorkspace: true,
        tuitionPlan: index % 2 === 0 ? "Full-time preschool weekly" : "Part-time toddler weekly",
        subsidyPending: index % 5 === 0,
      },
    },
    create: {
      familyId,
      balanceCents: balance,
      autopayPlaceholder: index % 3 === 0,
      ledgerSyncedAt: dateAt(-1),
      sourceSystem: DEMO_SOURCE,
      externalId: `demo-billing-${familyId}`,
      customFields: {
        demoWorkspace: true,
        tuitionPlan: index % 2 === 0 ? "Full-time preschool weekly" : "Part-time toddler weekly",
        subsidyPending: index % 5 === 0,
      },
    },
  });

  const invoiceNumber = `DEMO-${String(index + 1).padStart(4, "0")}`;
  const invoice = await prisma.invoice.upsert({
    where: { number: invoiceNumber },
    update: {
      billingAccountId: account.id,
      status: balance > 0 ? PaymentStatus.OPEN : PaymentStatus.PAID,
      dueDate: dateAt(balance > 0 ? 5 : -3),
      totalCents: money(index % 2 === 0 ? 32500 : 21800),
      sourceSystem: DEMO_SOURCE,
      externalId: invoiceNumber,
      customFields: {
        demoWorkspace: true,
        paymentMethodOptions: ["ACH", "Card"],
        surchargeDisclosure: "Demo: processing recovery displayed before payment.",
      },
    },
    create: {
      billingAccountId: account.id,
      number: invoiceNumber,
      status: balance > 0 ? PaymentStatus.OPEN : PaymentStatus.PAID,
      dueDate: dateAt(balance > 0 ? 5 : -3),
      totalCents: money(index % 2 === 0 ? 32500 : 21800),
      sourceSystem: DEMO_SOURCE,
      externalId: invoiceNumber,
      customFields: {
        demoWorkspace: true,
        paymentMethodOptions: ["ACH", "Card"],
        surchargeDisclosure: "Demo: processing recovery displayed before payment.",
      },
    },
  });

  await prisma.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
  await prisma.invoiceItem.createMany({
    data: [
      { invoiceId: invoice.id, description: "Weekly tuition", amountCents: invoice.totalCents - 3500 },
      { invoiceId: invoice.id, description: "Registration/activity fee", amountCents: 3500 },
    ],
  });

  const existingPayment = await prisma.payment.findFirst({
    where: { billingAccountId: account.id, externalIdPlaceholder: `demo-payment-${invoiceNumber}` },
  });
  if (!balance) {
    const paymentData = {
      billingAccountId: account.id,
      amountCents: invoice.totalCents,
      status: PaymentStatus.PAID,
      provider: "stripe_mock",
      externalIdPlaceholder: `demo-payment-${invoiceNumber}`,
      customFields: {
        demoWorkspace: true,
        method: index % 2 === 0 ? "ACH" : "Card",
        convenienceFeeCents: index % 2 === 0 ? 500 : 0,
      },
      paidAt: dateAt(-3),
    };
    if (existingPayment) await prisma.payment.update({ where: { id: existingPayment.id }, data: paymentData });
    else await prisma.payment.create({ data: paymentData });
  }

  await prisma.ledgerEntry.upsert({
    where: { sourceSystem_externalId: { sourceSystem: DEMO_SOURCE, externalId: `ledger-${invoiceNumber}-charge` } },
    update: {
      billingAccountId: account.id,
      invoiceId: invoice.id,
      type: "charge",
      description: "Weekly tuition charge",
      amountCents: invoice.totalCents,
      balanceAfterCents: balance || invoice.totalCents,
      effectiveAt: dateAt(-7),
      metadata: { demoWorkspace: true },
    },
    create: {
      billingAccountId: account.id,
      invoiceId: invoice.id,
      type: "charge",
      description: "Weekly tuition charge",
      amountCents: invoice.totalCents,
      balanceAfterCents: balance || invoice.totalCents,
      effectiveAt: dateAt(-7),
      sourceSystem: DEMO_SOURCE,
      externalId: `ledger-${invoiceNumber}-charge`,
      metadata: { demoWorkspace: true },
    },
  });
}

async function upsertDailyReport(input: {
  childId: string;
  classroomId: string;
  childName: string;
  uploadedById?: string;
}) {
  const reportDate = dateAt(0, 0);
  const existing = await prisma.dailyReport.findFirst({
    where: { childId: input.childId, date: reportDate },
  });
  const data = {
    childId: input.childId,
    classroomId: input.classroomId,
    date: reportDate,
    mood: "Happy and curious",
    teacherNote: `${input.childName} enjoyed story time, outdoor play, and a small-group counting activity today.`,
    suppliesNeeded: "Extra weather-appropriate outfit",
    sentAt: dateAt(0, 15, 45),
  };
  const report = existing
    ? await prisma.dailyReport.update({ where: { id: existing.id }, data })
    : await prisma.dailyReport.create({ data });

  await prisma.meal.deleteMany({ where: { dailyReportId: report.id } });
  await prisma.nap.deleteMany({ where: { dailyReportId: report.id } });
  await prisma.diaperPottyLog.deleteMany({ where: { dailyReportId: report.id } });
  await prisma.activityLog.deleteMany({ where: { dailyReportId: report.id } });
  await prisma.meal.createMany({
    data: [
      { dailyReportId: report.id, mealType: "Breakfast", food: "Banana oatmeal and milk", amount: "Most" },
      { dailyReportId: report.id, mealType: "Lunch", food: "Turkey roll-up, fruit, and vegetables", amount: "All" },
      { dailyReportId: report.id, mealType: "Snack", food: "Applesauce and crackers", amount: "Some" },
    ],
  });
  await prisma.nap.create({
    data: {
      dailyReportId: report.id,
      startsAt: dateAt(0, 12, 35),
      endsAt: dateAt(0, 14, 5),
    },
  });
  await prisma.diaperPottyLog.create({
    data: {
      dailyReportId: report.id,
      type: "potty",
      occurredAt: dateAt(0, 10, 15),
      notes: "Participated in routine with teacher support.",
    },
  });
  await prisma.activityLog.createMany({
    data: [
      { dailyReportId: report.id, title: "Outdoor gross motor", notes: "Practiced balance steps and cooperative play." },
      { dailyReportId: report.id, title: "Early literacy", notes: "Identified picture cards and repeated new vocabulary." },
    ],
  });

  const mediaUrl = `https://placehold.co/900x600/f5b51b/111827?text=${encodeURIComponent(input.childName.split(" ")[0])}+classroom+moment`;
  const existingMedia = await prisma.childMedia.findFirst({ where: { childId: input.childId, url: mediaUrl } });
  const mediaData = {
    childId: input.childId,
    classroomId: input.classroomId,
    uploadedById: input.uploadedById ?? null,
    dailyReportId: report.id,
    url: mediaUrl,
    storageKey: `demo-media/${input.childId}/classroom-moment.jpg`,
    caption: `${input.childName} participating in a teacher-led classroom activity.`,
    mediaType: "photo",
    status: "shared",
    sharedWithParents: true,
    takenAt: dateAt(0, 10, 45),
  };
  if (existingMedia) await prisma.childMedia.update({ where: { id: existingMedia.id }, data: mediaData });
  else await prisma.childMedia.create({ data: mediaData });
}

async function upsertAttendance(input: {
  centerId: string;
  classroomId: string;
  childId: string;
  guardianId: string;
  childName: string;
  index: number;
}) {
  const status = input.index % 7 === 0 ? "absent" : "present";
  const externalBase = `attendance-${input.childId}-${new Date().toISOString().slice(0, 10)}`;
  const existingAttendance = await prisma.attendanceRecord.findFirst({
    where: { sourceSystem: DEMO_SOURCE, externalId: externalBase },
  });
  const attendanceData = {
    childId: input.childId,
    classroomId: input.classroomId,
    date: dateAt(0, 0),
    status,
    absenceReason: status === "absent" ? "Family reported sick day through parent portal" : null,
    sourceSystem: DEMO_SOURCE,
    externalId: externalBase,
    metadata: { demoWorkspace: true, checkedBy: "Lobby kiosk" },
  };
  if (existingAttendance) await prisma.attendanceRecord.update({ where: { id: existingAttendance.id }, data: attendanceData });
  else await prisma.attendanceRecord.create({ data: attendanceData });

  if (status !== "present") return;

  for (const [type, hour, minute] of [
    ["check_in", 7 + (input.index % 3), 35 + (input.index % 20)],
    ["check_out", 15 + (input.index % 2), 10 + (input.index % 25)],
  ] as const) {
    const externalId = `${externalBase}-${type}`;
    const existingLog = await prisma.checkInOutLog.findFirst({
      where: { sourceSystem: DEMO_SOURCE, externalId },
    });
    const logData = {
      childId: input.childId,
      centerId: input.centerId,
      classroomId: input.classroomId,
      guardianId: input.guardianId,
      type,
      occurredAt: dateAt(0, hour, minute),
      pickupName: type === "check_out" ? "Primary guardian" : null,
      signaturePlaceholder: true,
      verificationStatus: "pin_verified",
      pinVerified: true,
      notes: `${input.childName} ${type === "check_in" ? "arrived ready for the day" : "left with authorized guardian"}.`,
      sourceSystem: DEMO_SOURCE,
      externalId,
      metadata: { demoWorkspace: true, kioskMode: true },
    };
    if (existingLog) await prisma.checkInOutLog.update({ where: { id: existingLog.id }, data: logData });
    else await prisma.checkInOutLog.create({ data: logData });
  }
}

async function upsertFteReports(
  centerId: string,
  submittedById: string,
  baseline: number,
  ageGroupCounts?: {
    infants: number;
    toddlers: number;
    twos: number;
    preschool: number;
    preK: number;
    schoolAge: number;
  },
) {
  for (let week = -3; week <= 0; week += 1) {
    const weekStart = startOfWeek(week);
    const fullTime = baseline + week;
    const partTime = Math.max(4, Math.round(baseline / 3) + (week % 2));
    const counts = ageGroupCounts ?? {
      infants: Math.max(4, Math.round(baseline * 0.12)),
      toddlers: Math.max(5, Math.round(baseline * 0.16)),
      twos: Math.max(5, Math.round(baseline * 0.17)),
      preschool: Math.max(7, Math.round(baseline * 0.22)),
      preK: Math.max(6, Math.round(baseline * 0.2)),
      schoolAge: Math.max(3, Math.round(baseline * 0.13)),
    };
    await prisma.fteReport.upsert({
      where: { centerId_weekStart: { centerId, weekStart } },
      update: {
        submittedById,
        weekEnd: weekEnd(weekStart),
        enrolledCount: fullTime + partTime,
        fullTimeCount: fullTime,
        partTimeCount: partTime,
        fteCount: Number((fullTime + partTime * 0.55).toFixed(2)),
        infants: counts.infants,
        toddlers: counts.toddlers,
        twos: counts.twos,
        preschool: counts.preschool,
        preK: counts.preK,
        schoolAge: counts.schoolAge,
        notes: week === 0 ? "Demo weekly FTE submitted from director dashboard." : "Demo historical FTE report.",
        status: week === 0 ? "submitted" : "approved",
        source: "demo_seed",
        sourceMetadata: { demoWorkspace: true },
      },
      create: {
        centerId,
        submittedById,
        weekStart,
        weekEnd: weekEnd(weekStart),
        enrolledCount: fullTime + partTime,
        fullTimeCount: fullTime,
        partTimeCount: partTime,
        fteCount: Number((fullTime + partTime * 0.55).toFixed(2)),
        infants: counts.infants,
        toddlers: counts.toddlers,
        twos: counts.twos,
        preschool: counts.preschool,
        preK: counts.preK,
        schoolAge: counts.schoolAge,
        notes: week === 0 ? "Demo weekly FTE submitted from director dashboard." : "Demo historical FTE report.",
        status: week === 0 ? "submitted" : "approved",
        source: "demo_seed",
        sourceMetadata: { demoWorkspace: true },
      },
    });
  }
}

async function main() {
  const tenant = await upsertTenant();
  const brand = await upsertBrand(tenant.id);
  const organization = await upsertOrganization(tenant.id, brand.id);
  const ownerGroup = await upsertOwnerGroup({ tenantId: tenant.id, brandId: brand.id, organizationId: organization.id });

  await prisma.whiteLabelSettings.upsert({
    where: { brandId: brand.id },
    update: {
      brandName: DEMO_BRAND_NAME,
      logoUrlPlaceholder: KID_CITY_USA_BRANDING.logoSrc,
      faviconUrlPlaceholder: KID_CITY_USA_BRANDING.markSrc,
      primaryColor: "#f5b51b",
      accentColor: "#38bdf8",
      themeMode: "dark",
      emailSenderPlaceholder: "hello@kidcityusa-demo.test",
      customDomainPlaceholder: "demo.kidcityusa.test",
      legalFooterText: "Demo workspace for The BEE Suite sales and training only.",
      termsUrl: "https://thebeesuite.io/terms",
      privacyUrl: "https://thebeesuite.io/privacy",
    },
    create: {
      brandId: brand.id,
      brandName: DEMO_BRAND_NAME,
      logoUrlPlaceholder: KID_CITY_USA_BRANDING.logoSrc,
      faviconUrlPlaceholder: KID_CITY_USA_BRANDING.markSrc,
      primaryColor: "#f5b51b",
      accentColor: "#38bdf8",
      themeMode: "dark",
      emailSenderPlaceholder: "hello@kidcityusa-demo.test",
      customDomainPlaceholder: "demo.kidcityusa.test",
      legalFooterText: "Demo workspace for The BEE Suite sales and training only.",
      termsUrl: "https://thebeesuite.io/terms",
      privacyUrl: "https://thebeesuite.io/privacy",
    },
  });

  await Promise.all([
    ensureBrandAsset({
      tenantId: tenant.id,
      brandId: brand.id,
      assetType: "logo",
      url: KID_CITY_USA_BRANDING.logoSrc,
      altText: KID_CITY_USA_BRANDING.logoAlt,
    }),
    ensureBrandAsset({
      tenantId: tenant.id,
      brandId: brand.id,
      assetType: "favicon",
      url: KID_CITY_USA_BRANDING.markSrc,
      altText: "Kid City USA favicon",
    }),
  ]);

  const centers = await Promise.all([
    upsertCenter({
      organizationId: organization.id,
      ownerGroupId: ownerGroup.id,
      externalId: "demo-center-little-harbor",
      name: DEMO_LOCATION_NAME,
      crmLocationId: DEMO_LOCATION_NAME,
      address: "123 Demo Hive Lane",
      city: "Port Orange",
      state: "FL",
      postalCode: "32129",
      phone: "(386) 555-0138",
      email: "demo@kidcityusa.com",
      licensedCapacity: 79,
    }),
  ]);
  await prisma.center.updateMany({
    where: {
      sourceSystem: DEMO_SOURCE,
      externalId: { notIn: centers.map((center) => center.externalId).filter((id): id is string => Boolean(id)) },
    },
    data: { status: "closed" },
  });
  const primaryCenter = centers[0];

  const classroomTemplates = [
    ["infants", "Infant Hive", "Infant", 10, "1:4"],
    ["toddlers", "Toddler Hive", "Toddler", 15, "1:6"],
    ["threes", "3's Hive", "3's", 14, "1:9"],
    ["prek", "Pre-K Hive", "Pre-K", 18, "1:12"],
    ["afterschool", "Afterschool Hive", "Afterschool", 22, "1:18"],
  ] as const;

  const classroomsByCenter = new Map<string, Awaited<ReturnType<typeof upsertClassroom>>[]>();
  for (const center of centers) {
    const classrooms = [];
    for (const [key, name, ageGroup, capacity, ratioRule] of classroomTemplates) {
      classrooms.push(await upsertClassroom(center.id, {
        externalId: `${center.externalId}-${key}`,
        name,
        ageGroup,
        capacity,
        ratioRule,
      }));
    }
    classroomsByCenter.set(center.id, classrooms);
  }
  const primaryClassrooms = classroomsByCenter.get(primaryCenter.id) ?? [];

  const schoolUser = await upsertUser({
    tenantId: tenant.id,
    organizationId: organization.id,
    email: demoAccountEmails.school,
    name: "Demo School Director",
    role: UserRole.CENTER_DIRECTOR,
  });
  const execUser = await upsertUser({
    tenantId: tenant.id,
    organizationId: organization.id,
    email: demoAccountEmails.executive,
    name: "Demo Brand Executive",
    role: UserRole.BRAND_ADMIN,
  });
  const demoTeacherUser = await upsertUser({
    tenantId: tenant.id,
    organizationId: organization.id,
    email: demoAccountEmails.teacher,
    name: "Demo Teacher",
    role: UserRole.TEACHER,
    mustResetPassword: false,
  });

  await prisma.userAccessGrant.updateMany({
    where: {
      userId: { in: [schoolUser.id, execUser.id, demoTeacherUser.id] },
      tenantId: { not: tenant.id },
      permissions: { path: ["demoWorkspace"], equals: true },
    },
    data: { isActive: false, endsAt: new Date() },
  });

  await Promise.all([
    upsertSupabaseAuthUserWithPassword({
      email: demoAccountEmails.school,
      name: schoolUser.name,
      password: demoPassword,
      role: schoolUser.role,
      source: DEMO_SOURCE,
    }),
    upsertSupabaseAuthUserWithPassword({
      email: demoAccountEmails.executive,
      name: execUser.name,
      password: demoPassword,
      role: execUser.role,
      source: DEMO_SOURCE,
    }),
    upsertSupabaseAuthUserWithPassword({
      email: demoAccountEmails.teacher,
      name: demoTeacherUser.name,
      password: demoPassword,
      role: demoTeacherUser.role,
      source: DEMO_SOURCE,
    }),
  ]);

  await ensureAccessGrant({
    userId: schoolUser.id,
    tenantId: tenant.id,
    role: UserRole.CENTER_DIRECTOR,
    scopeType: "CENTER",
    centerId: primaryCenter.id,
  });
  await ensureAccessGrant({
    userId: execUser.id,
    tenantId: tenant.id,
    role: UserRole.BRAND_ADMIN,
    scopeType: "BRAND",
    brandId: brand.id,
  });
  await ensureAccessGrant({
    userId: demoTeacherUser.id,
    tenantId: tenant.id,
    role: UserRole.TEACHER,
    scopeType: "CENTER",
    organizationId: organization.id,
    centerId: primaryCenter.id,
  });
  await upsertStaffProfile({
    userId: schoolUser.id,
    centerId: primaryCenter.id,
    title: "Center Director",
    phone: "(843) 555-0101",
    externalId: "demo-school-director-profile",
  });
  await upsertStaffProfile({
    userId: demoTeacherUser.id,
    centerId: primaryCenter.id,
    classroomId: primaryClassrooms[3]?.id ?? primaryClassrooms[0]?.id,
    title: "Demo Lead Teacher",
    phone: "(843) 555-0119",
    externalId: "demo-teacher-login-profile",
  });
  await refreshDemoStaffReadiness(demoTeacherUser.id, primaryCenter.id);

  const teacherInputs = [
    ["Avery Johnson", "Lead Infant Teacher", primaryClassrooms[0]?.id],
    ["Mia Patel", "Lead Toddler Teacher", primaryClassrooms[1]?.id],
    ["Camila Brooks", "3's Teacher", primaryClassrooms[2]?.id],
    ["Noah Bennett", "Pre-K Teacher", primaryClassrooms[3]?.id],
    ["Jordan Carter", "Afterschool Teacher", primaryClassrooms[4]?.id],
  ] as const;
  const teacherInitialPassword = getDefaultTeacherInitialPassword();
  const teacherUsers = [demoTeacherUser];
  for (let index = 0; index < teacherInputs.length; index += 1) {
    const [name, title, classroomId] = teacherInputs[index];
    const email = buildTeacherLoginEmail({ fullName: name });
    const user = await upsertUser({
      tenantId: tenant.id,
      organizationId: organization.id,
      email,
      name,
      role: UserRole.TEACHER,
      mustResetPassword: true,
    });
    await upsertSupabaseAuthUserWithPassword({
      email,
      name,
      password: teacherInitialPassword,
      role: UserRole.TEACHER,
      source: DEMO_SOURCE,
    });
    teacherUsers.push(user);
    await upsertStaffProfile({
      userId: user.id,
      centerId: primaryCenter.id,
      classroomId,
      title,
      phone: `(843) 555-01${20 + index}`,
      externalId: `demo-teacher-${index + 1}`,
    });
    await ensureAccessGrant({
      userId: user.id,
      tenantId: tenant.id,
      role: UserRole.TEACHER,
      scopeType: "CENTER",
      organizationId: organization.id,
      centerId: primaryCenter.id,
    });
    await refreshDemoStaffReadiness(user.id, primaryCenter.id);
  }

  type DemoFamilyInput = {
    key: string;
    familyName: string;
    address: string;
    billingEmail: string;
    guardianName: string;
    childName: string;
    ageGroup: string;
    dateOfBirth: Date;
    permission: boolean;
  };

  const demoRosterTargets = [
    { ageGroup: "Infant", children: 8 },
    { ageGroup: "Toddler", children: 12 },
    { ageGroup: "3's", children: 11 },
    { ageGroup: "Pre-K", children: 14 },
    { ageGroup: "Afterschool", children: 12 },
  ] as const;
  const legacyFamilySeeds = [
    ["rivera", "Rivera", "212 Oak Blossom Drive, Port Orange, FL", "maria.rivera.demo@example.com", "Lena Rivera"],
    ["chen", "Chen", "48 Palmetto Row, Port Orange, FL", "grace.chen.demo@example.com", "Grace Chen"],
    ["williams", "Williams", "870 Magnolia Street, Port Orange, FL", "noah.williams.demo@example.com", "Noah Williams"],
    ["thompson", "Thompson", "141 Seaside Court, Port Orange, FL", "lauren.thompson.demo@example.com", "Lauren Thompson"],
    ["nguyen", "Nguyen", "332 Demo Center Way, Port Orange, FL", "anh.nguyen.demo@example.com", "Anh Nguyen"],
    ["parker", "Parker", "76 Marsh Landing, Port Orange, FL", "olivia.parker.demo@example.com", "Olivia Parker"],
    ["robinson", "Robinson", "505 Harbor Gate, Port Orange, FL", "jamal.robinson.demo@example.com", "Jamal Robinson"],
    ["martinez", "Martinez", "18 Gardenia Way, Port Orange, FL", "sofia.martinez.demo@example.com", "Sofia Martinez"],
  ] as const;
  const demoChildFirstNames = [
    "Ari", "Sofia", "Mia", "Eli", "Theo", "Amelie", "Noah", "Lena", "Milo", "Ivy",
    "Ezra", "Nora", "Kai", "Luca", "Zoe", "Finn", "Ava", "Leo", "Ruby", "Jude",
    "Cora", "Owen", "Maya", "Remy", "Isla", "Layla", "Mateo", "Harper", "Miles", "Ella",
    "Jack", "Aria", "Henry", "Nora", "Logan", "Emery", "Caleb", "Violet", "Wyatt", "Lila",
    "Asher", "Chloe", "Mason", "Hazel", "Ethan", "Lucy", "Samuel", "Grace", "Daniel", "Stella",
    "Sebastian", "Naomi", "Julian", "Piper", "Hudson", "Quinn", "Evelyn",
  ];
  const demoLastNames = [
    "Baker", "Harris", "Cooper", "Bell", "Foster", "Sullivan", "Reed", "Kelly", "Watson", "Price",
    "Evans", "Diaz", "Carter", "Brooks", "Allen", "Murphy", "Turner", "Collins", "Stewart", "Morris",
    "Bailey", "Sanders", "Russell", "Powell", "Perry", "Long", "Bryant", "Coleman", "Jenkins", "Barnes",
    "Fisher", "Henderson", "Hamilton", "Woods", "West", "Stone", "Hart", "Ford", "Gibson", "Ellis",
  ];
  const demoGuardianFirstNames = [
    "Jordan", "Taylor", "Morgan", "Riley", "Casey", "Avery", "Peyton", "Reese", "Jamie", "Cameron",
  ];

  function demoDateOfBirth(ageGroup: string, index: number) {
    const month = String((index % 12) + 1).padStart(2, "0");
    const day = String(((index * 3) % 20) + 5).padStart(2, "0");
    if (ageGroup === "Infant") return fixedDate(`2025-${month}-${day}`);
    if (ageGroup === "Toddler") return fixedDate(`2023-${month}-${day}`);
    if (ageGroup === "3's") return fixedDate(`2022-${month}-${day}`);
    if (ageGroup === "Pre-K") return fixedDate(`2021-${month}-${day}`);
    return fixedDate(`2018-${month}-${day}`);
  }

  function familySeedAt(index: number) {
    const legacy = legacyFamilySeeds[index];
    if (legacy) {
      const [key, lastName, address, billingEmail, guardianName] = legacy;
      return { key, lastName, familyName: `${lastName} Family`, address, billingEmail, guardianName };
    }
    const lastName = demoLastNames[index % demoLastNames.length];
    return {
      key: `${lastName.toLowerCase()}-${String(index + 1).padStart(2, "0")}`,
      lastName,
      familyName: `${lastName} Family`,
      address: `${100 + index} Demo Hive Lane, Port Orange, FL`,
      billingEmail: `${lastName.toLowerCase()}.${index + 1}.demo@example.com`,
      guardianName: `${demoGuardianFirstNames[index % demoGuardianFirstNames.length]} ${lastName}`,
    };
  }

  function buildDemoFamilyInputs(): DemoFamilyInput[] {
    const inputs: DemoFamilyInput[] = [];
    let index = 0;
    for (const target of demoRosterTargets) {
      for (let rosterIndex = 0; rosterIndex < target.children; rosterIndex += 1) {
        const seed = familySeedAt(index);
        const childFirstName = demoChildFirstNames[index % demoChildFirstNames.length];
        inputs.push({
          key: seed.key,
          familyName: seed.familyName,
          address: seed.address,
          billingEmail: seed.billingEmail,
          guardianName: seed.guardianName,
          childName: `${childFirstName} ${seed.lastName}`,
          ageGroup: target.ageGroup,
          dateOfBirth: demoDateOfBirth(target.ageGroup, index),
          permission: index % 9 !== 0,
        });
        index += 1;
      }
    }
    return inputs;
  }

  const familyInputs = buildDemoFamilyInputs();

  const createdChildren: Array<{ childId: string; classroomId: string; guardianId: string; childName: string }> = [];
  for (let index = 0; index < familyInputs.length; index += 1) {
    const { key, familyName, address, billingEmail, guardianName, childName, ageGroup, dateOfBirth, permission } = familyInputs[index];
    const classroom = primaryClassrooms.find((item) => item.ageGroup === ageGroup) ?? primaryClassrooms[0];
    const family = await upsertFamily(primaryCenter.id, {
      externalId: `demo-family-${key}`,
      name: familyName,
      address,
      billingEmail,
      notes: "Demo family profile with complete contacts, billing account, documents, and classroom records.",
      custodyNotes: index === 2 ? "Restricted demo note: pickup changes require director review." : undefined,
    });
    const guardian = await upsertGuardian(family.id, {
      externalId: `demo-guardian-${key}-primary`,
      fullName: guardianName,
      email: billingEmail,
      phone: `(386) 555-1${String(index).padStart(3, "0")}`,
      employer: index % 2 === 0 ? "Harbor Health Partners" : "Coastal Design Studio",
      relation: "Parent / Guardian",
      isBillingContact: true,
      pin: "2468",
    });
    await upsertGuardian(family.id, {
      externalId: `demo-guardian-${key}-secondary`,
      fullName: `${childName.split(" ")[0]} ${familyName.replace(" Family", "")}`,
      email: `secondary.${key}.demo@example.com`,
      phone: `(386) 555-2${String(index).padStart(3, "0")}`,
      employer: "Self-employed",
      relation: "Parent / Guardian",
      isBillingContact: false,
      pin: "1357",
    });
    await prisma.authorizedPickup.deleteMany({ where: { familyId: family.id } });
    await prisma.authorizedPickup.createMany({
      data: [
        { familyId: family.id, fullName: `${familyName.replace(" Family", "")} Grandparent`, phone: `(386) 555-3${String(index).padStart(3, "0")}`, relation: "Grandparent", verificationNotes: "Photo ID required", sourceSystem: DEMO_SOURCE, externalId: `pickup-${key}` },
      ],
    });
    await prisma.emergencyContact.deleteMany({ where: { familyId: family.id } });
    await prisma.emergencyContact.createMany({
      data: [
        { familyId: family.id, fullName: `${familyName.replace(" Family", "")} Emergency Contact`, phone: `(386) 555-4${String(index).padStart(3, "0")}`, relation: "Aunt/Uncle", sourceSystem: DEMO_SOURCE, externalId: `emergency-${key}`, customFields: { demoWorkspace: true } },
      ],
    });
    const child = await upsertChild(family.id, classroom.id, {
      externalId: `demo-child-${key}`,
      fullName: childName,
      preferredName: childName.split(" ")[0],
      dateOfBirth,
      ageGroup,
      startDate: dateAt(-45 - index * 7),
      photoVideoPermission: permission,
      fieldTripPermission: permission,
      allergies: index === 1 ? [{ allergen: "Peanuts", severity: "High", actionPlan: "No nuts in classroom; emergency plan on file." }] : undefined,
    });
    createdChildren.push({ childId: child.id, classroomId: classroom.id, guardianId: guardian.id, childName });
    await upsertBilling(family.id, index);
    await prisma.document.deleteMany({ where: { OR: [{ familyId: family.id }, { childId: child.id }] } });
    await prisma.document.createMany({
      data: [
        { familyId: family.id, name: "Enrollment Agreement", type: "registration", status: DocumentStatus.APPROVED, restricted: false, storageKey: `demo-docs/${family.id}/enrollment-agreement.pdf` },
        { childId: child.id, name: "Medical and Allergy Form", type: "medical", status: DocumentStatus.APPROVED, restricted: true, expiresAt: dateAt(210), storageKey: `demo-docs/${child.id}/medical-form.pdf` },
        { childId: child.id, name: "Photo / Video Permission", type: "permission", status: permission ? DocumentStatus.APPROVED : DocumentStatus.REQUESTED, restricted: false, storageKey: `demo-docs/${child.id}/photo-permission.pdf` },
      ],
    });
    await upsertAttendance({
      centerId: primaryCenter.id,
      classroomId: classroom.id,
      childId: child.id,
      guardianId: guardian.id,
      childName,
      index,
    });
    await upsertDailyReport({
      childId: child.id,
      classroomId: classroom.id,
      childName,
      uploadedById: teacherUsers[index % teacherUsers.length]?.id,
    });
  }

  for (let index = 0; index < createdChildren.length; index += 1) {
    if (index % 5 !== 0) continue;
    const existingIncident = await prisma.incidentReport.findFirst({
      where: { childId: createdChildren[index].childId, type: "Playground scrape" },
    });
    const data = {
      childId: createdChildren[index].childId,
      classroomId: createdChildren[index].classroomId,
      staffMember: "Demo School Director",
      occurredAt: dateAt(-index - 1, 10, 20),
      type: "Playground scrape",
      description: "Child tripped during outdoor play and had a minor scrape on knee.",
      actionTaken: "Area cleaned, bandage applied, child monitored, parent notified at pickup.",
      parentNotified: true,
      parentAcknowledgedAt: index === 0 ? null : dateAt(-index, 16),
      photoAttachmentPlaceholder: true,
      adminReviewStatus: index === 0 ? "pending" : "reviewed",
      followUpTasks: [{ title: "Check playground surface", status: "complete" }],
    };
    if (existingIncident) await prisma.incidentReport.update({ where: { id: existingIncident.id }, data });
    else await prisma.incidentReport.create({ data });
  }

  const leadStages = [
    EnrollmentStage.NEW_INQUIRY,
    EnrollmentStage.CONTACTED,
    EnrollmentStage.TOUR_SCHEDULED,
    EnrollmentStage.TOUR_COMPLETED,
    EnrollmentStage.APPLICATION_SENT,
    EnrollmentStage.APPLICATION_SUBMITTED,
    EnrollmentStage.DOCUMENTS_PENDING,
    EnrollmentStage.DEPOSIT_PENDING,
    EnrollmentStage.ENROLLED,
    EnrollmentStage.WAITLISTED,
    EnrollmentStage.LOST_NOT_A_FIT,
  ];
  const leadNames = [
    ["Baker", "Emma", "Baker", "Oliver Baker", "Infant", "Daycare"],
    ["Harris", "Daniel", "Harris", "Amelia Harris", "Toddler", "Daycare"],
    ["Cooper", "Nina", "Cooper", "Henry Cooper", "3's", "Preschool"],
    ["Bell", "Rachel", "Bell", "Ella Bell", "Pre-K", "Preschool"],
    ["Foster", "Chris", "Foster", "Jack Foster", "3's", "Daycare"],
    ["Sullivan", "Paige", "Sullivan", "Liam Sullivan", "Afterschool", "Before & After School Care"],
    ["Reed", "Morgan", "Reed", "Aria Reed", "3's", "Preschool"],
    ["Kelly", "Tara", "Kelly", "Leo Kelly", "Toddler", "Daycare"],
    ["Watson", "Miles", "Watson", "Nora Watson", "Pre-K", "Preschool"],
    ["Price", "Dana", "Price", "Theo Price", "Infant", "Daycare"],
    ["Evans", "Jules", "Evans", "Ruby Evans", "3's", "Daycare"],
  ] as const;

  for (let index = 0; index < leadNames.length; index += 1) {
    const center = centers[index % centers.length];
    const [lastName, parentFirstName, parentLastName, childName, ageGroupInterest, programInterest] = leadNames[index];
    await upsertLead(center.id, {
      externalId: `demo-lead-${index + 1}`,
      familyName: `${lastName} Family`,
      parentFirstName,
      parentLastName,
      email: `${parentFirstName.toLowerCase()}.${lastName.toLowerCase()}.demo@example.com`,
      phone: `(555) 019-${String(index).padStart(4, "0")}`,
      childName,
      ageGroupInterest,
      programInterest,
      stage: leadStages[index % leadStages.length],
      score: 62 + index * 3,
      desiredStartDate: dateAt(21 + index * 4),
    });
  }

  const demoFteAgeGroupCounts = { infants: 8, toddlers: 12, twos: 0, preschool: 11, preK: 14, schoolAge: 12 };
  for (let centerIndex = 0; centerIndex < centers.length; centerIndex += 1) {
    await upsertFteReports(centers[centerIndex].id, centerIndex === 0 ? schoolUser.id : execUser.id, [43][centerIndex] ?? 43, demoFteAgeGroupCounts);
    const existingAnnouncement = await prisma.announcement.findFirst({
      where: { centerId: centers[centerIndex].id, title: "Demo Family Newsletter" },
    });
    const announcementData = {
      centerId: centers[centerIndex].id,
      title: "Demo Family Newsletter",
      body: "This week includes picture day reminders, classroom curriculum themes, and upcoming parent conferences.",
      audience: { demoWorkspace: true, classrooms: "all" },
      status: "scheduled",
      sendAt: dateAt(2, 8),
    };
    if (existingAnnouncement) await prisma.announcement.update({ where: { id: existingAnnouncement.id }, data: announcementData });
    else await prisma.announcement.create({ data: announcementData });
  }

  const firstFamily = await prisma.family.findFirst({
    where: { centerId: primaryCenter.id, sourceSystem: DEMO_SOURCE },
  });
  if (firstFamily) {
    const existingMessage = await prisma.message.findFirst({
      where: { familyId: firstFamily.id, subject: "Demo parent message" },
    });
    const messageData = {
      familyId: firstFamily.id,
      senderId: schoolUser.id,
      subject: "Demo parent message",
      body: "Thanks for the daily report. Could you send an extra reminder about picture day?",
      channel: "parent_portal",
      priority: "normal",
      sentiment: "positive",
      readAt: null,
      createdAt: dateAt(0, 9, 12),
    };
    if (existingMessage) await prisma.message.update({ where: { id: existingMessage.id }, data: messageData });
    else await prisma.message.create({ data: messageData });
  }

  for (const campaignName of ["New inquiry nurture", "Tour reminder sequence", "Parent newsletter", "Review request"]) {
    const existing = await prisma.campaign.findFirst({ where: { brandId: brand.id, name: campaignName } });
    const data = {
      brandId: brand.id,
      name: campaignName,
      type: campaignName.includes("newsletter") ? "newsletter" : "enrollment",
      audience: { demoWorkspace: true, centers: centers.map((center) => center.crmLocationId) },
      status: "active",
      metrics: { sent: 124, opened: 89, clicked: 31, replies: 12 },
    };
    if (existing) await prisma.campaign.update({ where: { id: existing.id }, data });
    else await prisma.campaign.create({ data });
  }

  const automation = await prisma.automation.findFirst({ where: { brandId: brand.id, name: "Demo missing document follow-up" } });
  const automationData = {
    brandId: brand.id,
    name: "Demo missing document follow-up",
    trigger: "Missing document",
    condition: { demoWorkspace: true, documentStatus: "requested" },
    action: { sendEmail: true, createTask: true, aiSummary: true },
    delay: "24 hours",
    status: "active",
  };
  const savedAutomation = automation
    ? await prisma.automation.update({ where: { id: automation.id }, data: automationData })
    : await prisma.automation.create({ data: automationData });
  await prisma.automationRun.deleteMany({ where: { automationId: savedAutomation.id } });
  await prisma.automationRun.create({
    data: {
      automationId: savedAutomation.id,
      status: "completed",
      logs: { demoWorkspace: true, result: "Created director task and parent reminder draft." },
    },
  });

  await prisma.notification.deleteMany({
    where: { userId: { in: [schoolUser.id, execUser.id, demoTeacherUser.id] }, title: { startsWith: "Demo" } },
  });
  await prisma.notification.createMany({
    data: [
      {
        userId: schoolUser.id,
        title: "Demo new inquiry",
        body: `Emma Baker asked about infant availability at ${DEMO_LOCATION_NAME}.`,
        type: "lead",
        priority: "high",
      },
      {
        userId: schoolUser.id,
        title: "Demo FTE due",
        body: "Weekly FTE report is ready to review and submit.",
        type: "fte",
        priority: "normal",
      },
      {
        userId: execUser.id,
        title: "Demo executive snapshot",
        body: `${DEMO_LOCATION_NAME} has current FTE data, active enrollment pipelines, and open invoices.`,
        type: "executive",
        priority: "normal",
      },
      {
        userId: demoTeacherUser.id,
        title: "Demo classroom update",
        body: "Pre-K daily reports, attendance, and parent photos are ready for review.",
        type: "teacher",
        priority: "normal",
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      centerId: primaryCenter.id,
      userId: execUser.id,
      action: "demo.seed.completed",
      resource: "Tenant",
      resourceId: tenant.id,
      metadata: {
        demoWorkspace: true,
        centers: centers.length,
        families: familyInputs.length,
        children: createdChildren.length,
        licensedCapacity: primaryCenter.licensedCapacity,
        leads: leadNames.length,
        schoolLogin: "demoschool",
        schoolEmail: demoAccountEmails.school,
        teacherLogin: "demoteacher",
        teacherEmail: demoAccountEmails.teacher,
        executiveLogin: "demoexec",
      },
    },
  });

  console.log(JSON.stringify({
    ok: true,
    tenant: tenant.slug,
    brand: brand.name,
    centers: centers.map((center) => center.crmLocationId),
    schoolLogin: "demoschool",
    schoolEmail: demoAccountEmails.school,
    teacherLogin: "demoteacher",
    teacherEmail: demoAccountEmails.teacher,
    executiveLogin: "demoexec",
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
