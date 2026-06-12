import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const EXECUTIVE_USERS = [
  { email: "brenden@kidcityusa.com", name: "Brenden Kid City USA" },
  { email: "marie@kidcityusa.com", name: "Marie Kid City USA" },
  { email: "audrey@kidcityusa.com", name: "Audrey Kid City USA" },
  { email: "kayleen@kidcityusa.com", name: "Kayleen Kid City USA" },
];

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.KIDCITY_DEFAULT_PASSWORD;

async function ensureSupabaseUsers() {
  if (!supabaseUrl || !serviceRoleKey || !password) {
    return { skipped: true, reason: "Supabase auth env vars are not set." };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const existingByEmail = new Map(data.users.map((user) => [user.email?.toLowerCase(), user]));
  const results = [];

  for (const executive of EXECUTIVE_USERS) {
    const existing = existingByEmail.get(executive.email.toLowerCase());
    if (existing) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(existing.user_metadata ?? {}),
          name: executive.name,
          source: "kidcity_executive_access",
        },
        app_metadata: {
          ...(existing.app_metadata ?? {}),
          bee_suite_role: UserRole.BRAND_ADMIN,
        },
      });
      if (updateError) throw updateError;
      results.push({ email: executive.email, status: "updated" });
    } else {
      const { error: createError } = await supabase.auth.admin.createUser({
        email: executive.email,
        password,
        email_confirm: true,
        user_metadata: {
          name: executive.name,
          source: "kidcity_executive_access",
        },
        app_metadata: {
          bee_suite_role: UserRole.BRAND_ADMIN,
        },
      });
      if (createError) throw createError;
      results.push({ email: executive.email, status: "created" });
    }
  }

  return { skipped: false, results };
}

async function main() {
  const templateUser = await prisma.user.findUnique({
    where: { email: "brenden@kidcityusa.com" },
    select: { tenantId: true, organizationId: true },
  });
  const fallbackOrganization = templateUser
    ? null
    : await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, tenantId: true } });

  const tenantId = templateUser?.tenantId ?? fallbackOrganization?.tenantId;
  const organizationId = templateUser?.organizationId ?? fallbackOrganization?.id ?? null;
  if (!tenantId) throw new Error("No tenant exists for Kid City executive users.");

  const dbResults = [];
  for (const executive of EXECUTIVE_USERS) {
    const user = await prisma.user.upsert({
      where: { email: executive.email.toLowerCase() },
      update: {
        name: executive.name,
        role: UserRole.BRAND_ADMIN,
        tenantId,
        organizationId,
        isActive: true,
      },
      create: {
        tenantId,
        organizationId,
        email: executive.email.toLowerCase(),
        name: executive.name,
        role: UserRole.BRAND_ADMIN,
        isActive: true,
      },
      select: { email: true, role: true },
    });
    dbResults.push(user);
  }

  const authResults = await ensureSupabaseUsers();
  console.log(JSON.stringify({ prismaUsers: dbResults.length, authResults }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
