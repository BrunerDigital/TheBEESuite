import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const preferredRoles: UserRole[] = [
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
];

function scoreRole(role: UserRole) {
  const index = preferredRoles.indexOf(role);
  return index === -1 ? preferredRoles.length : index;
}

async function main() {
  const centers = await prisma.center.findMany({
    where: {
      organization: { name: "Kid City USA" },
    },
    select: {
      id: true,
      name: true,
      email: true,
      staff: {
        select: {
          user: {
            select: {
              email: true,
              role: true,
              isActive: true,
            },
          },
        },
      },
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const center of centers) {
    const primary = center.staff
      .map((staff) => staff.user)
      .filter((user) => user.isActive && user.email.endsWith("@kidcityusa.com"))
      .sort((a, b) => {
        const roleDelta = scoreRole(a.role) - scoreRole(b.role);
        if (roleDelta !== 0) return roleDelta;
        return a.email.localeCompare(b.email);
      })[0];

    if (!primary) {
      skipped += 1;
      continue;
    }

    if (center.email !== primary.email) {
      await prisma.center.update({
        where: { id: center.id },
        data: { email: primary.email },
      });
      updated += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        centers: centers.length,
        updated,
        skipped,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
