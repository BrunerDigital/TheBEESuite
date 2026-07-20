import type { Prisma } from "@prisma/client";

type BuildMessageVisibilityWhereInput = {
  userId: string;
  familyScopeWhere: Prisma.FamilyWhereInput;
  allCenters: boolean;
  teacherMessageScope: boolean;
  tenantId?: string;
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
}: BuildMessageVisibilityWhereInput): Prisma.MessageWhereInput {
  const staffThreads = directStaffThreadWhere(userId);

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

  const tenantInternalThreadWhere: Prisma.MessageWhereInput = tenantId
    ? {
        AND: [
          nonStaffInternalThreadWhere,
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
