import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Actor = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
};

type RecordChangeInput = {
  actor: Actor;
  entity: string;
  mode: string;
  resourceId: string | null;
  centerId?: string | null;
};

const leadershipRoles = [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR] as const;

function recordLabel(entity: string) {
  const labels: Record<string, string> = {
    classroom: "Classroom",
    family: "Family",
    guardian: "Parent/guardian",
    child: "Child profile",
    authorizedPickup: "Authorized pickup",
    emergencyContact: "Emergency contact",
    document: "Document request",
    staff: "Teacher profile",
    staffAssignment: "Teacher assignment",
    staffSchedule: "Teacher schedule",
    staffTimeClock: "Staff time clock",
  };
  return labels[entity] ?? entity.replaceAll("_", " ");
}

function changedLabel(mode: string) {
  if (mode === "created") return "created";
  if (mode === "merged") return "merged";
  if (mode === "deleted") return "deleted";
  if (mode === "deactivated") return "deactivated";
  return "updated";
}

async function centerLeadershipUserIds(actor: Actor, centerId: string | null | undefined) {
  if (!centerId) return [];
  const users = await prisma.user.findMany({
    where: {
      tenantId: actor.tenantId,
      isActive: true,
      role: { in: [...leadershipRoles] },
      OR: [
        { staffProfile: { centerId } },
        { accessGrants: { some: { isActive: true, centerId } } },
      ],
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

async function relatedUserIds(input: RecordChangeInput) {
  if (!input.resourceId) return [];

  if (input.entity === "classroom") {
    const staff = await prisma.staffProfile.findMany({
      where: { classroomId: input.resourceId, user: { isActive: true } },
      select: { userId: true },
    });
    return staff.map((item) => item.userId);
  }

  if (input.entity === "family") {
    const family = await prisma.family.findUnique({
      where: { id: input.resourceId },
      select: { guardians: { select: { userId: true } } },
    });
    return family?.guardians.map((guardian) => guardian.userId).filter((id): id is string => Boolean(id)) ?? [];
  }

  if (input.entity === "guardian" || input.entity === "authorizedPickup" || input.entity === "emergencyContact" || input.entity === "document") {
    const family = input.entity === "guardian"
      ? await prisma.guardian.findUnique({
          where: { id: input.resourceId },
          select: { userId: true, family: { select: { guardians: { select: { userId: true } } } } },
        }).then((guardian) => ({
          directUserId: guardian?.userId ?? null,
          guardianUserIds: guardian?.family.guardians.map((item) => item.userId).filter((id): id is string => Boolean(id)) ?? [],
        }))
      : input.entity === "authorizedPickup"
        ? await prisma.authorizedPickup.findUnique({
            where: { id: input.resourceId },
            select: { family: { select: { guardians: { select: { userId: true } } } } },
          }).then((pickup) => ({
            directUserId: null,
            guardianUserIds: pickup?.family.guardians.map((item) => item.userId).filter((id): id is string => Boolean(id)) ?? [],
          }))
        : input.entity === "emergencyContact"
          ? await prisma.emergencyContact.findUnique({
              where: { id: input.resourceId },
              select: { family: { select: { guardians: { select: { userId: true } } } } },
            }).then((contact) => ({
              directUserId: null,
              guardianUserIds: contact?.family.guardians.map((item) => item.userId).filter((id): id is string => Boolean(id)) ?? [],
            }))
          : await prisma.document.findUnique({
              where: { id: input.resourceId },
              select: { family: { select: { guardians: { select: { userId: true } } } } },
            }).then((document) => ({
              directUserId: null,
              guardianUserIds: document?.family?.guardians.map((item) => item.userId).filter((id): id is string => Boolean(id)) ?? [],
            }));
    return [family.directUserId, ...family.guardianUserIds].filter((id): id is string => Boolean(id));
  }

  if (input.entity === "child") {
    const child = await prisma.child.findUnique({
      where: { id: input.resourceId },
      select: {
        family: { select: { guardians: { select: { userId: true } } } },
        classroom: { select: { staff: { where: { user: { isActive: true } }, select: { userId: true } } } },
      },
    });
    return [
      ...(child?.family.guardians.map((guardian) => guardian.userId).filter((id): id is string => Boolean(id)) ?? []),
      ...(child?.classroom?.staff.map((staff) => staff.userId) ?? []),
    ];
  }

  if (["staff", "staffAssignment", "staffSchedule", "staffTimeClock"].includes(input.entity)) {
    const staff = input.entity === "staffSchedule"
      ? await prisma.staffSchedule.findUnique({
          where: { id: input.resourceId },
          select: { staff: { select: { userId: true } } },
        }).then((schedule) => schedule?.staff ?? null)
      : await prisma.staffProfile.findUnique({
          where: { id: input.resourceId },
          select: { userId: true },
        });
    return staff?.userId ? [staff.userId] : [];
  }

  return [];
}

export async function notifyOperationsRecordChange(input: RecordChangeInput) {
  if (!input.resourceId) return 0;

  const [leadershipIds, directlyRelatedIds] = await Promise.all([
    centerLeadershipUserIds(input.actor, input.centerId),
    relatedUserIds(input),
  ]);
  const userIds = Array.from(new Set([...leadershipIds, ...directlyRelatedIds]))
    .filter((userId) => userId && userId !== input.actor.id);
  if (!userIds.length) return 0;

  const label = recordLabel(input.entity);
  const change = changedLabel(input.mode);
  const created = await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      title: `${label} ${change}`,
      body: `${label} was ${change} by ${input.actor.name || input.actor.email}. Open the related dashboard to review the latest saved details.`,
      type: "record_change",
      priority: "normal",
    })),
  });

  return created.count;
}
