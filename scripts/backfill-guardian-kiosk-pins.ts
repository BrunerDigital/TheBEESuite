import { prisma } from "../src/lib/prisma";
import { defaultGuardianPinUpdate } from "../src/lib/guardian-kiosk-pin";

const write = process.argv.includes("--write");
const centerIdArg = process.argv.find((arg) => arg.startsWith("--centerId="))?.split("=").slice(1).join("=");
const actorUserId = process.env.BACKFILL_ACTOR_USER_ID || "system-default-pin-backfill";

async function main() {
  const guardians = await prisma.guardian.findMany({
    where: {
      checkInPinHash: null,
      phone: { not: null },
      family: {
        centerId: centerIdArg || { not: null },
      },
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      family: { select: { id: true, name: true, centerId: true } },
    },
    orderBy: [{ family: { name: "asc" } }, { fullName: "asc" }],
  });
  const centerIds = Array.from(new Set(guardians.map((guardian) => guardian.family.centerId).filter((id): id is string => Boolean(id))));
  const centers = centerIds.length
    ? await prisma.center.findMany({
        where: { id: { in: centerIds } },
        select: { id: true, name: true, crmLocationId: true },
      })
    : [];
  const centerLabelById = new Map(centers.map((center) => [center.id, center.crmLocationId ?? center.name]));

  let eligible = 0;
  let updated = 0;
  const skipped: string[] = [];
  const byCenter = new Map<string, { center: string; eligible: number; updated: number }>();

  for (const guardian of guardians) {
    const update = defaultGuardianPinUpdate({
      guardianId: guardian.id,
      phone: guardian.phone,
      setById: actorUserId,
    });
    if (!update) {
      skipped.push(guardian.id);
      continue;
    }

    eligible += 1;
    const centerKey = guardian.family.centerId || "unassigned";
    const centerLabel = guardian.family.centerId ? centerLabelById.get(guardian.family.centerId) ?? guardian.family.centerId : "Unassigned";
    const current = byCenter.get(centerKey) ?? { center: centerLabel, eligible: 0, updated: 0 };
    current.eligible += 1;

    if (write) {
      await prisma.guardian.update({
        where: { id: guardian.id },
        data: update,
      });
      updated += 1;
      current.updated += 1;
    }

    byCenter.set(centerKey, current);
  }

  console.log(JSON.stringify({
    ok: true,
    mode: write ? "write" : "dry-run",
    centerId: centerIdArg || null,
    scanned: guardians.length,
    eligible,
    updated,
    skippedNoFourDigitPhone: skipped.length,
    centers: Array.from(byCenter.values()),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
