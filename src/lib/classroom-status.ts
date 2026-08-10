import type { Prisma } from "@prisma/client";

export function activeClassroomWhere(
  where: Prisma.ClassroomWhereInput = {},
): Prisma.ClassroomWhereInput {
  return {
    AND: [
      where,
      { NOT: { customFields: { path: ["archived"], equals: true } } },
    ],
  };
}

export function classroomIsArchived(customFields: unknown) {
  return Boolean(
    customFields
      && typeof customFields === "object"
      && !Array.isArray(customFields)
      && (customFields as Record<string, unknown>).archived === true,
  );
}
