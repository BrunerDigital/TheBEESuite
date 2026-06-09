import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getLeadScopeWhere } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { readCenterLicensingConfiguration } from "@/lib/licensing-config";
import {
  buildRequiredDocumentChecklist,
  requiresChecklistAction,
} from "@/lib/required-document-checklist";
import {
  buildRecordsExportPackage,
  recordsPackageFilename,
  type RecordsExportSection,
} from "@/lib/records-export-package";
import { canAccessModule } from "@/lib/rbac";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

const sectionLimit = 2000;

function iso(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function dateOnly(value: Date | string | null | undefined) {
  return iso(value).slice(0, 10);
}

function yesNo(value: boolean | null | undefined) {
  return value ? "yes" : "no";
}

function centerLabel(center: { name: string; crmLocationId: string | null }) {
  return center.crmLocationId ?? center.name;
}

function documentFileState(document: { storageKey: string | null }) {
  if (!document.storageKey || document.storageKey === "upload_pending") return "pending_upload";
  if (document.storageKey === "internal_signature_pending" || document.storageKey === "signature_provider_pending") return "pending_signature";
  return "file_attached";
}

function safeJson(value: unknown) {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canAccessModule(user, "documents") && !canAccessModule(user, "compliance")) {
    return NextResponse.json({ ok: false, error: "Records package exports are not allowed for this role." }, { status: 403 });
  }

  const requestedCenterId = request.nextUrl.searchParams.get("centerId")?.trim() || "";
  const centerScopeWhere = getLeadScopeWhere(user);
  const centerWhere = requestedCenterId
    ? { AND: [centerScopeWhere, { id: requestedCenterId }, { status: { not: "closed" } }] }
    : { ...centerScopeWhere, status: { not: "closed" } };

  const centers = await prisma.center.findMany({
    where: centerWhere,
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      phone: true,
      email: true,
      licensedCapacity: true,
      timezone: true,
      customFields: true,
    },
  });

  if (requestedCenterId && !centers.length) {
    return NextResponse.json({ ok: false, error: "That school is not visible for this export." }, { status: 403 });
  }
  if (!centers.length) {
    return NextResponse.json({ ok: false, error: "No schools are visible for this export." }, { status: 404 });
  }

  const centerIds = centers.map((center) => center.id);
  const centerById = new Map(centers.map((center) => [center.id, center]));
  const centerLabelById = new Map(centers.map((center) => [center.id, centerLabel(center)]));
  const centerIdWhere = { in: centerIds };

  const [families, staff, incidents, medicationLogs, emergencyDrills, complianceTasks, attendanceRecords, checkLogs] = await Promise.all([
    prisma.family.findMany({
      where: { centerId: centerIdWhere },
      orderBy: [{ centerId: "asc" }, { name: "asc" }],
      take: sectionLimit,
      include: {
        guardians: { orderBy: { fullName: "asc" } },
        pickups: { orderBy: { fullName: "asc" } },
        emergencyContacts: { orderBy: { fullName: "asc" } },
        documents: { orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }] },
        children: {
          orderBy: { fullName: "asc" },
          include: {
            classroom: { select: { name: true, centerId: true } },
            allergies: { orderBy: [{ severity: "desc" }, { allergen: "asc" }] },
            medicalNotes: { orderBy: { createdAt: "desc" } },
            documents: { orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }] },
          },
        },
      },
    }),
    prisma.staffProfile.findMany({
      where: { centerId: centerIdWhere },
      orderBy: [{ centerId: "asc" }, { user: { name: "asc" } }],
      take: sectionLimit,
      include: {
        user: { select: { name: true, email: true, role: true, isActive: true } },
        center: { select: { name: true, crmLocationId: true, state: true, licensedCapacity: true, customFields: true } },
        classroom: { select: { name: true } },
        certifications: { orderBy: { expiresAt: "asc" } },
      },
    }),
    prisma.incidentReport.findMany({
      where: { child: { family: { centerId: centerIdWhere } } },
      orderBy: { occurredAt: "desc" },
      take: sectionLimit,
      include: {
        child: { select: { fullName: true, family: { select: { name: true, centerId: true } } } },
        classroom: { select: { name: true, centerId: true } },
      },
    }),
    prisma.medicationLog.findMany({
      where: { child: { family: { centerId: centerIdWhere } } },
      orderBy: { administeredAt: "desc" },
      take: sectionLimit,
      include: {
        child: { select: { fullName: true, family: { select: { name: true, centerId: true } } } },
        administeredBy: { select: { name: true, email: true } },
      },
    }),
    prisma.emergencyDrillLog.findMany({
      where: { centerId: centerIdWhere },
      orderBy: { conductedAt: "desc" },
      take: sectionLimit,
      include: { center: { select: { name: true, crmLocationId: true } }, createdBy: { select: { name: true, email: true } } },
    }),
    prisma.complianceTask.findMany({
      where: { centerId: centerIdWhere },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: sectionLimit,
      include: {
        center: { select: { name: true, crmLocationId: true } },
        assignedTo: { select: { name: true, email: true } },
        createdBy: { select: { name: true, email: true } },
      },
    }),
    prisma.attendanceRecord.findMany({
      where: {
        OR: [
          { child: { family: { centerId: centerIdWhere } } },
          { classroom: { centerId: centerIdWhere } },
        ],
      },
      orderBy: { date: "desc" },
      take: sectionLimit,
      include: {
        child: { select: { fullName: true, family: { select: { name: true, centerId: true } } } },
        classroom: { select: { name: true, centerId: true } },
      },
    }),
    prisma.checkInOutLog.findMany({
      where: {
        OR: [
          { centerId: centerIdWhere },
          { child: { family: { centerId: centerIdWhere } } },
          { classroom: { centerId: centerIdWhere } },
        ],
      },
      orderBy: { occurredAt: "desc" },
      take: sectionLimit,
      include: {
        child: { select: { fullName: true, family: { select: { name: true, centerId: true } } } },
        classroom: { select: { name: true, centerId: true } },
        guardian: { select: { fullName: true, relation: true } },
      },
    }),
  ]);

  const familyIds = families.map((family) => family.id);
  const formSubmissions = familyIds.length
    ? await prisma.formSubmission.findMany({
        where: { familyId: { in: familyIds } },
        orderBy: { submittedAt: "desc" },
        take: sectionLimit,
        include: { form: { select: { name: true, type: true } } },
      })
    : [];

  const checklistItems = buildRequiredDocumentChecklist({
    families: families.map((family) => ({
      id: family.id,
      name: family.name,
      center: family.centerId ? centerById.get(family.centerId) ?? null : null,
      documents: family.documents,
      children: family.children.map((child) => ({
        id: child.id,
        fullName: child.fullName,
        documents: child.documents,
      })),
    })),
    staff,
    now: new Date(),
  });

  const documentRows = families.flatMap((family) => [
    ...family.documents.map((document) => [
      centerLabelById.get(family.centerId ?? "") ?? "Unassigned",
      "family",
      family.name,
      "",
      document.name,
      document.type,
      document.status,
      dateOnly(document.expiresAt),
      yesNo(document.restricted),
      documentFileState(document),
      iso(document.createdAt),
    ]),
    ...family.children.flatMap((child) =>
      child.documents.map((document) => [
        centerLabelById.get(family.centerId ?? "") ?? "Unassigned",
        "child",
        child.fullName,
        family.name,
        document.name,
        document.type,
        document.status,
        dateOnly(document.expiresAt),
        yesNo(document.restricted),
        documentFileState(document),
        iso(document.createdAt),
      ]),
    ),
  ]);

  const healthSafetyRows = families.flatMap((family) =>
    family.children.flatMap((child) => [
      ...child.allergies.map((allergy) => [
        centerLabelById.get(family.centerId ?? "") ?? "Unassigned",
        child.fullName,
        family.name,
        "allergy",
        allergy.allergen,
        allergy.severity,
        allergy.actionPlan ?? "",
        "",
      ]),
      ...child.medicalNotes.map((note) => [
        centerLabelById.get(family.centerId ?? "") ?? "Unassigned",
        child.fullName,
        family.name,
        "medical_note",
        note.category,
        note.restricted ? "restricted" : "standard",
        note.note,
        iso(note.createdAt),
      ]),
    ]),
  );

  const sections: RecordsExportSection[] = [
    {
      id: "centers",
      title: "School licensing setup",
      description: "School identity and saved licensing configuration fields.",
      filename: "01-centers-licensing.csv",
      headers: ["center", "centerId", "locationId", "address", "city", "state", "postalCode", "phone", "email", "licensedCapacity", "timezone", "licensingAgency", "licenseNumber", "licenseType", "renewalDueDate", "inspectionDueDate", "licensingStatus", "missingFields"],
      rows: centers.map((center) => {
        const licensing = readCenterLicensingConfiguration(center.customFields, {
          centerState: center.state,
          licensedCapacity: center.licensedCapacity,
        });
        return [
          centerLabel(center),
          center.id,
          center.locationId ?? "",
          center.address ?? "",
          center.city ?? "",
          center.state ?? "",
          center.postalCode ?? "",
          center.phone ?? "",
          center.email ?? "",
          center.licensedCapacity,
          center.timezone,
          licensing.licensingAgency,
          licensing.licenseNumber,
          licensing.licenseType,
          licensing.renewalDueDate,
          licensing.inspectionDueDate,
          licensing.status,
          licensing.missingFields.join("; "),
        ];
      }),
    },
    {
      id: "families",
      title: "Families",
      description: "Family-level identity, contact, custody, and linked record counts.",
      filename: "02-families.csv",
      headers: ["center", "family", "address", "billingEmail", "guardians", "children", "authorizedPickups", "emergencyContacts", "documents", "custodyNotes", "sourceSystem", "externalId", "createdAt"],
      rows: families.map((family) => [
        centerLabelById.get(family.centerId ?? "") ?? "Unassigned",
        family.name,
        family.address ?? "",
        family.billingEmail ?? "",
        family.guardians.length,
        family.children.length,
        family.pickups.length,
        family.emergencyContacts.length,
        family.documents.length + family.children.reduce((count, child) => count + child.documents.length, 0),
        family.custodyNotes ? "restricted custody note present" : "",
        family.sourceSystem ?? "",
        family.externalId ?? "",
        iso(family.createdAt),
      ]),
    },
    {
      id: "guardians",
      title: "Guardians",
      description: "Guardian contact, relation, billing contact, and parent portal link status.",
      filename: "03-guardians.csv",
      headers: ["center", "family", "guardian", "relation", "email", "phone", "preferredCommunication", "billingContact", "portalLinked", "sourceSystem", "externalId"],
      rows: families.flatMap((family) =>
        family.guardians.map((guardian) => [
          centerLabelById.get(family.centerId ?? "") ?? "Unassigned",
          family.name,
          guardian.fullName,
          guardian.relation,
          guardian.email ?? "",
          guardian.phone ?? "",
          guardian.preferredCommunication ?? "",
          yesNo(guardian.isBillingContact),
          yesNo(Boolean(guardian.userId)),
          guardian.sourceSystem ?? "",
          guardian.externalId ?? "",
        ]),
      ),
    },
    {
      id: "children",
      title: "Children",
      description: "Child profile, classroom assignment, permissions, and enrollment status.",
      filename: "04-children.csv",
      headers: ["center", "family", "child", "preferredName", "dateOfBirth", "ageGroup", "classroom", "enrollmentStatus", "startDate", "photoVideoPermission", "fieldTripPermission", "sourceSystem", "externalId"],
      rows: families.flatMap((family) =>
        family.children.map((child) => [
          centerLabelById.get(family.centerId ?? "") ?? "Unassigned",
          family.name,
          child.fullName,
          child.preferredName ?? "",
          dateOnly(child.dateOfBirth),
          child.ageGroup,
          child.classroom?.name ?? "",
          child.enrollmentStatus,
          dateOnly(child.startDate),
          yesNo(child.photoVideoPermission),
          yesNo(child.fieldTripPermission),
          child.sourceSystem ?? "",
          child.externalId ?? "",
        ]),
      ),
    },
    {
      id: "authorized-pickups",
      title: "Authorized pickups",
      description: "Family-authorized pickup contacts and verification notes.",
      filename: "05-authorized-pickups.csv",
      headers: ["center", "family", "pickup", "relation", "phone", "verificationNotes", "sourceSystem", "externalId"],
      rows: families.flatMap((family) =>
        family.pickups.map((pickup) => [
          centerLabelById.get(family.centerId ?? "") ?? "Unassigned",
          family.name,
          pickup.fullName,
          pickup.relation ?? "",
          pickup.phone ?? "",
          pickup.verificationNotes ?? "",
          pickup.sourceSystem ?? "",
          pickup.externalId ?? "",
        ]),
      ),
    },
    {
      id: "emergency-contacts",
      title: "Emergency contacts",
      description: "Family emergency contact records.",
      filename: "06-emergency-contacts.csv",
      headers: ["center", "family", "contact", "relation", "phone", "sourceSystem", "externalId"],
      rows: families.flatMap((family) =>
        family.emergencyContacts.map((contact) => [
          centerLabelById.get(family.centerId ?? "") ?? "Unassigned",
          family.name,
          contact.fullName,
          contact.relation,
          contact.phone,
          contact.sourceSystem ?? "",
          contact.externalId ?? "",
        ]),
      ),
    },
    {
      id: "required-document-checklist",
      title: "Required document checklist",
      description: "Family, child, and staff requirement status for the visible schools.",
      filename: "07-required-document-checklist.csv",
      headers: ["center", "scope", "subject", "requirement", "status", "actionNeeded", "expiresAt", "recordId"],
      rows: checklistItems.map((item) => [
        item.centerLabel ?? "Unassigned",
        item.scope,
        item.subjectName,
        item.requirementLabel,
        item.status,
        yesNo(requiresChecklistAction(item.status)),
        item.expiresAt ?? "",
        item.recordId ?? "",
      ]),
    },
    {
      id: "documents",
      title: "Document records",
      description: "Document request/review/expiration metadata. Raw storage keys and file bytes are not included.",
      filename: "08-documents.csv",
      headers: ["center", "ownerType", "owner", "family", "document", "type", "status", "expiresAt", "restricted", "fileState", "createdAt"],
      rows: documentRows,
    },
    {
      id: "staff",
      title: "Staff profiles",
      description: "Staff profile and classroom assignment records.",
      filename: "09-staff.csv",
      headers: ["center", "staff", "email", "role", "active", "title", "phone", "classroom", "backgroundCheckStatus", "sourceSystem", "externalId"],
      rows: staff.map((member) => [
        centerLabelById.get(member.centerId) ?? centerLabel(member.center),
        member.user.name,
        member.user.email,
        member.user.role,
        yesNo(member.user.isActive),
        member.title,
        member.phone ?? "",
        member.classroom?.name ?? "",
        member.backgroundCheckStatus ?? "",
        member.sourceSystem ?? "",
        member.externalId ?? "",
      ]),
    },
    {
      id: "staff-certifications",
      title: "Staff certifications",
      description: "Staff credential, certification, and training status records.",
      filename: "10-staff-certifications.csv",
      headers: ["center", "staff", "email", "certification", "status", "expiresAt"],
      rows: staff.flatMap((member) =>
        member.certifications.map((certification) => [
          centerLabelById.get(member.centerId) ?? centerLabel(member.center),
          member.user.name,
          member.user.email,
          certification.name,
          certification.status,
          dateOnly(certification.expiresAt),
        ]),
      ),
    },
    {
      id: "health-safety",
      title: "Child health and safety",
      description: "Allergy and medical note records.",
      filename: "11-child-health-safety.csv",
      headers: ["center", "child", "family", "recordType", "categoryOrAllergen", "severityOrVisibility", "detail", "createdAt"],
      rows: healthSafetyRows,
    },
    {
      id: "incidents",
      title: "Incidents",
      description: "Incident reports with admin review and parent acknowledgement status.",
      filename: "12-incidents.csv",
      headers: ["center", "child", "family", "classroom", "staffMember", "occurredAt", "type", "description", "actionTaken", "parentNotified", "parentAcknowledgedAt", "adminReviewStatus"],
      rows: incidents.map((incident) => [
        centerLabelById.get(incident.child.family.centerId ?? "") ?? "Unassigned",
        incident.child.fullName,
        incident.child.family.name,
        incident.classroom?.name ?? "",
        incident.staffMember,
        iso(incident.occurredAt),
        incident.type,
        incident.description,
        incident.actionTaken,
        yesNo(incident.parentNotified),
        iso(incident.parentAcknowledgedAt),
        incident.adminReviewStatus,
      ]),
    },
    {
      id: "medication-logs",
      title: "Medication logs",
      description: "Medication administration records.",
      filename: "13-medication-logs.csv",
      headers: ["center", "child", "family", "medication", "dosage", "route", "administeredAt", "administeredBy", "status", "parentNotified", "notes"],
      rows: medicationLogs.map((log) => [
        centerLabelById.get(log.child.family.centerId ?? "") ?? "Unassigned",
        log.child.fullName,
        log.child.family.name,
        log.medicationName,
        log.dosage,
        log.route ?? "",
        iso(log.administeredAt),
        log.administeredBy?.name ?? "",
        log.status,
        yesNo(log.parentNotified),
        log.notes ?? "",
      ]),
    },
    {
      id: "emergency-drills",
      title: "Emergency drills",
      description: "Emergency preparedness and drill log records.",
      filename: "14-emergency-drills.csv",
      headers: ["center", "drillType", "conductedAt", "durationMinutes", "participants", "outcome", "nextDueAt", "createdBy", "notes"],
      rows: emergencyDrills.map((drill) => [
        centerLabel(drill.center),
        drill.drillType,
        iso(drill.conductedAt),
        drill.durationMinutes ?? "",
        drill.participants ?? "",
        drill.outcome,
        iso(drill.nextDueAt),
        drill.createdBy?.name ?? "",
        drill.notes ?? "",
      ]),
    },
    {
      id: "compliance-tasks",
      title: "Compliance tasks",
      description: "Assigned compliance tasks and reminders.",
      filename: "15-compliance-tasks.csv",
      headers: ["center", "title", "category", "priority", "status", "dueAt", "reminderAt", "assignedTo", "createdBy", "relatedResourceType", "relatedResourceId", "completedAt", "notes"],
      rows: complianceTasks.map((task) => [
        centerLabel(task.center),
        task.title,
        task.category,
        task.priority,
        task.status,
        iso(task.dueAt),
        iso(task.reminderAt),
        task.assignedTo?.name ?? "",
        task.createdBy?.name ?? "",
        task.relatedResourceType ?? "",
        task.relatedResourceId ?? "",
        iso(task.completedAt),
        task.notes ?? "",
      ]),
    },
    {
      id: "attendance",
      title: "Attendance records",
      description: "Child attendance status records.",
      filename: "16-attendance.csv",
      headers: ["center", "child", "family", "classroom", "date", "status", "absenceReason", "sourceSystem", "externalId", "metadata"],
      rows: attendanceRecords.map((record) => [
        centerLabelById.get(record.child?.family.centerId ?? record.classroom?.centerId ?? "") ?? "Unassigned",
        record.child?.fullName ?? "",
        record.child?.family.name ?? "",
        record.classroom?.name ?? "",
        iso(record.date),
        record.status,
        record.absenceReason ?? "",
        record.sourceSystem ?? "",
        record.externalId ?? "",
        safeJson(record.metadata),
      ]),
    },
    {
      id: "check-in-out",
      title: "Check-in/out logs",
      description: "Kiosk check-in and check-out verification records.",
      filename: "17-check-in-out.csv",
      headers: ["center", "child", "family", "classroom", "guardian", "type", "occurredAt", "pickupName", "signatureCaptured", "verificationStatus", "pinVerified", "notes", "sourceSystem", "externalId"],
      rows: checkLogs.map((log) => [
        centerLabelById.get(log.centerId ?? log.child.family.centerId ?? log.classroom?.centerId ?? "") ?? "Unassigned",
        log.child.fullName,
        log.child.family.name,
        log.classroom?.name ?? "",
        log.guardian?.fullName ?? "",
        log.type,
        iso(log.occurredAt),
        log.pickupName ?? "",
        yesNo(log.signaturePlaceholder),
        log.verificationStatus ?? "",
        yesNo(log.pinVerified),
        log.notes ?? "",
        log.sourceSystem ?? "",
        log.externalId ?? "",
      ]),
    },
    {
      id: "form-submissions",
      title: "Form submissions",
      description: "Registration, document, and e-signature form submission records.",
      filename: "18-form-submissions.csv",
      headers: ["center", "family", "form", "formType", "status", "signaturePlaceholder", "submittedAt", "data"],
      rows: formSubmissions.map((submission) => {
        const family = families.find((candidate) => candidate.id === submission.familyId);
        return [
          centerLabelById.get(family?.centerId ?? "") ?? "Unassigned",
          family?.name ?? submission.familyId ?? "",
          submission.form.name,
          submission.form.type,
          submission.status,
          yesNo(submission.signaturePlaceholder),
          iso(submission.submittedAt),
          safeJson(submission.data),
        ];
      }),
    },
  ];

  const generatedAt = new Date().toISOString();
  const recordsPackage = buildRecordsExportPackage({
    generatedAt,
    generatedBy: {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    centers: centers.map((center) => ({
      id: center.id,
      label: centerLabel(center),
      state: center.state,
    })),
    sections,
  });

  await writeAuditLog(user, {
    centerId: centerIds.length === 1 ? centerIds[0] : null,
    action: "documents.records_package_exported",
    resource: "RecordsExportPackage",
    metadata: {
      centerCount: centerIds.length,
      centerIds: centerIds.slice(0, 100),
      fileCount: recordsPackage.totals.files,
      recordCount: recordsPackage.totals.records,
      requestedCenterId: requestedCenterId || null,
    },
  });

  return new NextResponse(JSON.stringify(recordsPackage, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${recordsPackageFilename(new Date(generatedAt))}"`,
    },
  });
}

export const GET = withApiLogging("GET", GETHandler);
