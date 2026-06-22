import { NextResponse } from "next/server";
import { canAccessAllCenters, canManageOperations, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values: unknown[]) {
  return values.map(csvCell).join(",");
}

async function GETHandler() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Compliance exports are not allowed for this role." }, { status: 403 });
  }

  const scopedCenterIds = user.centerIds.length ? { in: user.centerIds } : { in: ["__no_visible_centers__"] };
  const allCenters = canAccessAllCenters(user);
  const incidentWhere = allCenters
    ? {}
    : {
        OR: [
          { classroom: { is: { centerId: scopedCenterIds } } },
          { child: { family: { is: { centerId: scopedCenterIds } } } },
        ],
      };
  const childScopedWhere = allCenters ? {} : { child: { family: { is: { centerId: scopedCenterIds } } } };
  const staffScopedWhere = allCenters ? {} : { staff: { centerId: scopedCenterIds } };
  const centerScopedWhere = allCenters ? {} : { centerId: scopedCenterIds };

  const [incidents, medications, allergies, certifications, drillLogs, complianceTasks] = await Promise.all([
    prisma.incidentReport.findMany({
      where: incidentWhere,
      orderBy: { occurredAt: "desc" },
      take: 1000,
      include: {
        child: { select: { fullName: true, family: { select: { name: true, centerId: true } } } },
        classroom: { select: { name: true, center: { select: { name: true, crmLocationId: true } } } },
      },
    }),
    prisma.medicationLog.findMany({
      where: childScopedWhere,
      orderBy: { administeredAt: "desc" },
      take: 1000,
      include: {
        child: { select: { fullName: true, family: { select: { name: true, centerId: true } } } },
        administeredBy: { select: { name: true, email: true } },
      },
    }),
    prisma.allergy.findMany({
      where: childScopedWhere,
      orderBy: [{ severity: "desc" }, { allergen: "asc" }],
      take: 1000,
      include: { child: { select: { fullName: true, family: { select: { name: true, centerId: true } } } } },
    }),
    prisma.certification.findMany({
      where: staffScopedWhere,
      orderBy: { expiresAt: "asc" },
      take: 1000,
      include: { staff: { select: { user: { select: { name: true, email: true } }, center: { select: { name: true, crmLocationId: true } } } } },
    }),
    prisma.emergencyDrillLog.findMany({
      where: centerScopedWhere,
      orderBy: { conductedAt: "desc" },
      take: 1000,
      include: {
        center: { select: { name: true, crmLocationId: true } },
        createdBy: { select: { name: true, email: true } },
      },
    }),
    prisma.complianceTask.findMany({
      where: centerScopedWhere,
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: 1000,
      include: {
        center: { select: { name: true, crmLocationId: true } },
        assignedTo: { select: { name: true, email: true } },
      },
    }),
  ]);

  const rows = [
    csvRow(["recordType", "center", "person", "familyOrStaff", "eventAt", "status", "summary", "parentNotified", "parentAcknowledgedAt"]),
    ...incidents.map((incident) => csvRow([
      "incident",
      incident.classroom?.center.crmLocationId ?? incident.classroom?.center.name ?? incident.child.family.centerId,
      incident.child.fullName,
      incident.child.family.name,
      incident.occurredAt.toISOString(),
      incident.adminReviewStatus,
      `${incident.type}: ${incident.description} Action: ${incident.actionTaken}`,
      incident.parentNotified,
      incident.parentAcknowledgedAt?.toISOString() ?? "",
    ])),
    ...medications.map((log) => csvRow([
      "medication",
      log.child.family.centerId,
      log.child.fullName,
      log.child.family.name,
      log.administeredAt.toISOString(),
      log.status,
      `${log.medicationName} ${log.dosage}${log.route ? ` via ${log.route}` : ""}${log.notes ? ` Notes: ${log.notes}` : ""}`,
      log.parentNotified,
      "",
    ])),
    ...allergies.map((allergy) => csvRow([
      "allergy",
      allergy.child.family.centerId,
      allergy.child.fullName,
      allergy.child.family.name,
      "",
      allergy.severity,
      `${allergy.allergen}${allergy.actionPlan ? ` Action: ${allergy.actionPlan}` : ""}`,
      "",
      "",
    ])),
    ...certifications.map((certification) => csvRow([
      "staff_certification",
      certification.staff.center.crmLocationId ?? certification.staff.center.name,
      certification.staff.user.name,
      certification.staff.user.email,
      certification.expiresAt?.toISOString() ?? "",
      certification.status,
      certification.name,
      "",
      "",
    ])),
    ...drillLogs.map((log) => csvRow([
      "emergency_drill",
      log.center.crmLocationId ?? log.center.name,
      log.createdBy?.name ?? "",
      "",
      log.conductedAt.toISOString(),
      log.outcome,
      `${log.drillType}${log.durationMinutes ? ` · ${log.durationMinutes} minutes` : ""}${log.participants ? ` · Participants: ${log.participants}` : ""}${log.notes ? ` · Notes: ${log.notes}` : ""}${log.nextDueAt ? ` · Next due: ${log.nextDueAt.toISOString().slice(0, 10)}` : ""}`,
      "",
      "",
    ])),
    ...complianceTasks.map((task) => csvRow([
      "compliance_task",
      task.center.crmLocationId ?? task.center.name,
      task.assignedTo?.name ?? "",
      task.category,
      task.dueAt?.toISOString() ?? task.reminderAt?.toISOString() ?? "",
      task.status,
      `${task.priority}: ${task.title}${task.notes ? ` · ${task.notes}` : ""}${task.reminderAt ? ` · Reminder: ${task.reminderAt.toISOString().slice(0, 10)}` : ""}`,
      "",
      task.completedAt?.toISOString() ?? "",
    ])),
  ];

  return new NextResponse(rows.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bee-suite-compliance-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

export const GET = withApiLogging("GET", GETHandler);
