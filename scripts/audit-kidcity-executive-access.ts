import "./load-env";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const EXECUTIVE_EMAILS = [
  "dawn@kidcityusa.com",
  "michelle@kidcityusa.com",
  "brenden@kidcityusa.com",
  "marie@kidcityusa.com",
  "audrey@kidcityusa.com",
  "kayleen@kidcityusa.com",
  "dee@kidcityusa.com",
  "tracey@kidcityusa.com",
  "jianna@kidcityusa.com",
  "linda@kidcityusa.com",
] as const;

export async function auditKidCityExecutiveAccess() {
  const verifySharedPassword = process.argv.includes("--verify-shared-password");
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

  const applicationUsers = await prisma.user.findMany({
    where: { tenantId: tenant.id, email: { in: [...EXECUTIVE_EMAILS] } },
    select: {
      email: true,
      role: true,
      isActive: true,
      mustResetPassword: true,
      accessGrants: {
        where: {
          tenantId: tenant.id,
          scopeType: "TENANT",
          role: UserRole.BRAND_ADMIN,
          isActive: true,
        },
        select: { id: true },
      },
    },
  });
  const appByEmail = new Map(applicationUsers.map((user) => [user.email.toLowerCase(), user]));

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  const clientKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !clientKey) {
    throw new Error("Supabase admin and client credentials are required for the executive access audit.");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (authError) throw authError;
  const authByEmail = new Map(
    authData.users
      .filter((user) => user.email)
      .map((user) => [user.email!.toLowerCase(), user]),
  );

  const password = verifySharedPassword ? process.env.KIDCITY_DEFAULT_PASSWORD : undefined;
  if (verifySharedPassword && !password) {
    throw new Error("KIDCITY_DEFAULT_PASSWORD is required when --verify-shared-password is requested.");
  }
  const passwordLogins = new Set<string>();
  const passwordFailures = new Set<string>();
  if (password) {
    for (const email of EXECUTIVE_EMAILS) {
      const loginClient = createClient(supabaseUrl, clientKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await loginClient.auth.signInWithPassword({ email, password });
      if (!error && data.user?.email?.toLowerCase() === email) {
        passwordLogins.add(email);
        await loginClient.auth.signOut();
      } else {
        passwordFailures.add(email);
      }
    }
  }

  const failures: Array<{ email: string; issues: string[] }> = [];
  for (const email of EXECUTIVE_EMAILS) {
    const issues: string[] = [];
    const appUser = appByEmail.get(email);
    const authUser = authByEmail.get(email);
    if (!appUser) {
      issues.push("missing application user");
    } else {
      if (appUser.role !== UserRole.BRAND_ADMIN) issues.push("role is not BRAND_ADMIN");
      if (!appUser.isActive) issues.push("application user is inactive");
      if (appUser.mustResetPassword) issues.push("forced password reset is still enabled");
      if (appUser.accessGrants.length !== 1) issues.push("expected exactly one active tenant-wide grant");
    }
    if (!authUser) {
      issues.push("missing Supabase Auth user");
    } else {
      if (!authUser.email_confirmed_at) issues.push("email is not confirmed");
      if (authUser.banned_until && new Date(authUser.banned_until) > new Date()) issues.push("Auth user is banned");
    }
    if (verifySharedPassword && passwordFailures.has(email)) issues.push("shared password login failed");
    if (issues.length) failures.push({ email, issues });
  }

  const summary = {
    ok: failures.length === 0,
    expectedExecutives: EXECUTIVE_EMAILS.length,
    applicationUsersReady: EXECUTIVE_EMAILS.filter((email) => {
      const user = appByEmail.get(email);
      return Boolean(
        user &&
        user.role === UserRole.BRAND_ADMIN &&
        user.isActive &&
        !user.mustResetPassword &&
        user.accessGrants.length === 1,
      );
    }).length,
    authUsersReady: EXECUTIVE_EMAILS.filter((email) => {
      const user = authByEmail.get(email);
      return Boolean(
        user &&
        user.email_confirmed_at &&
        (!user.banned_until || new Date(user.banned_until) <= new Date()),
      );
    }).length,
    sharedPasswordVerificationRequested: verifySharedPassword,
    sharedPasswordLoginsVerified: passwordLogins.size,
    failures,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
  return summary;
}

async function main() {
  try {
    await auditKidCityExecutiveAccess();
  } finally {
    await prisma.$disconnect();
  }
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedScriptUrl) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
