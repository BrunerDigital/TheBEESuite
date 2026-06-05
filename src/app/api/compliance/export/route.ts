import { NextResponse } from "next/server";
import { canAccessAllCenters, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values: unknown[]) {
  return values.map(csvCell).join(",");
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
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

  const [incidents, medications, allergies, certifications] = await Promise.all([
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
  ];

  return new NextResponse(rows.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bee-suite-compliance-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
