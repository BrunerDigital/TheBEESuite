import { Prisma } from "@prisma/client";

export function activeClassroomWhere(
  where: Prisma.ClassroomWhereInput = {},
): Prisma.ClassroomWhereInput {
  return {
    AND: [
      where,
      {
        OR: [
          { customFields: { equals: Prisma.DbNull } },
          { customFields: { path: ["archived"], equals: Prisma.AnyNull } },
          { customFields: { path: ["archived"], equals: false } },
        ],
      },
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
