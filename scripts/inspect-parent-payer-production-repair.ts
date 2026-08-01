import "./load-env";
import { prisma } from "@/lib/prisma";

const TEST_SOURCE = "bee_suite_parent_invite_test";
const CURRENT = ["enrolled", "active", "current"];

async function main() {
  const centers = await prisma.center.findMany({
    where: { OR: [{ name: { contains: "Beach", mode: "insensitive" } }, { name: { contains: "Lees Summit", mode: "insensitive" } }] },
    select: { id: true, name: true },
  });
  const beachIds = centers.filter((center) => /beach/i.test(center.name)).map((center) => center.id);
  const leesIds = centers.filter((center) => /lees summit/i.test(center.name)).map((center) => center.id);
  const [beach, lees, enriquez, testUsers, testClassrooms] = await Promise.all([
    prisma.child.findMany({
      where: {
        family: { centerId: { in: beachIds } },
        OR: [
          { fullName: { contains: "Lila Eason", mode: "insensitive" } },
          { fullName: { contains: "Mateo Cruz Perez", mode: "insensitive" } },
        ],
      },
      select: {
        id: true, fullName: true, dateOfBirth: true, externalId: true, classroomId: true,
        enrollmentStatus: true, customFields: true,
        _count: { select: { medicalNotes: true, allergies: true, enrollments: true, attendance: true, checkLogs: true, dailyReports: true, incidents: true, documents: true, media: true, medicationLogs: true, locationTransitions: true } },
        liveLocation: { select: { id: true } },
        family: {
          select: {
            id: true, name: true, externalId: true, sourceSystem: true, billingEmail: true, customFields: true,
            guardians: { select: { id: true, fullName: true, email: true, phone: true, isBillingContact: true, externalId: true, sourceSystem: true } },
            _count: { select: { children: true, pickups: true, emergencyContacts: true, messages: true, documents: true, notesList: true, surveyResponses: true, dataDeletionRequests: true, refundRequests: true } },
            billingAccount: { select: { id: true, _count: { select: { invoices: true, payments: true, ledgerEntries: true } } } },
          },
        },
      },
      orderBy: [{ fullName: "asc" }, { createdAt: "asc" }],
    }),
    prisma.child.findMany({
      where: {
        enrollmentStatus: { in: CURRENT, mode: "insensitive" },
        family: { centerId: { in: leesIds } },
        OR: [
          { fullName: { contains: "Zariyah", mode: "insensitive" } },
          { fullName: { contains: "Dakota Jones", mode: "insensitive" } },
        ],
      },
      select: {
        id: true, fullName: true, dateOfBirth: true, externalId: true, customFields: true,
        family: { select: { id: true, name: true, guardians: { select: { id: true, fullName: true, email: true, phone: true, relation: true, externalId: true, isBillingContact: true } } } },
      },
    }),
    prisma.guardian.findMany({
      where: {
        OR: [
          { phone: { contains: "9402104404" } },
          { fullName: { contains: "Jeremi", mode: "insensitive" } },
        ],
      },
      select: { id: true, fullName: true, email: true, phone: true, relation: true, isBillingContact: true, externalId: true, sourceSystem: true, family: { select: { id: true, centerId: true, name: true, children: { select: { id: true, fullName: true, enrollmentStatus: true } } } } },
    }),
    prisma.user.findMany({
      where: { guardians: { some: { family: { sourceSystem: TEST_SOURCE } } } },
      select: {
        id: true, email: true, role: true, isActive: true,
        _count: { select: { guardians: true, accessGrants: true, deviceSessions: true, auditLogs: true, notifications: true, notificationPreferences: true, notes: true, messages: true, assignedMessages: true, movedChildLocations: true, childLocationTransitions: true, medicationLogs: true, uploadedMedia: true, procareImports: true, dataDeletionRequests: true, requestedRefunds: true, reviewedRefunds: true } },
        guardians: { select: { id: true, sourceSystem: true, family: { select: { id: true, sourceSystem: true } } } },
      },
      orderBy: { email: "asc" },
    }),
    prisma.classroom.findMany({
      where: { sourceSystem: TEST_SOURCE },
      select: { id: true, name: true, centerId: true, _count: { select: { children: true, staff: true, dailyReports: true, incidents: true, attendance: true, checkLogs: true, media: true, currentChildLocations: true, childLocationTransitionsFrom: true, childLocationTransitionsTo: true } } },
    }),
  ]);

  const relationshipIds = ["210978", "203578", "180526"];
  const relationshipNames = ["herrera, Marissa", "Cooper, Vantice", "Jones SR, Dakota"];
  const [guardiansByRelationship, childrenWithRelationshipEvidence] = await Promise.all([
    prisma.guardian.findMany({
      where: {
        OR: [
          { externalId: { in: relationshipIds } },
          ...relationshipNames.map((fullName) => ({ fullName: { equals: fullName, mode: "insensitive" as const } })),
        ],
      },
      select: { id: true, fullName: true, email: true, phone: true, relation: true, externalId: true, sourceSystem: true, isBillingContact: true, customFields: true, family: { select: { id: true, centerId: true, name: true, externalId: true, sourceSystem: true, billingEmail: true, children: { select: { id: true, fullName: true, enrollmentStatus: true, externalId: true } }, billingAccount: { select: { id: true, _count: { select: { invoices: true, payments: true, ledgerEntries: true } } } }, _count: { select: { guardians: true, children: true, pickups: true, emergencyContacts: true, messages: true, documents: true, notesList: true, surveyResponses: true, dataDeletionRequests: true, refundRequests: true } } } } },
    }),
    prisma.child.findMany({
      where: { customFields: { path: ["procareRelationshipRows"], array_contains: relationshipIds.map((id) => ({ "relationship person id": id })) } },
      select: { id: true, fullName: true, customFields: true, family: { select: { id: true, centerId: true, name: true } } },
    }).catch(() => []),
  ]);

  const testDeliveries = await prisma.integrationDelivery.findMany({
    where: { payload: { path: ["test"], equals: true } },
    select: { id: true, recipient: true, provider: true, providerMessageId: true, purpose: true, payload: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(JSON.stringify({ centers, beach, lees, enriquez, guardiansByRelationship, childrenWithRelationshipEvidence, testUsers, testClassrooms, testDeliveries }, null, 2));
}

main().finally(() => prisma.$disconnect());
