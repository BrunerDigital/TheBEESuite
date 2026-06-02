import "./load-env";
import { EnrollmentStage, Prisma, UserRole } from "@prisma/client";
import { readFileSync } from "node:fs";
import { KID_CITY_USA_BRANDING } from "@/lib/brand-assets";
import { prisma } from "@/lib/prisma";

type NormalizedLocation = {
  crmLocationId: string;
  locationId: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
  licensedCapacity?: number;
  customFields?: Prisma.InputJsonValue;
};

type NormalizedUser = {
  email: string;
  name: string;
  role: keyof typeof UserRole;
  crmLocationId?: string;
  legacyRole?: string;
  isActive?: boolean;
};

type NormalizedLead = {
  externalId?: string;
  crmLocationId: string;
  familyName: string;
  parentFirstName?: string;
  parentLastName?: string;
  email?: string;
  phone?: string;
  leadSource?: string;
  status?: string;
  stage: keyof typeof EnrollmentStage;
  createdAt?: string | null;
  notes?: string;
  rawPipelineStage?: string;
};

type NormalizedExport = {
  locations: NormalizedLocation[];
  users: NormalizedUser[];
  leads: NormalizedLead[];
};

const inputPath = process.env.KIDCITY_IMPORT_FILE ?? "tmp/kidcity-crm-normalized.json";
const leadLimit = process.env.KIDCITY_IMPORT_LEADS_LIMIT
  ? Number(process.env.KIDCITY_IMPORT_LEADS_LIMIT)
  : undefined;

function loadExport(): NormalizedExport {
  return JSON.parse(readFileSync(inputPath, "utf8")) as NormalizedExport;
}

function toDate(value?: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function scoreImportedLead(lead: NormalizedLead) {
  let score = 45;
  if (lead.email) score += 15;
  if (lead.phone) score += 15;
  if (lead.stage !== "NEW_INQUIRY") score += 10;
  if (lead.crmLocationId && lead.crmLocationId !== "UNASSIGNED") score += 10;
  return Math.min(score, 95);
}

async function ensureBrandAsset(input: {
  tenantId: string;
  brandId: string;
  assetType: string;
  url: string;
  altText: string;
}) {
  const existing = await prisma.brandAsset.findFirst({
    where: {
      tenantId: input.tenantId,
      brandId: input.brandId,
      assetType: input.assetType,
    },
    select: { id: true },
  });
  const data = {
    url: input.url,
    altText: input.altText,
    metadata: { source: "import-kidcity-crm" },
  };

  if (existing) return prisma.brandAsset.update({ where: { id: existing.id }, data });

  return prisma.brandAsset.create({
    data: {
      tenantId: input.tenantId,
      brandId: input.brandId,
      assetType: input.assetType,
      ...data,
    },
  });
}

async function ensureOrg() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "kid-city-usa" },
    update: { name: "Kid City USA" },
    create: { name: "Kid City USA", slug: "kid-city-usa" },
  });

  const brand = await prisma.brand.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "kid-city-usa" } },
    update: { name: "Kid City USA" },
    create: { tenantId: tenant.id, name: "Kid City USA", slug: "kid-city-usa" },
  });

  await prisma.whiteLabelSettings.upsert({
    where: { brandId: brand.id },
    update: {
      brandName: "Kid City USA",
      logoUrlPlaceholder: KID_CITY_USA_BRANDING.logoSrc,
      faviconUrlPlaceholder: KID_CITY_USA_BRANDING.markSrc,
    },
    create: {
      brandId: brand.id,
      brandName: "Kid City USA",
      logoUrlPlaceholder: KID_CITY_USA_BRANDING.logoSrc,
      faviconUrlPlaceholder: KID_CITY_USA_BRANDING.markSrc,
      primaryColor: "#f5b51b",
      accentColor: "#10b981",
      themeMode: "dark",
      emailSenderPlaceholder: "hello@kidcityusa.com",
      customDomainPlaceholder: "portal.kidcityusa.com",
      legalFooterText: "Kid City USA childcare operations powered by The Bee Suite.",
    },
  });

  await Promise.all([
    ensureBrandAsset({
      tenantId: tenant.id,
      brandId: brand.id,
      assetType: "logo",
      url: KID_CITY_USA_BRANDING.logoSrc,
      altText: KID_CITY_USA_BRANDING.logoAlt,
    }),
    ensureBrandAsset({
      tenantId: tenant.id,
      brandId: brand.id,
      assetType: "favicon",
      url: KID_CITY_USA_BRANDING.markSrc,
      altText: "Kid City USA favicon",
    }),
  ]);

  const organization =
    (await prisma.organization.findFirst({
      where: { tenantId: tenant.id, name: "Kid City USA" },
    })) ??
    (await prisma.organization.create({
      data: { tenantId: tenant.id, brandId: brand.id, name: "Kid City USA" },
    }));

  if (organization.brandId !== brand.id) {
    await prisma.organization.update({
      where: { id: organization.id },
      data: { brandId: brand.id },
    });
  }

  return { tenant, brand, organization };
}

async function upsertCenters(organizationId: string, locations: NormalizedLocation[]) {
  const centerMap = new Map<string, string>();

  for (const location of locations) {
    const existing = await prisma.center.findFirst({
      where: {
        organizationId,
        OR: [
          { crmLocationId: location.crmLocationId },
          { locationId: location.locationId },
        ],
      },
      select: { id: true },
    });

    const data = {
      organizationId,
      name: location.name,
      crmLocationId: location.crmLocationId,
      locationId: location.locationId,
      address: location.address || null,
      city: location.city || null,
      state: location.state || null,
      postalCode: location.postalCode || null,
      phone: location.phone || null,
      licensedCapacity: location.licensedCapacity ?? 0,
      status: "active",
      sourceSystem: "kidcity_legacy_crm",
      externalId: location.crmLocationId,
      customFields: location.customFields ?? {},
    };

    const center = existing
      ? await prisma.center.update({ where: { id: existing.id }, data })
      : await prisma.center.create({ data });

    centerMap.set(location.crmLocationId, center.id);
    centerMap.set(location.locationId, center.id);
  }

  const unassigned =
    (await prisma.center.findFirst({
      where: { organizationId, crmLocationId: "UNASSIGNED" },
      select: { id: true },
    })) ??
    (await prisma.center.create({
      data: {
        organizationId,
        name: "Kid City USA - Unassigned Lead Queue",
        crmLocationId: "UNASSIGNED",
        locationId: "UNASSIGNED",
        licensedCapacity: 0,
        status: "active",
        sourceSystem: "kidcity_legacy_crm",
      },
      select: { id: true },
    }));

  centerMap.set("UNASSIGNED", unassigned.id);
  return centerMap;
}

async function ensureLeadLocationQueues(
  organizationId: string,
  centerMap: Map<string, string>,
  leads: NormalizedLead[],
) {
  const crmLocationIds = new Set(
    leads
      .map((lead) => lead.crmLocationId)
      .filter((value) => value && !centerMap.has(value)),
  );

  for (const crmLocationId of crmLocationIds) {
    const existing = await prisma.center.findFirst({
      where: { organizationId, crmLocationId },
      select: { id: true },
    });

    const center =
      existing ??
      (await prisma.center.create({
        data: {
          organizationId,
          name: `Kid City USA - ${crmLocationId.replace(/^[A-Z]{2}\\s\\|\\s/, "")}`,
          crmLocationId,
          locationId: crmLocationId,
          licensedCapacity: 0,
          status: "lead_queue",
          sourceSystem: "kidcity_legacy_crm",
          externalId: crmLocationId,
          customFields: {
            importNote:
              "Created from a legacy lead CRM location ID that did not have a matching full location profile in the export.",
          },
        },
        select: { id: true },
      }));

    centerMap.set(crmLocationId, center.id);
  }

  return crmLocationIds.size;
}

async function upsertUsers(
  tenantId: string,
  organizationId: string,
  centerMap: Map<string, string>,
  users: NormalizedUser[],
) {
  let staffProfiles = 0;

  for (const item of users) {
    const role = UserRole[item.role] ?? UserRole.CENTER_DIRECTOR;
    const user = await prisma.user.upsert({
      where: { email: item.email },
      update: {
        tenantId,
        organizationId,
        name: item.name,
        role,
        isActive: item.isActive ?? true,
      },
      create: {
        tenantId,
        organizationId,
        email: item.email,
        name: item.name,
        role,
        isActive: item.isActive ?? true,
      },
    });

    const centerId = item.crmLocationId ? centerMap.get(item.crmLocationId) : undefined;
    if (centerId && role !== UserRole.BRAND_ADMIN && role !== UserRole.PLATFORM_OWNER) {
      await prisma.staffProfile.upsert({
        where: { userId: user.id },
        update: {
          centerId,
          title: "Center CRM User",
        },
        create: {
          userId: user.id,
          centerId,
          title: "Center CRM User",
        },
      });
      staffProfiles += 1;
    }
  }

  return staffProfiles;
}

async function importLeads(centerMap: Map<string, string>, leads: NormalizedLead[]) {
  const selectedLeads = leadLimit ? leads.slice(0, leadLimit) : leads;
  const data: Prisma.LeadCreateManyInput[] = selectedLeads.map((lead) => {
    const centerId = centerMap.get(lead.crmLocationId) ?? centerMap.get("UNASSIGNED");
    if (!centerId) throw new Error("Missing unassigned center.");

    return {
      centerId,
      externalId: lead.externalId || undefined,
      familyName: lead.familyName || "Unknown Family",
      parentFirstName: lead.parentFirstName || undefined,
      parentLastName: lead.parentLastName || undefined,
      email: lead.email || undefined,
      phone: lead.phone || undefined,
      leadSource: lead.leadSource || "Old CRM Import",
      stage: EnrollmentStage[lead.stage] ?? EnrollmentStage.NEW_INQUIRY,
      status: lead.status || "imported",
      score: scoreImportedLead(lead),
      customFields: {
        intakeType: "kidcity_legacy_crm_import",
        crmLocationId: lead.crmLocationId,
        rawPipelineStage: lead.rawPipelineStage,
        legacyNotes: lead.notes,
      },
      createdAt: toDate(lead.createdAt),
    };
  });

  const result = await prisma.lead.createMany({
    data,
    skipDuplicates: true,
  });

  return result.count;
}

async function main() {
  const normalized = loadExport();
  const { tenant, organization } = await ensureOrg();
  const centerMap = await upsertCenters(organization.id, normalized.locations);
  const leadOnlyCenters = await ensureLeadLocationQueues(
    organization.id,
    centerMap,
    normalized.leads,
  );
  const staffProfiles = await upsertUsers(
    tenant.id,
    organization.id,
    centerMap,
    normalized.users,
  );
  const importedLeads = await importLeads(centerMap, normalized.leads);

  const counts = await prisma.$transaction([
    prisma.center.count({ where: { organizationId: organization.id } }),
    prisma.user.count({ where: { organizationId: organization.id } }),
    prisma.lead.count({ where: { center: { organizationId: organization.id } } }),
  ]);

  console.log(
    JSON.stringify(
      {
        inputPath,
        locationsInFile: normalized.locations.length,
        usersInFile: normalized.users.length,
        leadsInFile: normalized.leads.length,
        leadOnlyCenters,
        staffProfiles,
        importedLeads,
        database: {
          centers: counts[0],
          users: counts[1],
          leads: counts[2],
        },
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
