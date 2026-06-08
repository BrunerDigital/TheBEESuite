import "./load-env";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { upsertSupabaseAuthUserWithPassword } from "@/lib/supabase-auth";

const ACCOUNTING_EMAIL = "accounting@kidcityusa.com";
const ACCOUNTING_NAME = "Kid City USA Accounting";

function defaultPassword() {
  return process.env.KIDCITY_DEFAULT_PASSWORD || process.env.DEMO_PASSWORD || "BusyBees";
}

async function main() {
  const templateUser = await prisma.user.findUnique({
    where: { email: "brenden@kidcityusa.com" },
    select: { tenantId: true, organizationId: true },
  });
  const kidCityTenant = templateUser
    ? null
    : await prisma.tenant.findFirst({
        where: {
          OR: [
            { slug: "kid-city-usa" },
            { name: { contains: "Kid City", mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          organizations: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { id: true },
          },
        },
      });

  const tenantId = templateUser?.tenantId ?? kidCityTenant?.id;
  const organizationId = templateUser?.organizationId ?? kidCityTenant?.organizations[0]?.id ?? null;
  if (!tenantId) throw new Error("Kid City tenant was not found.");

  const appUser = await prisma.user.upsert({
    where: { email: ACCOUNTING_EMAIL },
    update: {
      tenantId,
      organizationId,
      name: ACCOUNTING_NAME,
      role: UserRole.BILLING_ADMIN,
      isActive: true,
      mustResetPassword: false,
    },
    create: {
      tenantId,
      organizationId,
      email: ACCOUNTING_EMAIL,
      name: ACCOUNTING_NAME,
      role: UserRole.BILLING_ADMIN,
      isActive: true,
      mustResetPassword: false,
    },
    select: { id: true, email: true, role: true, isActive: true },
  });

  const auth = await upsertSupabaseAuthUserWithPassword({
    email: ACCOUNTING_EMAIL,
    name: ACCOUNTING_NAME,
    password: defaultPassword(),
    role: UserRole.BILLING_ADMIN,
    source: "kidcity_accounting_corporate_billing",
  });

  console.log(JSON.stringify({ appUser, auth }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
