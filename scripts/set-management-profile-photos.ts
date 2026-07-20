import "./load-env";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PROFILE_PHOTO_URL,
  MANAGEMENT_PROFILE_PHOTO_ROLES,
  mergeProfilePhotoCustomFields,
} from "@/lib/profile-photo";

const applyChanges = process.argv.includes("--apply");
const managementRoles = MANAGEMENT_PROFILE_PHOTO_ROLES.map((role) => UserRole[role]);

async function main() {
  const users = await prisma.user.findMany({
    where: { role: { in: managementRoles } },
    orderBy: [{ role: "asc" }, { email: "asc" }],
    select: { id: true, email: true, name: true, role: true, customFields: true },
  });

  console.log(`${applyChanges ? "Updating" : "Would update"} ${users.length} management profile photo(s).`);

  if (!applyChanges) {
    console.table(users.map(({ email, name, role }) => ({ email, name, role })));
    console.log("Run again with --apply to save these changes.");
    return;
  }

  const updatedAt = new Date().toISOString();
  await prisma.$transaction(
    users.map((user) =>
      prisma.user.update({
        where: { id: user.id },
        data: {
          customFields: mergeProfilePhotoCustomFields(user.customFields, {
            url: DEFAULT_PROFILE_PHOTO_URL,
            bucket: null,
            storageKey: null,
            contentType: "image/png",
            uploadedAt: updatedAt,
          }) as Prisma.InputJsonValue,
        },
      }),
    ),
  );

  const updatedCount = await prisma.user.count({
    where: {
      role: { in: managementRoles },
      customFields: { path: ["profilePhotoUrl"], equals: DEFAULT_PROFILE_PHOTO_URL },
    },
  });

  console.log(`Updated and verified ${updatedCount} management profile photo(s).`);
  if (updatedCount !== users.length) throw new Error(`Expected ${users.length} updated users, found ${updatedCount}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
