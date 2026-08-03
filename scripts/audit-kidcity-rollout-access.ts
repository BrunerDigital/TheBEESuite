import "./load-env";
import { pathToFileURL } from "node:url";
import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import {
  kidCityCorporateRolloutSchools,
  normalizeRolloutEmail,
  rolloutSchoolEmailCandidates,
} from "@/lib/kidcity-corporate-rollout";
import { prisma } from "@/lib/prisma";
import { getSupabaseAuthConfig } from "@/lib/supabase-auth";

const CORPORATE_SCHOOLS_EMAIL = "corpschools@kidcityusa.com";
const BUSY_BEES_PASSWORD = "BusyBees";

function activeAuthUser(user: SupabaseUser | undefined) {
  return Boolean(
    user?.email_confirmed_at
    && (!user.banned_until || new Date(user.banned_until) <= new Date()),
  );
}

async function listAuthUsers() {
  const { url, key } = getSupabaseAuthConfig("service");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const users: SupabaseUser[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function verifyPassword(email: string) {
  const { url, key } = getSupabaseAuthConfig("anon");
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: BUSY_BEES_PASSWORD,
  });
  const ok = !error && data.user?.email?.toLowerCase() === email;
  if (ok) await client.auth.signOut();
  return ok;
}

export async function auditKidCityRolloutAccess() {
  const verifyBusyBees = process.argv.includes("--verify-busybees");
  const centers = await prisma.center.findMany({
    where: { status: "active" },
    select: { id: true, name: true, email: true, crmLocationId: true },
  });
  const centersByEmail = new Map(
    centers
      .filter((center) => normalizeRolloutEmail(center.email))
      .map((center) => [normalizeRolloutEmail(center.email), center]),
  );
  const matches = kidCityCorporateRolloutSchools.map((school) => ({
    school,
    center: rolloutSchoolEmailCandidates(school)
      .map((email) => centersByEmail.get(email))
      .find((center) => Boolean(center)) ?? null,
  }));
  const matchedCenterIds = matches.flatMap(({ center }) => center ? [center.id] : []);
  const relevantEmails = [
    CORPORATE_SCHOOLS_EMAIL,
    ...matches.map(({ school, center }) => normalizeRolloutEmail(center?.email ?? school.canonicalEmail)),
  ];
  const [appUsers, authUsers] = await Promise.all([
    prisma.user.findMany({
      where: { email: { in: relevantEmails } },
      select: {
        email: true,
        role: true,
        isActive: true,
        mustResetPassword: true,
        accessGrants: {
          where: { isActive: true },
          select: { centerId: true, role: true, scopeType: true },
        },
      },
    }),
    listAuthUsers(),
  ]);
  const appByEmail = new Map(appUsers.map((user) => [normalizeRolloutEmail(user.email), user]));
  const authByEmail = new Map(
    authUsers
      .filter((user) => normalizeRolloutEmail(user.email))
      .map((user) => [normalizeRolloutEmail(user.email), user]),
  );
  const passwordResults = new Map<string, boolean>();
  if (verifyBusyBees) {
    for (const email of relevantEmails) {
      passwordResults.set(email, await verifyPassword(email));
    }
  }

  const schools = matches.map(({ school, center }) => {
    const email = normalizeRolloutEmail(center?.email ?? school.canonicalEmail);
    const appUser = appByEmail.get(email);
    const authUser = authByEmail.get(email);
    const centerGrantReady = Boolean(center && appUser?.accessGrants.some((grant) => (
      grant.centerId === center.id
      && grant.scopeType === "CENTER"
      && grant.role === UserRole.CENTER_DIRECTOR
    )));
    const issues = [
      ...(!center ? ["rollout center was not matched"] : []),
      ...(!appUser ? ["application user is missing"] : []),
      ...(appUser && (!appUser.isActive || appUser.role !== UserRole.CENTER_DIRECTOR)
        ? ["application user is not an active center director"]
        : []),
      ...(!centerGrantReady ? ["active center-director grant is missing"] : []),
      ...(!activeAuthUser(authUser) ? ["confirmed active Supabase Auth user is missing"] : []),
      ...(verifyBusyBees && !passwordResults.get(email) ? ["BusyBees password login failed"] : []),
    ];
    return {
      location: school.location,
      email,
      excludedFromInvitationWave: school.location === "Kokomo",
      centerId: center?.id ?? null,
      centerLocationId: center?.crmLocationId ?? null,
      applicationRole: appUser?.role ?? null,
      mustResetPassword: appUser?.mustResetPassword ?? null,
      busyBeesLoginVerified: verifyBusyBees ? passwordResults.get(email) === true : null,
      issues,
    };
  });

  const corporateUser = appByEmail.get(CORPORATE_SCHOOLS_EMAIL);
  const corporateAuth = authByEmail.get(CORPORATE_SCHOOLS_EMAIL);
  const corporateCenterGrants = new Set(
    corporateUser?.accessGrants
      .filter((grant) => (
        grant.scopeType === "CENTER"
        && grant.role === UserRole.BILLING_ADMIN
        && grant.centerId
      ))
      .map((grant) => grant.centerId) ?? [],
  );
  const corporateIssues = [
    ...(!corporateUser ? ["application user is missing"] : []),
    ...(corporateUser && (!corporateUser.isActive || corporateUser.role !== UserRole.BILLING_ADMIN)
      ? ["application user is not an active billing administrator"]
      : []),
    ...(!matchedCenterIds.every((centerId) => corporateCenterGrants.has(centerId))
      ? ["one or more corporate rollout center grants are missing"]
      : []),
    ...(!activeAuthUser(corporateAuth) ? ["confirmed active Supabase Auth user is missing"] : []),
    ...(verifyBusyBees && !passwordResults.get(CORPORATE_SCHOOLS_EMAIL)
      ? ["BusyBees password login failed"]
      : []),
  ];
  const corporate = {
    email: CORPORATE_SCHOOLS_EMAIL,
    applicationRole: corporateUser?.role ?? null,
    mustResetPassword: corporateUser?.mustResetPassword ?? null,
    activeRolloutCenterGrants: matchedCenterIds.filter((centerId) => corporateCenterGrants.has(centerId)).length,
    expectedRolloutCenterGrants: kidCityCorporateRolloutSchools.length,
    busyBeesLoginVerified: verifyBusyBees
      ? passwordResults.get(CORPORATE_SCHOOLS_EMAIL) === true
      : null,
    issues: corporateIssues,
  };
  const summary = {
    ok: corporateIssues.length === 0 && schools.every((school) => school.issues.length === 0),
    passwordVerificationRequested: verifyBusyBees,
    corporate,
    schools,
    totals: {
      rolloutSchools: schools.length,
      matchedCenters: schools.filter((school) => school.centerId).length,
      readySchoolAccounts: schools.filter((school) => school.issues.length === 0).length,
      busyBeesSchoolLoginsVerified: schools.filter((school) => school.busyBeesLoginVerified).length,
    },
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
  return summary;
}

async function main() {
  try {
    await auditKidCityRolloutAccess();
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
