import { UserRole, type Prisma, type PrismaClient } from "@prisma/client";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

const schoolUserRoles = [
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.BILLING_ADMIN,
] as const;

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

export function getKidCitySoftwareFeeUnitAmountCents() {
  return nonNegativeIntEnv("STRIPE_KIDCITY_SOFTWARE_FEE_PER_SCHOOL_USER_CENTS", 4_900);
}

export function getKidCitySoftwareInvoiceDaysUntilDue() {
  return Math.max(1, nonNegativeIntEnv("STRIPE_KIDCITY_SOFTWARE_INVOICE_DAYS_UNTIL_DUE", 15));
}

export function getKidCitySoftwareInvoicePeriod(date = new Date()) {
  return yyyymm(date);
}

export function getKidCitySoftwareInvoiceAmount(userCount: number, unitAmountCents = getKidCitySoftwareFeeUnitAmountCents()) {
  return Math.max(0, Math.floor(userCount)) * Math.max(0, unitAmountCents);
}

export function getKidCitySoftwareInvoiceNumber(period = getKidCitySoftwareInvoicePeriod()) {
  return `BEE-KCUSA-SOFTWARE-${period}`;
}

export function getKidCitySoftwareInvoiceDescription({
  period = getKidCitySoftwareInvoicePeriod(),
  userCount,
  unitAmountCents = getKidCitySoftwareFeeUnitAmountCents(),
}: {
  period?: string;
  userCount: number;
  unitAmountCents?: number;
}) {
  return `The BEE Suite monthly software access fee for Kid City USA Enterprises - ${period} - ${userCount} active school user(s) at $${(unitAmountCents / 100).toFixed(2)} each`;
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
  if (!customerId.startsWith("cus_")) throw new Error("A valid Stripe customer ID is required.");
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
  const unitAmountCents = getKidCitySoftwareFeeUnitAmountCents();
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
  const activeSchoolUserCount = schoolUsers.length;
  const totalAmountCents = getKidCitySoftwareInvoiceAmount(activeSchoolUserCount, unitAmountCents);
  const customerId = clean(process.env.STRIPE_KIDCITY_ENTERPRISES_CUSTOMER_ID) ||
    readStoredStripeCustomerId(billingOwnerGroup?.customFields);

  return {
    period,
    invoiceNumber: getKidCitySoftwareInvoiceNumber(period),
    unitAmountCents,
    activeSchoolUserCount,
    totalAmountCents,
    description: getKidCitySoftwareInvoiceDescription({ period, userCount: activeSchoolUserCount, unitAmountCents }),
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
  };
}
