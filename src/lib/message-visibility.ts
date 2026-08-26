import type { Prisma } from "@prisma/client";

type BuildMessageVisibilityWhereInput = {
  userId: string;
  familyScopeWhere: Prisma.FamilyWhereInput;
  allCenters: boolean;
  teacherMessageScope: boolean;
  tenantId?: string;
  nonFamilyCenterIds?: readonly string[];
};

function directStaffThreadWhere(userId: string): Prisma.MessageWhereInput {
  return {
    familyId: null,
    threadKey: { startsWith: "staff:" },
    OR: [{ senderId: userId }, { assignedToId: userId }],
  };
}

const nonStaffInternalThreadWhere: Prisma.MessageWhereInput = {
  familyId: null,
  OR: [
    { threadKey: null },
    { NOT: { threadKey: { startsWith: "staff:" } } },
  ],
};

export function buildVisibleMessageWhere({
  userId,
  familyScopeWhere,
  allCenters,
  teacherMessageScope,
  tenantId,
  nonFamilyCenterIds,
}: BuildMessageVisibilityWhereInput): Prisma.MessageWhereInput {
  const directStaffThreads = directStaffThreadWhere(userId);
  const staffThreads: Prisma.MessageWhereInput = nonFamilyCenterIds
    ? {
        AND: [
          directStaffThreads,
          {
            OR: [
              { sender: { is: { role: "TEACHER", staffProfile: { is: { centerId: { in: [...nonFamilyCenterIds] } } } } } },
              { assignedTo: { is: { role: "TEACHER", staffProfile: { is: { centerId: { in: [...nonFamilyCenterIds] } } } } } },
            ],
          },
        ],
      }
    : directStaffThreads;

  if (teacherMessageScope) {
    return {
      OR: [
        { family: { is: familyScopeWhere } },
        staffThreads,
      ],
    };
  }

  if (allCenters && !tenantId) {
    return {
      OR: [
        { familyId: { not: null } },
        nonStaffInternalThreadWhere,
        staffThreads,
      ],
    };
  }

  const scopedInternalThreadWhere: Prisma.MessageWhereInput = nonFamilyCenterIds
    ? {
        familyId: null,
        threadKey: { in: nonFamilyCenterIds.map((centerId) => `internal:${centerId}`) },
      }
    : nonStaffInternalThreadWhere;
  const tenantInternalThreadWhere: Prisma.MessageWhereInput = tenantId
    ? {
        AND: [
          scopedInternalThreadWhere,
          { OR: [{ sender: { is: { tenantId } } }, { assignedTo: { is: { tenantId } } }] },
        ],
      }
    : nonStaffInternalThreadWhere;

  return {
    OR: [
      { family: { is: familyScopeWhere } },
      tenantInternalThreadWhere,
      staffThreads,
    ],
  };
}
