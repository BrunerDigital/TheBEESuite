import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import rehearsalTarget from "./agency-ledger-rehearsal-target.ts";

const { loadEnvConfig } = nextEnv;
const {
  AGENCY_REHEARSAL_DATABASE_MARKER,
  AGENCY_REHEARSAL_PROJECT_REF,
  assertAuthorizedRehearsalDatabaseTarget,
} = rehearsalTarget;

loadEnvConfig(process.env.BEE_SUITE_ENV_DIR || process.cwd());
const databaseUrl = process.env.REHEARSAL_DATABASE_URL;
if (!databaseUrl) throw new Error("REHEARSAL_DATABASE_URL is required.");
assertAuthorizedRehearsalDatabaseTarget(databaseUrl);

const setup = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const first = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const second = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const observer = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const run = randomUUID().replaceAll("-", "").slice(0, 12);
const prefix = `agency-race-${run}`;
const applicationNames = {
  activation: `agency_activate_${run}`,
  baselineWrite: `agency_baseline_${run}`,
  periodClose: `agency_close_${run}`,
  claimPosting: `agency_post_${run}`,
  allocationA: `agency_alloc_a_${run}`,
  allocationB: `agency_alloc_b_${run}`,
};
const today = new Date();
const nextUtcDayStartMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1);
assert.ok(
  nextUtcDayStartMs - today.getTime() > 10 * 60 * 1000,
  "Start the concurrency rehearsal at least ten minutes before the next UTC day so accounting-date guards cannot cross a day boundary.",
);
const accountingDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12));
const expectedMigrationSha256 = Object.freeze({
  agencyReceivableLedger: "ef3d32acb21cca1e11d08db5098c850bca79b1bea89382a2c60e27454d59c0c5",
  agencyReconciliationControls: "5576f0ae9f743e45a713151dd7a87809d3596c33bc75b29b4e9ef4b9f3a99bd8",
});
const expectedInstalledMigrations = Object.freeze([
  {
    key: "agencyReceivableLedger",
    version: "20260905002924",
    name: "20260903190000_agency_receivable_ledger",
    statementCount: 1,
    statementOctets: 31_631,
    statementsSha256: "ef3d32acb21cca1e11d08db5098c850bca79b1bea89382a2c60e27454d59c0c5",
  },
  {
    key: "agencyReconciliationControls",
    version: "20260905002935",
    name: "20260903210000_agency_reconciliation_controls",
    statementCount: 1,
    statementOctets: 253_662,
    statementsSha256: "5576f0ae9f743e45a713151dd7a87809d3596c33bc75b29b4e9ef4b9f3a99bd8",
  },
]);
const expectedSourceShapeSha256 = "a8304df5ba2c68761c5b90525784557be3dab250f96c0530da2c0c86705c2793";
const expectedProductionDerivedSeed = Object.freeze({
  agencyProgramCount: "82",
  activeProgramCount: "5",
  setupRequiredProgramCount: "77",
  agencyProgramChecksum: "116c4ec14ae661d0225af532090169d6",
  subsidyClaimCount: "51",
  draftClaimCount: "51",
  subsidyClaimChecksum: "81b9fb864f91a530ac84e9ffba4320fb",
  subsidyRemittanceCount: "0",
  billingAccountCount: "3",
  billingAccountBalanceCents: "12400",
  billingAccountChecksum: "7b0b4e8d7cd60bbbfcd2c0de865dbdb3",
  invoiceCount: "0",
  paymentCount: "0",
  familyLedgerEntryCount: "4",
  familyLedgerEntryCents: "-122470",
  familyLedgerChecksum: "a3b75d5417d644cd8a6f5115857d175b",
  legacyAgencyPaymentCount: "4",
  legacyAgencyPaymentCents: "-122470",
  legacyAgencyPaymentChecksum: "b22b65d0feb18b5819c2860da9ffdbeb",
  ledgerAccountCount: "82",
  nonzeroLedgerAccountCount: "0",
  ledgerAccountBalanceCents: "0",
  ledgerEntryCount: "0",
  remittanceBatchCount: "0",
  remittanceAllocationCount: "0",
  ledgerAdjustmentCount: "0",
  accountingPeriodCount: "0",
  accountingPeriodEventCount: "0",
});

const ids = {
  tenant: `${prefix}-tenant`,
  organization: `${prefix}-organization`,
  center: `${prefix}-center`,
  classroom: `${prefix}-classroom`,
  family: `${prefix}-family`,
  child: `${prefix}-child`,
  program: `${prefix}-program`,
  authorization: `${prefix}-authorization`,
  claim: `${prefix}-claim`,
  claimLine: `${prefix}-claim-line`,
  activationRaceRemittance: `${prefix}-activation-remittance`,
  closeRaceClaim: `${prefix}-close-claim`,
  closeRaceClaimLine: `${prefix}-close-claim-line`,
  period: `${prefix}-period`,
  batch: `${prefix}-batch`,
  allocationA: `${prefix}-allocation-a`,
  allocationB: `${prefix}-allocation-b`,
  preparer: `${prefix}-preparer`,
  reviewer: `${prefix}-reviewer`,
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function verifyExactLocalMigrationBytes() {
  const migrations = [
    {
      name: "agencyReceivableLedger",
      prisma: new URL("../prisma/migrations/20260903190000_agency_receivable_ledger/migration.sql", import.meta.url),
      supabase: new URL("../supabase/migrations/20260903190000_agency_receivable_ledger.sql", import.meta.url),
    },
    {
      name: "agencyReconciliationControls",
      prisma: new URL("../prisma/migrations/20260903210000_agency_reconciliation_controls/migration.sql", import.meta.url),
      supabase: new URL("../supabase/migrations/20260903210000_agency_reconciliation_controls.sql", import.meta.url),
    },
  ];
  const result = {};
  for (const migration of migrations) {
    const [prismaBytes, supabaseBytes] = await Promise.all([readFile(migration.prisma), readFile(migration.supabase)]);
    assert.deepEqual(supabaseBytes, prismaBytes, `${migration.name} Prisma and Supabase mirrors differ.`);
    const hash = createHash("sha256").update(prismaBytes).digest("hex");
    assert.equal(hash, expectedMigrationSha256[migration.name], `${migration.name} changed after audit; stop before writing durable race fixtures.`);
    result[migration.name] = { sha256: hash, mirrorsByteForByteIdentical: true };
  }
  return result;
}

async function readInstalledMigrationWriterEvidence(tx) {
  const rows = await tx.$queryRaw`
    SELECT version, name, statements
    FROM supabase_migrations.schema_migrations
    WHERE name IN (
      '20260903190000_agency_receivable_ledger',
      '20260903210000_agency_reconciliation_controls'
    )
    ORDER BY version, name
  `;
  assert.equal(rows.length, expectedInstalledMigrations.length, "Expected exactly two selected Supabase migration history rows.");
  const evidence = rows.map((row) => {
    const statements = Array.isArray(row.statements)
      ? row.statements.map((statement) => String(statement))
      : [String(row.statements ?? "")];
    return {
      version: String(row.version),
      name: String(row.name),
      statementCount: statements.length,
      statementOctets: Buffer.byteLength(statements.join("\n"), "utf8"),
      statementsSha256: sha256(statements.join("\n")),
    };
  });
  for (const expected of expectedInstalledMigrations) {
    assert.equal(
      expected.statementsSha256,
      expectedMigrationSha256[expected.key],
      `${expected.key} installed-history pin is not coupled to the frozen local migration hash.`,
    );
    const matchingRows = evidence.filter((row) => row.name === expected.name);
    assert.equal(matchingRows.length, 1, `Installed Supabase history does not uniquely identify ${expected.name}.`);
    assert.deepEqual(matchingRows[0], {
      version: expected.version,
      name: expected.name,
      statementCount: expected.statementCount,
      statementOctets: expected.statementOctets,
      statementsSha256: expected.statementsSha256,
    }, `${expected.name} installed Supabase history does not match the exact frozen migration.`);
  }

  const [prismaHistory] = await tx.$queryRaw`
    SELECT (to_regclass('public."_prisma_migrations"') IS NOT NULL) AS present
  `;
  let candidatePrismaRows = [];
  if (prismaHistory?.present) {
    candidatePrismaRows = await tx.$queryRawUnsafe(`
      SELECT migration_name AS "migrationName"
      FROM public."_prisma_migrations"
      WHERE migration_name IN (
        '20260903190000_agency_receivable_ledger',
        '20260903210000_agency_reconciliation_controls'
      )
      ORDER BY migration_name, started_at
    `);
  }
  assert.deepEqual(candidatePrismaRows, [], "Candidate migrations were recorded by both Prisma and Supabase writers.");
  return {
    authority: "supabase_migrations.schema_migrations",
    selectedRows: evidence,
    prismaHistoryTablePresent: Boolean(prismaHistory?.present),
    candidatePrismaRowCount: candidatePrismaRows.length,
  };
}

function normalizeBigInts(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => (
    typeof item === "bigint" ? item.toString() : item
  )));
}

async function readExpectedProductionDerivedSeedEvidence(tx) {
  const [row] = await tx.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM "Center")::bigint AS "centerCount",
      (SELECT COUNT(*) FROM "Center"
        WHERE "organizationId" = 'agency-ledger-rehearsal-organization'
          AND "customFields"->>'agencyLedgerRehearsalSourceShapeSha256' = ${expectedSourceShapeSha256})::bigint AS "sourceShapeMarkerCount",
      (SELECT COUNT(*) FROM "AgencyProgram")::bigint AS "agencyProgramCount",
      (SELECT COUNT(*) FROM "AgencyProgram" WHERE status = 'active')::bigint AS "activeProgramCount",
      (SELECT COUNT(*) FROM "AgencyProgram" WHERE status = 'setup_required')::bigint AS "setupRequiredProgramCount",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || status || ':' || "centerId", '|' ORDER BY id), '')) FROM "AgencyProgram") AS "agencyProgramChecksum",
      (SELECT COUNT(*) FROM "SubsidyClaim")::bigint AS "subsidyClaimCount",
      (SELECT COUNT(*) FROM "SubsidyClaim" WHERE status = 'draft')::bigint AS "draftClaimCount",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || status || ':' || "claimedCents"::text || ':' || COALESCE("approvedCents"::text, '') || ':' || "paidCents"::text || ':' || "servicePeriodStart"::text || ':' || "servicePeriodEnd"::text, '|' ORDER BY id), '')) FROM "SubsidyClaim") AS "subsidyClaimChecksum",
      (SELECT COUNT(*) FROM "SubsidyRemittance")::bigint AS "subsidyRemittanceCount",
      (SELECT COUNT(*) FROM "BillingAccount")::bigint AS "billingAccountCount",
      (SELECT COALESCE(SUM("balanceCents"), 0) FROM "BillingAccount")::bigint AS "billingAccountBalanceCents",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "familyId" || ':' || "balanceCents"::text || ':' || COALESCE("ledgerSyncedAt"::text, ''), '|' ORDER BY id), '')) FROM "BillingAccount") AS "billingAccountChecksum",
      (SELECT COUNT(*) FROM "Invoice")::bigint AS "invoiceCount",
      (SELECT COUNT(*) FROM "Payment")::bigint AS "paymentCount",
      (SELECT COUNT(*) FROM "LedgerEntry")::bigint AS "familyLedgerEntryCount",
      (SELECT COALESCE(SUM("amountCents"), 0) FROM "LedgerEntry")::bigint AS "familyLedgerEntryCents",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "billingAccountId" || ':' || type || ':' || "amountCents"::text || ':' || COALESCE("balanceAfterCents"::text, '') || ':' || "effectiveAt"::text, '|' ORDER BY id), '')) FROM "LedgerEntry") AS "familyLedgerChecksum",
      (SELECT COUNT(*) FROM "LedgerEntry" WHERE type = 'agency_payment')::bigint AS "legacyAgencyPaymentCount",
      (SELECT COALESCE(SUM("amountCents"), 0) FROM "LedgerEntry" WHERE type = 'agency_payment')::bigint AS "legacyAgencyPaymentCents",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "billingAccountId" || ':' || "amountCents"::text || ':' || COALESCE("balanceAfterCents"::text, '') || ':' || "effectiveAt"::text, '|' ORDER BY id), '')) FROM "LedgerEntry" WHERE type = 'agency_payment') AS "legacyAgencyPaymentChecksum",
      (SELECT COUNT(*) FROM "AgencyLedgerAccount")::bigint AS "ledgerAccountCount",
      (SELECT COUNT(*) FROM "AgencyLedgerAccount" WHERE "balanceCents" <> 0)::bigint AS "nonzeroLedgerAccountCount",
      (SELECT COALESCE(SUM("balanceCents"), 0) FROM "AgencyLedgerAccount")::bigint AS "ledgerAccountBalanceCents",
      (SELECT COUNT(*) FROM "AgencyLedgerEntry")::bigint AS "ledgerEntryCount",
      (SELECT COUNT(*) FROM "AgencyRemittanceBatch")::bigint AS "remittanceBatchCount",
      (SELECT COUNT(*) FROM "AgencyRemittanceAllocation")::bigint AS "remittanceAllocationCount",
      (SELECT COUNT(*) FROM "AgencyLedgerAdjustment")::bigint AS "ledgerAdjustmentCount",
      (SELECT COUNT(*) FROM "AgencyAccountingPeriod")::bigint AS "accountingPeriodCount",
      (SELECT COUNT(*) FROM "AgencyAccountingPeriodEvent")::bigint AS "accountingPeriodEventCount"
  `;
  assert.ok(row, "The production-derived seed evidence query returned no row.");
  const evidence = normalizeBigInts(row);
  assert.ok(Number(evidence.centerCount) > 0, "The production-derived seed contains no sanitized schools.");
  assert.equal(
    evidence.sourceShapeMarkerCount,
    evidence.centerCount,
    "Every sanitized seed school must carry the exact captured production source-shape marker.",
  );
  for (const [field, expected] of Object.entries(expectedProductionDerivedSeed)) {
    assert.equal(evidence[field], expected, `Production-derived seed mismatch for ${field}.`);
  }
  return {
    ...evidence,
    sourceShapeSha256: expectedSourceShapeSha256,
    everySanitizedCenterCarriesSourceShapeMarker: true,
    exactExpectedCountsAndChecksumsMatched: true,
  };
}

async function verifyInstalledMigrationWriter() {
  return setup.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await verifyTargetInsideTransaction(tx);
    const migrationWriter = await readInstalledMigrationWriterEvidence(tx);
    const capturedSeed = await readExpectedProductionDerivedSeedEvidence(tx);
    return { migrationWriter, capturedSeed };
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function normalizeFailure(error) {
  const normalized = {
    name: typeof error?.name === "string" ? error.name : null,
    code: typeof error?.code === "string" ? error.code : null,
    message: typeof error?.message === "string" ? error.message : String(error),
    metaCode: typeof error?.meta?.code === "string" ? error.meta.code : null,
    metaTarget: error?.meta?.target ?? null,
    metaMessage: typeof error?.meta?.message === "string" ? error.meta.message : null,
  };
  if (error?.cause && error.cause !== error) normalized.cause = normalizeFailure(error.cause);
  return normalized;
}

function assertIntendedRejection(result, label, acceptedMessageFragments, acceptedCodes = ["P2034", "40001"]) {
  assert.equal(result.status, "rejected", `${label} must reject the losing transaction.`);
  const failure = normalizeFailure(result.reason);
  const serialized = JSON.stringify(failure);
  const hasAcceptedMessage = acceptedMessageFragments.some((fragment) => serialized.includes(fragment));
  const hasAcceptedCode = acceptedCodes.some((code) => (
    failure.code === code
    || failure.metaCode === code
    || serialized.includes(`\"code\":\"${code}\"`)
  ));
  assert.ok(
    hasAcceptedMessage || hasAcceptedCode,
    `${label} failed for an unexpected reason: ${serialized}`,
  );
  return failure;
}

async function waitForBarrierOrWorkerFailure(barrierPromise, workerPromise, label, timeoutMs = 10_000) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not reach its transaction barrier within ${timeoutMs}ms.`)), timeoutMs);
  });
  const prematureWorkerExit = workerPromise.then(
    () => { throw new Error(`${label} transaction completed before reaching its barrier.`); },
    (error) => { throw error; },
  );
  try {
    await Promise.race([barrierPromise, prematureWorkerExit, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function observeBlockedRace(applicationName, releaseBarrier, firstWorker, competingWorker, label) {
  let waitEvidence;
  let observationError;
  const prematureCompetingExit = competingWorker.then(
    () => { throw new Error(`${label} competing transaction completed before the expected lock wait.`); },
    (error) => { throw error; },
  );
  try {
    waitEvidence = await Promise.race([
      waitForBlockedClient(applicationName),
      prematureCompetingExit,
    ]);
  } catch (error) {
    observationError = error;
  } finally {
    // Always unblock the first transaction, including when lock observation
    // itself fails, so a diagnostic failure cannot strand a connection.
    releaseBarrier.resolve();
  }
  const results = await Promise.allSettled([firstWorker, competingWorker]);
  if (observationError) throw observationError;
  return { waitEvidence, results };
}

async function waitForBlockedClient(applicationName) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [row] = await observer.$queryRaw`
      SELECT pid, wait_event_type AS "waitEventType", wait_event AS "waitEvent",
        cardinality(pg_blocking_pids(pid)) AS "blockingBackendCount"
      FROM pg_stat_activity
      WHERE application_name = ${applicationName}
        AND datname = current_database()
      ORDER BY backend_start DESC, pid DESC
      LIMIT 1
    `;
    if (row?.blockingBackendCount > 0) return row;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${applicationName} did not reach the expected database lock wait.`);
}

async function verifyTarget() {
  const [identity] = await setup.$queryRaw`
    SELECT current_database() AS "databaseName", current_user AS "databaseUser",
      shobj_description(database_row.oid, 'pg_database') AS "databaseMarker"
    FROM pg_database database_row
    WHERE database_row.datname = current_database()
  `;
  assert.equal(identity?.databaseName, "postgres");
  assert.equal(identity?.databaseUser, "postgres");
  assert.equal(identity?.databaseMarker, AGENCY_REHEARSAL_DATABASE_MARKER);
  return identity;
}

async function verifyTargetInsideTransaction(tx) {
  const [identity] = await tx.$queryRaw`
    SELECT current_database() AS "databaseName", current_user AS "databaseUser",
      shobj_description(database_row.oid, 'pg_database') AS "databaseMarker"
    FROM pg_database database_row
    WHERE database_row.datname = current_database()
  `;
  assert.equal(identity?.databaseName, "postgres");
  assert.equal(identity?.databaseUser, "postgres");
  assert.equal(identity?.databaseMarker, AGENCY_REHEARSAL_DATABASE_MARKER);
}

async function seedCommittedFixture() {
  const transactionPreflight = await setup.$transaction(async (tx) => {
    await verifyTargetInsideTransaction(tx);
    const migrationWriter = await readInstalledMigrationWriterEvidence(tx);
    const capturedSeed = await readExpectedProductionDerivedSeedEvidence(tx);
    await tx.tenant.create({ data: { id: ids.tenant, name: "Agency concurrency rehearsal", slug: ids.tenant } });
    await tx.organization.create({ data: { id: ids.organization, tenantId: ids.tenant, name: "Agency concurrency rehearsal" } });
    await tx.center.create({ data: { id: ids.center, organizationId: ids.organization, name: "Agency concurrency rehearsal school", status: "active", licensedCapacity: 1, timezone: "America/New_York" } });
    await tx.user.createMany({ data: [
      { id: ids.preparer, tenantId: ids.tenant, organizationId: ids.organization, email: `${ids.preparer}@example.invalid`, name: "Race preparer", role: "BILLING_ADMIN" },
      { id: ids.reviewer, tenantId: ids.tenant, organizationId: ids.organization, email: `${ids.reviewer}@example.invalid`, name: "Race reviewer", role: "BRAND_ADMIN" },
    ] });
    await tx.classroom.create({ data: { id: ids.classroom, centerId: ids.center, name: "Race classroom", ageGroup: "preschool", capacity: 1 } });
    await tx.family.create({ data: { id: ids.family, centerId: ids.center, name: "Race family" } });
    await tx.child.create({ data: { id: ids.child, familyId: ids.family, classroomId: ids.classroom, fullName: "Race child", dateOfBirth: new Date(Date.UTC(2022, 0, 1, 12)), ageGroup: "preschool", enrollmentStatus: "enrolled" } });
    await tx.agencyProgram.create({ data: {
      id: ids.program, centerId: ids.center, name: "Race Agency", stateCode: "IN",
      providerNumber: "RACE-PROVIDER", submissionMethod: "agency_portal",
      portalUrl: "https://example.invalid/race", paymentInstructions: "Disposable rehearsal only",
      receivableGlCode: "1200-RACE", cashGlCode: "1000-RACE", adjustmentGlCode: "6900-RACE",
      costCenterCode: "RACE", requirements: [], status: "active",
    } });
    await tx.subsidyAuthorization.create({ data: {
      id: ids.authorization, centerId: ids.center, agencyProgramId: ids.program,
      familyId: ids.family, childId: ids.child, authorizationNumber: `RACE-${run}`,
      coverageStart: new Date(Date.UTC(2025, 0, 1, 12)), coverageEnd: new Date(Date.UTC(2027, 11, 31, 12)),
      authorizedRateCents: 10_000, familyCopayCents: 0, unitType: "weekly", status: "active", requiredDocuments: [],
    } });
    await tx.subsidyClaim.create({ data: {
      id: ids.claim, centerId: ids.center, agencyProgramId: ids.program, authorizationId: ids.authorization,
      number: `RACE-APPROVED-${run}`, servicePeriodStart: accountingDate, servicePeriodEnd: accountingDate,
      status: "draft", claimedCents: 10_000, approvedCents: null, paidCents: 0,
      submittedAt: accountingDate, createdById: ids.preparer,
      lines: { create: [{ id: ids.claimLine, childId: ids.child, description: "Race approved claim", serviceUnits: 1, unitType: "weekly", rateCents: 10_000, amountCents: 10_000 }] },
    } });
    await tx.subsidyClaim.update({ where: { id: ids.claim }, data: { status: "approved", approvedCents: 10_000, approvedAt: accountingDate, externalReference: `RACE-APPROVAL-${run}` } });
    await tx.subsidyClaim.create({ data: {
      id: ids.closeRaceClaim, centerId: ids.center, agencyProgramId: ids.program, authorizationId: ids.authorization,
      number: `RACE-SUBMITTED-${run}`, servicePeriodStart: accountingDate, servicePeriodEnd: accountingDate,
      status: "submitted", claimedCents: 2_000, approvedCents: null, paidCents: 0,
      submittedAt: accountingDate, createdById: ids.preparer,
      lines: { create: [{ id: ids.closeRaceClaimLine, childId: ids.child, description: "Race submitted claim", serviceUnits: 1, unitType: "weekly", rateCents: 2_000, amountCents: 2_000 }] },
    } });
    // Let COMMIT flush the initially-deferred source guard while the dependent
    // ledger/account guards are still deferred. Forcing every guard IMMEDIATE
    // here makes the source guard's compatibility entry validate before its
    // account recalculation has completed, which is not commit ordering.
    return { migrationWriter, capturedSeed };
  }, { isolationLevel: "Serializable", timeout: 60_000 });

  const [claim, submittedClaim, accounts, entries] = await Promise.all([
    setup.subsidyClaim.findUniqueOrThrow({
      where: { id: ids.claim },
      select: { status: true, claimedCents: true, approvedCents: true, paidCents: true, approvedAt: true },
    }),
    setup.subsidyClaim.findUniqueOrThrow({
      where: { id: ids.closeRaceClaim },
      select: { status: true, claimedCents: true, approvedCents: true, paidCents: true },
    }),
    setup.agencyLedgerAccount.findMany({
      where: { centerId: ids.center, agencyProgramId: ids.program },
      select: { id: true, balanceCents: true },
      orderBy: { id: "asc" },
    }),
    setup.agencyLedgerEntry.findMany({
      where: { claimId: ids.claim },
      select: {
        id: true,
        agencyLedgerAccountId: true,
        type: true,
        amountCents: true,
        balanceAfterCents: true,
        effectiveAt: true,
        sourceSystem: true,
        externalId: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);
  const committedProjection = {
    claim: { ...claim, approvedAt: claim.approvedAt?.toISOString() ?? null },
    submittedClaim,
    accounts,
    entries: entries.map((entry) => ({ ...entry, effectiveAt: entry.effectiveAt.toISOString() })),
  };
  assert.deepEqual(committedProjection, {
    claim: {
      status: "approved",
      claimedCents: 10_000,
      approvedCents: 10_000,
      paidCents: 0,
      approvedAt: accountingDate.toISOString(),
    },
    submittedClaim: {
      status: "submitted",
      claimedCents: 2_000,
      approvedCents: null,
      paidCents: 0,
    },
    accounts: [{ id: `agency-ledger-account:${ids.program}`, balanceCents: 10_000 }],
    entries: [{
      id: `agency-ledger-claim:${ids.claim}`,
      agencyLedgerAccountId: `agency-ledger-account:${ids.program}`,
      type: "claim_approved",
      amountCents: 10_000,
      balanceAfterCents: 10_000,
      effectiveAt: accountingDate.toISOString(),
      sourceSystem: "subsidy_agency",
      externalId: `claim-approved:${ids.claim}`,
    }],
  });
  return { transactionPreflight, committedProjection };
}

async function activationVersusBaselineRemittance() {
  const activationUpdated = deferred();
  const releaseActivation = deferred();
  const activatedAt = new Date();
  const activationReason = "Committed multi-session activation race rehearsal";
  const activation = first.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL application_name = '${applicationNames.activation}'`);
    await tx.center.update({ where: { id: ids.center }, data: {
      agencyReconciliationEnabled: true,
      agencyReconciliationActivatedAt: activatedAt,
      agencyReconciliationActivatedById: ids.reviewer,
      agencyReconciliationActivationReason: activationReason,
    } });
    activationUpdated.resolve();
    await releaseActivation.promise;
  }, { isolationLevel: "Serializable", timeout: 60_000 });

  try {
    await waitForBarrierOrWorkerFailure(activationUpdated.promise, activation, "activation race");
  } catch (error) {
    releaseActivation.resolve();
    await Promise.allSettled([activation]);
    throw error;
  }
  const baselineWrite = second.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL application_name = '${applicationNames.baselineWrite}'`);
    await tx.subsidyRemittance.create({ data: {
      id: ids.activationRaceRemittance, claimId: ids.claim, amountCents: 1_000,
      paidAt: accountingDate, paymentMethod: "ach", externalReference: `RACE-REMITTANCE-${run}`,
      enteredById: ids.preparer,
    } });
    await tx.subsidyClaim.update({ where: { id: ids.claim }, data: { paidCents: 1_000, status: "partially_paid" } });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  }, { isolationLevel: "Serializable", timeout: 60_000 });
  const { waitEvidence, results: [activationResult, baselineResult] } = await observeBlockedRace(
    applicationNames.baselineWrite, releaseActivation, activation, baselineWrite, "activation race",
  );
  assert.equal(activationResult.status, "fulfilled");
  const losingFailure = assertIntendedRejection(
    baselineResult,
    "activation race",
    [
      "Activated agency reconciliation requires a matching reviewed batch allocation",
      "Transaction failed due to a write conflict or a deadlock",
      "could not serialize access due to concurrent update",
    ],
  );
  const [state] = await setup.$queryRaw`
    SELECT center."agencyReconciliationEnabled", center."agencyReconciliationActivatedAt",
      center."agencyReconciliationActivatedById", center."agencyReconciliationActivationReason",
      claim.status AS "claimStatus", claim."paidCents",
      (SELECT COUNT(*) FROM "SubsidyRemittance" WHERE id = ${ids.activationRaceRemittance})::integer AS "remittanceCount",
      (SELECT COUNT(*) FROM "AgencyLedgerEntry" WHERE "claimId" = claim.id AND type = 'claim_approved')::integer AS "approvalEntryCount",
      account."balanceCents" AS "accountBalanceCents"
    FROM "Center" center
    JOIN "SubsidyClaim" claim ON claim.id = ${ids.claim}
    JOIN "AgencyLedgerAccount" account ON account."centerId" = center.id AND account."agencyProgramId" = claim."agencyProgramId"
    WHERE center.id = ${ids.center}
  `;
  assert.deepEqual(state, {
    agencyReconciliationEnabled: true,
    agencyReconciliationActivatedAt: activatedAt,
    agencyReconciliationActivatedById: ids.reviewer,
    agencyReconciliationActivationReason: activationReason,
    claimStatus: "approved",
    paidCents: 0,
    remittanceCount: 0,
    approvalEntryCount: 1,
    accountBalanceCents: 10_000,
  });
  return { oneSafeWinner: "activation", blockedWriteRolledBack: true, losingFailure, postState: state, waitEvidence };
}

async function periodCloseVersusClaimPosting() {
  const closeInserted = deferred();
  const releaseClose = deferred();
  const close = first.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL application_name = '${applicationNames.periodClose}'`);
    await tx.agencyAccountingPeriod.create({ data: {
      id: ids.period, centerId: ids.center, name: "Race current period",
      startDate: accountingDate, endDate: accountingDate, status: "closed",
      closedAt: new Date(), closedById: ids.reviewer, closeReason: "Committed multi-session close race rehearsal",
    } });
    closeInserted.resolve();
    await releaseClose.promise;
  }, { isolationLevel: "Serializable", timeout: 60_000 });

  try {
    await waitForBarrierOrWorkerFailure(closeInserted.promise, close, "period-close race");
  } catch (error) {
    releaseClose.resolve();
    await Promise.allSettled([close]);
    throw error;
  }
  const posting = second.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL application_name = '${applicationNames.claimPosting}'`);
    const approvedAt = new Date();
    await tx.subsidyClaim.update({ where: { id: ids.closeRaceClaim }, data: { status: "approved", approvedCents: 2_000, approvedAt, externalReference: `RACE-CLOSE-APPROVAL-${run}` } });
    const account = await tx.agencyLedgerAccount.findUniqueOrThrow({ where: { centerId_agencyProgramId: { centerId: ids.center, agencyProgramId: ids.program } } });
    await tx.agencyLedgerEntry.create({ data: {
      id: `${prefix}-close-race-ledger`, agencyLedgerAccountId: account.id, claimId: ids.closeRaceClaim,
      type: "claim_approved", description: "Close-race claim approval", amountCents: 2_000,
      balanceAfterCents: account.balanceCents + 2_000, effectiveAt: approvedAt,
      externalReference: `RACE-CLOSE-APPROVAL-${run}`, glCodeSnapshot: "1200-RACE", costCenterCodeSnapshot: "RACE",
      sourceSystem: "subsidy_agency", externalId: `claim-approved:${ids.closeRaceClaim}`,
    } });
    await tx.agencyLedgerAccount.update({ where: { id: account.id }, data: { balanceCents: { increment: 2_000 } } });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  }, { isolationLevel: "Serializable", timeout: 60_000 });
  const { waitEvidence, results: [closeResult, postingResult] } = await observeBlockedRace(
    applicationNames.claimPosting, releaseClose, close, posting, "period-close race",
  );
  assert.equal(closeResult.status, "fulfilled");
  const losingFailure = assertIntendedRejection(
    postingResult,
    "period-close race",
    [
      "Agency ledger activity cannot post before or within a later closed accounting period",
      "Transaction failed due to a write conflict or a deadlock",
      "could not serialize access due to concurrent update",
    ],
  );
  const [state] = await setup.$queryRaw`
    SELECT claim.status, claim."approvedCents",
      (SELECT COUNT(*) FROM "AgencyLedgerEntry" WHERE "claimId" = claim.id)::integer AS "ledgerEntryCount",
      period.status AS "periodStatus",
      (SELECT COUNT(*) FROM "AgencyAccountingPeriodEvent" WHERE "periodId" = period.id)::integer AS "periodEventCount",
      (SELECT action FROM "AgencyAccountingPeriodEvent" WHERE "periodId" = period.id ORDER BY sequence DESC LIMIT 1) AS "periodEventAction",
      (SELECT "actorId" FROM "AgencyAccountingPeriodEvent" WHERE "periodId" = period.id ORDER BY sequence DESC LIMIT 1) AS "periodEventActorId",
      (SELECT reason FROM "AgencyAccountingPeriodEvent" WHERE "periodId" = period.id ORDER BY sequence DESC LIMIT 1) AS "periodEventReason",
      account."balanceCents" AS "accountBalanceCents"
    FROM "SubsidyClaim" claim
    JOIN "AgencyAccountingPeriod" period ON period.id = ${ids.period}
    JOIN "AgencyLedgerAccount" account ON account."centerId" = claim."centerId" AND account."agencyProgramId" = claim."agencyProgramId"
    WHERE claim.id = ${ids.closeRaceClaim}
  `;
  assert.deepEqual(state, {
    status: "submitted",
    approvedCents: null,
    ledgerEntryCount: 0,
    periodStatus: "closed",
    periodEventCount: 1,
    periodEventAction: "closed",
    periodEventActorId: ids.reviewer,
    periodEventReason: "Committed multi-session close race rehearsal",
    accountBalanceCents: 10_000,
  });
  return { oneSafeWinner: "period_close", blockedPostingRolledBack: true, losingFailure, postState: state, waitEvidence };
}

async function duplicateActiveAllocationRace() {
  await setup.$transaction(async (tx) => {
    await verifyTargetInsideTransaction(tx);
    await tx.agencyRemittanceBatch.create({ data: {
      id: ids.batch, centerId: ids.center, agencyProgramId: ids.program,
      externalReference: `RACE-BATCH-${run}`, referenceKey: `ach:RACE-BATCH-${run.toUpperCase()}`,
      paidAt: accountingDate, paymentMethod: "ach", cashGlCodeSnapshot: "1000-RACE", costCenterCodeSnapshot: "RACE",
      totalCents: 1_000, allocatedCents: 0, unappliedCents: 0, status: "pending_review",
      evidenceName: "Concurrency rehearsal", evidenceReference: `race:${run}`,
      followUpOwnerId: ids.preparer, followUpDueAt: new Date(accountingDate.getTime() + 86_400_000),
      idempotencyKey: randomUUID(), reconciliationFingerprint: sha256(`batch:${run}`), enteredById: ids.preparer,
    } });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  });
  const firstInserted = deferred();
  const releaseFirst = deferred();
  const insertA = first.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL application_name = '${applicationNames.allocationA}'`);
    await tx.agencyRemittanceAllocation.create({ data: {
      id: ids.allocationA, batchId: ids.batch, claimId: ids.claim, amountCents: 400,
      fingerprint: sha256(`allocation-a:${run}`), idempotencyKey: randomUUID(), requestedById: ids.preparer,
    } });
    firstInserted.resolve();
    await releaseFirst.promise;
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  }, { isolationLevel: "Serializable", timeout: 60_000 });
  try {
    await waitForBarrierOrWorkerFailure(firstInserted.promise, insertA, "duplicate-allocation race");
  } catch (error) {
    releaseFirst.resolve();
    await Promise.allSettled([insertA]);
    throw error;
  }
  const insertB = second.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL application_name = '${applicationNames.allocationB}'`);
    await tx.agencyRemittanceAllocation.create({ data: {
      id: ids.allocationB, batchId: ids.batch, claimId: ids.claim, amountCents: 500,
      fingerprint: sha256(`allocation-b:${run}`), idempotencyKey: randomUUID(), requestedById: ids.preparer,
    } });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  }, { isolationLevel: "Serializable", timeout: 60_000 });
  const { waitEvidence, results: [a, b] } = await observeBlockedRace(
    applicationNames.allocationB, releaseFirst, insertA, insertB, "duplicate-allocation race",
  );
  assert.equal(a.status, "fulfilled");
  const raceLosingFailure = assertIntendedRejection(
    b,
    "duplicate-allocation race",
    [
      "AgencyRemittanceAllocation_active_batch_claim_key",
      "Transaction failed due to a write conflict or a deadlock",
      "could not serialize access due to concurrent update",
    ],
    ["P2002", "P2034", "23505", "40001"],
  );

  const [index] = await setup.$queryRaw`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'AgencyRemittanceAllocation'
      AND indexname = 'AgencyRemittanceAllocation_active_batch_claim_key'
  `;
  assert.match(index?.indexdef ?? "", /^CREATE UNIQUE INDEX /);
  assert.match(index.indexdef, /\("batchId", "claimId"\)/);
  assert.match(index.indexdef, /pending_review/);
  assert.match(index.indexdef, /posted/);

  let committedDuplicateFailure;
  try {
    await setup.$executeRaw`
      INSERT INTO "AgencyRemittanceAllocation" (
        id, "batchId", "claimId", "amountCents", fingerprint, "idempotencyKey", "requestedById"
      ) VALUES (
        ${ids.allocationB}, ${ids.batch}, ${ids.claim}, 500,
        ${sha256(`allocation-committed-duplicate:${run}`)}, ${randomUUID()}, ${ids.preparer}
      )
    `;
    assert.fail("A committed duplicate active allocation unexpectedly succeeded.");
  } catch (error) {
    if (error?.code === "ERR_ASSERTION") throw error;
    committedDuplicateFailure = normalizeFailure(error);
    assert.equal(committedDuplicateFailure.code, "P2010");
    assert.equal(committedDuplicateFailure.metaCode, "23505");
    assert.match(
      committedDuplicateFailure.metaMessage ?? "",
      new RegExp(`Key \\(\\"batchId\\", \\"claimId\\"\\)=\\(${ids.batch}, ${ids.claim}\\) already exists\\.`),
      `Committed duplicate did not fail on the exact active batch/claim key: ${JSON.stringify(committedDuplicateFailure)}`,
    );
  }
  const rows = await setup.agencyRemittanceAllocation.findMany({ where: { batchId: ids.batch, claimId: ids.claim, status: { in: ["pending_review", "posted"] } }, select: { id: true } });
  assert.deepEqual(rows, [{ id: ids.allocationA }]);
  return {
    oneActiveAllocation: true,
    losingConcurrentInsertRolledBack: true,
    raceLosingFailure,
    exactPartialUniqueIndex: index.indexdef,
    committedDuplicateFailure,
    postState: rows,
    waitEvidence,
  };
}

let report;
try {
  const target = await verifyTarget();
  const migrationFiles = await verifyExactLocalMigrationBytes();
  const preflight = await verifyInstalledMigrationWriter();
  const committedSeed = await seedCommittedFixture();
  assert.deepEqual(committedSeed.transactionPreflight, preflight);
  report = {
    mode: "disposable_production_derived_multi_session_race_rehearsal",
    targetProjectRef: AGENCY_REHEARSAL_PROJECT_REF,
    target,
    migrationFiles,
    migrationWriter: preflight.migrationWriter,
    capturedProductionDerivedSeed: preflight.capturedSeed,
    committedSeedProjection: committedSeed.committedProjection,
    activationVersusBaselineRemittance: await activationVersusBaselineRemittance(),
    periodCloseVersusClaimPosting: await periodCloseVersusClaimPosting(),
    duplicateActiveAllocationRace: await duplicateActiveAllocationRace(),
    cleanup: "The committed immutable test records exist only on the authorized disposable branch; deleting that exact branch removes them without weakening financial-history guards.",
    completedAt: new Date(),
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await Promise.allSettled([setup.$disconnect(), first.$disconnect(), second.$disconnect(), observer.$disconnect()]);
}
