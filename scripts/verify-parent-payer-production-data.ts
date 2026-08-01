import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

const TEST_SOURCE = "bee_suite_parent_invite_test";
const CURRENT = ["enrolled", "active", "current"];
const TEST_PREFIX = "brendenbruner+bee-invite-";

function validEmail(value: string | null | undefined) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value?.trim().toLowerCase() ?? "");
}

function hasInvitePhone(value: string | null | undefined) {
  return (value?.replace(/\D/g, "") ?? "").length >= 4;
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function portalDisabled(customFields: unknown) {
  const root = jsonObject(customFields);
  const portal = jsonObject(root.parentPortal);
  return root.accessDisabled === true || root.loginEnabled === false || portal.accessDisabled === true || portal.loginEnabled === false;
}

async function authAliasCount() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials are required.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let count = 0;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    count += data.users.filter((user) => user.email?.toLowerCase().startsWith(TEST_PREFIX)).length;
    if (data.users.length < 1000) break;
  }
  return count;
}

async function main() {
  const centers = await prisma.center.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const centerName = new Map(centers.map((center) => [center.id, center.name]));
  const families = await prisma.family.findMany({
    where: { centerId: { in: centers.map((center) => center.id) }, children: { some: { enrollmentStatus: { in: CURRENT, mode: "insensitive" } } } },
    select: {
      id: true, centerId: true, name: true,
      children: { where: { enrollmentStatus: { in: CURRENT, mode: "insensitive" } }, select: { id: true, fullName: true } },
      guardians: { select: { id: true, fullName: true, email: true, phone: true, isBillingContact: true, customFields: true } },
    },
    orderBy: { name: "asc" },
  });

  const byCenter = Map.groupBy(families, (family) => family.centerId ?? "NO_CENTER");
  const schools = [...byCenter.entries()].map(([centerId, rows]) => {
    const exceptions = rows.flatMap((family) => {
      const payers = family.guardians.filter((guardian) => guardian.isBillingContact);
      const validPayers = payers.filter((guardian) => validEmail(guardian.email));
      const inviteContactPayers = validPayers.filter((guardian) => hasInvitePhone(guardian.phone));
      const enabledInvitePayers = inviteContactPayers.filter((guardian) => !portalDisabled(guardian.customFields));
      const issues: string[] = [];
      if (!payers.length) issues.push("no selected payer");
      else if (!validPayers.length) issues.push("selected payer has no valid email");
      else if (!inviteContactPayers.length) issues.push("selected payer with email has no usable phone for the setup PIN");
      if (inviteContactPayers.length && !enabledInvitePayers.length) issues.push("payer portal access is disabled");
      return issues.length ? [{ family: family.name, children: family.children.map((child) => child.fullName), payers: payers.map((payer) => ({ name: payer.fullName, hasValidEmail: validEmail(payer.email), hasInvitePhone: hasInvitePhone(payer.phone) })), issues }] : [];
    });
    return { school: centerName.get(centerId) ?? centerId, enrolledFamilies: rows.length, inviteReadyFamilies: rows.length - exceptions.length, exceptions };
  }).sort((left, right) => left.school.localeCompare(right.school));

  const [testFamilies, testChildren, testGuardians, testClassrooms, testAppUsers, testDeliveries, testSetupTokens, authAliases, repairAudits] = await Promise.all([
    prisma.family.count({ where: { sourceSystem: TEST_SOURCE } }),
    prisma.child.count({ where: { OR: [{ sourceSystem: TEST_SOURCE }, { family: { sourceSystem: TEST_SOURCE } }] } }),
    prisma.guardian.count({ where: { OR: [{ sourceSystem: TEST_SOURCE }, { family: { sourceSystem: TEST_SOURCE } }] } }),
    prisma.classroom.count({ where: { sourceSystem: TEST_SOURCE } }),
    prisma.user.count({ where: { email: { startsWith: TEST_PREFIX, mode: "insensitive" } } }),
    prisma.integrationDelivery.count({ where: { payload: { path: ["test"], equals: true } } }),
    prisma.parentPortalSetupToken.count({ where: { email: { startsWith: TEST_PREFIX, mode: "insensitive" } } }),
    authAliasCount(),
    prisma.auditLog.count({ where: { action: "parent_payer.production_data.repaired" } }),
  ]);

  console.log(JSON.stringify({
    activeSchools: centers.length,
    schoolsWithEnrolledFamilies: schools.length,
    schoolsFullyInviteReady: schools.filter((school) => school.exceptions.length === 0).length,
    schoolsNeedingReview: schools.filter((school) => school.exceptions.length > 0).length,
    enrolledFamilies: families.length,
    inviteReadyFamilies: schools.reduce((sum, school) => sum + school.inviteReadyFamilies, 0),
    familiesNeedingReview: schools.reduce((sum, school) => sum + school.exceptions.length, 0),
    schoolsNeedingReviewDetails: schools.filter((school) => school.exceptions.length > 0),
    syntheticRemaining: { families: testFamilies, children: testChildren, guardians: testGuardians, classrooms: testClassrooms, appUsers: testAppUsers, authUsers: authAliases, inviteDeliveries: testDeliveries, setupTokens: testSetupTokens },
    repairAuditRecords: repairAudits,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
