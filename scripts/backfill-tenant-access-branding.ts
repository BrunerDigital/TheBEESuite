import "./load-env";
import { PrismaClient, UserRole } from "@prisma/client";
import { KID_CITY_USA_BRANDING, isKidCityBrandText } from "@/lib/brand-assets";

const prisma = new PrismaClient();

const KIDCITY_EXECUTIVE_EMAILS = new Set([
  "brenden@kidcityusa.com",
  "marie@kidcityusa.com",
  "audrey@kidcityusa.com",
  "kayleen@kidcityusa.com",
]);

const TENANT_SCOPE_ROLES = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.READ_ONLY_AUDITOR,
]);

const OWNER_GROUP_SCOPE_ROLES = new Set<UserRole>([
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
]);

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `ownership-${Date.now()}`;
}

async function ensureOwnerGroup(input: {
  tenantId: string;
  brandId?: string | null;
  organizationId?: string | null;
  name: string;
  ownerType: string;
  billingEmail?: string | null;
  contactName?: string | null;
}) {
  const slug = slugify(input.name);
  const existing = await prisma.ownerGroup.findUnique({
    where: { tenantId_slug: { tenantId: input.tenantId, slug } },
    select: { id: true },
  });

  if (existing) {
    return prisma.ownerGroup.update({
      where: { id: existing.id },
      data: {
        brandId: input.brandId ?? null,
        organizationId: input.organizationId ?? null,
        ownerType: input.ownerType,
        billingEmail: input.billingEmail ?? null,
        contactName: input.contactName ?? null,
        status: "active",
      },
      select: { id: true, name: true, tenantId: true, organizationId: true },
    });
  }

  return prisma.ownerGroup.create({
    data: {
      tenantId: input.tenantId,
      brandId: input.brandId ?? null,
      organizationId: input.organizationId ?? null,
      name: input.name,
      slug,
      ownerType: input.ownerType,
      billingEmail: input.billingEmail ?? null,
      contactName: input.contactName ?? null,
      status: "active",
      customFields: {
        backfilledAt: new Date().toISOString(),
        source: "tenant_access_branding_backfill",
      },
    },
    select: { id: true, name: true, tenantId: true, organizationId: true },
  });
}

async function ensureBrandCustomization(input: {
  tenantId: string;
  brandId?: string | null;
  organizationId?: string | null;
  ownerGroupId?: string | null;
  centerId?: string | null;
  scopeType: string;
  brandName: string;
  logoUrlPlaceholder?: string | null;
  faviconUrlPlaceholder?: string | null;
  primaryColor?: string;
  accentColor?: string;
  themeMode?: string;
  emailSenderPlaceholder?: string | null;
  customDomainPlaceholder?: string | null;
  legalFooterText?: string | null;
  termsUrl?: string | null;
  privacyUrl?: string | null;
}) {
  const existing = await prisma.brandCustomization.findFirst({
    where: {
      tenantId: input.tenantId,
      brandId: input.brandId ?? null,
      organizationId: input.organizationId ?? null,
      ownerGroupId: input.ownerGroupId ?? null,
      centerId: input.centerId ?? null,
      scopeType: input.scopeType,
    },
    select: { id: true },
  });
  const data = {
    brandName: input.brandName,
    logoUrlPlaceholder: input.logoUrlPlaceholder ?? null,
    faviconUrlPlaceholder: input.faviconUrlPlaceholder ?? null,
    mascotUrlPlaceholder: "/mr-bee.png",
    primaryColor: input.primaryColor ?? "#f5b51b",
    accentColor: input.accentColor ?? "#10b981",
    themeMode: input.themeMode ?? "dark",
    emailSenderPlaceholder: input.emailSenderPlaceholder ?? null,
    customDomainPlaceholder: input.customDomainPlaceholder ?? null,
    parentPortalName: `${input.brandName} Family Portal`,
    loginScreenTitle: `${input.brandName} operations workspace`,
    notificationFooterText: `Sent from ${input.brandName} through The BEE Suite.`,
    legalFooterText: input.legalFooterText ?? `${input.brandName} childcare operations powered by The BEE Suite.`,
    termsUrl: input.termsUrl ?? null,
    privacyUrl: input.privacyUrl ?? null,
  };

  if (existing) {
    await prisma.brandCustomization.update({ where: { id: existing.id }, data });
    return { created: false };
  }

  await prisma.brandCustomization.create({
    data: {
      tenantId: input.tenantId,
      brandId: input.brandId ?? null,
      organizationId: input.organizationId ?? null,
      ownerGroupId: input.ownerGroupId ?? null,
      centerId: input.centerId ?? null,
      scopeType: input.scopeType,
      ...data,
    },
  });
  return { created: true };
}

async function ensureBrandAsset(input: {
  tenantId: string;
  brandId?: string | null;
  ownerGroupId?: string | null;
  centerId?: string | null;
  assetType: string;
  url?: string | null;
  altText?: string | null;
}) {
  const existing = await prisma.brandAsset.findFirst({
    where: {
      tenantId: input.tenantId,
      brandId: input.brandId ?? null,
      ownerGroupId: input.ownerGroupId ?? null,
      centerId: input.centerId ?? null,
      assetType: input.assetType,
    },
    select: { id: true },
  });
  const data = {
    url: input.url ?? null,
    altText: input.altText ?? null,
    metadata: {
      backfilledAt: new Date().toISOString(),
      source: "tenant_access_branding_backfill",
    },
  };
  if (existing) {
    await prisma.brandAsset.update({ where: { id: existing.id }, data });
    return { created: false };
  }
  await prisma.brandAsset.create({
    data: {
      tenantId: input.tenantId,
      brandId: input.brandId ?? null,
      ownerGroupId: input.ownerGroupId ?? null,
      centerId: input.centerId ?? null,
      assetType: input.assetType,
      ...data,
    },
  });
  return { created: true };
}

async function ensureAccessGrant(input: {
  userId: string;
  tenantId: string;
  role: UserRole;
  scopeType: string;
  brandId?: string | null;
  organizationId?: string | null;
  ownerGroupId?: string | null;
  centerId?: string | null;
}) {
  const existing = await prisma.userAccessGrant.findFirst({
    where: {
      userId: input.userId,
      tenantId: input.tenantId,
      role: input.role,
      scopeType: input.scopeType,
      brandId: input.brandId ?? null,
      organizationId: input.organizationId ?? null,
      ownerGroupId: input.ownerGroupId ?? null,
      centerId: input.centerId ?? null,
    },
    select: { id: true },
  });
  if (existing) {
    await prisma.userAccessGrant.update({
      where: { id: existing.id },
      data: { isActive: true },
    });
    return { created: false };
  }

  await prisma.userAccessGrant.create({
    data: {
      userId: input.userId,
      tenantId: input.tenantId,
      role: input.role,
      scopeType: input.scopeType,
      brandId: input.brandId ?? null,
      organizationId: input.organizationId ?? null,
      ownerGroupId: input.ownerGroupId ?? null,
      centerId: input.centerId ?? null,
      permissions: {
        source: "tenant_access_branding_backfill",
      },
    },
  });
  return { created: true };
}

async function main() {
  const organizations = await prisma.organization.findMany({
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      brand: { select: { id: true, name: true, slug: true, settings: true } },
      centers: {
        orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          crmLocationId: true,
          email: true,
          status: true,
          ownerGroupId: true,
        },
      },
    },
  });

  const ownerGroupsByOrg = new Map<string, string>();
  let ownerGroupsTouched = 0;
  let centersAssigned = 0;
  let customizationsCreated = 0;
  let assetsCreated = 0;

  for (const organization of organizations) {
    const label = `${organization.tenant.name} ${organization.brand?.name ?? organization.name}`;
    const isKidCity = isKidCityBrandText(label);
    const ownerGroup = await ensureOwnerGroup({
      tenantId: organization.tenantId,
      brandId: organization.brandId,
      organizationId: organization.id,
      name: isKidCity ? "Kid City USA Corporate and Franchise Network" : `${organization.name} Ownership`,
      ownerType: isKidCity ? "brand_network" : organization.centers.length > 1 ? "multi_location_operator" : "single_location_owner",
      billingEmail: organization.centers.find((center) => center.email)?.email ?? null,
      contactName: isKidCity ? "Kid City USA Executive Team" : null,
    });
    ownerGroupsTouched += 1;
    ownerGroupsByOrg.set(organization.id, ownerGroup.id);

    const centerUpdate = await prisma.center.updateMany({
      where: { organizationId: organization.id, ownerGroupId: null },
      data: { ownerGroupId: ownerGroup.id },
    });
    centersAssigned += centerUpdate.count;

    const brandName = organization.brand?.settings?.brandName ?? organization.brand?.name ?? organization.name;
    const logoUrlPlaceholder = organization.brand?.settings?.logoUrlPlaceholder ?? (isKidCity ? KID_CITY_USA_BRANDING.logoSrc : null);
    const faviconUrlPlaceholder = organization.brand?.settings?.faviconUrlPlaceholder ?? (isKidCity ? KID_CITY_USA_BRANDING.markSrc : null);
    const brandCustomization = await ensureBrandCustomization({
      tenantId: organization.tenantId,
      brandId: organization.brandId,
      organizationId: organization.id,
      scopeType: "BRAND",
      brandName,
      logoUrlPlaceholder,
      faviconUrlPlaceholder,
      primaryColor: organization.brand?.settings?.primaryColor,
      accentColor: organization.brand?.settings?.accentColor,
      themeMode: organization.brand?.settings?.themeMode,
      emailSenderPlaceholder: organization.brand?.settings?.emailSenderPlaceholder,
      customDomainPlaceholder: organization.brand?.settings?.customDomainPlaceholder,
      legalFooterText: organization.brand?.settings?.legalFooterText,
      termsUrl: organization.brand?.settings?.termsUrl,
      privacyUrl: organization.brand?.settings?.privacyUrl,
    });
    if (brandCustomization.created) customizationsCreated += 1;

    const ownerCustomization = await ensureBrandCustomization({
      tenantId: organization.tenantId,
      brandId: organization.brandId,
      organizationId: organization.id,
      ownerGroupId: ownerGroup.id,
      scopeType: "OWNER_GROUP",
      brandName: ownerGroup.name,
      primaryColor: organization.brand?.settings?.primaryColor,
      accentColor: organization.brand?.settings?.accentColor,
      themeMode: organization.brand?.settings?.themeMode,
      emailSenderPlaceholder: organization.brand?.settings?.emailSenderPlaceholder,
      customDomainPlaceholder: organization.brand?.settings?.customDomainPlaceholder,
      legalFooterText: organization.brand?.settings?.legalFooterText,
    });
    if (ownerCustomization.created) customizationsCreated += 1;

    for (const center of organization.centers) {
      const centerCustomization = await ensureBrandCustomization({
        tenantId: organization.tenantId,
        brandId: organization.brandId,
        organizationId: organization.id,
        ownerGroupId: ownerGroup.id,
        centerId: center.id,
        scopeType: "CENTER",
        brandName: center.crmLocationId ?? center.name,
        primaryColor: organization.brand?.settings?.primaryColor,
        accentColor: organization.brand?.settings?.accentColor,
        themeMode: organization.brand?.settings?.themeMode,
        emailSenderPlaceholder: center.email ?? organization.brand?.settings?.emailSenderPlaceholder,
        legalFooterText: `${center.crmLocationId ?? center.name} childcare operations powered by The BEE Suite.`,
      });
      if (centerCustomization.created) customizationsCreated += 1;
    }

    const mascot = await ensureBrandAsset({
      tenantId: organization.tenantId,
      brandId: organization.brandId,
      assetType: "mascot",
      url: "/mr-bee.png",
      altText: "Mr. Bee AI assistant",
    });
    if (mascot.created) assetsCreated += 1;

    if (logoUrlPlaceholder) {
      const logo = await ensureBrandAsset({
        tenantId: organization.tenantId,
        brandId: organization.brandId,
        assetType: "logo",
        url: logoUrlPlaceholder,
        altText: `${brandName} logo`,
      });
      if (logo.created) assetsCreated += 1;
    }
  }

  const users = await prisma.user.findMany({
    where: { isActive: true },
    include: {
      tenant: { select: { name: true } },
      organization: { select: { id: true, name: true, brand: { select: { id: true, name: true } } } },
      staffProfile: { select: { centerId: true } },
    },
  });

  let grantsCreated = 0;
  for (const user of users) {
    const label = `${user.tenant.name} ${user.organization?.brand?.name ?? ""} ${user.organization?.name ?? ""}`;
    const isKidCity = /kid\s*city/i.test(label) || KIDCITY_EXECUTIVE_EMAILS.has(user.email.toLowerCase());

    if (user.staffProfile?.centerId) {
      const result = await ensureAccessGrant({
        userId: user.id,
        tenantId: user.tenantId,
        organizationId: user.organizationId,
        role: user.role,
        scopeType: "CENTER",
        centerId: user.staffProfile.centerId,
      });
      if (result.created) grantsCreated += 1;
      continue;
    }

    if (isKidCity && TENANT_SCOPE_ROLES.has(user.role)) {
      const result = await ensureAccessGrant({
        userId: user.id,
        tenantId: user.tenantId,
        brandId: user.organization?.brand?.id ?? null,
        organizationId: user.organizationId,
        role: user.role,
        scopeType: "TENANT",
      });
      if (result.created) grantsCreated += 1;
      continue;
    }

    if (OWNER_GROUP_SCOPE_ROLES.has(user.role) && user.organizationId) {
      const ownerGroupId = ownerGroupsByOrg.get(user.organizationId);
      const result = await ensureAccessGrant({
        userId: user.id,
        tenantId: user.tenantId,
        brandId: user.organization?.brand?.id ?? null,
        organizationId: user.organizationId,
        ownerGroupId,
        role: user.role,
        scopeType: ownerGroupId ? "OWNER_GROUP" : "ORGANIZATION",
      });
      if (result.created) grantsCreated += 1;
    }
  }

  console.log(JSON.stringify({
    organizations: organizations.length,
    ownerGroupsTouched,
    centersAssigned,
    customizationsCreated,
    assetsCreated,
    users: users.length,
    grantsCreated,
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
