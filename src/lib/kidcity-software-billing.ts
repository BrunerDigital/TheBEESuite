import { UserRole, type Prisma, type PrismaClient } from "@prisma/client";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

const schoolUserRoles = [
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.BILLING_ADMIN,
] as const;

const corporateSoftwareFeeOwnerTypes = new Set([
  "corporate",
  "corporate_owned",
  "company_owned",
  "corp_school",
  "corpschool",
  "corporate_school",
  "corporate_schools",
]);

type SchoolSoftwareFeeTier = "corporate" | "partner";

type SchoolSoftwareFeeCenter = {
  id?: string | null;
  name?: string | null;
  crmLocationId?: string | null;
  locationId?: string | null;
  customFields?: unknown;
  ownerGroup?: {
    name?: string | null;
    ownerType?: string | null;
    billingEmail?: string | null;
    contactName?: string | null;
    customFields?: unknown;
  } | null;
};

function nonNegativeIntEnv(name: string, fallback = 0) {
  const parsed = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function yyyymm(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeKey(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeIdentifier(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function csvEnvSet(name: string) {
  return new Set(
    clean(process.env[name])
      .split(",")
      .map(normalizeIdentifier)
      .filter(Boolean),
  );
}

function fieldText(fields: unknown, ...keys: string[]) {
  const record = asRecord(fields);
  for (const key of keys) {
    const value = clean(record[key]);
    if (value) return value;
  }
  return "";
}

function fieldBoolean(fields: unknown, ...keys: string[]) {
  const record = asRecord(fields);
  return keys.some((key) => record[key] === true || clean(record[key]).toLowerCase() === "true");
}

function explicitTierFromFields(fields: unknown): SchoolSoftwareFeeTier | null {
  const tier = normalizeKey(fieldText(
    fields,
    "stripeSoftwareFeeTier",
    "softwareFeeTier",
    "beeSuiteSoftwareFeeTier",
    "ownershipTier",
    "billingTier",
  ));
  if (tier === "corporate" || tier === "corp" || tier === "corporate_owned" || tier === "company_owned") {
    return "corporate";
  }
  if (tier === "partner" || tier === "franchise" || tier === "franchisee" || tier === "school_partner") {
    return "partner";
  }
  if (fieldBoolean(fields, "isCorporateSchool", "corporateOwned", "isCorpSchool")) return "corporate";
  return null;
}

function centerMatchesConfiguredCorporateIds(center: SchoolSoftwareFeeCenter) {
  const configured = csvEnvSet("STRIPE_CORPORATE_SCHOOL_SOFTWARE_FEE_CENTER_IDS");
  if (!configured.size) return false;
  return [
    center.id,
    center.crmLocationId,
    center.locationId,
    center.name,
  ].some((value) => configured.has(normalizeIdentifier(value)));
}

function ownerGroupLooksCorporate(ownerGroup: SchoolSoftwareFeeCenter["ownerGroup"]) {
  if (!ownerGroup) return false;
  const ownerType = normalizeKey(ownerGroup.ownerType);
  if (corporateSoftwareFeeOwnerTypes.has(ownerType)) return true;
  const fieldsTier = explicitTierFromFields(ownerGroup.customFields);
  if (fieldsTier) return fieldsTier === "corporate";
  const ownerText = [
    ownerGroup.name,
    ownerGroup.billingEmail,
    ownerGroup.contactName,
  ].map((value) => clean(value).toLowerCase()).join(" ");
  return ownerText.includes("corpschools@kidcityusa.com") ||
    ownerText.includes("corp schools") ||
    ownerText.includes("corporate schools");
}

export function getCorporateSchoolSoftwareFeeUnitAmountCents() {
  return nonNegativeIntEnv("STRIPE_CORPORATE_SCHOOL_SOFTWARE_FEE_CENTS", 4_900);
}

export function getPartnerSchoolSoftwareFeeUnitAmountCents() {
  return nonNegativeIntEnv("STRIPE_PARTNER_SCHOOL_SOFTWARE_FEE_CENTS", 7_900);
}

export function getKidCitySoftwareFeeUnitAmountCents() {
  return getPartnerSchoolSoftwareFeeUnitAmountCents();
}

export function getSchoolSoftwareFeeTier(center: SchoolSoftwareFeeCenter): SchoolSoftwareFeeTier {
  const explicitCenterTier = explicitTierFromFields(center.customFields);
  if (explicitCenterTier) return explicitCenterTier;
  if (centerMatchesConfiguredCorporateIds(center)) return "corporate";
  if (ownerGroupLooksCorporate(center.ownerGroup)) return "corporate";
  return "partner";
}

export function getSchoolSoftwareFeePolicyForCenter(center: SchoolSoftwareFeeCenter) {
  const tier = getSchoolSoftwareFeeTier(center);
  const unitAmountCents = tier === "corporate"
    ? getCorporateSchoolSoftwareFeeUnitAmountCents()
    : getPartnerSchoolSoftwareFeeUnitAmountCents();
  return {
    tier,
    unitAmountCents,
    billingBasis: "per_school" as const,
  };
}

export function formatSchoolSoftwareFeeAmount(amountCents: number) {
  return `$${(Math.max(0, amountCents) / 100).toFixed(amountCents % 100 === 0 ? 0 : 2)}`;
}

export function getKidCitySoftwareInvoiceDaysUntilDue() {
  return Math.max(1, nonNegativeIntEnv("STRIPE_KIDCITY_SOFTWARE_INVOICE_DAYS_UNTIL_DUE", 15));
}

export function getKidCitySoftwareInvoicePeriod(date = new Date()) {
  return yyyymm(date);
}

export function getKidCitySoftwareInvoiceAmount(schoolCount: number, unitAmountCents = getKidCitySoftwareFeeUnitAmountCents()) {
  return Math.max(0, Math.floor(schoolCount)) * Math.max(0, unitAmountCents);
}

export function getKidCitySoftwareInvoiceNumber(period = getKidCitySoftwareInvoicePeriod()) {
  return `BEE-KCUSA-SOFTWARE-${period}`;
}

export function getKidCitySoftwareInvoiceDescription({
  period = getKidCitySoftwareInvoicePeriod(),
  schoolCount,
  unitAmountCents = getKidCitySoftwareFeeUnitAmountCents(),
}: {
  period?: string;
  schoolCount: number;
  unitAmountCents?: number;
}) {
  return `The BEE Suite monthly software access fee for Kid City USA Enterprises - ${period} - ${schoolCount} active school(s) at ${formatSchoolSoftwareFeeAmount(unitAmountCents)} each`;
}

function getTierSummary(policies: Array<{ tier: SchoolSoftwareFeeTier; unitAmountCents: number }>) {
  const corporate = policies.filter((policy) => policy.tier === "corporate");
  const partner = policies.filter((policy) => policy.tier === "partner");
  const parts: string[] = [];
  if (corporate.length) {
    parts.push(`${corporate.length} corporate school(s) at ${formatSchoolSoftwareFeeAmount(corporate[0].unitAmountCents)}`);
  }
  if (partner.length) {
    parts.push(`${partner.length} partner school(s) at ${formatSchoolSoftwareFeeAmount(partner[0].unitAmountCents)}`);
  }
  return parts.join(" and ");
}

export function kidCitySchoolUserWhere(now = new Date()): Prisma.UserWhereInput {
  return {
    isActive: true,
    role: { in: [...schoolUserRoles] },
    tenant: {
      OR: [
        { slug: "kid-city-usa" },
        { name: { contains: "Kid City", mode: "insensitive" } },
      ],
    },
    OR: [
      {
        staffProfile: {
          is: {
            center: {
              status: { notIn: ["closed", "archived", "inactive"] },
            },
          },
        },
      },
      {
        accessGrants: {
          some: {
            isActive: true,
            centerId: { not: null },
            OR: [{ startsAt: null }, { startsAt: { lte: now } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
            center: {
              status: { notIn: ["closed", "archived", "inactive"] },
            },
          },
        },
      },
    ],
  };
}

async function getKidCityBillingOwnerGroup(db: PrismaLike) {
  return db.ownerGroup.findFirst({
    where: {
      status: { not: "closed" },
      tenant: {
        OR: [
          { slug: "kid-city-usa" },
          { name: { contains: "Kid City", mode: "insensitive" } },
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      billingEmail: true,
      customFields: true,
    },
  });
}

function readStoredStripeCustomerId(customFields: unknown) {
  const fields = asRecord(customFields);
  const value = fields.stripeKidCitySoftwareCustomerId || fields.stripeCorporateSoftwareCustomerId;
  return typeof value === "string" && value.startsWith("cus_") ? value : null;
}

export async function saveKidCitySoftwareStripeCustomerId(db: PrismaLike, customerId: string) {
  if (!customerId.startsWith("cus_")) throw new Error("A valid payment customer ID is required.");
  const ownerGroup = await getKidCityBillingOwnerGroup(db);
  if (!ownerGroup) throw new Error("Kid City owner group was not found for corporate billing.");
  await db.ownerGroup.update({
    where: { id: ownerGroup.id },
    data: {
      customFields: {
        ...asRecord(ownerGroup.customFields),
        stripeKidCitySoftwareCustomerId: customerId,
      },
    },
  });
}

export async function getKidCitySoftwareInvoiceSnapshot(db: PrismaLike, date = new Date()) {
  const period = getKidCitySoftwareInvoicePeriod(date);
  const billingOwnerGroup = await getKidCityBillingOwnerGroup(db);
  const schoolUsers = await db.user.findMany({
    where: kidCitySchoolUserWhere(date),
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      staffProfile: {
        select: {
          center: { select: { id: true, name: true, crmLocationId: true } },
        },
      },
      accessGrants: {
        where: {
          isActive: true,
          centerId: { not: null },
          OR: [{ startsAt: null }, { startsAt: { lte: date } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: date } }] }],
        },
        select: {
          center: { select: { id: true, name: true, crmLocationId: true } },
        },
      },
    },
  });
  const activeSchoolRows = await db.center.findMany({
    where: {
      status: { notIn: ["closed", "archived", "inactive"] },
      organization: {
        tenant: {
          OR: [
            { slug: "kid-city-usa" },
            { name: { contains: "Kid City", mode: "insensitive" } },
          ],
        },
      },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      customFields: true,
      ownerGroup: {
        select: {
          name: true,
          ownerType: true,
          billingEmail: true,
          contactName: true,
          customFields: true,
        },
      },
    },
  });
  const activeSchools = activeSchoolRows.map((school) => {
    const policy = getSchoolSoftwareFeePolicyForCenter(school);
    return {
      id: school.id,
      name: school.name,
      crmLocationId: school.crmLocationId,
      feeTier: policy.tier,
      monthlyAmountCents: policy.unitAmountCents,
    };
  });
  const policies = activeSchoolRows.map(getSchoolSoftwareFeePolicyForCenter);
  const activeSchoolUserCount = schoolUsers.length;
  const activeSchoolCount = activeSchools.length;
  const totalAmountCents = policies.reduce((total, policy) => total + policy.unitAmountCents, 0);
  const unitAmountCents = getPartnerSchoolSoftwareFeeUnitAmountCents();
  const customerId = clean(process.env.STRIPE_KIDCITY_ENTERPRISES_CUSTOMER_ID) ||
    readStoredStripeCustomerId(billingOwnerGroup?.customFields);
  const tierSummary = getTierSummary(policies);

  return {
    period,
    invoiceNumber: getKidCitySoftwareInvoiceNumber(period),
    unitAmountCents,
    activeSchoolCount,
    activeSchoolUserCount,
    totalAmountCents,
    description: tierSummary
      ? `The BEE Suite monthly software access fee for Kid City USA Enterprises - ${period} - ${tierSummary}`
      : getKidCitySoftwareInvoiceDescription({ period, schoolCount: activeSchoolCount, unitAmountCents }),
    daysUntilDue: getKidCitySoftwareInvoiceDaysUntilDue(),
    stripeCustomerId: customerId || null,
    stripeCustomerConfigured: Boolean(customerId),
    billingEmail: billingOwnerGroup?.billingEmail || "accounting@kidcityusa.com",
    schoolUsers: schoolUsers.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      centers: [
        user.staffProfile?.center,
        ...user.accessGrants.map((grant) => grant.center),
      ].filter((center): center is NonNullable<typeof center> => Boolean(center)),
    })),
    activeSchools,
  };
}
