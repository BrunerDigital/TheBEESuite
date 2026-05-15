import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

type PublicLocation = {
  crmLocationId: string;
  locationId: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
};

type PublicLocationFile = {
  locations: PublicLocation[];
};

const prisma = new PrismaClient();

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function getOrganizationId() {
  const configured = clean(process.env.KIDCITY_ORGANIZATION_ID);
  if (configured) return configured;

  const kidCity = await prisma.organization.findFirst({
    where: { name: { contains: "Kid City" } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (kidCity) return kidCity.id;

  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!organization) throw new Error("No organization exists. Import or seed an organization before syncing open schools.");
  return organization.id;
}

async function main() {
  const inputPath = process.env.KIDCITY_OPEN_SCHOOLS_FILE || join(process.cwd(), "public", "kidcity-locations.json");
  const organizationId = await getOrganizationId();
  const file = JSON.parse(readFileSync(inputPath, "utf8")) as PublicLocationFile;
  const locations = file.locations.filter((location) => clean(location.crmLocationId) && clean(location.locationId));

  let created = 0;
  let updated = 0;

  for (const location of locations) {
    const matchers: Prisma.CenterWhereInput[] = [
      { crmLocationId: location.crmLocationId },
      { locationId: location.locationId },
      { name: location.name },
    ];
    if (location.address) matchers.push({ address: location.address });

    const existing = await prisma.center.findFirst({
      where: {
        OR: matchers,
      },
      select: { id: true, customFields: true },
    });

    const commonData = {
      name: location.name,
      crmLocationId: location.crmLocationId,
      locationId: location.locationId,
      address: clean(location.address) || null,
      city: clean(location.city) || null,
      state: clean(location.state) || null,
      postalCode: clean(location.postalCode) || null,
      phone: clean(location.phone) || null,
      status: "active",
      sourceSystem: "kidcity_open_schools",
      customFields: {
        ...(existing?.customFields && typeof existing.customFields === "object" && !Array.isArray(existing.customFields)
          ? existing.customFields
          : {}),
        openSchoolsSync: true,
        openSchoolsSyncedAt: new Date().toISOString(),
      },
    };

    if (existing) {
      await prisma.center.update({
        where: { id: existing.id },
        data: commonData,
      });
      updated += 1;
    } else {
      await prisma.center.create({
        data: {
          organizationId,
          licensedCapacity: 0,
          ...commonData,
        },
      });
      created += 1;
    }
  }

  console.log(JSON.stringify({ inputPath, locations: locations.length, created, updated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
