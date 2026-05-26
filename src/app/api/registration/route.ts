import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus, EnrollmentStage, UserRole } from "@prisma/client";
import { sendEmail, uniqueEmails } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RegistrationPayload = {
  centerId: string;
  primaryGuardianName: string;
  primaryGuardianEmail: string;
  primaryGuardianPhone: string;
  primaryGuardianAddress: string;
  secondaryGuardianName: string;
  secondaryGuardianEmail: string;
  secondaryGuardianPhone: string;
  childFullName: string;
  childPreferredName: string;
  childDateOfBirth: string;
  program: string;
  schedule: string;
  desiredStartDate: string;
  allergies: string;
  medications: string;
  dietaryRestrictions: string;
  medicalNotes: string;
  emergencyContacts: string;
  authorizedPickups: string;
  custodyNotes: string;
  physicianInfo: string;
  insuranceInfo: string;
  photoVideoPermission: boolean;
  fieldTripPermission: boolean;
  policyAcknowledgment: boolean;
  signatureName: string;
  pageUrl: string;
};

const rateLimit = new Map<string, { count: number; resetAt: number }>();

const stageRank: Record<EnrollmentStage, number> = {
  NEW_INQUIRY: 1,
  CONTACTED: 2,
  TOUR_SCHEDULED: 3,
  TOUR_COMPLETED: 4,
  APPLICATION_SENT: 5,
  APPLICATION_STARTED: 6,
  APPLICATION_SUBMITTED: 7,
  DOCUMENTS_PENDING: 8,
  DEPOSIT_PENDING: 9,
  ENROLLED: 10,
  WAITLISTED: 10,
  LOST_NOT_A_FIT: 10,
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanBool(value: unknown) {
  return value === true;
}

function readPayload(body: Record<string, unknown>): RegistrationPayload {
  return {
    centerId: clean(body.centerId),
    primaryGuardianName: clean(body.primaryGuardianName),
    primaryGuardianEmail: clean(body.primaryGuardianEmail).toLowerCase(),
    primaryGuardianPhone: clean(body.primaryGuardianPhone),
    primaryGuardianAddress: clean(body.primaryGuardianAddress),
    secondaryGuardianName: clean(body.secondaryGuardianName),
    secondaryGuardianEmail: clean(body.secondaryGuardianEmail).toLowerCase(),
    secondaryGuardianPhone: clean(body.secondaryGuardianPhone),
    childFullName: clean(body.childFullName),
    childPreferredName: clean(body.childPreferredName),
    childDateOfBirth: clean(body.childDateOfBirth),
    program: clean(body.program),
    schedule: clean(body.schedule),
    desiredStartDate: clean(body.desiredStartDate),
    allergies: clean(body.allergies),
    medications: clean(body.medications),
    dietaryRestrictions: clean(body.dietaryRestrictions),
    medicalNotes: clean(body.medicalNotes),
    emergencyContacts: clean(body.emergencyContacts),
    authorizedPickups: clean(body.authorizedPickups),
    custodyNotes: clean(body.custodyNotes),
    physicianInfo: clean(body.physicianInfo),
    insuranceInfo: clean(body.insuranceInfo),
    photoVideoPermission: cleanBool(body.photoVideoPermission),
    fieldTripPermission: cleanBool(body.fieldTripPermission),
    policyAcknowledgment: cleanBool(body.policyAcknowledgment),
    signatureName: clean(body.signatureName),
    pageUrl: clean(body.pageUrl),
  };
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validDate(value: string) {
  if (!value) return false;
  const timestamp = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(timestamp);
}

function toDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function splitName(fullName: string) {
  const [firstName, ...rest] = fullName.split(/\s+/);
  return [firstName || fullName, rest.join(" ") || null] as const;
}

function requestKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const current = rateLimit.get(key);
  if (!current || current.resetAt < now) {
    rateLimit.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

function validationErrors(payload: RegistrationPayload) {
  const errors: Record<string, string> = {};
  if (!payload.centerId) errors.centerId = "School is required.";
  if (!payload.primaryGuardianName) errors.primaryGuardianName = "Primary guardian name is required.";
  if (!validEmail(payload.primaryGuardianEmail)) errors.primaryGuardianEmail = "A valid guardian email is required.";
  if (!payload.primaryGuardianPhone) errors.primaryGuardianPhone = "Guardian phone is required.";
  if (!payload.childFullName) errors.childFullName = "Child full name is required.";
  if (!validDate(payload.childDateOfBirth)) errors.childDateOfBirth = "Child date of birth is required.";
  if (!payload.program) errors.program = "Program is required.";
  if (!payload.schedule) errors.schedule = "Schedule is required.";
  if (!validDate(payload.desiredStartDate)) errors.desiredStartDate = "Desired start date is required.";
  if (!payload.emergencyContacts) errors.emergencyContacts = "At least one emergency contact is required.";
  if (!payload.authorizedPickups) errors.authorizedPickups = "At least one authorized pickup is required.";
  if (!payload.policyAcknowledgment) errors.policyAcknowledgment = "Policy acknowledgment is required.";
  if (!payload.signatureName) errors.signatureName = "Typed signature is required.";
  return errors;
}

function existingCustomFields(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function registrationSchema() {
  return {
    version: 1,
    source: "public_online_registration",
    sections: [
      "school_program",
      "parent_guardian",
      "child_information",
      "medical_safety",
      "emergency_contacts",
      "permissions",
      "typed_signature",
    ],
  };
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export async function POST(request: NextRequest) {
  if (!checkRateLimit(requestKey(request))) {
    return NextResponse.json({ ok: false, error: "Too many registration attempts. Please try again shortly." }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid registration payload." }, { status: 400 });
    }

    const payload = readPayload(body);
    const errors = validationErrors(payload);
    if (Object.keys(errors).length) {
      return NextResponse.json({ ok: false, error: "Required registration fields are missing.", errors }, { status: 400 });
    }

    const center = await prisma.center.findFirst({
      where: { id: payload.centerId, status: { not: "closed" } },
      select: {
        id: true,
        name: true,
        crmLocationId: true,
        email: true,
        city: true,
        state: true,
        organization: { select: { tenantId: true } },
      },
    });
    if (!center) {
      return NextResponse.json({ ok: false, error: "Selected school is not available for online registration." }, { status: 404 });
    }

    const [parentFirstName, parentLastName] = splitName(payload.primaryGuardianName);
    const existingLead = await prisma.lead.findFirst({
      where: {
        centerId: center.id,
        email: payload.primaryGuardianEmail,
        status: { not: "lost" },
      },
      orderBy: { updatedAt: "desc" },
    });

    const nextStage = existingLead && stageRank[existingLead.stage] > stageRank.APPLICATION_SUBMITTED
      ? existingLead.stage
      : EnrollmentStage.APPLICATION_SUBMITTED;

    const leadData = {
      familyName: payload.primaryGuardianName,
      parentFirstName,
      parentLastName,
      email: payload.primaryGuardianEmail,
      phone: payload.primaryGuardianPhone,
      childName: payload.childFullName,
      leadSource: "Online Registration",
      ageGroupInterest: payload.program,
      desiredStartDate: toDate(payload.desiredStartDate),
      programInterest: payload.program,
      stage: nextStage,
      score: 90,
      status: "open",
      customFields: {
        ...existingCustomFields(existingLead?.customFields),
        intakeType: "online_registration",
        registrationStatus: "submitted",
        schoolName: center.name,
        crmLocationId: center.crmLocationId,
        childPreferredName: payload.childPreferredName,
        childDateOfBirth: payload.childDateOfBirth,
        schedule: payload.schedule,
        primaryGuardianAddress: payload.primaryGuardianAddress,
        secondaryGuardianName: payload.secondaryGuardianName,
        secondaryGuardianEmail: payload.secondaryGuardianEmail,
        secondaryGuardianPhone: payload.secondaryGuardianPhone,
        allergies: payload.allergies,
        medications: payload.medications,
        dietaryRestrictions: payload.dietaryRestrictions,
        medicalNotes: payload.medicalNotes,
        emergencyContacts: payload.emergencyContacts,
        authorizedPickups: payload.authorizedPickups,
        custodyNotes: payload.custodyNotes,
        physicianInfo: payload.physicianInfo,
        insuranceInfo: payload.insuranceInfo,
        photoVideoPermission: payload.photoVideoPermission,
        fieldTripPermission: payload.fieldTripPermission,
        pageUrl: payload.pageUrl,
        submittedAt: new Date().toISOString(),
      },
    };

    const lead = existingLead
      ? await prisma.lead.update({
          where: { id: existingLead.id },
          data: leadData,
          select: { id: true, stage: true },
        })
      : await prisma.lead.create({
          data: {
            centerId: center.id,
            externalId: `online-registration:${center.id}:${Date.now()}:${payload.primaryGuardianEmail}`,
            ...leadData,
          },
          select: { id: true, stage: true },
        });

    const form = await prisma.form.upsert({
      where: { id: "online-registration-packet" },
      update: { name: "Online Registration Packet", type: "online_registration", schema: registrationSchema(), status: "active" },
      create: { id: "online-registration-packet", name: "Online Registration Packet", type: "online_registration", schema: registrationSchema(), status: "active" },
    });

    const submission = await prisma.formSubmission.create({
      data: {
        formId: form.id,
        status: DocumentStatus.SUBMITTED,
        signaturePlaceholder: true,
        submittedAt: new Date(),
        data: {
          ...payload,
          centerName: center.name,
          crmLocationId: center.crmLocationId,
          city: center.city,
          state: center.state,
          leadId: lead.id,
        },
      },
      select: { id: true },
    });

    await Promise.all([
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          customFields: {
            ...leadData.customFields,
            registrationSubmissionId: submission.id,
          },
        },
      }),
      prisma.task.create({
        data: {
          leadId: lead.id,
          title: `Review online registration packet for ${payload.childFullName}`,
          status: "open",
          dueAt: addDays(1),
        },
      }),
      prisma.note.create({
        data: {
          leadId: lead.id,
          restricted: true,
          body: `Online registration submitted for ${payload.childFullName}. Emergency contacts, authorized pickups, medical, and custody details require director review before moving into the live family profile.`,
        },
      }),
    ]);

    const directors = await prisma.staffProfile.findMany({
      where: {
        centerId: center.id,
        user: {
          isActive: true,
          role: { in: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN] },
        },
      },
      select: { userId: true },
    });

    if (directors.length) {
      await prisma.notification.createMany({
        data: directors.map((director) => ({
          userId: director.userId,
          title: "Online registration submitted",
          body: `${payload.primaryGuardianName} submitted a packet for ${payload.childFullName}.`,
          type: "online_registration",
          priority: "high",
        })),
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: center.organization.tenantId,
        centerId: center.id,
        action: "registration.submitted",
        resource: "FormSubmission",
        resourceId: submission.id,
        metadata: {
          leadId: lead.id,
          stage: lead.stage,
          public: true,
        },
      },
    });

    const recipients = uniqueEmails([
      center.email ?? "",
      ...(process.env.INQUIRY_NOTIFICATION_EMAILS?.split(",") ?? []),
    ]);
    const email = await sendEmail({
      to: recipients,
      replyTo: payload.primaryGuardianEmail,
      subject: `New Online Registration - ${payload.program} - ${center.crmLocationId ?? center.name}`,
      text: [
        `School: ${center.name}`,
        `Location ID: ${center.crmLocationId ?? ""}`,
        `Parent: ${payload.primaryGuardianName}`,
        `Email: ${payload.primaryGuardianEmail}`,
        `Phone: ${payload.primaryGuardianPhone}`,
        `Child: ${payload.childFullName}`,
        `Program: ${payload.program}`,
        `Schedule: ${payload.schedule}`,
        `Desired start date: ${payload.desiredStartDate}`,
        `Bee Suite Lead ID: ${lead.id}`,
        `Registration Submission ID: ${submission.id}`,
      ].join("\n"),
    });

    return NextResponse.json(
      {
        ok: true,
        leadId: lead.id,
        submissionId: submission.id,
        integrations: { email },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Online registration failed", error);
    return NextResponse.json({ ok: false, error: "Registration could not be submitted. Please try again or contact the school." }, { status: 500 });
  }
}
