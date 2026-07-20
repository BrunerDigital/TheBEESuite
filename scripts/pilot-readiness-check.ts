import "./load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isActivePublicSchoolCandidate } from "@/lib/active-school-locations";
import { prisma } from "@/lib/prisma";
import { databaseUrlEnvNames, hasDatabaseConfig, hasStripeBillingConfig, hasSupabaseAuthConfig } from "@/lib/readiness-guardrails";
import { readSchoolEin } from "@/lib/school-tax-id";
import { isSupabaseStorageConfigured } from "@/lib/supabase-storage";

type CheckStatus = "pass" | "warn" | "fail";
type ReadinessStatus = "ready" | "ready_with_warnings" | "blocked";
export type RolloutModule = "setup" | "parent-invitations" | "kiosk" | "billing";
type ModuleGateStatus = "data_ready" | "blocked" | "manual_approval_required";

export type Check = {
  status: CheckStatus;
  label: string;
  detail: string;
};

export type CenterRolloutGap = {
  centerId: string;
  label: string;
  locationId: string;
  identity: {
    address: string | null;
    phone: string | null;
    email: string | null;
    timezone: string;
    organizationId: string;
    organizationName: string;
    tenantId: string;
    tenantName: string;
    ownerGroupId: string | null;
    ownerGroupName: string | null;
    taxIdConfigured: boolean;
  };
  classroomCount: number;
  staffCount: number;
  staffWithoutClassroomCount: number;
  familyCount: number;
  childCount: number;
  childrenWithoutClassroomCount: number;
  guardianCount: number;
  guardianLoginCount: number;
  guardianPinCount: number;
  authorizedPickupCount: number;
  directorAccessCount: number;
  moduleGates: Record<RolloutModule, {
    status: ModuleGateStatus;
    automatedGaps: string[];
    separateApprovalRequired: boolean;
    detail: string;
  }>;
  gaps: string[];
};

type ChildClassroomMismatch = {
  id: string;
  fullName: string;
  familyCenterId: string | null;
  classroomCenterId: string | null;
};

export type PilotReadinessArgs = {
  all: boolean;
  json: boolean;
  failOnWarn: boolean;
  schools: string[];
  modules: RolloutModule[];
  outputPath?: string;
};

type PilotReadinessReport = {
  generatedAt: string;
  selection: {
    requestedSchools: string[];
    selectedCenterCount: number;
    modules: RolloutModule[];
    controls: string;
  };
  summary: {
    status: ReadinessStatus;
    label: string;
    failures: number;
    warnings: number;
    rolloutGapCount: number;
    childClassroomMismatchCount: number;
  };
  checks: {
    configuration: Check[];
    database: Check[];
    pilotData: Check[];
  };
  rolloutGaps: CenterRolloutGap[];
  childClassroomMismatches: ChildClassroomMismatch[];
};

function check(status: CheckStatus, label: string, detail: string): Check {
  return { status, label, detail };
}

function envPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

const DEMO_TENANT_SLUGS = ["bee-suite-demo", "bee-suite-isolated-demo"];
export const rolloutModules: RolloutModule[] = ["setup", "parent-invitations", "kiosk", "billing"];

function optionValue(argv: string[], index: number, option: string) {
  const value = argv[index + 1]?.trim();
  if (!value || value.startsWith("-")) throw new Error(`${option} requires a value.`);
  return value;
}

function addModules(args: PilotReadinessArgs, value: string) {
  for (const raw of value.split(",")) {
    const module = raw.trim() as RolloutModule;
    if (!rolloutModules.includes(module)) {
      throw new Error(`Unknown rollout module: ${raw.trim()}. Choose from ${rolloutModules.join(", ")}.`);
    }
    if (!args.modules.includes(module)) args.modules.push(module);
  }
}

export function parsePilotReadinessArgs(argv = process.argv.slice(2)): PilotReadinessArgs {
  const args: PilotReadinessArgs = { all: false, json: false, failOnWarn: false, schools: [], modules: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") {
      args.all = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--fail-on-warn") {
      args.failOnWarn = true;
    } else if (arg === "--school") {
      args.schools.push(optionValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith("--school=")) {
      const value = arg.slice("--school=".length).trim();
      if (!value) throw new Error("--school requires a value.");
      args.schools.push(value);
    } else if (arg === "--module") {
      addModules(args, optionValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith("--module=")) {
      const value = arg.slice("--module=".length).trim();
      if (!value) throw new Error("--module requires a value.");
      addModules(args, value);
    } else if (arg === "--output" || arg === "-o") {
      const value = argv[index + 1]?.trim();
      if (!value || value.startsWith("-")) throw new Error(`${arg} requires a file path.`);
      args.outputPath = value;
      index += 1;
    } else if (arg.startsWith("--output=")) {
      const value = arg.slice("--output=".length).trim();
      if (!value) throw new Error("--output requires a file path.");
      args.outputPath = value;
    } else {
      throw new Error(`Unknown pilot readiness option: ${arg}`);
    }
  }

  if (!args.modules.length) args.modules.push("setup");

  return args;
}

type SchoolSelectorCandidate = { id: string; name: string; locationId: string | null; crmLocationId: string | null };

export function selectSchoolIds(candidates: SchoolSelectorCandidate[], selectors: string[]) {
  if (!selectors.length) return candidates.map((center) => center.id);
  const selected = new Set<string>();
  for (const selector of selectors) {
    const normalized = selector.trim().toLocaleLowerCase();
    const matches = candidates.filter((center) =>
      [center.id, center.name, center.locationId, center.crmLocationId]
        .some((value) => value?.trim().toLocaleLowerCase() === normalized));
    if (!matches.length) throw new Error(`Selected school was not found among active centers: ${selector}`);
    if (matches.length > 1) throw new Error(`Selected school is ambiguous; use the center ID: ${selector}`);
    selected.add(matches[0].id);
  }
  return [...selected];
}

export function buildModuleGates(input: {
  setupGaps: string[];
  guardianCount: number;
  guardianLoginCount: number;
  guardianPinCount: number;
}): CenterRolloutGap["moduleGates"] {
  const invitationGaps = [...input.setupGaps];
  if (input.guardianCount === 0) invitationGaps.push("no guardians available for invitation review");
  if (input.guardianLoginCount < input.guardianCount) {
    invitationGaps.push(`${input.guardianCount - input.guardianLoginCount} guardian(s) are not linked to login users`);
  }
  const kioskGaps = [...input.setupGaps];
  if (input.guardianCount === 0) kioskGaps.push("no guardians available for kiosk credential review");
  if (input.guardianPinCount < input.guardianCount) {
    kioskGaps.push(`${input.guardianCount - input.guardianPinCount} guardian(s) do not have kiosk PINs`);
  }

  return {
    setup: {
      status: input.setupGaps.length ? "blocked" : "data_ready",
      automatedGaps: input.setupGaps,
      separateApprovalRequired: false,
      detail: "Setup readiness covers identity, structure, records, assignments, and access signals; reconciliation and written cutover approval remain external.",
    },
    "parent-invitations": {
      status: invitationGaps.length ? "blocked" : "manual_approval_required",
      automatedGaps: invitationGaps,
      separateApprovalRequired: true,
      detail: "Invitation readiness never sends invitations and requires a separate director/corporate activation decision.",
    },
    kiosk: {
      status: kioskGaps.length ? "blocked" : "manual_approval_required",
      automatedGaps: kioskGaps,
      separateApprovalRequired: true,
      detail: "Kiosk readiness never creates or activates PINs and requires separate custody, pickup, device, and workflow approval.",
    },
    billing: {
      status: input.setupGaps.length ? "blocked" : "manual_approval_required",
      automatedGaps: input.setupGaps,
      separateApprovalRequired: true,
      detail: "This report does not prove Stripe, balances, billing preview, payments, or payouts and never enables billing.",
    },
  };
}

export function readinessStatus(failures: number, warnings: number): ReadinessStatus {
  if (failures > 0) return "blocked";
  if (warnings > 0) return "ready_with_warnings";
  return "ready";
}

function readinessLabel(status: ReadinessStatus) {
  if (status === "blocked") return "BLOCKED";
  if (status === "ready_with_warnings") return "READY WITH WARNINGS";
  return "READY";
}

function printSection(title: string, checks: Check[]) {
  console.log(`\n${title}`);
  for (const item of checks) {
    const marker = item.status === "pass" ? "PASS" : item.status === "warn" ? "WARN" : "FAIL";
    console.log(`- ${marker}: ${item.label} - ${item.detail}`);
  }
}

function printRolloutGaps(rows: CenterRolloutGap[], all: boolean) {
  const rowsWithGaps = rows.filter((row) => row.gaps.length);
  const limit = all ? rowsWithGaps.length : 20;
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

function buildReport(input: {
  configChecks: Check[];
  databaseChecks: Check[];
  dataChecks: Check[];
  rolloutGapRows: CenterRolloutGap[];
  childClassroomMismatches: ChildClassroomMismatch[];
  args: PilotReadinessArgs;
}): PilotReadinessReport {
  const allChecks = [...input.configChecks, ...input.databaseChecks, ...input.dataChecks];
  const failures = allChecks.filter((item) => item.status === "fail").length;
  const warnings = allChecks.filter((item) => item.status === "warn").length;
  const status = readinessStatus(failures, warnings);

  return {
    generatedAt: new Date().toISOString(),
    selection: {
      requestedSchools: input.args.schools,
      selectedCenterCount: input.rolloutGapRows.length,
      modules: input.args.modules,
      controls: "Automated gates are read-only. Parent invitations, kiosk activation, billing, and ProCare cutover require separate written approvals.",
    },
    summary: {
      status,
      label: readinessLabel(status),
      failures,
      warnings,
      rolloutGapCount: input.rolloutGapRows.filter((row) => row.gaps.length).length,
      childClassroomMismatchCount: input.childClassroomMismatches.length,
    },
    checks: {
      configuration: input.configChecks,
      database: input.databaseChecks,
      pilotData: input.dataChecks,
    },
    rolloutGaps: input.rolloutGapRows,
    childClassroomMismatches: input.childClassroomMismatches,
  };
}

function printReport(report: PilotReadinessReport, args: PilotReadinessArgs) {
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printSection("Configuration", report.checks.configuration);
  printSection("Database", report.checks.database);
  if (report.checks.pilotData.length) printSection("Pilot Data", report.checks.pilotData);
  printRolloutGaps(report.rolloutGaps, args.all);

  console.log("\nSelected Module Gates");
  for (const row of report.rolloutGaps) {
    for (const module of report.selection.modules) {
      const gate = row.moduleGates[module];
      console.log(`- ${row.label}: ${module} = ${gate.status}${gate.automatedGaps.length ? ` (${gate.automatedGaps.join("; ")})` : ""}`);
    }
  }
  console.log(`- CONTROL: ${report.selection.controls}`);

  if (report.childClassroomMismatches.length) {
    console.log("\nChild/classroom mismatches");
    for (const child of report.childClassroomMismatches.slice(0, 10)) {
      console.log(`- ${child.id}: ${child.fullName}`);
    }
  }

  console.log(`\nPilot readiness result: ${report.summary.label}`);
  console.log(`Failures: ${report.summary.failures}; warnings: ${report.summary.warnings}.`);
}

function writeReport(report: PilotReadinessReport, outputPath: string) {
  const absolutePath = resolve(outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return absolutePath;
}

async function main() {
  const args = parsePilotReadinessArgs();
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
    const report = buildReport({
      configChecks,
      databaseChecks,
      dataChecks,
      rolloutGapRows: [],
      childClassroomMismatches: [],
      args,
    });
    printReport(report, args);
    if (args.outputPath) {
      const absolutePath = writeReport(report, args.outputPath);
      if (!args.json) console.log(`Wrote readiness report to ${absolutePath}`);
    }
    process.exitCode = 1;
    return;
  }

  const liveTenantWhere = { slug: { notIn: DEMO_TENANT_SLUGS } };
  const liveCenters = await prisma.center.findMany({
    where: { organization: { tenant: liveTenantWhere } },
    select: { id: true, name: true, crmLocationId: true, locationId: true, status: true },
  });
  const activeLiveCenters = liveCenters.filter(isActivePublicSchoolCandidate);
  const activeLiveCenterIds = selectSchoolIds(activeLiveCenters, args.schools);
  const liveCenterIds = activeLiveCenterIds;
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
    args.schools.length ? Promise.resolve(0) : prisma.family.count({ where: { centerId: null } }),
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
  const childClassroomMismatches = childClassroomPairs
    .filter((child) => child.family.centerId && child.classroom?.centerId && child.family.centerId !== child.classroom.centerId)
    .map((child) => ({
      id: child.id,
      fullName: child.fullName,
      familyCenterId: child.family.centerId,
      classroomCenterId: child.classroom?.centerId ?? null,
    }));

  const [
    rolloutCenters,
    rolloutFamilies,
    rolloutChildren,
    rolloutGuardians,
    rolloutStaff,
    rolloutPickups,
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
        address: true,
        phone: true,
        email: true,
        timezone: true,
        organizationId: true,
        ownerGroupId: true,
        customFields: true,
        organization: { select: { name: true, tenant: { select: { id: true, name: true } } } },
        ownerGroup: { select: { name: true } },
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
    prisma.staffProfile.findMany({
      where: { centerId: { in: activeLiveCenterIds } },
      select: { centerId: true, classroomId: true },
    }),
    prisma.authorizedPickup.findMany({
      where: { family: { centerId: { in: activeLiveCenterIds } } },
      select: { family: { select: { centerId: true } } },
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

  const staffWithoutClassroomByCenter = new Map<string, number>();
  for (const staff of rolloutStaff) {
    if (!staff.classroomId) {
      staffWithoutClassroomByCenter.set(staff.centerId, (staffWithoutClassroomByCenter.get(staff.centerId) ?? 0) + 1);
    }
  }

  const authorizedPickupCountByCenter = new Map<string, number>();
  for (const pickup of rolloutPickups) {
    const centerId = pickup.family.centerId;
    if (centerId) authorizedPickupCountByCenter.set(centerId, (authorizedPickupCountByCenter.get(centerId) ?? 0) + 1);
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
    const staffWithoutClassroomCount = staffWithoutClassroomByCenter.get(center.id) ?? 0;
    const familyCount = familyCountByCenter.get(center.id) ?? 0;
    const childCount = childCountByCenter.get(center.id) ?? 0;
    const childrenWithoutClassroomCount = childrenWithoutClassroomByCenter.get(center.id) ?? 0;
    const guardianCount = guardianCountByCenter.get(center.id) ?? 0;
    const guardianLoginCount = guardianLoginCountByCenter.get(center.id) ?? 0;
    const guardianPinCount = guardianPinCountByCenter.get(center.id) ?? 0;
    const authorizedPickupCount = authorizedPickupCountByCenter.get(center.id) ?? 0;
    const directorAccessCount = directorAccessCountByCenter.get(center.id) ?? 0;
    const setupGaps: string[] = [];

    if (!center.address) setupGaps.push("missing school address");
    if (!center.phone) setupGaps.push("missing school phone");
    if (!center.email) setupGaps.push("missing school notification email");
    if (!center.timezone) setupGaps.push("missing school timezone");
    if (!center.locationId && !center.crmLocationId) setupGaps.push("missing school/CRM location ID");
    if (!center.ownerGroupId) setupGaps.push("missing owner group");
    if (classroomCount === 0) setupGaps.push("no classrooms");
    if (staffCount === 0) setupGaps.push("no staff/teacher profiles");
    if (familyCount === 0) setupGaps.push("no imported families");
    if (childCount === 0) setupGaps.push("no imported children");
    if (childrenWithoutClassroomCount > 0) setupGaps.push(`${childrenWithoutClassroomCount} child(ren) without classroom assignment`);
    if (guardianCount === 0) setupGaps.push("no guardian records");
    if (directorAccessCount === 0) setupGaps.push("no center director/billing access grant");

    const moduleGates = buildModuleGates({ setupGaps, guardianCount, guardianLoginCount, guardianPinCount });
    const gaps = Array.from(new Set(args.modules.flatMap((module) => moduleGates[module].automatedGaps)));

    return {
      centerId: center.id,
      label: center.name,
      locationId: center.locationId || center.crmLocationId || center.id,
      identity: {
        address: center.address,
        phone: center.phone,
        email: center.email,
        timezone: center.timezone,
        organizationId: center.organizationId,
        organizationName: center.organization.name,
        tenantId: center.organization.tenant.id,
        tenantName: center.organization.tenant.name,
        ownerGroupId: center.ownerGroupId,
        ownerGroupName: center.ownerGroup?.name ?? null,
        taxIdConfigured: Boolean(readSchoolEin(center.customFields)),
      },
      classroomCount,
      staffCount,
      staffWithoutClassroomCount,
      familyCount,
      childCount,
      childrenWithoutClassroomCount,
      guardianCount,
      guardianLoginCount,
      guardianPinCount,
      authorizedPickupCount,
      directorAccessCount,
      moduleGates,
      gaps,
    };
  });

  const activeCentersWithoutGuardianLogins = rolloutGapRows.filter((row) => row.guardianLoginCount < row.guardianCount).length;
  const activeCentersWithoutGuardianPins = rolloutGapRows.filter((row) => row.guardianPinCount < row.guardianCount).length;
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
    ...args.modules.map((module) => {
      const blocked = rolloutGapRows.filter((row) => row.moduleGates[module].status === "blocked").length;
      const manual = rolloutGapRows.filter((row) => row.moduleGates[module].status === "manual_approval_required").length;
      return check(
        blocked ? "warn" : "pass",
        `Module gate: ${module}`,
        `${blocked} selected school(s) blocked by automated data signals; ${manual} require separate manual approval. This check does not activate the module.`,
      );
    }),
  ];

  const failures = [...configChecks, ...databaseChecks, ...dataChecks].filter((item) => item.status === "fail");
  const warnings = [...configChecks, ...databaseChecks, ...dataChecks].filter((item) => item.status === "warn");
  const report = buildReport({
    configChecks,
    databaseChecks,
    dataChecks,
    rolloutGapRows,
    childClassroomMismatches,
    args,
  });
  printReport(report, args);
  if (args.outputPath) {
    const absolutePath = writeReport(report, args.outputPath);
    if (!args.json) console.log(`Wrote readiness report to ${absolutePath}`);
  }
  if (failures.length || (args.failOnWarn && warnings.length)) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
