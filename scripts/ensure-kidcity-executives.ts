import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const EXECUTIVE_USERS = [
  { email: "dawn@kidcityusa.com", name: "Dawn Kid City USA" },
  { email: "michelle@kidcityusa.com", name: "Michelle Kid City USA" },
  { email: "brenden@kidcityusa.com", name: "Brenden Kid City USA" },
  { email: "marie@kidcityusa.com", name: "Marie Kid City USA" },
  { email: "audrey@kidcityusa.com", name: "Audrey Kid City USA" },
  { email: "kayleen@kidcityusa.com", name: "Kayleen Kid City USA" },
  { email: "dee@kidcityusa.com", name: "Dee Kid City USA" },
  { email: "tracey@kidcityusa.com", name: "Tracey Kid City USA" },
  { email: "jianna@kidcityusa.com", name: "Jianna Kid City USA" },
  { email: "linda@kidcityusa.com", name: "Linda Kid City USA" },
];

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const password = process.env.KIDCITY_DEFAULT_PASSWORD;

async function ensureSupabaseUsers(
  users: Array<{ email: string; name: string; tenantId: string; organizationId: string | null }>,
) {
  if (!supabaseUrl || !serviceRoleKey || !password) {
    throw new Error("Supabase auth and Kid City password environment variables are required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const existingByEmail = new Map(data.users.map((user) => [user.email?.toLowerCase(), user]));
  const results = [];

  for (const executive of users) {
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
          bee_suite_tenant_id: executive.tenantId,
          bee_suite_organization_id: executive.organizationId,
        },
        ban_duration: "none",
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
          bee_suite_tenant_id: executive.tenantId,
          bee_suite_organization_id: executive.organizationId,
        },
      });
      if (createError) throw createError;
      results.push({ email: executive.email, status: "created" });
    }
  }

  const clientKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!clientKey) throw new Error("Supabase client key is required for login verification.");
  const verifiedLogins = [];
  for (const executive of users) {
    const loginClient = createClient(supabaseUrl, clientKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: login, error: loginError } = await loginClient.auth.signInWithPassword({
      email: executive.email,
      password,
    });
    if (loginError || login.user?.email?.toLowerCase() !== executive.email) {
      throw new Error(`${executive.email}: login verification failed.`);
    }
    const { error: signOutError } = await loginClient.auth.signOut();
    if (signOutError) throw signOutError;
    verifiedLogins.push(executive.email);
  }

  return { skipped: false, results, verifiedLogins };
}

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { slug: "kid-city-usa" },
        { name: { contains: "Kid City", mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (!tenant) throw new Error("The Kid City tenant was not found.");
  const organization = await prisma.organization.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const tenantId = tenant.id;
  const organizationId = organization?.id ?? null;

  const dbResults = [];
  for (const executive of EXECUTIVE_USERS) {
    const user = await prisma.$transaction(async (tx) => {
      const appUser = await tx.user.upsert({
        where: { email: executive.email.toLowerCase() },
        update: {
          role: UserRole.BRAND_ADMIN,
          tenantId,
          organizationId,
          isActive: true,
          mustResetPassword: false,
        },
        create: {
          tenantId,
          organizationId,
          email: executive.email.toLowerCase(),
          name: executive.name,
          role: UserRole.BRAND_ADMIN,
          isActive: true,
          mustResetPassword: false,
        },
        select: { id: true, email: true, name: true, role: true, tenantId: true, organizationId: true },
      });
      const tenantGrants = await tx.userAccessGrant.findMany({
        where: { userId: appUser.id, tenantId, scopeType: "TENANT", isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (tenantGrants[0]) {
        await tx.userAccessGrant.update({
          where: { id: tenantGrants[0].id },
          data: { role: UserRole.BRAND_ADMIN, organizationId: null, centerId: null, isActive: true },
        });
        if (tenantGrants.length > 1) {
          await tx.userAccessGrant.updateMany({
            where: { id: { in: tenantGrants.slice(1).map((grant) => grant.id) } },
            data: { isActive: false },
          });
        }
      } else {
        await tx.userAccessGrant.create({
          data: {
            userId: appUser.id,
            tenantId,
            role: UserRole.BRAND_ADMIN,
            scopeType: "TENANT",
            isActive: true,
          },
        });
      }
      return appUser;
    });
    dbResults.push(user);
  }

  const authResults = await ensureSupabaseUsers(dbResults);
  const activeLocations = await prisma.center.count({
    where: { organization: { tenantId }, status: "active" },
  });
  const verifiedUsers = await prisma.user.findMany({
    where: { email: { in: EXECUTIVE_USERS.map((executive) => executive.email) } },
    orderBy: { email: "asc" },
    select: {
      email: true,
      name: true,
      role: true,
      isActive: true,
      mustResetPassword: true,
      accessGrants: {
        where: { tenantId, scopeType: "TENANT", role: UserRole.BRAND_ADMIN, isActive: true },
        select: { id: true },
      },
    },
  });
  const invalidUsers = verifiedUsers.filter((user) =>
    user.role !== UserRole.BRAND_ADMIN || !user.isActive || user.mustResetPassword || user.accessGrants.length !== 1,
  );
  if (verifiedUsers.length !== EXECUTIVE_USERS.length || invalidUsers.length) {
    throw new Error("Executive application access verification failed.");
  }
  console.log(JSON.stringify({
    ok: true,
    activeLocations,
    dashboardLenses: ["brand", "regional", "director"],
    users: verifiedUsers.map((user) => ({
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.isActive,
      tenantWideGrant: user.accessGrants.length === 1,
      loginVerified: authResults.verifiedLogins.includes(user.email),
    })),
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
