import "./load-env";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function centerLabel(center: { name: string; crmLocationId: string | null }) {
  return center.crmLocationId ?? center.name;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const children = await prisma.child.findMany({
    where: {
      classroomId: { not: null },
      enrollmentStatus: { not: "enrolled" },
    },
    select: {
      id: true,
      enrollmentStatus: true,
      customFields: true,
      classroom: {
        select: {
          center: { select: { name: true, crmLocationId: true } },
        },
      },
    },
  });

  const byCenterAndStatus = children.reduce<Record<string, number>>((acc, child) => {
    const center = child.classroom?.center ? centerLabel(child.classroom.center) : "Unknown center";
    const key = `${center} | ${child.enrollmentStatus}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    matchingChildren: children.length,
    byCenterAndStatus,
  }, null, 2));

  if (!apply || !children.length) return;

  const normalizedAt = new Date().toISOString();
  let updated = 0;
  for (const child of children) {
    const fields = asRecord(child.customFields);
    await prisma.child.update({
      where: { id: child.id },
      data: {
        enrollmentStatus: "enrolled",
        customFields: {
          ...fields,
          sourceEnrollmentStatus: fields.sourceEnrollmentStatus ?? fields.enrollmentStatus ?? child.enrollmentStatus,
          enrollmentStatus: "enrolled",
          classroomEnrollmentNormalizedAt: normalizedAt,
          classroomEnrollmentNormalizationReason: "classroom_linked_child_marked_enrolled",
        } satisfies Prisma.InputJsonValue,
      },
    });
    updated += 1;
  }

  console.log(JSON.stringify({ updated, normalizedAt }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
