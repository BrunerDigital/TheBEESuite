import "./load-env";
import { isActivePublicSchoolCandidate } from "@/lib/active-school-locations";
import { prisma } from "@/lib/prisma";
import { databaseUrlEnvNames, hasDatabaseConfig, hasStripeBillingConfig, hasSupabaseAuthConfig } from "@/lib/readiness-guardrails";
import { isSupabaseStorageConfigured } from "@/lib/supabase-storage";

type CheckStatus = "pass" | "warn" | "fail";

type Check = {
  status: CheckStatus;
  label: string;
  detail: string;
};

type CenterRolloutGap = {
  centerId: string;
  label: string;
  locationId: string;
  classroomCount: number;
  staffCount: number;
  familyCount: number;
  childCount: number;
  childrenWithoutClassroomCount: number;
  guardianCount: number;
  guardianLoginCount: number;
  guardianPinCount: number;
  directorAccessCount: number;
  gaps: string[];
};

function check(status: CheckStatus, label: string, detail: string): Check {
  return { status, label, detail };
}

function envPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

const DEMO_TENANT_SLUGS = ["bee-suite-demo", "bee-suite-isolated-demo"];

function printSection(title: string, checks: Check[]) {
  console.log(`\n${title}`);
  for (const item of checks) {
    const marker = item.status === "pass" ? "PASS" : item.status === "warn" ? "WARN" : "FAIL";
    console.log(`- ${marker}: ${item.label} - ${item.detail}`);
  }
}

function printRolloutGaps(rows: CenterRolloutGap[]) {
  const rowsWithGaps = rows.filter((row) => row.gaps.length);
  const limit = process.argv.includes("--all") ? rowsWithGaps.length : 20;
  console.log("\nPer-School Rollout Gaps");
  if (!rowsWithGaps.length) {
    console.log("- PASS: Every active center has the core classroom, staff, family, parent-login, PIN, and director-access setup signals.");
    return;
  }

  console.log(`- WARN: ${rowsWithGaps.length} active center(s) still need setup before full feature rollout.`);
  for (const row of rowsWithGaps.slice(0, limit)) {
    console.log(
      `- WARN: ${row.label} (${row.locationId}) - ${row.gaps.join("; ")} ` +
        `[classrooms=${row.classroomCount}, staff=${row.staffCount}, families=${row.familyCount}, children=${row.childCount}, guardianLogins=${row.guardianLoginCount}, guardianPins=${row.guardianPinCount}]`,
    );
  }
  if (rowsWithGaps.length > limit) {
    console.log(`- WARN: ${rowsWithGaps.length - limit} additional center(s) omitted from console output. Rerun with -- --all to print every center.`);
  }
}

async function main() {
  const configChecks: Check[] = [
    check(
      hasDatabaseConfig(process.env) ? "pass" : "fail",
      "Database URL",
      hasDatabaseConfig(process.env)
        ? `Configured through ${databaseUrlEnvNames.find((name) => envPresent(name))}.`
        : `Missing one of ${databaseUrlEnvNames.join(", ")}. Migrations, seed, readiness, and live data checks cannot run.`,
    ),
    check(envPresent("AUTH_SECRET") ? "pass" : "fail", "AUTH_SECRET", envPresent("AUTH_SECRET") ? "Configured." : "Missing. Production sessions must not use the dev fallback."),
    check(envPresent("PIN_HASH_SECRET") ? "pass" : "fail", "PIN_HASH_SECRET", envPresent("PIN_HASH_SECRET") ? "Configured." : "Missing. Guardian kiosk PIN hashing must fail closed in production."),
    check(hasSupabaseAuthConfig(process.env) ? "pass" : "fail", "Supabase Auth", hasSupabaseAuthConfig(process.env) ? "URL, anon key, and service role key are configured." : "Missing Supabase URL, anon key, or service role key."),
    check(isSupabaseStorageConfigured() ? "pass" : "warn", "Supabase Storage", isSupabaseStorageConfigured() ? "Child media storage can be signed/uploaded server-side." : "Missing storage config. Teacher photo upload and parent media review need verification."),
    check(hasStripeBillingConfig(process.env) ? "pass" : "warn", "Stripe billing", hasStripeBillingConfig(process.env) ? "Stripe secret and webhook secret are configured." : "Missing Stripe secret or webhook secret. Parent payments should stay disabled."),
  ];

  const databaseChecks: Check[] = [];
  let dataChecks: Check[] = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseChecks.push(check("pass", "Database connectivity", "Prisma can query the configured database."));
  } catch (error) {
    databaseChecks.push(check("fail", "Database connectivity", error instanceof Error ? error.message : "Database query failed."));
    printSection("Configuration", configChecks);
    printSection("Database", databaseChecks);
    process.exitCode = 1;
    return;
  }

  const liveTenantWhere = { slug: { notIn: DEMO_TENANT_SLUGS } };
  const liveCenters = await prisma.center.findMany({
    where: { organization: { tenant: liveTenantWhere } },
    select: { id: true, name: true, crmLocationId: true, locationId: true, status: true },
  });
  const liveCenterIds = liveCenters.map((center) => center.id);
  const activeLiveCenterIds = liveCenters.filter(isActivePublicSchoolCandidate).map((center) => center.id);
  const activeSchoolCenterCount = activeLiveCenterIds.length;

  const [
    tenantCount,
    activeUserCount,
    familyCount,
    childCount,
    guardianCount,
    guardiansWithPins,
    centerlessFamilies,
    activeCentersWithoutClassrooms,
    activeCentersWithoutStaff,
    openInvoices,
    pendingIncidents,
    mediaReviewQueue,
  ] = await Promise.all([
    prisma.tenant.count({ where: liveTenantWhere }),
    prisma.user.count({ where: { isActive: true, tenant: liveTenantWhere } }),
    prisma.family.count({ where: { centerId: { in: liveCenterIds } } }),
    prisma.child.count({ where: { family: { centerId: { in: liveCenterIds } } } }),
    prisma.guardian.count({ where: { family: { centerId: { in: liveCenterIds } } } }),
    prisma.guardian.count({ where: { checkInPinHash: { not: null }, family: { centerId: { in: liveCenterIds } } } }),
    prisma.family.count({ where: { centerId: null } }),
    prisma.center.count({ where: { id: { in: activeLiveCenterIds }, classrooms: { none: {} } } }),
    prisma.center.count({ where: { id: { in: activeLiveCenterIds }, staff: { none: {} } } }),
    prisma.invoice.count({ where: { status: "OPEN", billingAccount: { family: { centerId: { in: liveCenterIds } } } } }),
    prisma.incidentReport.count({ where: { adminReviewStatus: "pending", child: { family: { centerId: { in: liveCenterIds } } } } }),
    prisma.childMedia.count({ where: { status: "permission_review", sharedWithParents: false, child: { family: { centerId: { in: liveCenterIds } } } } }),
  ]);

  const childClassroomPairs = await prisma.child.findMany({
    where: { classroomId: { not: null }, family: { centerId: { in: liveCenterIds } } },
    select: {
      id: true,
      fullName: true,
      family: { select: { centerId: true } },
      classroom: { select: { centerId: true } },
    },
  });
  const childClassroomMismatches = childClassroomPairs.filter((child) =>
    child.family.centerId && child.classroom?.centerId && child.family.centerId !== child.classroom.centerId,
  );

  const [
    rolloutCenters,
    rolloutFamilies,
    rolloutChildren,
    rolloutGuardians,
    rolloutAccessGrants,
  ] = await Promise.all([
    prisma.center.findMany({
      where: { id: { in: activeLiveCenterIds } },
      orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        crmLocationId: true,
        locationId: true,
        email: true,
        _count: { select: { classrooms: true, staff: true } },
      },
    }),
    prisma.family.findMany({
      where: { centerId: { in: activeLiveCenterIds } },
      select: { id: true, centerId: true },
    }),
    prisma.child.findMany({
      where: { family: { centerId: { in: activeLiveCenterIds } } },
      select: { id: true, classroomId: true, family: { select: { centerId: true } } },
    }),
    prisma.guardian.findMany({
      where: { family: { centerId: { in: activeLiveCenterIds } } },
      select: { userId: true, checkInPinHash: true, family: { select: { centerId: true } } },
    }),
    prisma.userAccessGrant.findMany({
      where: {
        centerId: { in: activeLiveCenterIds },
        isActive: true,
        user: { isActive: true },
      },
      select: { centerId: true, role: true },
    }),
  ]);

  const familyCountByCenter = new Map<string, number>();
  for (const family of rolloutFamilies) {
    if (!family.centerId) continue;
    familyCountByCenter.set(family.centerId, (familyCountByCenter.get(family.centerId) ?? 0) + 1);
  }

  const childCountByCenter = new Map<string, number>();
  const childrenWithoutClassroomByCenter = new Map<string, number>();
  for (const child of rolloutChildren) {
    const centerId = child.family.centerId;
    if (!centerId) continue;
    childCountByCenter.set(centerId, (childCountByCenter.get(centerId) ?? 0) + 1);
    if (!child.classroomId) {
      childrenWithoutClassroomByCenter.set(centerId, (childrenWithoutClassroomByCenter.get(centerId) ?? 0) + 1);
    }
  }

  const guardianCountByCenter = new Map<string, number>();
  const guardianLoginCountByCenter = new Map<string, number>();
  const guardianPinCountByCenter = new Map<string, number>();
  for (const guardian of rolloutGuardians) {
    const centerId = guardian.family.centerId;
    if (!centerId) continue;
    guardianCountByCenter.set(centerId, (guardianCountByCenter.get(centerId) ?? 0) + 1);
    if (guardian.userId) guardianLoginCountByCenter.set(centerId, (guardianLoginCountByCenter.get(centerId) ?? 0) + 1);
    if (guardian.checkInPinHash) guardianPinCountByCenter.set(centerId, (guardianPinCountByCenter.get(centerId) ?? 0) + 1);
  }

  const directorAccessCountByCenter = new Map<string, number>();
  for (const grant of rolloutAccessGrants) {
    if (!grant.centerId) continue;
    if (!["CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "BILLING_ADMIN"].includes(grant.role)) continue;
    directorAccessCountByCenter.set(grant.centerId, (directorAccessCountByCenter.get(grant.centerId) ?? 0) + 1);
  }

  const rolloutGapRows: CenterRolloutGap[] = rolloutCenters.map((center) => {
    const classroomCount = center._count.classrooms;
    const staffCount = center._count.staff;
    const familyCount = familyCountByCenter.get(center.id) ?? 0;
    const childCount = childCountByCenter.get(center.id) ?? 0;
    const childrenWithoutClassroomCount = childrenWithoutClassroomByCenter.get(center.id) ?? 0;
    const guardianCount = guardianCountByCenter.get(center.id) ?? 0;
    const guardianLoginCount = guardianLoginCountByCenter.get(center.id) ?? 0;
    const guardianPinCount = guardianPinCountByCenter.get(center.id) ?? 0;
    const directorAccessCount = directorAccessCountByCenter.get(center.id) ?? 0;
    const gaps: string[] = [];

    if (!center.email) gaps.push("missing school notification email");
    if (classroomCount === 0) gaps.push("no classrooms");
    if (staffCount === 0) gaps.push("no staff/teacher profiles");
    if (familyCount === 0) gaps.push("no imported families");
    if (childCount === 0) gaps.push("no imported children");
    if (childrenWithoutClassroomCount > 0) gaps.push(`${childrenWithoutClassroomCount} child(ren) without classroom assignment`);
    if (guardianCount > 0 && guardianLoginCount === 0) gaps.push("no linked parent/guardian login users");
    if (guardianCount > 0 && guardianPinCount === 0) gaps.push("no guardian kiosk PINs");
    if (directorAccessCount === 0) gaps.push("no center director/billing access grant");

    return {
      centerId: center.id,
      label: center.name,
      locationId: center.locationId || center.crmLocationId || center.id,
      classroomCount,
      staffCount,
      familyCount,
      childCount,
      childrenWithoutClassroomCount,
      guardianCount,
      guardianLoginCount,
      guardianPinCount,
      directorAccessCount,
      gaps,
    };
  });

  const activeCentersWithoutGuardianLogins = rolloutGapRows.filter((row) => row.guardianCount > 0 && row.guardianLoginCount === 0).length;
  const activeCentersWithoutGuardianPins = rolloutGapRows.filter((row) => row.guardianCount > 0 && row.guardianPinCount === 0).length;
  const activeCentersWithoutDirectorAccess = rolloutGapRows.filter((row) => row.directorAccessCount === 0).length;
  const activeCentersWithUnassignedChildren = rolloutGapRows.filter((row) => row.childrenWithoutClassroomCount > 0).length;

  dataChecks = [
    check(tenantCount > 0 ? "pass" : "fail", "Tenants", `${tenantCount} tenant record(s).`),
    check(activeSchoolCenterCount > 0 ? "pass" : "fail", "Active rollout schools", `${activeSchoolCenterCount} active school center(s).`),
    check(activeUserCount > 0 ? "pass" : "fail", "Active users", `${activeUserCount} active user account(s).`),
    check(familyCount > 0 ? "pass" : "warn", "Families", `${familyCount} family record(s).`),
    check(childCount > 0 ? "pass" : "warn", "Children", `${childCount} child record(s).`),
    check(guardianCount > 0 ? "pass" : "warn", "Guardians", `${guardianCount} guardian record(s).`),
    check(guardiansWithPins > 0 ? "pass" : "warn", "Guardian kiosk PINs", `${guardiansWithPins} guardian(s) have kiosk PINs.`),
    check(centerlessFamilies === 0 ? "pass" : "fail", "Centerless families", `${centerlessFamilies} family record(s) are missing a center.`),
    check(childClassroomMismatches.length === 0 ? "pass" : "fail", "Child/classroom center consistency", `${childClassroomMismatches.length} child record(s) are linked to a classroom from another center.`),
    check(activeCentersWithoutClassrooms === 0 ? "pass" : "warn", "Classroom setup", `${activeCentersWithoutClassrooms} active center(s) have no classrooms.`),
    check(activeCentersWithoutStaff === 0 ? "pass" : "warn", "Staff setup", `${activeCentersWithoutStaff} active center(s) have no staff/teacher profiles.`),
    check(activeCentersWithUnassignedChildren === 0 ? "pass" : "warn", "Child classroom assignment", `${activeCentersWithUnassignedChildren} active center(s) have children without classroom assignments.`),
    check(activeCentersWithoutGuardianLogins === 0 ? "pass" : "warn", "Parent login links", `${activeCentersWithoutGuardianLogins} active center(s) have guardians but no linked parent/guardian login users.`),
    check(activeCentersWithoutGuardianPins === 0 ? "pass" : "warn", "Guardian PIN rollout", `${activeCentersWithoutGuardianPins} active center(s) have guardians but no kiosk PINs.`),
    check(activeCentersWithoutDirectorAccess === 0 ? "pass" : "warn", "Director/billing access grants", `${activeCentersWithoutDirectorAccess} active center(s) have no active center director, assistant director, or billing grant.`),
    check(openInvoices >= 0 ? "pass" : "warn", "Open invoices", `${openInvoices} open invoice(s).`),
    check(pendingIncidents === 0 ? "pass" : "warn", "Pending incident review", `${pendingIncidents} incident(s) need review.`),
    check(mediaReviewQueue === 0 ? "pass" : "warn", "Parent media review", `${mediaReviewQueue} photo(s) are waiting for permission review.`),
  ];

  printSection("Configuration", configChecks);
  printSection("Database", databaseChecks);
  printSection("Pilot Data", dataChecks);
  printRolloutGaps(rolloutGapRows);

  if (childClassroomMismatches.length) {
    console.log("\nChild/classroom mismatches");
    for (const child of childClassroomMismatches.slice(0, 10)) {
      console.log(`- ${child.id}: ${child.fullName}`);
    }
  }

  const failures = [...configChecks, ...databaseChecks, ...dataChecks].filter((item) => item.status === "fail");
  const warnings = [...configChecks, ...databaseChecks, ...dataChecks].filter((item) => item.status === "warn");
  console.log(`\nPilot readiness result: ${failures.length ? "BLOCKED" : warnings.length ? "READY WITH WARNINGS" : "READY"}`);
  console.log(`Failures: ${failures.length}; warnings: ${warnings.length}.`);
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
