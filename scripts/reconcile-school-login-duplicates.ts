import "./load-env";

import { readFile } from "node:fs/promises";
import { createClient, type User as AuthUser } from "@supabase/supabase-js";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const TENANT_SLUG = "kid-city-usa";
const REPAIR_SOURCE = "datasheet_school_login_deduplication_2026_08_02";
const ALLOWED_DUPLICATE_USER_REFERENCES = new Set([
  "AuditLog.userId",
  "DeviceSession.revokedById",
  "DeviceSession.userId",
  "MessageTemplate.createdById",
  "Notification.userId",
  "UserAccessGrant.userId",
]);

type Database = Prisma.TransactionClient | typeof prisma;
type DatasheetSchool = { centerId: string; email: string };

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function clean(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function normalize(value: string | null | undefined) {
  return clean(value).toLowerCase();
}

function argValue(name: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function readDatasheet(path: string) {
  const text = await readFile(path, "utf8");
  const objects = text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line) as { kind?: string; sheet?: string; values?: unknown[][] }];
    } catch {
      return [];
    }
  });
  const table = objects.find((item) => item.kind === "table" && item.sheet === "School Directory");
  invariant(table?.values, "School Directory table was not found in the datasheet inspection.");
  const headerIndex = table.values.findIndex((row) => row[0] === "Tenant" && row.includes("Center ID (internal)"));
  invariant(headerIndex >= 0, "School Directory headers were not found in the datasheet inspection.");
  const headers = table.values[headerIndex].map((value) => String(value ?? ""));
  const centerIndex = headers.indexOf("Center ID (internal)");
  const emailIndex = headers.indexOf("School Contact Email");
  invariant(centerIndex >= 0 && emailIndex >= 0, "Datasheet center ID or school contact email column is missing.");
  const schools = table.values.slice(headerIndex + 1).flatMap((row) => {
    const centerId = clean(String(row[centerIndex] ?? ""));
    const email = normalize(String(row[emailIndex] ?? ""));
    return centerId && email ? [{ centerId, email }] : [];
  });
  return new Map(schools.map((school) => [school.centerId, school]));
}

async function listAuthUsers() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  invariant(supabaseUrl && serviceRoleKey, "Supabase URL and service-role credentials are required for read-only Auth verification.");
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const users: AuthUser[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function userReferenceCounts(db: Database, userIds: string[]) {
  const result = new Map(userIds.map((id) => [id, {} as Record<string, number>]));
  if (!userIds.length) return result;
  const references = await db.$queryRaw<Array<{ tableName: string; columnName: string }>>(Prisma.sql`
    SELECT child.relname AS "tableName", attribute.attname AS "columnName"
    FROM pg_constraint constraint_row
    JOIN pg_class child ON child.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = constraint_row.confrelid
    JOIN pg_attribute attribute ON attribute.attrelid = child.oid AND attribute.attnum = constraint_row.conkey[1]
    WHERE constraint_row.contype = 'f' AND parent.relname = 'User' AND namespace.nspname = 'public'
    ORDER BY child.relname, attribute.attname
  `);
  for (const reference of references) {
    invariant(/^[A-Za-z_][A-Za-z0-9_]*$/.test(reference.tableName), `Unsafe table name: ${reference.tableName}`);
    invariant(/^[A-Za-z_][A-Za-z0-9_]*$/.test(reference.columnName), `Unsafe column name: ${reference.columnName}`);
    const table = Prisma.raw(`"${reference.tableName}"`);
    const column = Prisma.raw(`"${reference.columnName}"`);
    const rows = await db.$queryRaw<Array<{ userId: string; rowCount: bigint }>>(Prisma.sql`
      SELECT ${column} AS "userId", COUNT(*)::bigint AS "rowCount"
      FROM ${table}
      WHERE ${column} IN (${Prisma.join(userIds)})
      GROUP BY ${column}
    `);
    for (const row of rows) result.get(row.userId)![`${reference.tableName}.${reference.columnName}`] = Number(row.rowCount);
  }
  return result;
}

async function readPlan(db: Database, datasheet: Map<string, DatasheetSchool>, authUsers: AuthUser[]) {
  const tenant = await db.tenant.findUnique({ where: { slug: TENANT_SLUG }, select: { id: true } });
  invariant(tenant, `Tenant ${TENANT_SLUG} was not found.`);
  const [centers, legacyQueueGrants] = await Promise.all([
    db.center.findMany({
      where: {
        status: "active",
        organization: { tenantId: tenant.id },
        NOT: [{ crmLocationId: "UNASSIGNED" }, { locationId: "UNASSIGNED" }],
      },
      orderBy: { crmLocationId: "asc" },
      select: {
        id: true,
        name: true,
        crmLocationId: true,
        email: true,
        accessGrants: {
          where: { isActive: true, scopeType: "CENTER", role: UserRole.CENTER_DIRECTOR, user: { isActive: true } },
          orderBy: { createdAt: "asc" },
          include: {
            user: {
              select: {
                id: true, email: true, name: true, role: true, tenantId: true, isActive: true,
                staffProfile: { select: { id: true } },
                _count: { select: { guardians: true } },
              },
            },
          },
        },
      },
    }),
    db.userAccessGrant.findMany({
      where: {
        isActive: true,
        scopeType: "CENTER",
        role: UserRole.CENTER_DIRECTOR,
        user: { isActive: true },
        center: { status: "lead_queue", organization: { tenantId: tenant.id } },
      },
      orderBy: [{ center: { crmLocationId: "asc" } }, { createdAt: "asc" }],
      include: {
        center: { select: { id: true, name: true, crmLocationId: true } },
        user: {
          select: {
            id: true, email: true, name: true, role: true, tenantId: true, isActive: true,
            staffProfile: { select: { id: true } },
            _count: { select: { guardians: true } },
          },
        },
      },
    }),
  ]);
  const authByEmail = new Map(authUsers.filter((user) => user.email).map((user) => [normalize(user.email), user]));
  const datasheetEmails = new Set(Array.from(datasheet.values()).map((school) => school.email));
  const errors: string[] = [];
  const rows = centers.map((center) => {
    const sheet = datasheet.get(center.id);
    if (!sheet) errors.push(`${center.crmLocationId}: missing from the school datasheet.`);
    const canonicalEmail = sheet?.email ?? "";
    if (normalize(center.email) !== canonicalEmail) errors.push(`${center.crmLocationId}: center email does not match the datasheet.`);
    const grantsByUser = Map.groupBy(center.accessGrants, (grant) => grant.user.id);
    const canonicalGroups = Array.from(grantsByUser.values()).filter((grants) => normalize(grants[0].user.email) === canonicalEmail);
    if (canonicalGroups.length !== 1) errors.push(`${center.crmLocationId}: expected one canonical app user for ${canonicalEmail}; found ${canonicalGroups.length}.`);
    const canonicalGrants = canonicalGroups[0] ?? [];
    const canonicalUser = canonicalGrants[0]?.user ?? null;
    const auth = authByEmail.get(canonicalEmail);
    const authCenterIds = Array.isArray(auth?.app_metadata?.bee_suite_center_ids)
      ? auth.app_metadata.bee_suite_center_ids.map(String)
      : [];
    if (!auth?.email_confirmed_at || !authCenterIds.includes(center.id)) {
      errors.push(`${center.crmLocationId}: canonical Auth identity is missing, unconfirmed, or lacks the center scope.`);
    }
    const duplicateGrants = canonicalGrants.slice(1);
    const duplicateUsers = Array.from(grantsByUser.values())
      .filter((grants) => normalize(grants[0].user.email) !== canonicalEmail)
      .map((grants) => ({ user: grants[0].user, grants }));
    for (const duplicate of duplicateUsers) {
      if (datasheetEmails.has(normalize(duplicate.user.email))) errors.push(`${duplicate.user.email}: duplicate account is canonical for another datasheet school.`);
      if (duplicate.user.role !== UserRole.CENTER_DIRECTOR || duplicate.user.tenantId !== tenant.id) errors.push(`${duplicate.user.email}: duplicate account role or tenant is unsafe.`);
      if (duplicate.user.staffProfile || duplicate.user._count.guardians) errors.push(`${duplicate.user.email}: duplicate account has a staff or guardian identity.`);
      if (!normalize(duplicate.user.email).endsWith("@kidcityusa.com")) errors.push(`${duplicate.user.email}: duplicate account is outside the Kid City domain.`);
    }
    return { center, canonicalEmail, canonicalUser, duplicateGrants, duplicateUsers };
  });
  const queueGrantsWithCenters = legacyQueueGrants.filter((grant): grant is typeof grant & { center: NonNullable<typeof grant.center> } => Boolean(grant.center));
  if (queueGrantsWithCenters.length !== legacyQueueGrants.length) errors.push("A legacy queue grant is missing its center relation.");
  const legacyQueueAccounts = Array.from(Map.groupBy(queueGrantsWithCenters, (grant) => grant.user.id).values()).map((grants) => ({
    user: grants[0].user,
    grants,
    centers: Array.from(new Map(grants.map((grant) => [grant.center.id, grant.center])).values()),
  }));
  for (const account of legacyQueueAccounts) {
    if (datasheetEmails.has(normalize(account.user.email))) errors.push(`${account.user.email}: queue-only account is canonical for a datasheet school.`);
    if (account.user.role !== UserRole.CENTER_DIRECTOR || account.user.tenantId !== tenant.id) errors.push(`${account.user.email}: queue-only account role or tenant is unsafe.`);
    if (account.user.staffProfile || account.user._count.guardians) errors.push(`${account.user.email}: queue-only account has a staff or guardian identity.`);
    if (!normalize(account.user.email).endsWith("@kidcityusa.com")) errors.push(`${account.user.email}: queue-only account is outside the Kid City domain.`);
  }
  const duplicateUserIds = [
    ...rows.flatMap((row) => row.duplicateUsers.map((item) => item.user.id)),
    ...legacyQueueAccounts.map((item) => item.user.id),
  ];
  const references = await userReferenceCounts(db, duplicateUserIds);
  for (const userId of duplicateUserIds) {
    const unsafe = Object.keys(references.get(userId) ?? {}).filter((key) => !ALLOWED_DUPLICATE_USER_REFERENCES.has(key));
    if (unsafe.length) errors.push(`${userId}: duplicate user has protected references: ${unsafe.join(", ")}.`);
  }
  return { tenantId: tenant.id, rows, legacyQueueAccounts, errors, references };
}

function assertPlan(plan: Awaited<ReturnType<typeof readPlan>>) {
  invariant(plan.errors.length === 0, `Login reconciliation failed closed:\n- ${plan.errors.join("\n- ")}`);
  const duplicateUsers = plan.rows.flatMap((row) => row.duplicateUsers);
  if (duplicateUsers.length === 0 && plan.legacyQueueAccounts.length === 0) return;
  invariant(duplicateUsers.length === 7, `Expected the seven datasheet-proven duplicate accounts; found ${duplicateUsers.length}.`);
  invariant(plan.legacyQueueAccounts.length === 5, `Expected the five queue-only legacy accounts; found ${plan.legacyQueueAccounts.length}.`);
}

function summary(plan: Awaited<ReturnType<typeof readPlan>>) {
  return {
    activeSchools: plan.rows.length,
    canonicalAccountsVerified: plan.rows.filter((row) => row.canonicalUser).length,
    duplicateAccountsToDeactivate: plan.rows.flatMap((row) => row.duplicateUsers.map((item) => ({
      centerId: row.center.id,
      locationId: row.center.crmLocationId,
      canonicalEmail: row.canonicalEmail,
      duplicateEmail: item.user.email,
      retainedReferences: plan.references.get(item.user.id),
    }))),
    legacyQueueAccountsToDeactivate: plan.legacyQueueAccounts.map((item) => ({
      duplicateEmail: item.user.email,
      queueLocationIds: item.centers.map((center) => center.crmLocationId),
      retainedReferences: plan.references.get(item.user.id),
    })),
    duplicateActiveGrantsToDeactivate: plan.rows.reduce((sum, row) => sum + row.duplicateGrants.length, 0),
    passwordChecksRun: 0,
    passwordResets: 0,
    recoveryEmailsSent: 0,
    supabaseAuthRecordsChanged: 0,
    billingOrPaymentRecordsChanged: 0,
  };
}

async function applyPlan(
  expected: Awaited<ReturnType<typeof readPlan>>,
  datasheet: Map<string, DatasheetSchool>,
  authUsers: AuthUser[],
) {
  const before = await Promise.all([
    prisma.center.count(), prisma.lead.count(), prisma.invoice.count(), prisma.payment.count(), prisma.user.count(),
  ]);
  const expectedDuplicateIds = [
    ...expected.rows.flatMap((row) => row.duplicateUsers.map((item) => item.user.id)),
    ...expected.legacyQueueAccounts.map((item) => item.user.id),
  ].sort();

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${REPAIR_SOURCE}))`);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id IN (${Prisma.join(expectedDuplicateIds)}) FOR UPDATE`);
    const current = await readPlan(tx, datasheet, authUsers);
    assertPlan(current);
    invariant(
      JSON.stringify([
        ...current.rows.flatMap((row) => row.duplicateUsers.map((item) => item.user.id)),
        ...current.legacyQueueAccounts.map((item) => item.user.id),
      ].sort()) === JSON.stringify(expectedDuplicateIds),
      "The duplicate login set changed after the dry-run audit.",
    );
    const changedAt = new Date();

    for (const row of current.rows) {
      if (row.duplicateGrants.length) {
        await tx.userAccessGrant.updateMany({
          where: { id: { in: row.duplicateGrants.map((grant) => grant.id) }, isActive: true },
          data: { isActive: false },
        });
        await tx.auditLog.create({
          data: {
            tenantId: current.tenantId,
            centerId: row.center.id,
            action: "access_grant.duplicates_deactivated",
            resource: "Center",
            resourceId: row.center.id,
            metadata: jsonSafe({ repairSource: REPAIR_SOURCE, grantIds: row.duplicateGrants.map((grant) => grant.id), changedAt }),
          },
        });
      }

      for (const duplicate of row.duplicateUsers) {
        await tx.user.update({
          where: { id: duplicate.user.id },
          data: { isActive: false, sessionVersion: { increment: 1 } },
        });
        await tx.userAccessGrant.updateMany({ where: { userId: duplicate.user.id, isActive: true }, data: { isActive: false } });
        await tx.deviceSession.updateMany({
          where: { userId: duplicate.user.id, revokedAt: null },
          data: { revokedAt: changedAt },
        });
        await tx.webPushSubscription.updateMany({
          where: { userId: duplicate.user.id, isActive: true },
          data: { isActive: false },
        });
        await tx.auditLog.create({
          data: {
            tenantId: current.tenantId,
            centerId: row.center.id,
            action: "user.duplicate_school_login_deactivated",
            resource: "User",
            resourceId: duplicate.user.id,
            metadata: jsonSafe({
              repairSource: REPAIR_SOURCE,
              changedAt,
              duplicateEmail: duplicate.user.email,
              canonicalEmail: row.canonicalEmail,
              centerId: row.center.id,
              retainedReferences: current.references.get(duplicate.user.id),
              supabaseAuthRecordChanged: false,
            }),
          },
        });
      }
    }

    for (const account of current.legacyQueueAccounts) {
      await tx.user.update({
        where: { id: account.user.id },
        data: { isActive: false, sessionVersion: { increment: 1 } },
      });
      await tx.userAccessGrant.updateMany({ where: { userId: account.user.id, isActive: true }, data: { isActive: false } });
      await tx.deviceSession.updateMany({
        where: { userId: account.user.id, revokedAt: null },
        data: { revokedAt: changedAt },
      });
      await tx.webPushSubscription.updateMany({
        where: { userId: account.user.id, isActive: true },
        data: { isActive: false },
      });
      await tx.auditLog.create({
        data: {
          tenantId: current.tenantId,
          centerId: account.centers.length === 1 ? account.centers[0]?.id ?? null : null,
          action: "user.legacy_lead_queue_login_deactivated",
          resource: "User",
          resourceId: account.user.id,
          metadata: jsonSafe({
            repairSource: REPAIR_SOURCE,
            changedAt,
            duplicateEmail: account.user.email,
            queueCenters: account.centers,
            retainedReferences: current.references.get(account.user.id),
            reason: "This active login was tied only to an ambiguous legacy lead queue and is not a canonical datasheet school account.",
            supabaseAuthRecordChanged: false,
          }),
        },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 120_000 });

  const after = await Promise.all([
    prisma.center.count(), prisma.lead.count(), prisma.invoice.count(), prisma.payment.count(), prisma.user.count(),
  ]);
  invariant(JSON.stringify(before) === JSON.stringify(after), `Protected record counts changed: before=${before.join(",")} after=${after.join(",")}`);
  const verification = await readPlan(prisma, datasheet, authUsers);
  invariant(verification.errors.length === 0, `Post-apply verification errors: ${verification.errors.join("; ")}`);
  invariant(verification.rows.every((row) => row.duplicateUsers.length === 0), "An active duplicate school login remains.");
  invariant(verification.rows.every((row) => row.duplicateGrants.length === 0), "A duplicate active canonical grant remains.");
  invariant(verification.legacyQueueAccounts.length === 0, "An active legacy lead-queue login remains.");
  return verification;
}

async function main() {
  const datasheetPath = argValue("--datasheet-inspect");
  invariant(datasheetPath, "--datasheet-inspect is required so the canonical school emails come from the approved school datasheet.");
  const [datasheet, authUsers] = await Promise.all([readDatasheet(datasheetPath), listAuthUsers()]);
  const plan = await readPlan(prisma, datasheet, authUsers);
  assertPlan(plan);
  const apply = process.argv.includes("--apply");
  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, ...summary(plan) }, null, 2));
    return;
  }
  invariant(process.argv.includes("--confirm-school-login-deduplication"), "Apply mode requires --confirm-school-login-deduplication.");
  invariant(
    plan.rows.some((row) => row.duplicateUsers.length || row.duplicateGrants.length) || plan.legacyQueueAccounts.length > 0,
    "No duplicate school logins or active grants are pending reconciliation.",
  );
  const verification = await applyPlan(plan, datasheet, authUsers);
  console.log(JSON.stringify({ applied: true, ...summary(verification) }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
