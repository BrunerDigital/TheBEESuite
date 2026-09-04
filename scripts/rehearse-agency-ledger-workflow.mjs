import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { mock } from "node:test";
import rehearsalTarget from "./agency-ledger-rehearsal-target.ts";

const { loadEnvConfig } = nextEnv;
const {
  AGENCY_PRODUCTION_PROJECT_REF: PRODUCTION_PROJECT_REF,
  AGENCY_REHEARSAL_DATABASE_MARKER,
  AGENCY_REHEARSAL_PROJECT_REF: REHEARSAL_PROJECT_REF,
  assertAuthorizedRehearsalDatabaseTarget,
} = rehearsalTarget;

const EXPECTED_SOURCE_SHAPE_SHA256 = "6e0333b1705ddd5e21d6be6832b7f6ef0f8610d39d77bd78792b086d6c987560";
const EXPECTED_MIGRATION_SHA256 = Object.freeze({
  agencyReceivableLedger: "f97efba6de09c76ae3b5919c97fa364783b4abc4aea22845384018e6891aa90a",
  agencyReconciliationControls: "5c50fefe9d174e3106c9cf0d762953372102751d67c09416126cbbffaca32919",
});
const REHEARSAL_TENANT_ID = "agency-ledger-rehearsal-tenant";
const REHEARSAL_ORGANIZATION_ID = "agency-ledger-rehearsal-organization";
const EXPECTED_PRODUCTION_DERIVED_SEED = Object.freeze({
  agencyProgramCount: 82n,
  activeProgramCount: 5n,
  setupRequiredProgramCount: 77n,
  agencyProgramChecksum: "116c4ec14ae661d0225af532090169d6",
  subsidyClaimCount: 51n,
  draftClaimCount: 51n,
  subsidyClaimChecksum: "81b9fb864f91a530ac84e9ffba4320fb",
  subsidyRemittanceCount: 0n,
  familyCount: 3n,
  billingAccountCount: 3n,
  billingAccountBalanceCents: 15_100n,
  billingAccountChecksum: "87874cd039624d49ec67db7aa6d50ee1",
  invoiceCount: 0n,
  paymentCount: 0n,
  familyLedgerEntryCount: 4n,
  familyLedgerEntryCents: -122_470n,
  familyLedgerChecksum: "a3b75d5417d644cd8a6f5115857d175b",
  legacyAgencyPaymentCount: 4n,
  legacyAgencyPaymentCents: -122_470n,
  legacyAgencyPaymentChecksum: "b22b65d0feb18b5819c2860da9ffdbeb",
});
const BILLING_ROLES = new Set([
  "PLATFORM_OWNER",
  "BRAND_ADMIN",
  "REGIONAL_MANAGER",
  "CENTER_DIRECTOR",
  "ASSISTANT_DIRECTOR",
  "BILLING_ADMIN",
]);
const ACCESS_ROLES = [
  ...BILLING_ROLES,
  "READ_ONLY_AUDITOR",
  "TEACHER",
  "PARENT_GUARDIAN",
  "AUTHORIZED_PICKUP",
];
const NON_BILLING_ROLES = ["TEACHER", "PARENT_GUARDIAN", "AUTHORIZED_PICKUP"];
const AGENCY_POST_ACTIONS = [
  "createProgram",
  "updateProgram",
  "createAuthorization",
  "updateAuthorization",
  "archiveAuthorization",
  "restoreAuthorization",
  "prepareRemittanceBatch",
  "approveRemittanceBatch",
  "requestBatchAllocation",
  "approveBatchAllocation",
  "rejectBatchAllocation",
  "requestLedgerAdjustment",
  "approveLedgerAdjustment",
  "rejectLedgerAdjustment",
  "reverseLedgerAdjustment",
  "closeAccountingPeriod",
  "reopenAccountingPeriod",
  "rejectRemittanceBatch",
  "reverseRemittanceBatch",
  "createClaim",
  "syncRequirements",
  "updateDocument",
  "submitClaim",
  "recordDecision",
  "voidClaim",
  "recordRemittance",
  "reverseRemittance",
];
const EXPORT_QUERIES = Object.freeze({
  claims: "exportClaims=true",
  deposits: "exportDeposits=true",
  ledger: "exportLedger=true",
  reconciliation: "exportReconciliation=true",
});
const CSV_HEADERS = Object.freeze({
  claims: ["Claim", "Agency", "Family", "Child", "Service start", "Service end", "Status", "Claimed", "Approved", "Paid", "Missing documents"],
  deposits: ["School", "Agency", "Program", "Paid date", "Deposit reference", "Method", "Cash GL", "Cost center", "Deposit total", "Allocated", "Unapplied", "Batch status", "Evidence", "Evidence reference", "Follow-up owner", "Follow-up due", "Claim", "Claim allocation", "Allocation status"],
  ledger: ["Date", "Agency", "Program", "Type", "GL code", "Cost center", "Claim", "Family", "Child", "Reference", "Charge", "Payment / credit", "Net", "Balance"],
  reconciliation: ["School", "Agency", "Program", "A/R GL", "Cash GL", "Adjustment GL", "Cost center", "Approved", "Remitted", "Unapplied cash", "Adjustments", "Expected balance", "Ledger balance", "Variance", "Open batch exceptions"],
});
const ROLLBACK = new Error("Intentional rollback after agency workflow rehearsal");
const REHEARSAL_DATE_ANCHOR = new Date();
const NEXT_UTC_DAY_START_MS = Date.UTC(
  REHEARSAL_DATE_ANCHOR.getUTCFullYear(),
  REHEARSAL_DATE_ANCHOR.getUTCMonth(),
  REHEARSAL_DATE_ANCHOR.getUTCDate() + 1,
);
assert.ok(
  NEXT_UTC_DAY_START_MS - REHEARSAL_DATE_ANCHOR.getTime() > 10 * 60 * 1000,
  "Start the rehearsal at least ten minutes before the next UTC day so application wall-clock reviews cannot cross the database transaction's fixed UTC date.",
);

async function verifyExactLocalMigrationBytes() {
  const migrationPairs = [
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
  for (const migration of migrationPairs) {
    const [prismaBytes, supabaseBytes] = await Promise.all([
      readFile(migration.prisma),
      readFile(migration.supabase),
    ]);
    assert.deepEqual(supabaseBytes, prismaBytes, `${migration.name} Prisma and Supabase migration mirrors differ.`);
    const sha256 = createHash("sha256").update(prismaBytes).digest("hex");
    assert.equal(sha256, EXPECTED_MIGRATION_SHA256[migration.name], `${migration.name} changed after the migration audit; stop and re-audit before writing rehearsal data.`);
    result[migration.name] = { sha256, mirrorsByteForByteIdentical: true };
  }
  return result;
}

loadEnvConfig(process.env.BEE_SUITE_ENV_DIR || process.cwd());
const databaseUrl = process.env.REHEARSAL_DATABASE_URL;

function validatedRehearsalDatabaseUrl(rawUrl) {
  if (!rawUrl) throw new Error("REHEARSAL_DATABASE_URL is required.");
  const parsedIdentity = assertAuthorizedRehearsalDatabaseTarget(rawUrl);
  const parsed = new URL(rawUrl);
  const connectionKind = parsed.hostname.endsWith(".pooler.supabase.com") ? "session_pooler" : "direct";
  if (connectionKind === "session_pooler" && (parsed.port || "5432") !== "5432") {
    throw new Error("The rollback-only workflow rehearsal requires the session pooler on port 5432, not transaction pooling.");
  }
  return { rawUrl, parsed, parsedIdentity, connectionKind };
}

const validatedTarget = validatedRehearsalDatabaseUrl(databaseUrl);

const base = new PrismaClient({ datasources: { db: { url: validatedTarget.rawUrl } }, log: ["error"] });
let activeTx = null;
let actingUser = null;

async function flushDeferredConstraints() {
  await activeTx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  await activeTx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
}

const prismaProxy = new Proxy({}, {
  get(_target, property) {
    if (!activeTx) throw new Error("The rehearsal database proxy was used outside its rollback transaction.");
    if (property === "$transaction") {
      return async (callback) => {
        if (typeof callback !== "function") throw new Error("The rehearsal proxy supports interactive transactions only.");
        const result = await callback(activeTx);
        await flushDeferredConstraints();
        return result;
      };
    }
    const value = activeTx[property];
    return typeof value === "function" ? value.bind(activeTx) : value;
  },
});

mock.module("@/lib/prisma", { namedExports: { prisma: prismaProxy } });
mock.module("@/lib/auth", {
  namedExports: {
    async getCurrentUser() { return actingUser; },
    canManageBilling(user) { return BILLING_ROLES.has(user.role); },
    canManageAgencyBilling(user) { return BILLING_ROLES.has(user.role); },
    canAccessCenter(user, centerId) { return user.centerIds.includes(centerId); },
  },
});
mock.module("@/lib/request-response-logging", {
  namedExports: { withApiLogging(_name, handler) { return handler; } },
});

const [{ GET, POST }, { NextRequest }] = await Promise.all([
  import("../src/app/api/billing/agency-claims/route.ts"),
  import("next/server"),
]);

function utcDay(offset = 0) {
  return new Date(Date.UTC(
    REHEARSAL_DATE_ANCHOR.getUTCFullYear(),
    REHEARSAL_DATE_ANCHOR.getUTCMonth(),
    REHEARSAL_DATE_ANCHOR.getUTCDate() + offset,
    12,
    0,
    0,
    0,
  ));
}

function dayInput(offset = 0) {
  return utcDay(offset).toISOString().slice(0, 10);
}

function currentUser(role, ids, centerIds, overrides = {}) {
  return {
    id: ids.users[role] || `${ids.prefix}-reader-${role.toLowerCase()}`,
    tenantId: ids.tenant,
    organizationId: ids.organization,
    email: `${role.toLowerCase()}-${ids.run}@example.invalid`,
    name: `Rehearsal ${role}`,
    role,
    centerIds,
    accessScope: "center",
    workspace: { mode: centerIds.length > 1 ? "all" : "center" },
    ...overrides,
  };
}

async function responsePayload(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function postAs(user, body, expectedStatus = 200) {
  actingUser = user;
  const response = await POST(new NextRequest("https://rehearsal.invalid/api/billing/agency-claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  const payload = await responsePayload(response);
  assert.equal(response.status, expectedStatus, `${body.action}: ${JSON.stringify(payload)}`);
  return payload;
}

async function getAs(user, query = "", expectedStatus = 200) {
  actingUser = user;
  const response = await GET(new NextRequest(`https://rehearsal.invalid/api/billing/agency-claims${query ? `?${query}` : ""}`));
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await responsePayload(response) : await response.text();
  assert.equal(response.status, expectedStatus, `GET ${query}: ${JSON.stringify(payload)}`);
  return payload;
}

async function verifyAuthorizedRehearsalTarget() {
  const result = await base.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const [identity] = await tx.$queryRaw`
      SELECT current_database() AS "databaseName",
        current_user AS "databaseUser",
        CURRENT_TIMESTAMP AS "verifiedAt",
        shobj_description(database_row.oid, 'pg_database') AS "databaseMarker",
        EXISTS (
          SELECT 1 FROM "Tenant"
          WHERE id = ${REHEARSAL_TENANT_ID}
            AND name = 'Agency ledger rehearsal'
            AND slug = 'agency-ledger-rehearsal'
        ) AS "tenantMarkerPresent",
        EXISTS (
          SELECT 1 FROM "Organization"
          WHERE id = ${REHEARSAL_ORGANIZATION_ID}
            AND "tenantId" = ${REHEARSAL_TENANT_ID}
            AND name = 'Sanitized rehearsal organization'
        ) AS "organizationMarkerPresent",
        (
          SELECT COUNT(*) = 6
          FROM (VALUES
            (to_regclass('public."AgencyLedgerAccount"')),
            (to_regclass('public."AgencyLedgerEntry"')),
            (to_regclass('public."AgencyRemittanceBatch"')),
            (to_regclass('public."AgencyRemittanceAllocation"')),
            (to_regclass('public."AgencyLedgerAdjustment"')),
            (to_regclass('public."AgencyAccountingPeriod"'))
          ) expected(table_oid)
          WHERE table_oid IS NOT NULL
        ) AS "agencySchemaPresent"
      FROM pg_database database_row
      WHERE database_row.datname = current_database()
    `;
    const [seed] = await tx.$queryRaw`
      SELECT
        (SELECT COUNT(*) FROM "AgencyProgram")::bigint AS "agencyProgramCount",
        (SELECT COUNT(*) FROM "AgencyProgram" WHERE status = 'active')::bigint AS "activeProgramCount",
        (SELECT COUNT(*) FROM "AgencyProgram" WHERE status = 'setup_required')::bigint AS "setupRequiredProgramCount",
        (SELECT MD5(COALESCE(STRING_AGG(id || ':' || status || ':' || "centerId", '|' ORDER BY id), '')) FROM "AgencyProgram") AS "agencyProgramChecksum",
        (SELECT COUNT(*) FROM "SubsidyClaim")::bigint AS "subsidyClaimCount",
        (SELECT COUNT(*) FROM "SubsidyClaim" WHERE status = 'draft')::bigint AS "draftClaimCount",
        (SELECT MD5(COALESCE(STRING_AGG(id || ':' || status || ':' || "claimedCents"::text || ':' || COALESCE("approvedCents"::text, '') || ':' || "paidCents"::text || ':' || "servicePeriodStart"::text || ':' || "servicePeriodEnd"::text, '|' ORDER BY id), '')) FROM "SubsidyClaim") AS "subsidyClaimChecksum",
        (SELECT COUNT(*) FROM "SubsidyRemittance")::bigint AS "subsidyRemittanceCount",
        (SELECT COUNT(*) FROM "Family")::bigint AS "familyCount",
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
        (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "billingAccountId" || ':' || "amountCents"::text || ':' || COALESCE("balanceAfterCents"::text, '') || ':' || "effectiveAt"::text, '|' ORDER BY id), '')) FROM "LedgerEntry" WHERE type = 'agency_payment') AS "legacyAgencyPaymentChecksum"
    `;
    return { identity, seed };
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });

  assert.equal(result.identity.databaseName, "postgres", "The rehearsal connection must target the postgres database.");
  assert.equal(result.identity.databaseUser, "postgres", "The rehearsal connection must resolve to the branch postgres role.");
  assert.equal(result.identity.databaseMarker, AGENCY_REHEARSAL_DATABASE_MARKER, "The exact authorized disposable-branch database marker is missing.");
  assert.equal(result.identity.tenantMarkerPresent, true, "The durable sanitized-seed tenant marker is missing.");
  assert.equal(result.identity.organizationMarkerPresent, true, "The durable sanitized-seed organization marker is missing.");
  assert.equal(result.identity.agencySchemaPresent, true, "Both agency migrations must already be present before the workflow rehearsal.");
  for (const [field, expected] of Object.entries(EXPECTED_PRODUCTION_DERIVED_SEED)) {
    assert.equal(result.seed[field], expected, `Production-derived rehearsal seed mismatch for ${field}.`);
  }
  return serializable({
    parsedUrlIdentity: {
      connectionKind: validatedTarget.connectionKind,
      hostname: validatedTarget.parsed.hostname,
      usernameProjectRef: decodeURIComponent(validatedTarget.parsed.username).split(".").at(-1),
      databaseName: result.identity.databaseName,
      sslMode: validatedTarget.parsed.searchParams.get("sslmode"),
      parsedIdentity: validatedTarget.parsedIdentity,
      productionProjectExplicitlyDenied: PRODUCTION_PROJECT_REF,
    },
    marker: {
      databaseMarker: AGENCY_REHEARSAL_DATABASE_MARKER,
      tenantId: REHEARSAL_TENANT_ID,
      organizationId: REHEARSAL_ORGANIZATION_ID,
      present: true,
    },
    capturedSeedSourceShapeSha256: EXPECTED_SOURCE_SHAPE_SHA256,
    productionDerivedSeed: result.seed,
    databaseSeedFactsAndChecksumsMatchCapturedSourceShape: true,
    agencySchemaAlreadyMigrated: true,
    verifiedAt: result.identity.verifiedAt,
  });
}

async function familyFinancialFingerprint(tx) {
  const [row] = await tx.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM "Family")::bigint AS "familyCount",
      (SELECT MD5(COALESCE(STRING_AGG(to_jsonb(family_row)::text, '|' ORDER BY id), '')) FROM "Family" family_row) AS "familyChecksum",
      (SELECT COUNT(*) FROM "BillingAccount")::bigint AS "billingAccountCount",
      (SELECT COALESCE(SUM("balanceCents"), 0) FROM "BillingAccount")::bigint AS "billingAccountBalanceCents",
      (SELECT MD5(COALESCE(STRING_AGG(to_jsonb(account_row)::text, '|' ORDER BY id), '')) FROM "BillingAccount" account_row) AS "billingAccountChecksum",
      (SELECT COUNT(*) FROM "Invoice")::bigint AS "invoiceCount",
      (SELECT COALESCE(SUM("totalCents"), 0) FROM "Invoice")::bigint AS "invoiceTotalCents",
      (SELECT MD5(COALESCE(STRING_AGG(to_jsonb(invoice_row)::text, '|' ORDER BY id), '')) FROM "Invoice" invoice_row) AS "invoiceChecksum",
      (SELECT COUNT(*) FROM "InvoiceItem")::bigint AS "invoiceItemCount",
      (SELECT MD5(COALESCE(STRING_AGG(to_jsonb(item_row)::text, '|' ORDER BY id), '')) FROM "InvoiceItem" item_row) AS "invoiceItemChecksum",
      (SELECT COUNT(*) FROM "Payment")::bigint AS "paymentCount",
      (SELECT COALESCE(SUM("amountCents"), 0) FROM "Payment")::bigint AS "paymentTotalCents",
      (SELECT MD5(COALESCE(STRING_AGG(to_jsonb(payment_row)::text, '|' ORDER BY id), '')) FROM "Payment" payment_row) AS "paymentChecksum",
      (SELECT COUNT(*) FROM "LedgerEntry")::bigint AS "familyLedgerEntryCount",
      (SELECT COALESCE(SUM("amountCents"), 0) FROM "LedgerEntry")::bigint AS "familyLedgerEntryCents",
      (SELECT MD5(COALESCE(STRING_AGG(to_jsonb(entry_row)::text, '|' ORDER BY id), '')) FROM "LedgerEntry" entry_row) AS "familyLedgerChecksum"
  `;
  return row;
}

async function participatingFamilyFinancialSnapshot(tx, ids) {
  const family = await tx.family.findUnique({
    where: { id: ids.family },
    include: {
      billingAccount: {
        include: {
          invoices: { orderBy: { id: "asc" }, include: { items: { orderBy: { id: "asc" } } } },
          payments: { orderBy: { id: "asc" } },
          ledgerEntries: { orderBy: { id: "asc" } },
        },
      },
    },
  });
  assert.ok(family?.billingAccount, "The participating family financial fixture is missing.");
  const canonical = JSON.stringify(serializable(family));
  return {
    familyId: family.id,
    billingAccountId: family.billingAccount.id,
    balanceCents: family.billingAccount.balanceCents,
    invoiceCount: family.billingAccount.invoices.length,
    invoiceTotalCents: family.billingAccount.invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0),
    paymentCount: family.billingAccount.payments.length,
    paymentTotalCents: family.billingAccount.payments.reduce((sum, payment) => sum + payment.amountCents, 0),
    familyLedgerEntryCount: family.billingAccount.ledgerEntries.length,
    familyLedgerEntryCents: family.billingAccount.ledgerEntries.reduce((sum, entry) => sum + entry.amountCents, 0),
    legacyAgencyEntryCount: family.billingAccount.ledgerEntries.filter((entry) => entry.type === "agency_payment").length,
    legacyAgencyEntryCents: family.billingAccount.ledgerEntries.filter((entry) => entry.type === "agency_payment").reduce((sum, entry) => sum + entry.amountCents, 0),
    exactRowSha256: createHash("sha256").update(canonical).digest("hex"),
  };
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\r" && csv[index + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  assert.equal(quoted, false, "CSV ended inside a quoted field.");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function numericCell(value) {
  assert.match(value, /^-?\d+(?:\.\d+)?$/, `Expected a numeric CSV cell, received ${JSON.stringify(value)}.`);
  return Number(value);
}

function assertDeniedWithoutAgencyData(payload) {
  assert.equal(payload?.ok, false);
  for (const field of ["programs", "authorizations", "claims", "families", "remittanceBatches", "adjustments", "accountingPeriods", "ledger", "reconciliation"]) {
    assert.equal(Object.hasOwn(payload, field), false, `Denied response leaked ${field}.`);
  }
}

function serializable(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
}

async function assertRehearsalMarkerBeforeWrite(tx) {
  const [identity] = await tx.$queryRaw`
    SELECT current_database() AS "databaseName",
      current_user AS "databaseUser",
      shobj_description(database_row.oid, 'pg_database') AS "databaseMarker",
      EXISTS (
        SELECT 1 FROM "Tenant"
        WHERE id = ${REHEARSAL_TENANT_ID}
          AND name = 'Agency ledger rehearsal'
          AND slug = 'agency-ledger-rehearsal'
      ) AS "tenantMarkerPresent",
      EXISTS (
        SELECT 1 FROM "Organization"
        WHERE id = ${REHEARSAL_ORGANIZATION_ID}
          AND "tenantId" = ${REHEARSAL_TENANT_ID}
          AND name = 'Sanitized rehearsal organization'
      ) AS "organizationMarkerPresent"
    FROM pg_database database_row
    WHERE database_row.datname = current_database()
  `;
  assert.equal(identity?.databaseName, "postgres", "The mutating rehearsal transaction must target the postgres database.");
  assert.equal(identity?.databaseUser, "postgres", "The mutating rehearsal transaction must use the branch postgres role.");
  assert.equal(identity?.databaseMarker, AGENCY_REHEARSAL_DATABASE_MARKER, "The exact rehearsal database marker changed before the first write.");
  assert.equal(identity?.tenantMarkerPresent, true, "The durable rehearsal tenant marker changed before the first write.");
  assert.equal(identity?.organizationMarkerPresent, true, "The durable rehearsal organization marker changed before the first write.");
  return serializable({ ...identity, verifiedImmediatelyBeforeFirstWrite: true });
}

let savepointSequence = 0;

function directSqlErrorText(error) {
  return [error?.message, error?.meta?.message, error?.cause?.message]
    .filter((value) => typeof value === "string" && value)
    .join("\n");
}

async function expectDirectSqlRejected(tx, label, operation, expectedMessage) {
  savepointSequence += 1;
  const savepoint = `agency_rehearsal_probe_${savepointSequence}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  let capturedError = null;
  try {
    await operation();
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  } catch (error) {
    capturedError = error;
  }
  await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
  assert.ok(capturedError, `${label} unexpectedly succeeded.`);
  const errorText = directSqlErrorText(capturedError);
  assert.match(errorText, expectedMessage, `${label} failed for an unexpected reason: ${errorText}`);
  return {
    label,
    rejected: true,
    expectedMessage: expectedMessage.source,
    matchedDatabaseError: errorText.split("\n").find((line) => expectedMessage.test(line)) ?? errorText,
    transactionStateRecoveredBySavepoint: true,
  };
}

async function seedWorkflow(tx, ids) {
  await tx.tenant.create({ data: { id: ids.tenant, name: "Rollback-only agency workflow rehearsal", slug: ids.tenant } });
  await tx.tenant.create({ data: { id: ids.wrongTenant, name: "Rollback-only cross-tenant rehearsal", slug: ids.wrongTenant } });
  await tx.organization.create({ data: { id: ids.organization, tenantId: ids.tenant, name: "Rollback-only rehearsal organization" } });
  await tx.organization.create({ data: { id: ids.wrongOrganization, tenantId: ids.wrongTenant, name: "Rollback-only cross-tenant organization" } });
  await tx.center.createMany({ data: [
    {
      id: ids.center,
      organizationId: ids.organization,
      name: "Rollback-only rehearsal school",
      status: "active",
      licensedCapacity: 1,
      timezone: "America/New_York",
    },
    {
      id: ids.secondaryCenter,
      organizationId: ids.organization,
      name: "Rollback-only second authorized school",
      status: "active",
      licensedCapacity: 1,
      timezone: "America/New_York",
    },
    {
      id: ids.wrongTenantCenter,
      organizationId: ids.wrongOrganization,
      name: "Rollback-only other-tenant school",
      status: "active",
      licensedCapacity: 1,
      timezone: "America/New_York",
    },
  ] });
  await tx.user.createMany({ data: [
    ...ACCESS_ROLES.map((role) => ({
      id: ids.users[role],
      tenantId: ids.tenant,
      organizationId: ids.organization,
      email: `${role.toLowerCase()}-${ids.run}@example.invalid`,
      name: `Rehearsal ${role}`,
      role,
    })),
    { id: ids.wrongSchoolUser, tenantId: ids.tenant, organizationId: ids.organization, email: `wrong-school-${ids.run}@example.invalid`, name: "Wrong-school rehearsal user", role: "BILLING_ADMIN" },
    { id: ids.wrongTenantUser, tenantId: ids.wrongTenant, organizationId: ids.wrongOrganization, email: `wrong-tenant-${ids.run}@example.invalid`, name: "Wrong-tenant rehearsal user", role: "BILLING_ADMIN" },
  ] });
  await tx.userAccessGrant.createMany({ data: [
    ...ACCESS_ROLES.map((role) => ({
      id: `${ids.prefix}-grant-${role.toLowerCase()}`,
      userId: ids.users[role],
      tenantId: ids.tenant,
      organizationId: ids.organization,
      centerId: ids.center,
      role,
      scopeType: "center",
      permissions: { rehearsalOnly: true },
    })),
    {
      id: `${ids.prefix}-grant-brand-admin-secondary`,
      userId: ids.users.BRAND_ADMIN,
      tenantId: ids.tenant,
      organizationId: ids.organization,
      centerId: ids.secondaryCenter,
      role: "BRAND_ADMIN",
      scopeType: "center",
      permissions: { rehearsalOnly: true, multiCenter: true },
    },
    {
      id: `${ids.prefix}-grant-wrong-school`,
      userId: ids.wrongSchoolUser,
      tenantId: ids.tenant,
      organizationId: ids.organization,
      centerId: ids.secondaryCenter,
      role: "BILLING_ADMIN",
      scopeType: "center",
      permissions: { rehearsalOnly: true },
    },
    {
      id: `${ids.prefix}-grant-wrong-tenant`,
      userId: ids.wrongTenantUser,
      tenantId: ids.wrongTenant,
      organizationId: ids.wrongOrganization,
      centerId: ids.wrongTenantCenter,
      role: "BILLING_ADMIN",
      scopeType: "center",
      permissions: { rehearsalOnly: true },
    },
  ] });
  await tx.classroom.create({ data: { id: ids.classroom, centerId: ids.center, name: "Rehearsal classroom", ageGroup: "preschool", capacity: 1 } });
  await tx.family.create({ data: {
    id: ids.family,
    centerId: ids.center,
    name: "Rollback-only rehearsal family",
    billingEmail: `family-${ids.run}@example.invalid`,
    customFields: { rehearsalOnly: true, parentVisibleResponsibilityCents: 3_000 },
  } });
  await tx.billingAccount.create({ data: {
    id: ids.billingAccount,
    familyId: ids.family,
    balanceCents: 3_000,
    autopayPlaceholder: false,
    sourceSystem: "rehearsal_fixture",
    externalId: `account:${ids.run}`,
    customFields: {
      rehearsalOnly: true,
      card: { brand: "visa", last4: "4242", paymentMethodReference: "pm_rehearsal_masked" },
      bank: { institution: "Rehearsal Bank", last4: "6789", accountReference: "ba_rehearsal_masked" },
    },
  } });
  await tx.invoice.create({ data: {
    id: ids.invoice,
    billingAccountId: ids.billingAccount,
    number: `REHEARSAL-INVOICE-${ids.run}`,
    status: "OPEN",
    dueDate: utcDay(-20),
    totalCents: 7_500,
    sourceSystem: "rehearsal_fixture",
    externalId: `invoice:${ids.run}`,
    customFields: { rehearsalOnly: true, parentVisible: true },
    items: { create: [{ id: ids.invoiceItem, description: "Representative parent charge", amountCents: 7_500 }] },
  } });
  await tx.payment.create({ data: {
    id: ids.payment,
    billingAccountId: ids.billingAccount,
    amountCents: 3_300,
    status: "PAID",
    provider: "rehearsal_mock",
    externalIdPlaceholder: `payment:${ids.run}`,
    paidAt: utcDay(-18),
    customFields: {
      rehearsalOnly: true,
      cardBrand: "visa",
      cardLast4: "4242",
      bankLast4: "6789",
      providerPaymentMethodReference: "pm_rehearsal_masked",
      noExternalTransaction: true,
    },
  } });
  await tx.ledgerEntry.createMany({ data: [
    {
      id: ids.invoiceLedgerEntry,
      billingAccountId: ids.billingAccount,
      invoiceId: ids.invoice,
      type: "invoice_charge",
      description: "Representative parent invoice charge",
      amountCents: 7_500,
      balanceAfterCents: 7_500,
      effectiveAt: utcDay(-20),
      createdAt: utcDay(-20),
      sourceSystem: "rehearsal_fixture",
      externalId: `invoice-ledger:${ids.run}`,
      metadata: { rehearsalOnly: true },
    },
    {
      id: ids.paymentLedgerEntry,
      billingAccountId: ids.billingAccount,
      paymentId: ids.payment,
      type: "payment",
      description: "Representative parent payment",
      amountCents: -3_300,
      balanceAfterCents: 4_200,
      effectiveAt: utcDay(-18),
      createdAt: utcDay(-18),
      sourceSystem: "rehearsal_fixture",
      externalId: `payment-ledger:${ids.run}`,
      metadata: { rehearsalOnly: true, noExternalTransaction: true },
    },
    {
      id: ids.legacyAgencyLedgerEntry,
      billingAccountId: ids.billingAccount,
      type: "agency_payment",
      description: "Legacy-only subsidy history; not evidence for dedicated-ledger inference",
      amountCents: -1_200,
      balanceAfterCents: 3_000,
      effectiveAt: utcDay(-16),
      createdAt: utcDay(-16),
      sourceSystem: "rehearsal_legacy_only",
      externalId: `legacy-agency-history:${ids.run}`,
      metadata: {
        rehearsalOnly: true,
        legacyOnlyCompatibilityHistory: true,
        unsupportedForClaimApprovalOrRemittanceInference: true,
        familyResponsibilityMustRemainUnchanged: true,
      },
    },
  ] });
  await tx.child.create({ data: {
    id: ids.child,
    familyId: ids.family,
    classroomId: ids.classroom,
    fullName: "Rollback-only rehearsal child",
    dateOfBirth: utcDay(-1_500),
    ageGroup: "preschool",
    enrollmentStatus: "enrolled",
  } });
  await tx.classroom.create({ data: { id: ids.secondaryClassroom, centerId: ids.secondaryCenter, name: "Second-school rehearsal classroom", ageGroup: "preschool", capacity: 1 } });
  await tx.family.create({ data: { id: ids.secondaryFamily, centerId: ids.secondaryCenter, name: "Rollback-only second-school family" } });
  await tx.child.create({ data: {
    id: ids.secondaryChild,
    familyId: ids.secondaryFamily,
    classroomId: ids.secondaryClassroom,
    fullName: "Rollback-only second-school child",
    dateOfBirth: utcDay(-1_400),
    ageGroup: "preschool",
    enrollmentStatus: "enrolled",
  } });
  await tx.agencyProgram.create({ data: {
    id: ids.program,
    centerId: ids.center,
    name: "Rehearsal Agency",
    stateCode: "IN",
    providerNumber: "REHEARSAL-PROVIDER",
    submissionMethod: "agency_portal",
    portalUrl: "https://example.invalid/rehearsal",
    paymentInstructions: "Rollback-only verified payment setup",
    receivableGlCode: "1200-AR",
    cashGlCode: "1000-CASH",
    adjustmentGlCode: "6900-ADJ",
    costCenterCode: "REHEARSAL-CENTER",
    requirements: [],
    status: "active",
  } });
  await tx.agencyProgram.create({ data: {
    id: ids.secondaryProgram,
    centerId: ids.secondaryCenter,
    name: "Second-school Rehearsal Agency",
    stateCode: "IN",
    providerNumber: "REHEARSAL-SECOND-PROVIDER",
    submissionMethod: "agency_portal",
    portalUrl: "https://example.invalid/rehearsal-secondary",
    paymentInstructions: "Rollback-only second-school setup",
    receivableGlCode: "1200-AR-SECOND",
    cashGlCode: "1000-CASH-SECOND",
    adjustmentGlCode: "6900-ADJ-SECOND",
    costCenterCode: "REHEARSAL-SECOND",
    requirements: [],
    status: "active",
  } });
  await tx.subsidyAuthorization.create({ data: {
    id: ids.secondaryAuthorization,
    centerId: ids.secondaryCenter,
    agencyProgramId: ids.secondaryProgram,
    familyId: ids.secondaryFamily,
    childId: ids.secondaryChild,
    authorizationNumber: `SECOND-AUTH-${ids.run}`,
    coverageStart: utcDay(-365),
    coverageEnd: utcDay(365),
    authorizedRateCents: 5_000,
    familyCopayCents: 0,
    unitType: "weekly",
    status: "active",
    requiredDocuments: [],
  } });
  await tx.agencyLedgerAccount.create({ data: { id: ids.secondaryAccount, centerId: ids.secondaryCenter, agencyProgramId: ids.secondaryProgram, balanceCents: 5_000 } });
  const secondaryApprovedAt = utcDay(-6);
  const secondaryExternalReference = `SECOND-DECISION-${ids.run}`;
  await tx.subsidyClaim.create({ data: {
    id: ids.secondaryClaim,
    centerId: ids.secondaryCenter,
    agencyProgramId: ids.secondaryProgram,
    authorizationId: ids.secondaryAuthorization,
    number: `SECOND-CLAIM-${ids.run}`,
    servicePeriodStart: utcDay(-60),
    servicePeriodEnd: utcDay(-54),
    dueDate: utcDay(-4),
    status: "draft",
    claimedCents: 5_000,
    approvedCents: null,
    paidCents: 0,
    submittedAt: utcDay(-8),
    approvedAt: null,
    externalReference: null,
    createdById: ids.users.BILLING_ADMIN,
    lines: { create: [{ id: ids.secondaryClaimLine, childId: ids.secondaryChild, description: "Second-school rehearsal subsidy care", serviceUnits: 1, unitType: "weekly", rateCents: 5_000, amountCents: 5_000 }] },
  } });
  await tx.subsidyClaim.update({
    where: { id: ids.secondaryClaim },
    data: { status: "approved", approvedCents: 5_000, approvedAt: secondaryApprovedAt, externalReference: secondaryExternalReference },
  });
  await tx.agencyLedgerEntry.create({ data: {
    id: ids.secondaryClaimLedgerEntry,
    agencyLedgerAccountId: ids.secondaryAccount,
    claimId: ids.secondaryClaim,
    type: "claim_approved",
    description: `Second-school agency receivable for SECOND-CLAIM-${ids.run}`,
    amountCents: 5_000,
    balanceAfterCents: 5_000,
    effectiveAt: secondaryApprovedAt,
    externalReference: secondaryExternalReference,
    glCodeSnapshot: "1200-AR-SECOND",
    costCenterCodeSnapshot: "REHEARSAL-SECOND",
    sourceSystem: "subsidy_agency",
    externalId: `claim-approved:${ids.secondaryClaim}`,
    createdAt: secondaryApprovedAt,
  } });
  await tx.subsidyAuthorization.create({ data: {
    id: ids.authorization,
    centerId: ids.center,
    agencyProgramId: ids.program,
    familyId: ids.family,
    childId: ids.child,
    authorizationNumber: `AUTH-${ids.run}`,
    coverageStart: utcDay(-365),
    coverageEnd: utcDay(365),
    authorizedRateCents: 10_000,
    familyCopayCents: 0,
    unitType: "weekly",
    status: "active",
    requiredDocuments: [],
  } });
  await tx.agencyLedgerAccount.create({ data: { id: ids.account, centerId: ids.center, agencyProgramId: ids.program, balanceCents: 40_000 } });

  for (const [index, claimId] of ids.claims.entries()) {
    const approvedAt = utcDay(-10 + index);
    const externalReference = `DECISION-${ids.run}-${index + 1}`;
    await tx.subsidyClaim.create({ data: {
      id: claimId,
      centerId: ids.center,
      agencyProgramId: ids.program,
      authorizationId: ids.authorization,
      number: `SUB-IN-${ids.run}-${index + 1}`,
      servicePeriodStart: utcDay(-80 + index * 7),
      servicePeriodEnd: utcDay(-74 + index * 7),
      dueDate: utcDay(-5 + index),
      status: "draft",
      claimedCents: 10_000,
      approvedCents: null,
      paidCents: 0,
      submittedAt: utcDay(-12 + index),
      approvedAt: null,
      externalReference: null,
      createdById: ids.users.BILLING_ADMIN,
      lines: { create: [{ childId: ids.child, description: "Rehearsal subsidy care", serviceUnits: 1, unitType: "weekly", rateCents: 10_000, amountCents: 10_000 }] },
    } });
    await tx.subsidyClaim.update({
      where: { id: claimId },
      data: { status: "approved", approvedCents: 10_000, approvedAt, externalReference },
    });
    await tx.agencyLedgerEntry.create({ data: {
      id: `${ids.prefix}-claim-ledger-${index + 1}`,
      agencyLedgerAccountId: ids.account,
      claimId,
      type: "claim_approved",
      description: `Rehearsal Agency receivable for SUB-IN-${ids.run}-${index + 1}`,
      amountCents: 10_000,
      balanceAfterCents: (index + 1) * 10_000,
      effectiveAt: approvedAt,
      externalReference,
      glCodeSnapshot: "1200-AR",
      costCenterCodeSnapshot: "REHEARSAL-CENTER",
      sourceSystem: "subsidy_agency",
      externalId: `claim-approved:${claimId}`,
      createdAt: approvedAt,
    } });
  }
  await flushDeferredConstraints();
  await tx.center.update({ where: { id: ids.center }, data: {
    agencyReconciliationEnabled: true,
    agencyReconciliationActivatedAt: utcDay(0),
    agencyReconciliationActivatedById: ids.users.BRAND_ADMIN,
    agencyReconciliationActivationReason: "Authorized disposable rehearsal only",
  } });
  await flushDeferredConstraints();
}

async function periodReconciliationSnapshot(tx, ids, endExclusive) {
  const [row] = await tx.$queryRaw`
    WITH scoped_claims AS (
      SELECT claim.id,
        COALESCE(claim."approvedCents", claim."claimedCents")::bigint AS "approvedCents",
        EXISTS (
          SELECT 1 FROM "AgencyLedgerEntry" entry
          WHERE entry."claimId" = claim.id
            AND entry."sourceSystem" = 'subsidy_agency'
            AND entry.type = 'claim_approved'
            AND entry."effectiveAt" < ${endExclusive}
        ) AS "approvedBeforeEnd"
      FROM "SubsidyClaim" claim
      WHERE claim."centerId" = ${ids.center}
        AND claim."agencyProgramId" = ${ids.program}
        AND claim."approvedCents" > 0
        AND claim.status IN ('approved', 'partially_paid', 'paid')
    ), scoped_remittances AS (
      SELECT remittance.id,
        remittance."amountCents"::bigint AS "amountCents",
        COALESCE(BOOL_OR(entry.type = 'remittance_received' AND entry."effectiveAt" < ${endExclusive}), FALSE) AS "receivedBeforeEnd",
        COALESCE(BOOL_OR(entry.type = 'remittance_reversal' AND entry."effectiveAt" < ${endExclusive}), FALSE) AS "reversalBeforeEnd"
      FROM "SubsidyRemittance" remittance
      JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
      LEFT JOIN "AgencyLedgerEntry" entry
        ON entry."remittanceId" = remittance.id
       AND entry."sourceSystem" = 'subsidy_agency'
      WHERE claim."centerId" = ${ids.center}
        AND claim."agencyProgramId" = ${ids.program}
      GROUP BY remittance.id, remittance."amountCents"
    ), scoped_adjustments AS (
      SELECT adjustment.id,
        adjustment."amountCents"::bigint AS "amountCents",
        COALESCE(BOOL_OR(entry.type LIKE 'adjustment_%' AND entry.type <> 'adjustment_reversal' AND entry."effectiveAt" < ${endExclusive}), FALSE) AS "adjustmentBeforeEnd",
        COALESCE(BOOL_OR(entry.type = 'adjustment_reversal' AND entry."effectiveAt" < ${endExclusive}), FALSE) AS "reversalBeforeEnd"
      FROM "AgencyLedgerAdjustment" adjustment
      LEFT JOIN "AgencyLedgerEntry" entry
        ON entry."adjustmentId" = adjustment.id
       AND entry."sourceSystem" = 'subsidy_agency'
      WHERE adjustment."centerId" = ${ids.center}
        AND adjustment."agencyProgramId" = ${ids.program}
        AND adjustment."reviewedAt" IS NOT NULL
        AND adjustment.status <> 'rejected'
      GROUP BY adjustment.id, adjustment."amountCents"
    )
    SELECT
      ${endExclusive}::timestamptz AS "endExclusive",
      COALESCE((SELECT SUM("approvedCents") FILTER (WHERE "approvedBeforeEnd") FROM scoped_claims), 0)::bigint AS "approvedExpectedCents",
      COALESCE((SELECT SUM(CASE WHEN "receivedBeforeEnd" THEN -"amountCents" ELSE 0 END + CASE WHEN "reversalBeforeEnd" THEN "amountCents" ELSE 0 END) FROM scoped_remittances), 0)::bigint AS "remittanceExpectedCents",
      COALESCE((SELECT SUM("amountCents") FILTER (WHERE "receivedBeforeEnd") FROM scoped_remittances), 0)::bigint AS "receiptEventCents",
      COALESCE((SELECT SUM("amountCents") FILTER (WHERE "reversalBeforeEnd") FROM scoped_remittances), 0)::bigint AS "reversalEventCents",
      COALESCE((SELECT SUM(CASE WHEN "adjustmentBeforeEnd" THEN "amountCents" ELSE 0 END + CASE WHEN "reversalBeforeEnd" THEN -"amountCents" ELSE 0 END) FROM scoped_adjustments), 0)::bigint AS "adjustmentExpectedCents",
      COALESCE((
        SELECT SUM(entry."amountCents")
        FROM "AgencyLedgerEntry" entry
        WHERE entry."agencyLedgerAccountId" = ${ids.account}
          AND entry."effectiveAt" < ${endExclusive}
          AND entry.type IN ('unapplied_cash', 'unapplied_cash_allocation', 'unapplied_cash_reversal')
      ), 0)::bigint AS "unappliedExpectedCents",
      COALESCE((
        SELECT SUM(entry."amountCents")
        FROM "AgencyLedgerEntry" entry
        WHERE entry."agencyLedgerAccountId" = ${ids.account}
          AND entry."effectiveAt" < ${endExclusive}
      ), 0)::bigint AS "ledgerBalanceCents"
  `;
  const expectedBalanceCents = row.approvedExpectedCents
    + row.remittanceExpectedCents
    + row.adjustmentExpectedCents
    + row.unappliedExpectedCents;
  return {
    ...row,
    expectedBalanceCents,
    varianceCents: row.ledgerBalanceCents - expectedBalanceCents,
  };
}

async function databaseSecurityEvidence(tx) {
  const rows = await tx.$queryRaw`
    WITH expected(table_name) AS (VALUES
      ('AgencyLedgerAccount'),
      ('AgencyLedgerEntry'),
      ('AgencyRemittanceBatch'),
      ('AgencyRemittanceAllocation'),
      ('AgencyLedgerAdjustment'),
      ('AgencyAccountingPeriod')
    )
    SELECT expected.table_name AS "tableName",
      table_row.relrowsecurity AS "rlsEnabled",
      table_row.relforcerowsecurity AS "rlsForced",
      has_table_privilege('anon', table_row.oid, 'SELECT,INSERT,UPDATE,DELETE') AS "anonHasDataPrivilege",
      has_table_privilege('authenticated', table_row.oid, 'SELECT,INSERT,UPDATE,DELETE') AS "authenticatedHasDataPrivilege"
    FROM expected
    JOIN pg_class table_row
      ON table_row.relname = expected.table_name
     AND table_row.relnamespace = 'public'::regnamespace
    ORDER BY expected.table_name
  `;
  assert.equal(rows.length, 6);
  for (const row of rows) {
    assert.equal(row.rlsEnabled, true, `${row.tableName} must have RLS enabled.`);
    assert.equal(row.anonHasDataPrivilege, false, `${row.tableName} must deny anon data privileges.`);
    assert.equal(row.authenticatedHasDataPrivilege, false, `${row.tableName} must deny authenticated data privileges.`);
  }
  const [uniqueIndex] = await tx.$queryRaw`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'AgencyRemittanceAllocation'
      AND indexname = 'AgencyRemittanceAllocation_active_batch_claim_key'
  `;
  assert.match(uniqueIndex?.indexdef ?? "", /CREATE UNIQUE INDEX[\s\S]*\("batchId", "claimId"\)[\s\S]*WHERE[\s\S]*status[\s\S]*pending_review[\s\S]*posted/i, "The active batch/claim partial unique index is missing or has an unexpected predicate.");
  return { tables: rows, activeBatchClaimUniqueIndex: uniqueIndex.indexdef };
}

async function fetchExports(user, centerId) {
  const exports = {};
  for (const [name, exportQuery] of Object.entries(EXPORT_QUERIES)) {
    exports[name] = await getAs(user, `centerId=${centerId}&${exportQuery}`);
  }
  return exports;
}

async function validateWorkflowExports(tx, ids, exportContents) {
  const parsed = Object.fromEntries(Object.entries(exportContents).map(([name, csv]) => {
    const rows = parseCsv(csv);
    assert.deepEqual(rows[0], CSV_HEADERS[name], `${name} export header changed.`);
    assert.ok(rows.slice(1).every((row) => row.length === CSV_HEADERS[name].length), `${name} export contains a malformed row.`);
    return [name, rows];
  }));

  const claimRows = await tx.subsidyClaim.findMany({
    where: { id: { in: ids.claims } },
    orderBy: { id: "asc" },
    include: {
      agencyProgram: true,
      authorization: { include: { family: true, child: true } },
    },
  });
  assert.equal(claimRows.length, 4);
  assert.equal(parsed.claims.length - 1, claimRows.length);
  for (const [index, claim] of claimRows.entries()) {
    const row = parsed.claims[index + 1];
    assert.equal(row[0], claim.number);
    assert.equal(row[1], "Rehearsal Agency");
    assert.equal(row[2], "Rollback-only rehearsal family");
    assert.equal(row[3], "Rollback-only rehearsal child");
    assert.equal(row[4], claim.servicePeriodStart.toISOString().slice(0, 10));
    assert.equal(row[5], claim.servicePeriodEnd.toISOString().slice(0, 10));
    assert.equal(row[6], claim.status);
    assert.equal(numericCell(row[7]), claim.claimedCents / 100);
    assert.equal(numericCell(row[8]), claim.approvedCents / 100);
    assert.equal(numericCell(row[9]), claim.paidCents / 100);
    assert.equal(row[10], "");
  }
  const claimStatuses = Object.fromEntries(claimRows.map((claim) => [claim.number, claim.status]));
  assert.deepEqual(Object.values(claimStatuses).sort(), ["approved", "approved", "paid", "partially_paid"]);
  assert.equal(claimRows.reduce((sum, claim) => sum + (claim.approvedCents ?? 0), 0), 40_000);
  assert.equal(claimRows.reduce((sum, claim) => sum + claim.paidCents, 0), 12_000);

  const batches = await tx.agencyRemittanceBatch.findMany({
    where: { centerId: ids.center },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: {
      agencyProgram: true,
      center: true,
      allocations: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { claim: true } },
    },
  });
  const expectedDepositRows = batches.flatMap((batch) => (batch.allocations.length ? batch.allocations : [null]).map((allocation) => ({ batch, allocation })));
  assert.equal(batches.length, 5);
  assert.equal(batches.reduce((sum, batch) => sum + batch.totalCents, 0), 41_000);
  assert.equal(parsed.deposits.length - 1, expectedDepositRows.length);
  for (const [index, expected] of expectedDepositRows.entries()) {
    const { batch, allocation } = expected;
    const row = parsed.deposits[index + 1];
    assert.equal(row[0], batch.center.name);
    assert.equal(row[1], batch.agencyProgram.name);
    assert.equal(row[2], batch.agencyProgram.programName ?? "");
    assert.equal(row[3], batch.paidAt.toISOString().slice(0, 10));
    assert.equal(row[4], batch.externalReference);
    assert.equal(row[5], batch.paymentMethod);
    assert.equal(row[6], batch.cashGlCodeSnapshot ?? "");
    assert.equal(row[7], batch.costCenterCodeSnapshot ?? "");
    assert.equal(numericCell(row[8]), batch.totalCents / 100);
    assert.equal(numericCell(row[9]), batch.allocatedCents / 100);
    assert.equal(numericCell(row[10]), batch.unappliedCents / 100);
    assert.equal(row[11], batch.status);
    assert.equal(row[12], batch.evidenceName ?? "");
    assert.equal(row[13], batch.evidenceReference ?? "");
    assert.equal(row[14], batch.followUpOwnerId ?? "");
    assert.equal(row[15], batch.followUpDueAt?.toISOString().slice(0, 10) ?? "");
    assert.equal(row[16], allocation?.claim.number ?? "");
    if (allocation) assert.equal(numericCell(row[17]), allocation.amountCents / 100);
    else assert.equal(row[17], "");
    assert.equal(row[18], allocation?.status ?? "");
  }
  const batchStatuses = Object.fromEntries([...new Set(batches.map((batch) => batch.status))].sort().map((status) => [status, batches.filter((batch) => batch.status === status).length]));
  assert.deepEqual(batchStatuses, { reconciled: 2, rejected: 2, reversed: 1 });
  assert.deepEqual([...new Set(batches.map((batch) => batch.externalReference))].sort(), [
    `BACKDATED-${ids.run}`,
    `DEPOSIT-${ids.run}`,
    `REJECT-REPLACE-${ids.run}`,
  ].map((reference) => reference.toUpperCase()));

  const ledgerEntries = await tx.agencyLedgerEntry.findMany({
    where: { agencyLedgerAccountId: ids.account },
    orderBy: [{ agencyLedgerAccountId: "asc" }, { effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: {
      agencyLedgerAccount: { include: { agencyProgram: true } },
      claim: { include: { authorization: { include: { family: true, child: true } } } },
    },
  });
  assert.equal(parsed.ledger.length - 1, ledgerEntries.length);
  let runningBalanceCents = 0;
  for (const [index, entry] of ledgerEntries.entries()) {
    runningBalanceCents += entry.amountCents;
    assert.equal(entry.balanceAfterCents, runningBalanceCents, `Stored running balance is wrong at ${entry.id}.`);
    const row = parsed.ledger[index + 1];
    assert.equal(row[0], entry.effectiveAt.toISOString().slice(0, 10));
    assert.equal(row[1], entry.agencyLedgerAccount.agencyProgram.name);
    assert.equal(row[2], entry.agencyLedgerAccount.agencyProgram.programName ?? "");
    assert.equal(row[3], entry.type);
    assert.equal(row[4], entry.glCodeSnapshot ?? "");
    assert.equal(row[5], entry.costCenterCodeSnapshot ?? "");
    assert.equal(row[6], entry.claim?.number ?? "");
    assert.equal(row[7], entry.claim?.authorization?.family.name ?? "");
    assert.equal(row[8], entry.claim?.authorization?.child.fullName ?? "");
    assert.equal(row[9], entry.externalReference ?? "");
    if (entry.amountCents > 0) assert.equal(numericCell(row[10]), entry.amountCents / 100);
    else assert.equal(row[10], "");
    if (entry.amountCents < 0) assert.equal(numericCell(row[11]), Math.abs(entry.amountCents) / 100);
    else assert.equal(row[11], "");
    assert.equal(numericCell(row[12]), entry.amountCents / 100);
    assert.equal(numericCell(row[13]), entry.balanceAfterCents / 100);
  }
  assert.equal(runningBalanceCents, 28_000);
  const ledgerTypeCounts = Object.fromEntries([...new Set(ledgerEntries.map((entry) => entry.type))].sort().map((type) => [type, ledgerEntries.filter((entry) => entry.type === type).length]));
  assert.equal(ledgerTypeCounts.claim_approved, 4);
  assert.equal(ledgerTypeCounts.remittance_received, 6);
  assert.equal(ledgerTypeCounts.remittance_reversal, 4);
  assert.equal(ledgerTypeCounts.adjustment_write_off, 1);
  assert.equal(ledgerTypeCounts.adjustment_reversal, 1);

  assert.equal(parsed.reconciliation.length, 2);
  const reconciliation = parsed.reconciliation[1];
  assert.deepEqual(reconciliation.slice(0, 7), [
    "Rollback-only rehearsal school",
    "Rehearsal Agency",
    "",
    "1200-AR",
    "1000-CASH",
    "6900-ADJ",
    "REHEARSAL-CENTER",
  ]);
  const reconciliationValues = reconciliation.slice(7).map(numericCell);
  assert.deepEqual(reconciliationValues, [400, 120, 0, 0, 280, 280, 0, 0]);

  return {
    claims: {
      rowCount: claimRows.length,
      approvedCents: 40_000,
      paidCents: 12_000,
      statusesByClaimNumber: claimStatuses,
      sha256: createHash("sha256").update(exportContents.claims).digest("hex"),
    },
    deposits: {
      batchCount: batches.length,
      rowCount: expectedDepositRows.length,
      proposedBatchTotalCents: 41_000,
      statuses: batchStatuses,
      sha256: createHash("sha256").update(exportContents.deposits).digest("hex"),
    },
    ledger: {
      rowCount: ledgerEntries.length,
      netCents: runningBalanceCents,
      typeCounts: ledgerTypeCounts,
      chronologicalRunningBalancesVerified: true,
      sha256: createHash("sha256").update(exportContents.ledger).digest("hex"),
    },
    reconciliation: {
      rowCount: 1,
      approvedCents: 40_000,
      remittedCents: 12_000,
      unappliedCashCents: 0,
      adjustmentCents: 0,
      expectedBalanceCents: 28_000,
      ledgerBalanceCents: 28_000,
      varianceCents: 0,
      openBatchExceptions: 0,
      sha256: createHash("sha256").update(exportContents.reconciliation).digest("hex"),
    },
  };
}

async function verifyAccessContinuity(tx, ids, canonicalExports) {
  const accountingReviewRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "BILLING_ADMIN"]);
  const seededUsers = await tx.user.findMany({
    where: { id: { in: [...Object.values(ids.users), ids.wrongSchoolUser, ids.wrongTenantUser] } },
    orderBy: { id: "asc" },
    select: { id: true, tenantId: true, organizationId: true, role: true, isActive: true },
  });
  const seededGrants = await tx.userAccessGrant.findMany({
    where: { id: { startsWith: `${ids.prefix}-grant-` } },
    orderBy: { id: "asc" },
    select: { id: true, userId: true, tenantId: true, organizationId: true, centerId: true, role: true, scopeType: true, isActive: true },
  });
  assert.equal(seededUsers.length, ACCESS_ROLES.length + 2, "Every exercised role and isolation actor must exist in the rehearsal database.");
  assert.equal(seededGrants.length, ACCESS_ROLES.length + 3, "Every exercised actor must have the expected exact-school database grant fixture.");
  assert.ok(seededUsers.every((user) => user.isActive));
  assert.ok(seededGrants.every((grant) => grant.isActive && grant.scopeType === "center"));

  const roleResults = {};
  for (const role of ACCESS_ROLES) {
    const user = currentUser(role, ids, [ids.center]);
    if (BILLING_ROLES.has(role)) {
      const body = await getAs(user, `centerId=${ids.center}`);
      assert.equal(body.capabilities.canManageAgencyBilling, true, `${role} lost its agency billing mutation capability.`);
      assert.equal(body.capabilities.canReviewAgencyPosting, accountingReviewRoles.has(role), `${role} review capability changed unexpectedly.`);
      const roleExports = await fetchExports(user, ids.center);
      for (const [name, csv] of Object.entries(roleExports)) assert.equal(csv, canonicalExports[name], `${role} received a different ${name} export.`);
      await postAs(user, {
        action: "recordRemittance",
        centerId: ids.center,
        claimId: ids.claims[2],
        amountDollars: "1.00",
        externalReference: `ROLE-DIRECT-${role}-${ids.run}`,
        paidAt: dayInput(1),
        paymentMethod: "ach",
      }, 400);
      await postAs(user, {
        action: "prepareRemittanceBatch",
        centerId: ids.center,
        agencyProgramId: ids.program,
        totalDollars: "1.00",
        externalReference: `ROLE-BATCH-${role}-${ids.run}`,
        paidAt: dayInput(1),
        paymentMethod: "ach",
        evidenceName: "Access continuity boundary",
        evidenceReference: `role:${role}:${ids.run}`,
        followUpDueAt: dayInput(0),
        allocations: [],
        idempotencyKey: randomUUID(),
      }, 400);
      roleResults[role] = {
        exactSchoolRead: 200,
        exactSchoolExports: Object.fromEntries(Object.keys(EXPORT_QUERIES).map((name) => [name, 200])),
        baselineDirectMutationReachedServerDateValidation: true,
        reviewedBatchPreparationReachedServerDateValidation: true,
        accountingReviewCapability: accountingReviewRoles.has(role),
      };
      continue;
    }

    if (role === "READ_ONLY_AUDITOR") {
      const body = await getAs(user, `centerId=${ids.center}`);
      assert.equal(body.capabilities.canManageAgencyBilling, false);
      const roleExports = await fetchExports(user, ids.center);
      for (const [name, csv] of Object.entries(roleExports)) assert.equal(csv, canonicalExports[name], `Auditor received a different ${name} export.`);
      for (const action of AGENCY_POST_ACTIONS) assertDeniedWithoutAgencyData(await postAs(user, { action, centerId: ids.center }, 403));
      roleResults[role] = {
        exactSchoolRead: 200,
        exactSchoolExports: Object.fromEntries(Object.keys(EXPORT_QUERIES).map((name) => [name, 200])),
        allAgencyPostActionsDenied: AGENCY_POST_ACTIONS.length,
      };
      continue;
    }

    assert.ok(NON_BILLING_ROLES.includes(role));
    assertDeniedWithoutAgencyData(await getAs(user, `centerId=${ids.center}`, 403));
    for (const exportQuery of Object.values(EXPORT_QUERIES)) assertDeniedWithoutAgencyData(await getAs(user, `centerId=${ids.center}&${exportQuery}`, 403));
    for (const action of AGENCY_POST_ACTIONS) assertDeniedWithoutAgencyData(await postAs(user, { action, centerId: ids.center }, 403));
    roleResults[role] = {
      exactSchoolRead: 403,
      exactSchoolExports: Object.fromEntries(Object.keys(EXPORT_QUERIES).map((name) => [name, 403])),
      allAgencyPostActionsDenied: AGENCY_POST_ACTIONS.length,
    };
  }

  const preparer = currentUser("BILLING_ADMIN", ids, [ids.center]);
  assertDeniedWithoutAgencyData(await getAs(preparer, `centerId=${ids.secondaryCenter}`, 403));
  for (const exportQuery of Object.values(EXPORT_QUERIES)) assertDeniedWithoutAgencyData(await getAs(preparer, `centerId=${ids.secondaryCenter}&${exportQuery}`, 403));
  assertDeniedWithoutAgencyData(await postAs(preparer, { action: "createProgram", centerId: ids.secondaryCenter, name: "Forbidden", stateCode: "IN" }, 403));

  const wrongSchoolActor = currentUser("BILLING_ADMIN", ids, [ids.secondaryCenter], { id: ids.wrongSchoolUser });
  assertDeniedWithoutAgencyData(await getAs(wrongSchoolActor, `centerId=${ids.center}`, 403));
  assertDeniedWithoutAgencyData(await postAs(wrongSchoolActor, { action: "createProgram", centerId: ids.center, name: "Forbidden", stateCode: "IN" }, 403));

  const wrongTenantActor = currentUser("BILLING_ADMIN", ids, [ids.wrongTenantCenter], {
    id: ids.wrongTenantUser,
    tenantId: ids.wrongTenant,
    organizationId: ids.wrongOrganization,
  });
  assertDeniedWithoutAgencyData(await getAs(wrongTenantActor, `centerId=${ids.center}`, 403));
  for (const exportQuery of Object.values(EXPORT_QUERIES)) assertDeniedWithoutAgencyData(await getAs(wrongTenantActor, `centerId=${ids.center}&${exportQuery}`, 403));
  assertDeniedWithoutAgencyData(await postAs(wrongTenantActor, { action: "createProgram", centerId: ids.center, name: "Forbidden", stateCode: "IN" }, 403));

  const multiCenterReader = currentUser("BRAND_ADMIN", ids, [ids.center, ids.secondaryCenter]);
  const consolidated = await getAs(multiCenterReader);
  assert.ok(consolidated.programs.some((program) => program.id === ids.program));
  assert.ok(consolidated.programs.some((program) => program.id === ids.secondaryProgram));
  assert.ok(consolidated.programs.every((program) => [ids.center, ids.secondaryCenter].includes(program.centerId)));
  const primaryOnlyConsolidated = await getAs(preparer);
  assert.ok(primaryOnlyConsolidated.programs.some((program) => program.id === ids.program));
  assert.ok(primaryOnlyConsolidated.programs.every((program) => program.centerId === ids.center));
  assertDeniedWithoutAgencyData(await postAs(multiCenterReader, { action: "createProgram", centerId: "all", name: "Forbidden", stateCode: "IN" }, 403));

  const auditCountBeforeCrossScope = await tx.auditLog.count({ where: { tenantId: ids.tenant } });
  await postAs(multiCenterReader, {
    action: "updateProgram",
    centerId: ids.center,
    agencyProgramId: ids.secondaryProgram,
    name: "Cross-scope mutation must remain invisible",
    stateCode: "IN",
  }, 404);
  await postAs(multiCenterReader, {
    action: "approveRemittanceBatch",
    centerId: ids.secondaryCenter,
    batchId: ids.primaryBatchId,
  }, 404);
  await postAs(multiCenterReader, {
    action: "recordRemittance",
    centerId: ids.secondaryCenter,
    claimId: ids.claims[0],
    amountDollars: "1.00",
    externalReference: `CROSS-SCOPE-${ids.run}`,
    paidAt: dayInput(0),
    paymentMethod: "ach",
  }, 404);
  await postAs(multiCenterReader, {
    action: "requestLedgerAdjustment",
    centerId: ids.secondaryCenter,
    ledgerAccountId: ids.account,
    adjustmentType: "write_off",
    amountDollars: "1.00",
    effectiveAt: dayInput(0),
    reason: "Cross-scope mutation must remain invisible",
    evidenceName: "Rehearsal evidence",
    evidenceReference: `cross-scope:${ids.run}`,
    followUpDueAt: dayInput(0),
    idempotencyKey: randomUUID(),
  }, 404);
  const auditCountAfterCrossScope = await tx.auditLog.count({ where: { tenantId: ids.tenant } });
  assert.equal(auditCountAfterCrossScope, auditCountBeforeCrossScope, "Cross-school resource probes must not write audit records.");

  return {
    handlerMockEvidence: {
      roleResults,
      exactSchoolDenial: true,
      wrongSchoolGrantDenial: true,
      wrongTenantGrantDenial: true,
      crossCenterResourceIdsReturn404WithoutAudit: true,
      omittedCenterConsolidationRestrictedToResolvedAuthorizedCenters: true,
      postCenterIdAllDenied: true,
    },
    databaseFixtureEvidence: {
      activeUserCount: seededUsers.length,
      exactCenterGrantCount: seededGrants.length,
      roles: [...new Set(seededUsers.map((user) => user.role))].sort(),
      distinctTenantCount: new Set(seededUsers.map((user) => user.tenantId)).size,
    },
    limitation: "Authentication/session resolution and production grants are mocked at the route boundary. This proves handler behavior for pre-resolved exact-school scopes; it does not prove getCurrentUser, a real authenticated browser session, or service-role bypass behavior.",
  };
}

async function runWorkflow(tx, ids) {
  const preparer = currentUser("BILLING_ADMIN", ids, [ids.center]);
  const reviewer = currentUser("BRAND_ADMIN", ids, [ids.center]);
  const future = dayInput(1);
  const paidDay = dayInput(-2);
  const followUpDay = dayInput(0);

  const futureBatch = await postAs(preparer, {
    action: "prepareRemittanceBatch", centerId: ids.center, agencyProgramId: ids.program,
    totalDollars: "1.00", externalReference: `FUTURE-${ids.run}`, paidAt: future, paymentMethod: "ach",
    evidenceName: "Rehearsal evidence", evidenceReference: `evidence:${ids.run}`, followUpDueAt: followUpDay,
    allocations: [], idempotencyKey: randomUUID(),
  }, 400);
  assert.match(futureBatch.error, /current UTC accounting day/i);
  const futureDirect = await postAs(preparer, {
    action: "recordRemittance", centerId: ids.center, claimId: ids.claims[0], amountDollars: "1.00",
    externalReference: `FUTURE-DIRECT-${ids.run}`, paidAt: future, paymentMethod: "ach",
  }, 400);
  assert.match(futureDirect.error, /current UTC accounting day/i);
  const futureAdjustment = await postAs(preparer, {
    action: "requestLedgerAdjustment", centerId: ids.center, ledgerAccountId: ids.account,
    adjustmentType: "write_off", amountDollars: "1.00", effectiveAt: future,
    reason: "Future adjustment rejection rehearsal", evidenceName: "Rehearsal approval",
    evidenceReference: `future-adjustment:${ids.run}`, followUpDueAt: followUpDay, idempotencyKey: randomUUID(),
  }, 400);
  assert.match(futureAdjustment.error, /current UTC accounting day/i);

  const batchBody = {
    action: "prepareRemittanceBatch", centerId: ids.center, agencyProgramId: ids.program,
    totalDollars: "250.00", externalReference: `DEPOSIT-${ids.run}`, paidAt: paidDay, paymentMethod: "ach",
    evidenceName: "Rehearsal bank advice", evidenceReference: `bank:${ids.run}`, followUpDueAt: followUpDay,
    allocations: [
      { claimId: ids.claims[0], amountDollars: "100.00", notes: "Initial claim one" },
      { claimId: ids.claims[1], amountDollars: "50.00", notes: "Initial claim two" },
    ],
    idempotencyKey: randomUUID(),
  };
  const prepared = await postAs(preparer, batchBody);
  assert.equal(prepared.reused, false);
  const replayed = await postAs(preparer, batchBody);
  assert.equal(replayed.reused, true);
  assert.equal(replayed.batch.id, prepared.batch.id);
  await postAs(preparer, { action: "approveRemittanceBatch", centerId: ids.center, batchId: prepared.batch.id }, 403);
  const approved = await postAs(reviewer, { action: "approveRemittanceBatch", centerId: ids.center, batchId: prepared.batch.id });
  assert.equal(approved.batch.status, "partially_allocated");
  assert.equal(approved.batch.unappliedCents, 10_000);

  const rejectedAllocationBody = {
    action: "requestBatchAllocation", centerId: ids.center, batchId: prepared.batch.id,
    claimId: ids.claims[2], amountDollars: "50.00", notes: "First allocation proposal", idempotencyKey: randomUUID(),
  };
  const allocationPrepared = await postAs(preparer, rejectedAllocationBody);
  const allocationReplay = await postAs(preparer, rejectedAllocationBody);
  assert.equal(allocationReplay.reused, true);
  assert.equal(allocationReplay.allocation.id, allocationPrepared.allocation.id);
  await postAs(preparer, { action: "approveBatchAllocation", centerId: ids.center, allocationId: allocationPrepared.allocation.id }, 403);
  await postAs(reviewer, { action: "rejectBatchAllocation", centerId: ids.center, allocationId: allocationPrepared.allocation.id, reason: "Correct the allocation amount" });
  const correctedAllocation = await postAs(preparer, {
    ...rejectedAllocationBody, amountDollars: "40.00", notes: "Corrected allocation", idempotencyKey: randomUUID(),
  });
  await postAs(reviewer, { action: "approveBatchAllocation", centerId: ids.center, allocationId: correctedAllocation.allocation.id });
  const duplicateAllocation = await postAs(preparer, {
    ...rejectedAllocationBody, amountDollars: "10.00", notes: "Must not duplicate active claim", idempotencyKey: randomUUID(),
  }, 409);
  assert.match(duplicateAllocation.error, /already has an active allocation/i);
  const finalAllocation = await postAs(preparer, {
    action: "requestBatchAllocation", centerId: ids.center, batchId: prepared.batch.id,
    claimId: ids.claims[3], amountDollars: "60.00", notes: "Allocate remaining cash", idempotencyKey: randomUUID(),
  });
  const finalAllocationPosted = await postAs(reviewer, { action: "approveBatchAllocation", centerId: ids.center, allocationId: finalAllocation.allocation.id });
  assert.equal(finalAllocationPosted.batch.status, "reconciled");
  assert.equal(finalAllocationPosted.batch.unappliedCents, 0);

  const adjustmentPrepared = await postAs(preparer, {
    action: "requestLedgerAdjustment", centerId: ids.center, ledgerAccountId: ids.account,
    adjustmentType: "write_off", amountDollars: "10.00", effectiveAt: dayInput(0),
    reason: "Rollback-only adjustment rehearsal", evidenceName: "Rehearsal approval",
    evidenceReference: `adjustment:${ids.run}`, followUpDueAt: followUpDay, idempotencyKey: randomUUID(),
  });
  await postAs(preparer, { action: "approveLedgerAdjustment", centerId: ids.center, adjustmentId: adjustmentPrepared.adjustment.id }, 403);
  await postAs(reviewer, { action: "approveLedgerAdjustment", centerId: ids.center, adjustmentId: adjustmentPrepared.adjustment.id, reviewNotes: "Independent approval" });
  await postAs(reviewer, { action: "reverseLedgerAdjustment", centerId: ids.center, adjustmentId: adjustmentPrepared.adjustment.id, reason: "Reverse rehearsal adjustment" });

  await postAs(reviewer, { action: "reverseRemittanceBatch", centerId: ids.center, batchId: prepared.batch.id, reason: "Rollback-only deposit reversal rehearsal" });
  ids.primaryBatchId = prepared.batch.id;
  const chronology = await tx.$queryRaw`
    SELECT receipt."remittanceId",
      receipt."effectiveAt" AS "receiptEffectiveAt",
      reversal."effectiveAt" AS "reversalEffectiveAt"
    FROM "AgencyLedgerEntry" receipt
    JOIN "AgencyLedgerEntry" reversal
      ON reversal."remittanceId" = receipt."remittanceId"
     AND reversal.type = 'remittance_reversal'
     AND reversal."sourceSystem" = 'subsidy_agency'
    WHERE receipt."remittanceBatchId" = ${prepared.batch.id}
      AND receipt.type = 'remittance_received'
      AND receipt."sourceSystem" = 'subsidy_agency'
    ORDER BY receipt."remittanceId"
  `;
  assert.equal(chronology.length, 4);
  assert.ok(chronology.every((row) => row.reversalEffectiveAt >= row.receiptEffectiveAt), "A deposit reversal became effective before its receipt.");

  const receiptDayStart = new Date(`${paidDay}T00:00:00.000Z`);
  const receiptFollowingDayStart = new Date(receiptDayStart);
  receiptFollowingDayStart.setUTCDate(receiptFollowingDayStart.getUTCDate() + 1);
  const reversalDayStart = new Date(`${dayInput(0)}T00:00:00.000Z`);
  const reversalFollowingDayStart = new Date(reversalDayStart);
  reversalFollowingDayStart.setUTCDate(reversalFollowingDayStart.getUTCDate() + 1);
  const cutoffSnapshots = {
    receiptDayStart: await periodReconciliationSnapshot(tx, ids, receiptDayStart),
    receiptFollowingDayStart: await periodReconciliationSnapshot(tx, ids, receiptFollowingDayStart),
    reversalDayStart: await periodReconciliationSnapshot(tx, ids, reversalDayStart),
    reversalFollowingDayStart: await periodReconciliationSnapshot(tx, ids, reversalFollowingDayStart),
  };
  assert.deepEqual(
    [
      cutoffSnapshots.receiptDayStart.receiptEventCents,
      cutoffSnapshots.receiptDayStart.reversalEventCents,
      cutoffSnapshots.receiptDayStart.expectedBalanceCents,
      cutoffSnapshots.receiptDayStart.ledgerBalanceCents,
      cutoffSnapshots.receiptDayStart.varianceCents,
    ],
    [0n, 0n, 40_000n, 40_000n, 0n],
    "The 00:00 UTC start of the receipt day must exclude that day's noon receipt.",
  );
  assert.deepEqual(
    [
      cutoffSnapshots.receiptFollowingDayStart.receiptEventCents,
      cutoffSnapshots.receiptFollowingDayStart.reversalEventCents,
      cutoffSnapshots.receiptFollowingDayStart.remittanceExpectedCents,
      cutoffSnapshots.receiptFollowingDayStart.unappliedExpectedCents,
      cutoffSnapshots.receiptFollowingDayStart.expectedBalanceCents,
      cutoffSnapshots.receiptFollowingDayStart.ledgerBalanceCents,
      cutoffSnapshots.receiptFollowingDayStart.varianceCents,
    ],
    [15_000n, 0n, -15_000n, -10_000n, 15_000n, 15_000n, 0n],
    "The next 00:00 UTC cutoff must include receipt events independently and exclude later allocations/reversals.",
  );
  assert.deepEqual(
    [
      cutoffSnapshots.reversalDayStart.receiptEventCents,
      cutoffSnapshots.reversalDayStart.reversalEventCents,
      cutoffSnapshots.reversalDayStart.expectedBalanceCents,
      cutoffSnapshots.reversalDayStart.ledgerBalanceCents,
      cutoffSnapshots.reversalDayStart.varianceCents,
    ],
    [15_000n, 0n, 15_000n, 15_000n, 0n],
    "The 00:00 UTC start of the reversal day must still exclude that day's reversal.",
  );
  assert.deepEqual(
    [
      cutoffSnapshots.reversalFollowingDayStart.receiptEventCents,
      cutoffSnapshots.reversalFollowingDayStart.reversalEventCents,
      cutoffSnapshots.reversalFollowingDayStart.remittanceExpectedCents,
      cutoffSnapshots.reversalFollowingDayStart.unappliedExpectedCents,
      cutoffSnapshots.reversalFollowingDayStart.adjustmentExpectedCents,
      cutoffSnapshots.reversalFollowingDayStart.expectedBalanceCents,
      cutoffSnapshots.reversalFollowingDayStart.ledgerBalanceCents,
      cutoffSnapshots.reversalFollowingDayStart.varianceCents,
    ],
    [25_000n, 25_000n, 0n, 0n, 0n, 40_000n, 40_000n, 0n],
    "The following 00:00 UTC cutoff must include receipt and reversal events independently with zero variance.",
  );

  const replacement = await postAs(preparer, {
    ...batchBody,
    totalDollars: "100.00",
    paidAt: dayInput(0),
    allocations: [{ claimId: ids.claims[0], amountDollars: "100.00", notes: "Corrected after reversal" }],
    idempotencyKey: randomUUID(),
  });
  await postAs(reviewer, { action: "approveRemittanceBatch", centerId: ids.center, batchId: replacement.batch.id });

  const rejectedBatchBody = {
    ...batchBody,
    totalDollars: "20.00",
    externalReference: `REJECT-REPLACE-${ids.run}`,
    paidAt: dayInput(0),
    allocations: [{ claimId: ids.claims[1], amountDollars: "20.00", notes: "Reject this proposal" }],
    idempotencyKey: randomUUID(),
  };
  const rejectedBatch = await postAs(preparer, rejectedBatchBody);
  await postAs(reviewer, { action: "rejectRemittanceBatch", centerId: ids.center, batchId: rejectedBatch.batch.id, reason: "Replace with corrected evidence" });
  const batchReplacement = await postAs(preparer, { ...rejectedBatchBody, idempotencyKey: randomUUID(), evidenceReference: `corrected-bank:${ids.run}` });
  await postAs(reviewer, { action: "approveRemittanceBatch", centerId: ids.center, batchId: batchReplacement.batch.id });

  const pendingAdjustment = await postAs(preparer, {
    action: "requestLedgerAdjustment", centerId: ids.center, ledgerAccountId: ids.account,
    adjustmentType: "correction_increase", amountDollars: "1.00", effectiveAt: dayInput(0),
    reason: "Temporary close blocker", evidenceName: "Rehearsal approval",
    evidenceReference: `pending-adjustment:${ids.run}`, followUpDueAt: followUpDay, idempotencyKey: randomUUID(),
  });
  const closeBlocked = await postAs(reviewer, {
    action: "closeAccountingPeriod", centerId: ids.center, name: "Current rehearsal period",
    startDate: dayInput(-1), endDate: dayInput(0), reason: "Must be blocked by pending evidence",
  }, 409);
  assert.match(closeBlocked.error, /pending adjustment/i);
  await postAs(reviewer, { action: "rejectLedgerAdjustment", centerId: ids.center, adjustmentId: pendingAdjustment.adjustment.id, reviewNotes: "Remove the close blocker" });

  const olderPeriod = await postAs(reviewer, {
    action: "closeAccountingPeriod", centerId: ids.center, name: "Earlier rehearsal period",
    startDate: dayInput(-30), endDate: paidDay, reason: "Verify receipt before reversal cutoff",
  });
  const laterPeriod = await postAs(reviewer, {
    action: "closeAccountingPeriod", centerId: ids.center, name: "Current rehearsal period",
    startDate: dayInput(-1), endDate: dayInput(0), reason: "Verify current reconciliation",
  });
  const earlierReopenBlocked = await postAs(reviewer, {
    action: "reopenAccountingPeriod", centerId: ids.center, periodId: olderPeriod.period.id, reason: "Must reopen latest first",
  }, 409);
  assert.match(earlierReopenBlocked.error, /later closed period/i);

  const backdatedPrepared = await postAs(preparer, {
    ...rejectedBatchBody,
    externalReference: `BACKDATED-${ids.run}`,
    paidAt: dayInput(-3),
    allocations: [],
    idempotencyKey: randomUUID(),
  });
  const backdatedPostingBlocked = await postAs(reviewer, {
    action: "approveRemittanceBatch", centerId: ids.center, batchId: backdatedPrepared.batch.id,
  }, 409);
  assert.match(backdatedPostingBlocked.error, /closed/i);
  await postAs(reviewer, { action: "rejectRemittanceBatch", centerId: ids.center, batchId: backdatedPrepared.batch.id, reason: "Closed-period test record" });
  await postAs(reviewer, { action: "reopenAccountingPeriod", centerId: ids.center, periodId: laterPeriod.period.id, reason: "Valid chronological reopen" });
  await postAs(reviewer, { action: "reopenAccountingPeriod", centerId: ids.center, periodId: olderPeriod.period.id, reason: "Valid chronological reopen" });

  const canonicalExports = await fetchExports(reviewer, ids.center);
  const repeatedExports = await fetchExports(reviewer, ids.center);
  for (const name of Object.keys(EXPORT_QUERIES)) assert.equal(canonicalExports[name], repeatedExports[name], `${name} export must be deterministic.`);
  const exports = await validateWorkflowExports(tx, ids, canonicalExports);
  const accessContinuity = await verifyAccessContinuity(tx, ids, canonicalExports);
  const security = await databaseSecurityEvidence(tx);

  const activeAllocations = await tx.$queryRaw`
    SELECT allocation."batchId", allocation."claimId", COUNT(*)::bigint AS count
    FROM "AgencyRemittanceAllocation" allocation
    JOIN "AgencyRemittanceBatch" batch ON batch.id = allocation."batchId"
    WHERE allocation.status IN ('pending_review', 'posted')
      AND batch."centerId" = ${ids.center}
    GROUP BY allocation."batchId", allocation."claimId"
    HAVING COUNT(*) > 1
  `;
  assert.equal(activeAllocations.length, 0);
  const [counts] = await tx.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM "AgencyRemittanceBatch" WHERE "centerId" = ${ids.center})::bigint AS "batchCount",
      (SELECT COUNT(*) FROM "AgencyRemittanceAllocation" allocation JOIN "AgencyRemittanceBatch" batch ON batch.id = allocation."batchId" WHERE batch."centerId" = ${ids.center})::bigint AS "allocationCount",
      (SELECT COUNT(*) FROM "SubsidyRemittance" WHERE "claimId" = ANY(${ids.claims}))::bigint AS "remittanceCount",
      (SELECT COUNT(*) FROM "AgencyLedgerAdjustment" WHERE "centerId" = ${ids.center})::bigint AS "adjustmentCount",
      (SELECT COUNT(*) FROM "AgencyAccountingPeriod" WHERE "centerId" = ${ids.center})::bigint AS "periodCount",
      (SELECT COUNT(*) FROM "AuditLog" WHERE "tenantId" = ${ids.tenant})::bigint AS "auditCount"
  `;
  return {
    exports,
    accessContinuity,
    databaseSecurityEvidence: serializable(security),
    cutoffReconciliation: {
      chronology: serializable(chronology),
      snapshots: serializable(cutoffSnapshots),
      receiptAndReversalEventsEvaluatedIndependently: true,
      utcCalendarDayBoundariesVerified: true,
    },
    concurrency: {
      liveMultiConnectionRaceExecuted: false,
      reason: "The workflow fixture and all financial history remain inside one rollback-only transaction. Independent connections cannot see that uncommitted fixture, while committing it would create intentionally immutable financial records that cannot be safely deleted. No unsafe durable race fixture was introduced.",
      complementaryEvidence: [
        "Sequential same-key route replay returned one deterministic batch and one deterministic allocation.",
        "A competing key for the same active batch/claim returned HTTP 409.",
        "The migrated database partial unique index AgencyRemittanceAllocation_active_batch_claim_key was verified.",
        "Focused agency-idempotent-replay-api tests exercise simultaneous P2002/P2034 recovery with independent promises.",
      ],
    },
    counts: serializable(counts),
  };
}

async function runDirectSqlInvariantRehearsal(tx, ids) {
  await flushDeferredConstraints();
  const rejectedWrites = [];

  rejectedWrites.push(await expectDirectSqlRejected(
    tx,
    "derived AgencyLedgerAccount.balanceCents tamper",
    () => tx.$executeRaw`
      UPDATE "AgencyLedgerAccount"
      SET "balanceCents" = "balanceCents" + 1
      WHERE id = ${ids.account}
    `,
    /Agency ledger account balance conflicts with its exact entry total/i,
  ));

  rejectedWrites.push(await expectDirectSqlRejected(
    tx,
    "derived AgencyLedgerEntry.balanceAfterCents tamper",
    () => tx.$executeRaw`
      UPDATE "AgencyLedgerEntry"
      SET "balanceAfterCents" = "balanceAfterCents" + 1
      WHERE id = ${`${ids.prefix}-claim-ledger-1`}
    `,
    /Agency ledger running balances conflict with deterministic chronological entry order/i,
  ));

  const [balanceBeforeBackdatedInsert] = await tx.$queryRaw`
    SELECT "balanceCents"::bigint AS "balanceCents"
    FROM "AgencyLedgerAccount"
    WHERE id = ${ids.account}
  `;
  assert.ok(balanceBeforeBackdatedInsert, "The primary agency ledger account is missing before the backdated insert probe.");
  const backdatedEffectiveAt = utcDay(-9);
  backdatedEffectiveAt.setUTCHours(6, 0, 0, 0);
  const backdatedExternalReference = `DIRECT-SQL-APPROVAL-${ids.run}`;
  await tx.$executeRaw`
    INSERT INTO "SubsidyClaim" (
      id, "centerId", "agencyProgramId", "authorizationId", number,
      "servicePeriodStart", "servicePeriodEnd", "dueDate", status,
      "claimedCents", "approvedCents", "paidCents", "submittedAt", "approvedAt",
      "externalReference", "createdById", "createdAt", "updatedAt"
    ) VALUES (
      ${ids.directClaim}, ${ids.center}, ${ids.program}, ${ids.authorization}, ${`DIRECT-SQL-CLAIM-${ids.run}`},
      ${utcDay(-100)}, ${utcDay(-94)}, ${utcDay(-5)}, 'draft',
      1234, NULL, 0, ${utcDay(-11)}, NULL,
      NULL, ${ids.users.BILLING_ADMIN}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `;
  await tx.$executeRaw`
    INSERT INTO "SubsidyClaimLine" (
      id, "claimId", "childId", description, "serviceUnits", "unitType", "rateCents", "amountCents", "createdAt"
    ) VALUES (
      ${ids.directClaimLine}, ${ids.directClaim}, ${ids.child},
      'Rollback-only backdated direct-SQL receivable', 1, 'weekly', 1234, 1234, CURRENT_TIMESTAMP
    )
  `;
  await tx.$executeRaw`
    UPDATE "SubsidyClaim"
    SET status = 'approved',
      "approvedCents" = 1234,
      "approvedAt" = ${backdatedEffectiveAt},
      "externalReference" = ${backdatedExternalReference},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${ids.directClaim}
  `;
  await tx.$executeRaw`
    INSERT INTO "AgencyLedgerEntry" (
      id, "agencyLedgerAccountId", "claimId", type, description, "amountCents", "balanceAfterCents",
      "effectiveAt", "externalReference", "glCodeSnapshot", "costCenterCodeSnapshot",
      "sourceSystem", "externalId", metadata, "createdAt"
    ) VALUES (
      ${ids.directClaimLedgerEntry}, ${ids.account}, ${ids.directClaim}, 'claim_approved',
      'Rollback-only backdated direct-SQL receivable', 1234, 0,
      ${backdatedEffectiveAt}, ${backdatedExternalReference}, '1200-AR', 'REHEARSAL-CENTER',
      'subsidy_agency', ${`claim-approved:${ids.directClaim}`}, ${JSON.stringify({ rehearsalOnly: true, directSqlInvariantProbe: true })}::jsonb,
      CURRENT_TIMESTAMP
    )
  `;
  await tx.$executeRaw`
    WITH running AS (
      SELECT entry.id,
        SUM(entry."amountCents"::bigint) OVER (
          PARTITION BY entry."agencyLedgerAccountId"
          ORDER BY entry."effectiveAt", entry."createdAt", entry.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::integer AS exact_balance
      FROM "AgencyLedgerEntry" entry
      WHERE entry."agencyLedgerAccountId" = ${ids.account}
    )
    UPDATE "AgencyLedgerEntry" entry
    SET "balanceAfterCents" = running.exact_balance
    FROM running
    WHERE entry.id = running.id
  `;
  await tx.$executeRaw`
    UPDATE "AgencyLedgerAccount" account
    SET "balanceCents" = (
      SELECT COALESCE(SUM(entry."amountCents"::bigint), 0)::integer
      FROM "AgencyLedgerEntry" entry
      WHERE entry."agencyLedgerAccountId" = account.id
    )
    WHERE account.id = ${ids.account}
  `;
  await flushDeferredConstraints();
  const [backdatedProof] = await tx.$queryRaw`
    WITH ordered AS (
      SELECT entry.id, entry."effectiveAt", entry."createdAt", entry."amountCents"::bigint AS "amountCents",
        entry."balanceAfterCents"::bigint AS "storedBalanceCents",
        SUM(entry."amountCents"::bigint) OVER (
          PARTITION BY entry."agencyLedgerAccountId"
          ORDER BY entry."effectiveAt", entry."createdAt", entry.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS "calculatedBalanceCents"
      FROM "AgencyLedgerEntry" entry
      WHERE entry."agencyLedgerAccountId" = ${ids.account}
    )
    SELECT account."balanceCents"::bigint AS "accountBalanceCents",
      (SELECT COALESCE(SUM("amountCents"), 0) FROM ordered)::bigint AS "entryTotalCents",
      (SELECT COUNT(*) FROM ordered WHERE "storedBalanceCents" <> "calculatedBalanceCents")::bigint AS "runningBalanceMismatchCount",
      (SELECT "storedBalanceCents" FROM ordered WHERE id = ${ids.directClaimLedgerEntry})::bigint AS "insertedStoredBalanceCents",
      (SELECT "calculatedBalanceCents" FROM ordered WHERE id = ${ids.directClaimLedgerEntry})::bigint AS "insertedCalculatedBalanceCents",
      (SELECT COUNT(*) FROM ordered WHERE "effectiveAt" > ${backdatedEffectiveAt})::bigint AS "chronologicallyLaterEntryCount"
    FROM "AgencyLedgerAccount" account
    WHERE account.id = ${ids.account}
  `;
  assert.equal(backdatedProof.accountBalanceCents, balanceBeforeBackdatedInsert.balanceCents + 1234n);
  assert.equal(backdatedProof.entryTotalCents, backdatedProof.accountBalanceCents);
  assert.equal(backdatedProof.runningBalanceMismatchCount, 0n);
  assert.equal(backdatedProof.insertedStoredBalanceCents, backdatedProof.insertedCalculatedBalanceCents);
  assert.ok(backdatedProof.chronologicallyLaterEntryCount > 0n, "The valid direct-SQL insert was not actually backdated ahead of existing activity.");

  const directBatchReference = `SQL-GUARD-${ids.run}`;
  const batchFingerprint = createHash("sha256").update(`batch:${ids.directBatch}`).digest("hex");
  const allocationFingerprint = createHash("sha256").update(`allocation:${ids.directAllocation}`).digest("hex");
  await tx.$executeRaw`
    INSERT INTO "AgencyRemittanceBatch" (
      id, "centerId", "agencyProgramId", "externalReference", "referenceKey", "paidAt", "paymentMethod",
      "cashGlCodeSnapshot", "costCenterCodeSnapshot", "totalCents", "allocatedCents", "unappliedCents",
      status, notes, "evidenceName", "evidenceReference", "idempotencyKey", "reconciliationFingerprint",
      "enteredById", "followUpOwnerId", "followUpDueAt", "createdAt", "updatedAt"
    ) VALUES (
      ${ids.directBatch}, ${ids.center}, ${ids.program}, ${directBatchReference}, ${`ach:${directBatchReference.toUpperCase()}`},
      ${utcDay(-2)}, 'ach', '1000-CASH', 'REHEARSAL-CENTER', 1000, 0, 0,
      'pending_review', 'Rollback-only direct-SQL guard fixture', 'Direct SQL rehearsal evidence',
      ${`direct-sql:${ids.run}`}, ${randomUUID()}, ${batchFingerprint},
      ${ids.users.BILLING_ADMIN}, ${ids.users.BRAND_ADMIN}, ${utcDay(0)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `;
  await tx.$executeRaw`
    INSERT INTO "AgencyRemittanceAllocation" (
      id, "batchId", "claimId", "amountCents", status, notes, fingerprint, "idempotencyKey",
      "requestedById", "createdAt", "updatedAt"
    ) VALUES (
      ${ids.directAllocation}, ${ids.directBatch}, ${ids.claims[2]}, 100, 'pending_review',
      'Rollback-only direct-SQL allocation guard fixture', ${allocationFingerprint}, ${randomUUID()},
      ${ids.users.BILLING_ADMIN}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `;
  await flushDeferredConstraints();

  rejectedWrites.push(await expectDirectSqlRejected(
    tx,
    "future-dated allocation review evidence",
    () => tx.$executeRaw`
      UPDATE "AgencyRemittanceAllocation"
      SET status = 'rejected',
        "reviewedById" = ${ids.users.BRAND_ADMIN},
        "reviewedAt" = ${utcDay(1)},
        "reviewNotes" = 'Future review must fail',
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${ids.directAllocation}
    `,
    /Agency remittance allocation review cannot be future-dated/i,
  ));

  rejectedWrites.push(await expectDirectSqlRejected(
    tx,
    "rejected allocation without review notes",
    () => tx.$executeRaw`
      UPDATE "AgencyRemittanceAllocation"
      SET status = 'rejected',
        "reviewedById" = ${ids.users.BRAND_ADMIN},
        "reviewedAt" = CURRENT_TIMESTAMP,
        "reviewNotes" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${ids.directAllocation}
    `,
    /rejected agency remittance allocation requires review notes/i,
  ));

  rejectedWrites.push(await expectDirectSqlRejected(
    tx,
    "forged legacy-prefixed remittance batch",
    () => tx.$executeRaw`
      INSERT INTO "AgencyRemittanceBatch" (
        id, "centerId", "agencyProgramId", "externalReference", "referenceKey", "paidAt", "paymentMethod",
        "totalCents", "allocatedCents", "unappliedCents", status, "idempotencyKey",
        "reconciliationFingerprint", "enteredById", "createdAt", "updatedAt"
      ) VALUES (
        ${ids.forgedBatch}, ${ids.center}, ${ids.program}, ${`FORGED-LEGACY-${ids.run}`},
        ${`ach:FORGED-LEGACY-${ids.run.toUpperCase()}`}, ${utcDay(-2)}, 'ach', 1, 0, 0, 'pending_review',
        ${`legacy:forged:${ids.run}`}, ${createHash("md5").update(ids.forgedBatch).digest("hex")},
        ${ids.users.BILLING_ADMIN}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `,
    /Legacy agency remittance batches may only be created by verified activation adoption/i,
  ));

  rejectedWrites.push(await expectDirectSqlRejected(
    tx,
    "forged legacy-prefixed ledger entry",
    async () => {
      await tx.$executeRaw`
        INSERT INTO "AgencyLedgerEntry" (
          id, "agencyLedgerAccountId", "claimId", type, description, "amountCents", "balanceAfterCents",
          "effectiveAt", "externalReference", "glCodeSnapshot", "costCenterCodeSnapshot",
          "sourceSystem", "externalId", metadata, "createdAt"
        )
        SELECT
          ${ids.forgedLedgerEntry}, ${ids.account}, claim.id, 'claim_approved',
          'Otherwise exact claim approval with a forged legacy source key', claim."approvedCents", 0,
          claim."approvedAt", claim."externalReference", '1200-AR', 'REHEARSAL-CENTER',
          'subsidy_agency', ${`legacy:claim-approved:${ids.claims[0]}`},
          ${JSON.stringify({ forgedLegacyPrefix: true, otherwiseSupportedShape: true })}::jsonb, CURRENT_TIMESTAMP
        FROM "SubsidyClaim" claim
        WHERE claim.id = ${ids.claims[0]}
      `;
      await tx.$executeRaw`
        WITH running AS (
          SELECT entry.id,
            SUM(entry."amountCents"::bigint) OVER (
              PARTITION BY entry."agencyLedgerAccountId"
              ORDER BY entry."effectiveAt", entry."createdAt", entry.id
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )::integer AS exact_balance
          FROM "AgencyLedgerEntry" entry
          WHERE entry."agencyLedgerAccountId" = ${ids.account}
        )
        UPDATE "AgencyLedgerEntry" entry
        SET "balanceAfterCents" = running.exact_balance
        FROM running
        WHERE entry.id = running.id
      `;
      await tx.$executeRaw`
        UPDATE "AgencyLedgerAccount" account
        SET "balanceCents" = (
          SELECT COALESCE(SUM(entry."amountCents"::bigint), 0)::integer
          FROM "AgencyLedgerEntry" entry
          WHERE entry."agencyLedgerAccountId" = account.id
        )
        WHERE account.id = ${ids.account}
      `;
    },
    /Agency ledger claim approval conflicts with exact source facts/i,
  ));

  rejectedWrites.push(await expectDirectSqlRejected(
    tx,
    "operationally inactive school reconciliation activation",
    () => tx.$executeRaw`
      UPDATE "Center"
      SET status = 'inactive',
        "agencyReconciliationEnabled" = TRUE,
        "agencyReconciliationActivatedAt" = CURRENT_TIMESTAMP,
        "agencyReconciliationActivatedById" = ${ids.users.BRAND_ADMIN},
        "agencyReconciliationActivationReason" = 'Operationally inactive school must not activate',
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${ids.secondaryCenter}
    `,
    /Only an active school can enable agency reconciliation/i,
  ));

  rejectedWrites.push(await expectDirectSqlRejected(
    tx,
    "active school activation evidence rewrite",
    () => tx.$executeRaw`
      UPDATE "Center"
      SET "agencyReconciliationActivationReason" = 'Rewritten activation evidence must fail',
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${ids.center}
    `,
    /Agency reconciliation activation evidence is immutable after activation/i,
  ));

  const directPeriodClosedAt = utcDay(-20);
  await tx.$executeRaw`
    INSERT INTO "AgencyAccountingPeriod" (
      id, "centerId", name, "startDate", "endDate", status,
      "closedAt", "closedById", "closeReason", "createdAt", "updatedAt"
    ) VALUES (
      ${ids.directEarlierPeriod}, ${ids.secondaryCenter}, 'Direct SQL earlier closed period',
      ${utcDay(-60)}, ${utcDay(-50)}, 'closed', ${directPeriodClosedAt}, ${ids.users.BRAND_ADMIN},
      'Rollback-only period ordering proof', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ), (
      ${ids.directLaterPeriod}, ${ids.secondaryCenter}, 'Direct SQL later closed period',
      ${utcDay(-40)}, ${utcDay(-30)}, 'closed', ${directPeriodClosedAt}, ${ids.users.BRAND_ADMIN},
      'Rollback-only period ordering proof', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `;
  await flushDeferredConstraints();

  rejectedWrites.push(await expectDirectSqlRejected(
    tx,
    "overlapping direct-SQL accounting period",
    () => tx.$executeRaw`
      INSERT INTO "AgencyAccountingPeriod" (
        id, "centerId", name, "startDate", "endDate", status, "createdAt", "updatedAt"
      ) VALUES (
        ${ids.directOverlapPeriod}, ${ids.secondaryCenter}, 'Direct SQL overlap must fail',
        ${utcDay(-55)}, ${utcDay(-45)}, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `,
    /Agency accounting period ranges cannot overlap within a school/i,
  ));

  rejectedWrites.push(await expectDirectSqlRejected(
    tx,
    "out-of-order direct-SQL accounting period reopen",
    () => tx.$executeRaw`
      UPDATE "AgencyAccountingPeriod"
      SET status = 'open',
        "reopenedAt" = CURRENT_TIMESTAMP,
        "reopenedById" = ${ids.users.BRAND_ADMIN},
        "reopenReason" = 'Earlier period cannot reopen before the later period',
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${ids.directEarlierPeriod}
    `,
    /later closed agency accounting period must be reopened first/i,
  ));

  const adoptionReference = `POST-MIGRATION-DIRECT-${ids.run}`;
  const directRemittancePaidAt = utcDay(0);
  const [secondaryFamilyBillingAccount] = await tx.$queryRaw`
    SELECT account.id
    FROM "BillingAccount" account
    WHERE account."familyId" = ${ids.secondaryFamily}
  `;
  assert.equal(secondaryFamilyBillingAccount, undefined, "The direct-SQL baseline fixture must not have a family billing account to settle.");
  await tx.$executeRaw`
    INSERT INTO "SubsidyRemittance" (
      id, "claimId", "amountCents", "paidAt", "paymentMethod", "externalReference",
      notes, "enteredById", "createdAt"
    ) VALUES (
      ${ids.directBaselineRemittance}, ${ids.secondaryClaim}, 1000, ${directRemittancePaidAt}, 'ach',
      ${adoptionReference}, 'Rollback-only post-migration direct-SQL baseline remittance',
      ${ids.wrongSchoolUser}, CURRENT_TIMESTAMP
    )
  `;
  await tx.$executeRaw`
    INSERT INTO "AgencyLedgerEntry" (
      id, "agencyLedgerAccountId", "claimId", "remittanceId", "remittanceBatchId", "adjustmentId",
      type, description, "amountCents", "balanceAfterCents", "effectiveAt", "externalReference",
      "glCodeSnapshot", "costCenterCodeSnapshot", "sourceSystem", "externalId", metadata, "createdAt"
    ) VALUES (
      ${ids.directBaselineReceiptLedgerEntry}, ${ids.secondaryAccount}, ${ids.secondaryClaim},
      ${ids.directBaselineRemittance}, NULL, NULL, 'remittance_received',
      'Rollback-only post-migration direct-SQL remittance receipt', -1000, 0,
      ${directRemittancePaidAt}, ${adoptionReference}, '1000-CASH-SECOND', 'REHEARSAL-SECOND',
      'subsidy_agency', ${`remittance:${ids.directBaselineRemittance}`},
      ${JSON.stringify({ rehearsalOnly: true, postMigrationDirectSqlBaseline: true })}::jsonb, CURRENT_TIMESTAMP
    )
  `;
  await tx.$executeRaw`
    UPDATE "SubsidyClaim"
    SET "paidCents" = 1000,
      status = 'partially_paid',
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${ids.secondaryClaim}
  `;
  await tx.$executeRaw`
    WITH running AS (
      SELECT entry.id,
        SUM(entry."amountCents"::bigint) OVER (
          PARTITION BY entry."agencyLedgerAccountId"
          ORDER BY entry."effectiveAt", entry."createdAt", entry.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::integer AS exact_balance
      FROM "AgencyLedgerEntry" entry
      WHERE entry."agencyLedgerAccountId" = ${ids.secondaryAccount}
    )
    UPDATE "AgencyLedgerEntry" entry
    SET "balanceAfterCents" = running.exact_balance
    FROM running
    WHERE entry.id = running.id
  `;
  await tx.$executeRaw`
    UPDATE "AgencyLedgerAccount" account
    SET "balanceCents" = (
      SELECT COALESCE(SUM(entry."amountCents"::bigint), 0)::integer
      FROM "AgencyLedgerEntry" entry
      WHERE entry."agencyLedgerAccountId" = account.id
    )
    WHERE account.id = ${ids.secondaryAccount}
  `;
  await flushDeferredConstraints();
  const preActivationAdoptionRows = await tx.$queryRaw`
    SELECT remittance.id AS "remittanceId",
      allocation.id AS "allocationId",
      receipt."remittanceBatchId" AS "receiptBatchId"
    FROM "SubsidyRemittance" remittance
    LEFT JOIN "AgencyRemittanceAllocation" allocation ON allocation."remittanceId" = remittance.id
    JOIN "AgencyLedgerEntry" receipt
      ON receipt."remittanceId" = remittance.id
     AND receipt.type = 'remittance_received'
     AND receipt."sourceSystem" = 'subsidy_agency'
    WHERE remittance.id = ${ids.directBaselineRemittance}
  `;
  assert.deepEqual(serializable(preActivationAdoptionRows), [{
    remittanceId: ids.directBaselineRemittance,
    allocationId: null,
    receiptBatchId: null,
  }], "The baseline direct remittance was unexpectedly controlled before school activation.");

  const activationAt = utcDay(0);
  await tx.$executeRaw`
    UPDATE "Center"
    SET "agencyReconciliationEnabled" = TRUE,
      "agencyReconciliationActivatedAt" = ${activationAt},
      "agencyReconciliationActivatedById" = ${ids.users.BRAND_ADMIN},
      "agencyReconciliationActivationReason" = 'Rollback-only activation adoption and replay proof',
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${ids.secondaryCenter}
  `;
  await flushDeferredConstraints();

  async function adoptionSnapshot() {
    const rows = await tx.$queryRaw`
      SELECT remittance.id AS "remittanceId",
        to_jsonb(remittance) AS "remittanceExactRow",
        to_jsonb(batch) AS "batchExactRow",
        to_jsonb(allocation) AS "allocationExactRow",
        to_jsonb(receipt) AS "receiptExactRow",
        remittance."claimId", remittance."amountCents", remittance."paidAt", remittance."paymentMethod",
        remittance."externalReference", remittance."enteredById",
        batch.id AS "batchId", batch."centerId", batch."agencyProgramId", batch."totalCents",
        batch."allocatedCents", batch."unappliedCents", batch.status AS "batchStatus",
        batch."idempotencyKey" AS "batchIdempotencyKey", batch."reviewedAt" AS "batchReviewedAt",
        allocation.id AS "allocationId", allocation."remittanceId" AS "allocationRemittanceId",
        allocation."amountCents" AS "allocationAmountCents", allocation.status AS "allocationStatus",
        allocation."idempotencyKey" AS "allocationIdempotencyKey", allocation."reviewedAt" AS "allocationReviewedAt",
        receipt.id AS "receiptLedgerEntryId", receipt."remittanceBatchId" AS "receiptBatchId",
        receipt."amountCents" AS "receiptAmountCents", receipt."effectiveAt" AS "receiptEffectiveAt"
      FROM "SubsidyRemittance" remittance
      JOIN "AgencyRemittanceAllocation" allocation ON allocation."remittanceId" = remittance.id
      JOIN "AgencyRemittanceBatch" batch ON batch.id = allocation."batchId"
      JOIN "AgencyLedgerEntry" receipt
        ON receipt."remittanceId" = remittance.id
       AND receipt.type = 'remittance_received'
       AND receipt."sourceSystem" = 'subsidy_agency'
      WHERE remittance.id = ${ids.directBaselineRemittance}
    `;
    assert.equal(rows.length, 1, "Activation adoption must create exactly one batch/allocation link for the direct remittance.");
    return serializable(rows[0]);
  }

  const firstAdoption = await adoptionSnapshot();
  const expectedBatchId = `agency-remittance-batch:${createHash("md5").update(`${ids.secondaryCenter}:${ids.secondaryProgram}:ach:${adoptionReference.toUpperCase()}:active`).digest("hex")}`;
  assert.equal(firstAdoption.batchId, expectedBatchId);
  assert.equal(firstAdoption.centerId, ids.secondaryCenter);
  assert.equal(firstAdoption.agencyProgramId, ids.secondaryProgram);
  assert.equal(firstAdoption.totalCents, 1000);
  assert.equal(firstAdoption.allocatedCents, 1000);
  assert.equal(firstAdoption.unappliedCents, 0);
  assert.equal(firstAdoption.batchStatus, "reconciled");
  assert.match(firstAdoption.batchIdempotencyKey, /^legacy:adoption:/);
  assert.equal(firstAdoption.batchReviewedAt, null);
  assert.equal(firstAdoption.allocationId, `agency-remittance-allocation:${ids.directBaselineRemittance}`);
  assert.equal(firstAdoption.allocationRemittanceId, ids.directBaselineRemittance);
  assert.equal(firstAdoption.allocationAmountCents, 1000);
  assert.equal(firstAdoption.allocationStatus, "posted");
  assert.equal(firstAdoption.allocationIdempotencyKey, `legacy-allocation:adoption:${ids.directBaselineRemittance}`);
  assert.equal(firstAdoption.allocationReviewedAt, null);
  assert.equal(firstAdoption.receiptBatchId, expectedBatchId);
  assert.equal(firstAdoption.receiptAmountCents, -1000);
  assert.equal(new Date(firstAdoption.receiptEffectiveAt).toISOString().slice(0, 10), dayInput(0));

  const adoptionCountsBeforeReplay = await tx.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM "AgencyRemittanceBatch" WHERE id = ${expectedBatchId})::bigint AS "batchCount",
      (SELECT COUNT(*) FROM "AgencyRemittanceAllocation" WHERE "remittanceId" = ${ids.directBaselineRemittance})::bigint AS "allocationCount",
      (SELECT COUNT(*) FROM "AgencyLedgerEntry" WHERE "remittanceId" = ${ids.directBaselineRemittance})::bigint AS "ledgerEntryCount"
  `;
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
  await tx.$executeRawUnsafe('ALTER TABLE "Center" DISABLE TRIGGER "Center_agency_reconciliation_00_adoption_guard"');
  await tx.$executeRawUnsafe('ALTER TABLE "Center" DISABLE TRIGGER "Center_agency_reconciliation_activation_readiness_guard"');
  await tx.$executeRaw`
    UPDATE "Center"
    SET "agencyReconciliationEnabled" = FALSE,
      "agencyReconciliationActivatedAt" = NULL,
      "agencyReconciliationActivatedById" = NULL,
      "agencyReconciliationActivationReason" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${ids.secondaryCenter}
  `;
  await tx.$executeRawUnsafe('ALTER TABLE "Center" ENABLE TRIGGER "Center_agency_reconciliation_00_adoption_guard"');
  await tx.$executeRawUnsafe('ALTER TABLE "Center" ENABLE TRIGGER "Center_agency_reconciliation_activation_readiness_guard"');
  await tx.$executeRaw`
    UPDATE "Center"
    SET "agencyReconciliationEnabled" = TRUE,
      "agencyReconciliationActivatedAt" = ${activationAt},
      "agencyReconciliationActivatedById" = ${ids.users.BRAND_ADMIN},
      "agencyReconciliationActivationReason" = 'Rollback-only activation adoption and replay proof',
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${ids.secondaryCenter}
  `;
  await flushDeferredConstraints();
  const secondAdoption = await adoptionSnapshot();
  const adoptionCountsAfterReplay = await tx.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM "AgencyRemittanceBatch" WHERE id = ${expectedBatchId})::bigint AS "batchCount",
      (SELECT COUNT(*) FROM "AgencyRemittanceAllocation" WHERE "remittanceId" = ${ids.directBaselineRemittance})::bigint AS "allocationCount",
      (SELECT COUNT(*) FROM "AgencyLedgerEntry" WHERE "remittanceId" = ${ids.directBaselineRemittance})::bigint AS "ledgerEntryCount"
  `;
  assert.deepEqual(secondAdoption, firstAdoption, "The transaction-scoped activation retry changed exact adopted financial rows.");
  assert.deepEqual(serializable(adoptionCountsAfterReplay), serializable(adoptionCountsBeforeReplay), "The transaction-scoped activation retry duplicated adopted financial rows.");
  assert.deepEqual(serializable(adoptionCountsAfterReplay), [{ batchCount: "1", allocationCount: "1", ledgerEntryCount: "1" }]);

  return {
    markerPolicy: "The exact database marker is rechecked in the mutating transaction before its first write.",
    rejectedDirectSqlWrites: rejectedWrites,
    balanceInvariants: {
      accountBalanceTamperRejected: true,
      runningBalanceTamperRejected: true,
      validBackdatedInsertAndRecalculationSucceeded: true,
      beforeBalanceCents: balanceBeforeBackdatedInsert.balanceCents.toString(),
      afterBalanceCents: backdatedProof.accountBalanceCents.toString(),
      insertedAmountCents: 1234,
      insertedEffectiveAt: backdatedEffectiveAt,
      chronologicallyLaterEntryCount: backdatedProof.chronologicallyLaterEntryCount.toString(),
      runningBalanceMismatchCount: backdatedProof.runningBalanceMismatchCount.toString(),
    },
    allocationAndActivationInvariants: {
      futureAllocationReviewRejected: true,
      rejectedAllocationWithoutReviewNotesRejected: true,
      operationallyInactiveSchoolActivationRejected: true,
      activatedSchoolEvidenceRewriteRejected: true,
      forgedLegacyBatchRejected: true,
      forgedLegacyLedgerEntryRejected: true,
    },
    accountingPeriodInvariants: {
      overlappingPeriodRejected: true,
      outOfOrderReopenRejected: true,
    },
    postMigrationBaselineAdoption: {
      directRemittanceId: ids.directBaselineRemittance,
      exactBatchId: expectedBatchId,
      exactAllocationId: firstAdoption.allocationId,
      receiptRelinkedToExactBatch: true,
      sourceCreatedByDirectSqlAfterSchemaMigration: true,
      everyColumnOfRemittanceBatchAllocationAndReceiptComparedOnRetry: true,
      exactRowsPreservedOnTransactionScopedActivationRetry: true,
      retryMethod: "Inside the outer rollback transaction only, the two Center activation triggers are transactionally disabled while activation flags are reset, immediately re-enabled, and then the same activation is retried with the already-adopted rows present. PostgreSQL holds the ALTER TABLE lock until rollback, preventing another session from observing the temporary trigger state.",
      firstAdoption,
      secondAdoption,
      countsBeforeReplay: serializable(adoptionCountsBeforeReplay[0]),
      countsAfterReplay: serializable(adoptionCountsAfterReplay[0]),
    },
    literalSecondMigrationFileReplay: {
      executed: false,
      residualLimitation: "The migration file has its own top-level BEGIN/COMMIT. Running it inside this rollback-only Prisma transaction would commit the immutable financial fixture, while another connection cannot see this transaction's uncommitted post-migration remittance. This script instead retries the migration-installed activation adoption/relink path against already-adopted exact rows under a transaction-scoped table lock and proves row preservation, but does not claim a literal whole-file second replay or ON CONFLICT backfill replay.",
      safeFutureVerificationDesign: "After the final migration file is frozen, use one dedicated PostgreSQL session on a newly recreated disposable branch: BEGIN; create the post-migration remittance fixture; execute an audited copy of the migration body with only its outer BEGIN/COMMIT removed; assert exact rows; ROLLBACK. Do not use that technique on production or represent activation-trigger re-entry as whole-file replay.",
    },
    everyMutationCoveredByOuterRollback: true,
    eachExpectedFailureRecoveredBySavepoint: true,
  };
}

const run = randomUUID().replaceAll("-", "").slice(0, 12);
const prefix = `rehearsal-workflow-${run}`;
const ids = {
  run,
  prefix,
  tenant: `${prefix}-tenant`,
  wrongTenant: `${prefix}-wrong-tenant`,
  organization: `${prefix}-organization`,
  wrongOrganization: `${prefix}-wrong-organization`,
  center: `${prefix}-center`,
  secondaryCenter: `${prefix}-secondary-center`,
  wrongTenantCenter: `${prefix}-wrong-tenant-center`,
  classroom: `${prefix}-classroom`,
  secondaryClassroom: `${prefix}-secondary-classroom`,
  family: `${prefix}-family`,
  secondaryFamily: `${prefix}-secondary-family`,
  billingAccount: `${prefix}-billing-account`,
  invoice: `${prefix}-invoice`,
  invoiceItem: `${prefix}-invoice-item`,
  payment: `${prefix}-payment`,
  invoiceLedgerEntry: `${prefix}-family-ledger-invoice`,
  paymentLedgerEntry: `${prefix}-family-ledger-payment`,
  legacyAgencyLedgerEntry: `${prefix}-family-ledger-legacy-agency`,
  child: `${prefix}-child`,
  secondaryChild: `${prefix}-secondary-child`,
  program: `${prefix}-program`,
  secondaryProgram: `${prefix}-secondary-program`,
  authorization: `${prefix}-authorization`,
  secondaryAuthorization: `${prefix}-secondary-authorization`,
  account: `${prefix}-account`,
  secondaryAccount: `${prefix}-secondary-account`,
  secondaryClaim: `${prefix}-secondary-claim`,
  secondaryClaimLine: `${prefix}-secondary-claim-line`,
  secondaryClaimLedgerEntry: `${prefix}-secondary-claim-ledger-entry`,
  directBatch: `${prefix}-direct-sql-batch`,
  directAllocation: `${prefix}-direct-sql-allocation`,
  directClaim: `${prefix}-direct-sql-claim`,
  directClaimLine: `${prefix}-direct-sql-claim-line`,
  directClaimLedgerEntry: `${prefix}-direct-sql-claim-ledger-entry`,
  directBaselineRemittance: `${prefix}-direct-sql-baseline-remittance`,
  directBaselineReceiptLedgerEntry: `${prefix}-direct-sql-baseline-receipt`,
  directEarlierPeriod: `${prefix}-direct-sql-period-earlier`,
  directLaterPeriod: `${prefix}-direct-sql-period-later`,
  directOverlapPeriod: `${prefix}-direct-sql-period-overlap`,
  forgedBatch: `${prefix}-direct-sql-forged-legacy-batch`,
  forgedLedgerEntry: `${prefix}-direct-sql-forged-ledger-entry`,
  claims: Array.from({ length: 4 }, (_value, index) => `${prefix}-claim-${index + 1}`),
  users: Object.fromEntries(ACCESS_ROLES.map((role) => [role, `${prefix}-user-${role.toLowerCase()}`])),
  wrongSchoolUser: `${prefix}-wrong-school-user`,
  wrongTenantUser: `${prefix}-wrong-tenant-user`,
  primaryBatchId: null,
};

let report = null;
const startedAt = new Date();
const localMigrationEvidence = await verifyExactLocalMigrationBytes();
const targetEvidence = await verifyAuthorizedRehearsalTarget();
let preExistingFinancialBefore;
try {
  await base.$transaction(async (tx) => {
    activeTx = tx;
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
    preExistingFinancialBefore = await familyFinancialFingerprint(tx);
    const transactionMarkerBeforeFirstWrite = await assertRehearsalMarkerBeforeWrite(tx);
    await seedWorkflow(tx, ids);
    const allFinancialBeforeWorkflow = await familyFinancialFingerprint(tx);
    const participatingFamilyBeforeWorkflow = await participatingFamilyFinancialSnapshot(tx, ids);
    assert.deepEqual(
      {
        balanceCents: participatingFamilyBeforeWorkflow.balanceCents,
        invoiceCount: participatingFamilyBeforeWorkflow.invoiceCount,
        invoiceTotalCents: participatingFamilyBeforeWorkflow.invoiceTotalCents,
        paymentCount: participatingFamilyBeforeWorkflow.paymentCount,
        paymentTotalCents: participatingFamilyBeforeWorkflow.paymentTotalCents,
        familyLedgerEntryCount: participatingFamilyBeforeWorkflow.familyLedgerEntryCount,
        familyLedgerEntryCents: participatingFamilyBeforeWorkflow.familyLedgerEntryCents,
        legacyAgencyEntryCount: participatingFamilyBeforeWorkflow.legacyAgencyEntryCount,
        legacyAgencyEntryCents: participatingFamilyBeforeWorkflow.legacyAgencyEntryCents,
      },
      {
        balanceCents: 3_000,
        invoiceCount: 1,
        invoiceTotalCents: 7_500,
        paymentCount: 1,
        paymentTotalCents: 3_300,
        familyLedgerEntryCount: 3,
        familyLedgerEntryCents: 3_000,
        legacyAgencyEntryCount: 1,
        legacyAgencyEntryCents: -1_200,
      },
      "The participating family fixture no longer represents invoice, payment, ledger, and negative legacy-only agency history.",
    );
    const workflow = await runWorkflow(tx, ids);
    const directSqlInvariants = await runDirectSqlInvariantRehearsal(tx, ids);
    const allFinancialAfterWorkflow = await familyFinancialFingerprint(tx);
    const participatingFamilyAfterWorkflow = await participatingFamilyFinancialSnapshot(tx, ids);
    assert.deepEqual(serializable(allFinancialAfterWorkflow), serializable(allFinancialBeforeWorkflow), "Agency workflow changed a covered core family billing row.");
    assert.deepEqual(participatingFamilyAfterWorkflow, participatingFamilyBeforeWorkflow, "Agency workflow changed the participating family's responsibility, invoice, payment, instrument metadata, or ledger history.");
    report = {
      mode: "production_derived_disposable_branch_workflow_rehearsal",
      targetProjectRef: REHEARSAL_PROJECT_REF,
      targetEvidence,
      localMigrationEvidence,
      transactionMarkerBeforeFirstWrite,
      schemaState: "Both additive agency migrations were already applied before this script started.",
      cleanupScope: "All workflow fixture and route mutations execute inside one Serializable transaction that is intentionally rolled back.",
      schemaRollbackTested: false,
      oldApplicationAgainstMigratedSchemaTested: false,
      startedAt,
      completedAt: new Date(),
      familyFinancialSafety: {
        coveredCoreTables: ["Family", "BillingAccount", "Invoice", "InvoiceItem", "Payment", "LedgerEntry"],
        scope: "Exact database rows and aggregates for the participating family/account and all rows in the six covered core tables; this is not a browser rendering assertion and does not claim unrelated family-control tables were fingerprinted.",
        preExistingProductionDerivedRowsBeforeFixture: serializable(preExistingFinancialBefore),
        coveredCoreBillingRowsIncludingFixtureBeforeWorkflow: serializable(allFinancialBeforeWorkflow),
        coveredCoreBillingRowsIncludingFixtureAfterWorkflow: serializable(allFinancialAfterWorkflow),
        participatingFamilyBeforeWorkflow,
        participatingFamilyAfterWorkflow,
        exactParticipatingFamilyAndAccountFingerprintUnchanged: true,
        coveredCoreFamilyBillingRowsUnchangedDuringWorkflow: true,
        noNewParticipatingFamilyLedgerEntry: true,
        underlyingParentResponsibilityRowsUnchanged: true,
        maskedCardAndBankCustomFieldsUnchanged: true,
        negativeLegacyAgencyPaymentRemainedCompatibilityHistoryOnly: true,
        dedicatedLedgerInferenceFromLegacyHistory: false,
      },
      workflow,
      directSqlInvariants,
      reproducibleInvocation: "$env:REHEARSAL_DATABASE_URL='<exact authorized direct or session-pooler postgres URL with sslmode=require>'; node --import tsx --experimental-test-module-mocks .\\scripts\\rehearse-agency-ledger-workflow.mjs",
      generatedClientRequirement: "Run npx prisma generate from the exact final schema before this invocation; the script also refuses to start unless all six migrated agency tables are present.",
    };
    throw ROLLBACK;
  }, { isolationLevel: "Serializable", maxWait: 30_000, timeout: 300_000 });
} catch (error) {
  if (error !== ROLLBACK) throw error;
  activeTx = null;
  const [residual] = await base.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM "Tenant" WHERE id IN (${ids.tenant}, ${ids.wrongTenant}))::bigint AS "tenantCount",
      (SELECT COUNT(*) FROM "Organization" WHERE id IN (${ids.organization}, ${ids.wrongOrganization}))::bigint AS "organizationCount",
      (SELECT COUNT(*) FROM "Center" WHERE id IN (${ids.center}, ${ids.secondaryCenter}, ${ids.wrongTenantCenter}))::bigint AS "centerCount",
      (SELECT COUNT(*) FROM "User" WHERE id = ANY(${[...Object.values(ids.users), ids.wrongSchoolUser, ids.wrongTenantUser]}))::bigint AS "userCount",
      (SELECT COUNT(*) FROM "UserAccessGrant" WHERE "userId" = ANY(${[...Object.values(ids.users), ids.wrongSchoolUser, ids.wrongTenantUser]}))::bigint AS "accessGrantCount",
      (SELECT COUNT(*) FROM "Classroom" WHERE id = ANY(${[ids.classroom, ids.secondaryClassroom]}))::bigint AS "classroomCount",
      (SELECT COUNT(*) FROM "Family" WHERE id = ANY(${[ids.family, ids.secondaryFamily]}))::bigint AS "familyCount",
      (SELECT COUNT(*) FROM "Child" WHERE id = ANY(${[ids.child, ids.secondaryChild]}))::bigint AS "childCount",
      (SELECT COUNT(*) FROM "BillingAccount" WHERE id = ${ids.billingAccount})::bigint AS "billingAccountCount",
      (SELECT COUNT(*) FROM "Invoice" WHERE id = ${ids.invoice})::bigint AS "invoiceCount",
      (SELECT COUNT(*) FROM "InvoiceItem" WHERE "invoiceId" = ${ids.invoice})::bigint AS "invoiceItemCount",
      (SELECT COUNT(*) FROM "Payment" WHERE id = ${ids.payment})::bigint AS "paymentCount",
      (SELECT COUNT(*) FROM "LedgerEntry" WHERE "billingAccountId" = ${ids.billingAccount})::bigint AS "familyLedgerEntryCount",
      (SELECT COUNT(*) FROM "AgencyProgram" WHERE id = ANY(${[ids.program, ids.secondaryProgram]}))::bigint AS "programCount",
      (SELECT COUNT(*) FROM "SubsidyAuthorization" WHERE id = ANY(${[ids.authorization, ids.secondaryAuthorization]}))::bigint AS "authorizationCount",
      (SELECT COUNT(*) FROM "SubsidyClaim" WHERE id = ANY(${[...ids.claims, ids.secondaryClaim, ids.directClaim]}))::bigint AS "claimCount",
      (SELECT COUNT(*) FROM "SubsidyClaimLine" WHERE "claimId" = ANY(${[...ids.claims, ids.secondaryClaim, ids.directClaim]}))::bigint AS "claimLineCount",
      (SELECT COUNT(*) FROM "SubsidyRemittance" WHERE "claimId" = ${ids.secondaryClaim})::bigint AS "remittanceCount",
      (SELECT COUNT(*) FROM "AgencyLedgerAccount" WHERE id = ANY(${[ids.account, ids.secondaryAccount]}))::bigint AS "ledgerAccountCount",
      (SELECT COUNT(*) FROM "AgencyLedgerEntry" WHERE "agencyLedgerAccountId" = ANY(${[ids.account, ids.secondaryAccount]}))::bigint AS "agencyLedgerEntryCount",
      (SELECT COUNT(*) FROM "AgencyRemittanceBatch" WHERE "centerId" = ANY(${[ids.center, ids.secondaryCenter]}))::bigint AS "batchCount",
      (SELECT COUNT(*) FROM "AgencyRemittanceAllocation" allocation JOIN "AgencyRemittanceBatch" batch ON batch.id = allocation."batchId" WHERE batch."centerId" = ANY(${[ids.center, ids.secondaryCenter]}))::bigint AS "allocationCount",
      (SELECT COUNT(*) FROM "AgencyLedgerAdjustment" WHERE "centerId" = ANY(${[ids.center, ids.secondaryCenter]}))::bigint AS "adjustmentCount",
      (SELECT COUNT(*) FROM "AgencyAccountingPeriod" WHERE "centerId" = ANY(${[ids.center, ids.secondaryCenter]}))::bigint AS "periodCount",
      (SELECT COUNT(*) FROM "AuditLog" WHERE "tenantId" = ANY(${[ids.tenant, ids.wrongTenant]}))::bigint AS "auditLogCount"
  `;
  assert.ok(Object.values(residual).every((value) => value === 0n), `Rollback left rehearsal rows behind: ${JSON.stringify(serializable(residual))}`);
  const preExistingFinancialAfterRollback = await familyFinancialFingerprint(base);
  assert.deepEqual(serializable(preExistingFinancialAfterRollback), serializable(preExistingFinancialBefore), "Rolling back disposable data changed a covered pre-existing core family billing row.");
  report.disposableDataTransactionRollbackVerified = true;
  report.disposableDataTransactionRollbackVerifiedAt = new Date();
  report.familyFinancialSafety.preExistingProductionDerivedRowsAfterRollback = serializable(preExistingFinancialAfterRollback);
  report.familyFinancialSafety.preExistingProductionDerivedRowsRestoredExactly = true;
  report.residualDisposableRows = serializable(residual);
} finally {
  activeTx = null;
  await base.$disconnect();
}

assert.ok(report, "The workflow rehearsal did not produce a report.");
console.log(JSON.stringify(report, null, 2));
