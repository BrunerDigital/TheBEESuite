import "./load-env";
import { prisma } from "@/lib/prisma";
import { hasStripeBillingConfig, hasSupabaseAuthConfig } from "@/lib/readiness-guardrails";
import { isSupabaseStorageConfigured } from "@/lib/supabase-storage";

type CheckStatus = "pass" | "warn" | "fail";

type Check = {
  status: CheckStatus;
  label: string;
  detail: string;
};

function check(status: CheckStatus, label: string, detail: string): Check {
  return { status, label, detail };
}

function envPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

function printSection(title: string, checks: Check[]) {
  console.log(`\n${title}`);
  for (const item of checks) {
    const marker = item.status === "pass" ? "PASS" : item.status === "warn" ? "WARN" : "FAIL";
    console.log(`- ${marker}: ${item.label} - ${item.detail}`);
  }
}

async function main() {
  const configChecks: Check[] = [
    check(envPresent("DATABASE_URL") ? "pass" : "fail", "DATABASE_URL", envPresent("DATABASE_URL") ? "Configured." : "Missing. Migrations, seed, readiness, and live data checks cannot run."),
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

  const [
    tenantCount,
    activeCenterCount,
    activeUserCount,
    familyCount,
    childCount,
    guardianCount,
    guardiansWithPins,
    centerlessFamilies,
    activeCentersWithoutClassrooms,
    openInvoices,
    pendingIncidents,
    mediaReviewQueue,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.center.count({ where: { status: "active" } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.family.count(),
    prisma.child.count(),
    prisma.guardian.count(),
    prisma.guardian.count({ where: { checkInPinHash: { not: null } } }),
    prisma.family.count({ where: { centerId: null } }),
    prisma.center.count({ where: { status: "active", classrooms: { none: {} } } }),
    prisma.invoice.count({ where: { status: "OPEN" } }),
    prisma.incidentReport.count({ where: { adminReviewStatus: "pending" } }),
    prisma.childMedia.count({ where: { status: "permission_review", sharedWithParents: false } }),
  ]);

  const childClassroomPairs = await prisma.child.findMany({
    where: { classroomId: { not: null } },
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

  dataChecks = [
    check(tenantCount > 0 ? "pass" : "fail", "Tenants", `${tenantCount} tenant record(s).`),
    check(activeCenterCount > 0 ? "pass" : "fail", "Active centers", `${activeCenterCount} active center(s).`),
    check(activeUserCount > 0 ? "pass" : "fail", "Active users", `${activeUserCount} active user account(s).`),
    check(familyCount > 0 ? "pass" : "warn", "Families", `${familyCount} family record(s).`),
    check(childCount > 0 ? "pass" : "warn", "Children", `${childCount} child record(s).`),
    check(guardianCount > 0 ? "pass" : "warn", "Guardians", `${guardianCount} guardian record(s).`),
    check(guardiansWithPins > 0 ? "pass" : "warn", "Guardian kiosk PINs", `${guardiansWithPins} guardian(s) have kiosk PINs.`),
    check(centerlessFamilies === 0 ? "pass" : "fail", "Centerless families", `${centerlessFamilies} family record(s) are missing a center.`),
    check(childClassroomMismatches.length === 0 ? "pass" : "fail", "Child/classroom center consistency", `${childClassroomMismatches.length} child record(s) are linked to a classroom from another center.`),
    check(activeCentersWithoutClassrooms === 0 ? "pass" : "warn", "Classroom setup", `${activeCentersWithoutClassrooms} active center(s) have no classrooms.`),
    check(openInvoices >= 0 ? "pass" : "warn", "Open invoices", `${openInvoices} open invoice(s).`),
    check(pendingIncidents === 0 ? "pass" : "warn", "Pending incident review", `${pendingIncidents} incident(s) need review.`),
    check(mediaReviewQueue === 0 ? "pass" : "warn", "Parent media review", `${mediaReviewQueue} photo(s) are waiting for permission review.`),
  ];

  printSection("Configuration", configChecks);
  printSection("Database", databaseChecks);
  printSection("Pilot Data", dataChecks);

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
