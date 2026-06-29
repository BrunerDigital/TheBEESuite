import type { Prisma } from "@prisma/client";

type BuildMessageVisibilityWhereInput = {
  userId: string;
  familyScopeWhere: Prisma.FamilyWhereInput;
  allCenters: boolean;
  teacherMessageScope: boolean;
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

  if (allCenters) {
    return {
      OR: [
        { familyId: { not: null } },
        nonStaffInternalThreadWhere,
        staffThreads,
      ],
    };
  }

  return {
    OR: [
      { family: { is: familyScopeWhere } },
      nonStaffInternalThreadWhere,
      staffThreads,
    ],
  };
}
