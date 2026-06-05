import "./load-env";
import { UserRole } from "@prisma/client";
import { isActivePublicSchoolCandidate } from "@/lib/active-school-locations";
import {
  DIRECTOR_NOTIFICATION_ROLES,
  resolveDirectorNotificationAuditRow,
  summarizeDirectorNotificationAudit,
} from "@/lib/director-notification-audit";
import { prisma } from "@/lib/prisma";

const directorRoles = DIRECTOR_NOTIFICATION_ROLES.map((role) => UserRole[role]);

async function main() {
  const includeRows = process.argv.includes("--rows");
  const allowMissing = process.argv.includes("--allow-missing");

  const centers = await prisma.center.findMany({
    where: {
      status: "active",
      crmLocationId: {
        not: null,
      },
    },
    orderBy: {
      crmLocationId: "asc",
    },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      email: true,
      status: true,
      accessGrants: {
        where: {
          isActive: true,
          role: { in: directorRoles },
          user: {
            isActive: true,
            email: { endsWith: "@kidcityusa.com" },
          },
        },
        orderBy: { createdAt: "asc" },
        select: {
          isActive: true,
          role: true,
          user: {
            select: {
              email: true,
              isActive: true,
            },
          },
        },
      },
      staff: {
        where: {
          user: {
            isActive: true,
            role: { in: directorRoles },
            email: { endsWith: "@kidcityusa.com" },
          },
        },
        orderBy: { id: "asc" },
        select: {
          user: {
            select: {
              email: true,
              isActive: true,
              role: true,
            },
          },
        },
      },
    },
  });

  const rows = centers
    .filter(isActivePublicSchoolCandidate)
    .map((center) =>
      resolveDirectorNotificationAuditRow({
        ...center,
        userAccessGrants: center.accessGrants,
      }),
    );
  const summary = summarizeDirectorNotificationAudit(rows);

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        summary,
        rows: includeRows ? rows : undefined,
      },
      null,
      2,
    ),
  );

  if (summary.missing > 0 && !allowMissing) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
