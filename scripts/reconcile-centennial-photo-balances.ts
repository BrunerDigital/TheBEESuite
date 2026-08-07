import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const APPLY_FLAG = "--apply";
const CONFIRM_SCOPE_FLAG = "--confirm-centennial-photo-balances";
const CONFIRM_HISTORY_FLAG = "--confirm-preserve-payments-and-invoices";
const CENTER_NAME = "Miss Honey's Learning Center - Centennial";
const CENTER_CRM_LOCATION_ID = "Miss Honey's Learning Center - CO | Centennial";
const CENTER_LOCATION_ID = "Miss Honey's Learning Center - CO | Centennial";
const SOURCE_AS_OF = "2026-08-03";
const SOURCE_IMAGE_SHA256 = "6cca7fd70991391d719764b415afabd45cbba6064c8320e6efd99cef752ae1ac";
const IDENTITY_CSV_SHA256 = "ce0078045997d86f4711a8956771934301f1540ec1120f3f34e2cc4b06c7bec4";
const IDENTITY_CSV_PATH = resolve(
  process.cwd(),
  "docs/procare-exports/CO - Centennial - Miss Honeys/raw/CO - Centennial - Miss Honeys - Account Balance Summary.csv",
);
const EXPECTED_SOURCE_ROWS = 18;
const EXPECTED_SOURCE_TOTAL_CENTS = 659_210;

type SourceRow = {
  key: string;
  payer: string;
  accountId: string;
  personIds: string[];
  balanceCents: number;
  allowMissingAccountShell?: boolean;
};

type SourcePlan = {
  sourceAsOf: string;
  rows: SourceRow[];
};

const SOURCE_PLAN_PATH = resolve(
  process.cwd(),
  "docs/procare-exports/CO - Centennial - Miss Honeys/raw/centennial-balance-plan.json",
);
const SOURCE_PLAN_SHA256 = "b4f5b77e53c6d16d2043b4b54c597a16bcc3eadf865e391af6e8cfe21d66e88f";

function readSourceRows() {
  const raw = readFileSync(SOURCE_PLAN_PATH, "utf8");
  invariant(
    createHash("sha256").update(raw).digest("hex") === SOURCE_PLAN_SHA256,
    "The local Centennial balance plan changed after review.",
  );
  const plan = JSON.parse(raw) as SourcePlan;
  invariant(plan.sourceAsOf === SOURCE_AS_OF, "The Centennial balance plan as-of date changed.");
  invariant(Array.isArray(plan.rows), "The Centennial balance plan rows are missing.");
  invariant(plan.rows.every((row) => (
    clean(row.key)
    && clean(row.payer)
    && clean(row.accountId)
    && Array.isArray(row.personIds)
    && row.personIds.every((personId) => clean(personId))
    && Number.isInteger(row.balanceCents)
    && (row.allowMissingAccountShell === undefined || row.allowMissingAccountShell === true)
  )), "The Centennial balance plan contains an incomplete row.");
  return plan.rows;
}

const SOURCE_ROWS = readSourceRows();

type Args = {
  apply: boolean;
  confirmScope: boolean;
  confirmHistory: boolean;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedName(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/\bhousehold\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedKey(value: unknown) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sha256File(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sorted(values: string[]) {
  return [...values].sort();
}

function sameStrings(left: string[], right: string[]) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const args: Args = { apply: false, confirmScope: false, confirmHistory: false };
  for (const arg of argv) {
    if (arg === APPLY_FLAG) args.apply = true;
    else if (arg === CONFIRM_SCOPE_FLAG) args.confirmScope = true;
    else if (arg === CONFIRM_HISTORY_FLAG) args.confirmHistory = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (args.apply && (!args.confirmScope || !args.confirmHistory)) {
    throw new Error(
      `Apply mode requires ${APPLY_FLAG} ${CONFIRM_SCOPE_FLAG} ${CONFIRM_HISTORY_FLAG}.`,
    );
  }
  return args;
}

function verifySourceEvidence() {
  const imagePath = clean(process.env.CENTENNIAL_BALANCE_IMAGE_PATH);
  invariant(imagePath, "CENTENNIAL_BALANCE_IMAGE_PATH is required.");
  invariant(sha256File(imagePath) === SOURCE_IMAGE_SHA256, "The Centennial balance photo does not match the reviewed source image.");
  invariant(sha256File(IDENTITY_CSV_PATH) === IDENTITY_CSV_SHA256, "The Centennial ProCare identity export changed after review.");
  invariant(SOURCE_ROWS.length === EXPECTED_SOURCE_ROWS, "The Centennial source row count changed.");
  invariant(
    SOURCE_ROWS.reduce((sum, row) => sum + row.balanceCents, 0) === EXPECTED_SOURCE_TOTAL_CENTS,
    "The Centennial source balance total changed.",
  );
  invariant(new Set(SOURCE_ROWS.map((row) => row.accountId)).size === SOURCE_ROWS.length, "The source includes a duplicate account ID.");
  invariant(new Set(SOURCE_ROWS.map((row) => row.key)).size === SOURCE_ROWS.length, "The source includes a duplicate account key.");
  invariant(SOURCE_ROWS.filter((row) => row.allowMissingAccountShell).length === 1, "The source must identify exactly one approved balance-only shell.");
  return {
    imagePath,
    imageSha256: SOURCE_IMAGE_SHA256,
    identityCsvSha256: IDENTITY_CSV_SHA256,
    sourcePlanSha256: SOURCE_PLAN_SHA256,
  };
}

async function loadState(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const centers = await client.center.findMany({
    where: {
      OR: [
        { name: CENTER_NAME },
        { crmLocationId: CENTER_CRM_LOCATION_ID },
        { locationId: CENTER_LOCATION_ID },
      ],
    },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      status: true,
      organization: { select: { id: true, name: true, tenantId: true } },
    },
  });
  invariant(centers.length === 1, `Expected exactly one Centennial center; found ${centers.length}.`);
  const center = centers[0];
  invariant(center.name === CENTER_NAME, `Expected ${CENTER_NAME}; found ${center.name}.`);
  invariant(center.crmLocationId === CENTER_CRM_LOCATION_ID, `Expected ${CENTER_CRM_LOCATION_ID}; found ${center.crmLocationId}.`);
  invariant(center.locationId === CENTER_LOCATION_ID, `Expected ${CENTER_LOCATION_ID}; found ${center.locationId}.`);
  invariant(center.status === "active", `Expected active Centennial center; found ${center.status}.`);

  const families = await client.family.findMany({
    where: { centerId: center.id },
    select: {
      id: true,
      name: true,
      externalId: true,
      sourceSystem: true,
      customFields: true,
      guardians: {
        select: { id: true, fullName: true, externalId: true, sourceSystem: true },
      },
      children: {
        select: { id: true, fullName: true, externalId: true, sourceSystem: true, enrollmentStatus: true },
      },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          sourceSystem: true,
          externalId: true,
          customFields: true,
          payments: { select: { id: true } },
          invoices: { select: { id: true } },
          ledgerEntries: {
            where: {
              sourceSystem: "procare",
              externalId: { startsWith: `centennial-photo-balance:${SOURCE_AS_OF}:` },
            },
            select: { id: true, amountCents: true, balanceAfterCents: true },
          },
        },
      },
    },
  });
  invariant(families.length > 0, "Centennial has no family records.");
  const reconciliationAuditCount = await client.auditLog.count({
    where: { centerId: center.id, action: "billing.centennial_photo_balance_reconciled" },
  });
  return { center, families, reconciliationAuditCount };
}

type LoadedState = Awaited<ReturnType<typeof loadState>>;
type FamilyRecord = LoadedState["families"][number];

function scoreFamily(row: SourceRow, family: FamilyRecord) {
  const accountKey = normalizedKey(family.externalId) === normalizedKey(row.key);
  const familyName = normalizedName(family.name) === normalizedName(row.payer);
  const guardianPersonId = family.guardians.some((guardian) => row.personIds.includes(clean(guardian.externalId)));
  const guardianName = family.guardians.some((guardian) => normalizedName(guardian.fullName) === normalizedName(row.payer));
  const deterministic = guardianPersonId || (accountKey && (familyName || guardianName));
  const score = (accountKey ? 16 : 0) + (guardianPersonId ? 12 : 0) + (familyName ? 8 : 0) + (guardianName ? 6 : 0);
  return {
    deterministic,
    score,
    evidence: [
      ...(accountKey ? ["procare_account_key"] : []),
      ...(guardianPersonId ? ["procare_person_id"] : []),
      ...(familyName ? ["exact_family_name"] : []),
      ...(guardianName ? ["exact_guardian_name"] : []),
    ],
  };
}

function buildPlan(state: LoadedState, allowMissingAccountShell = false) {
  const targets: Array<{
    family: FamilyRecord;
    source: SourceRow;
    desiredCents: number;
    evidence: string[];
    reason: "reported_nonzero_balance";
  }> = [];
  const unresolved: Array<{ key: string; payer: string; nearby: unknown[] }> = [];
  const missingAccountShells: SourceRow[] = [];
  for (const row of SOURCE_ROWS) {
    const scored = state.families
      .map((family) => ({ family, ...scoreFamily(row, family) }))
      .sort((left, right) => right.score - left.score);
    const candidates = scored.filter((candidate) => candidate.deterministic);
    const top = candidates[0];
    if (!top) {
      const surname = normalizedName(row.payer.split(",")[0]);
      const nearby = scored
        .filter((candidate) => (
          candidate.score > 0
          || normalizedName(candidate.family.name).includes(surname)
          || candidate.family.children.some((child) => normalizedName(child.fullName).includes(surname))
        ))
        .slice(0, 5)
        .map((candidate) => ({
          familyId: candidate.family.id,
          familyName: candidate.family.name,
          externalId: candidate.family.externalId,
          evidence: candidate.evidence,
          children: candidate.family.children.map((child) => ({
            fullName: child.fullName,
            externalId: child.externalId,
            enrollmentStatus: child.enrollmentStatus,
          })),
        }));
      if (allowMissingAccountShell && row.allowMissingAccountShell === true && nearby.length === 0) {
        missingAccountShells.push(row);
      } else {
        unresolved.push({ key: row.key, payer: row.payer, nearby });
      }
      continue;
    }
    invariant(candidates.filter((candidate) => candidate.score === top.score).length === 1, `Centennial family match is ambiguous for ${row.key} / ${row.payer}.`);
    invariant(clean(top.family.sourceSystem).toLowerCase() === "procare", `${row.key} matched a non-ProCare family.`);
    invariant(top.evidence.includes("procare_account_key") || top.evidence.includes("procare_person_id"), `${row.key} lacks a stable ProCare identifier match.`);
    targets.push({
      family: top.family,
      source: row,
      desiredCents: row.balanceCents,
      evidence: top.evidence,
      reason: "reported_nonzero_balance" as const,
    });
  }
  invariant(unresolved.length === 0, `Unresolved Centennial source accounts: ${JSON.stringify(unresolved)}`);
  invariant(missingAccountShells.length <= 1, "More than one Centennial source account requires a family shell.");
  invariant(targets.length + missingAccountShells.length === SOURCE_ROWS.length, "Not every Centennial source row has a safe resolution.");
  invariant(new Set(targets.map((target) => target.family.id)).size === targets.length, "Two source rows matched the same Centennial family.");
  invariant(
    targets.reduce((sum, target) => sum + target.desiredCents, 0)
      + missingAccountShells.reduce((sum, row) => sum + row.balanceCents, 0)
      === EXPECTED_SOURCE_TOTAL_CENTS,
    "Mapped target total changed.",
  );

  const targetFamilyIds = new Set(targets.map((target) => target.family.id));
  const zeroed = state.families
    .filter((family) => !targetFamilyIds.has(family.id) && (family.billingAccount?.balanceCents ?? 0) !== 0)
    .map((family) => ({
      family,
      source: null,
      desiredCents: 0,
      evidence: ["omitted_from_2026_08_03_nonzero_report"],
      reason: "reported_paid_or_zero_balance" as const,
    }));
  const items = [...targets, ...zeroed];
  return { targets, zeroed, items, targetFamilyIds, missingAccountShells };
}

function historyIds(state: LoadedState) {
  return {
    payments: sorted(state.families.flatMap((family) => family.billingAccount?.payments.map((payment) => payment.id) ?? [])),
    invoices: sorted(state.families.flatMap((family) => family.billingAccount?.invoices.map((invoice) => invoice.id) ?? [])),
  };
}

function stateSummary(state: LoadedState, plan: ReturnType<typeof buildPlan>) {
  const history = historyIds(state);
  return {
    center: {
      id: state.center.id,
      name: state.center.name,
      crmLocationId: state.center.crmLocationId,
      locationId: state.center.locationId,
      status: state.center.status,
    },
    source: {
      asOf: SOURCE_AS_OF,
      rows: SOURCE_ROWS.length,
      totalCents: EXPECTED_SOURCE_TOTAL_CENTS,
      imageSha256: SOURCE_IMAGE_SHA256,
      identityCsvSha256: IDENTITY_CSV_SHA256,
    },
    current: {
      families: state.families.length,
      billingAccounts: state.families.filter((family) => family.billingAccount).length,
      nonzeroAccounts: state.families.filter((family) => (family.billingAccount?.balanceCents ?? 0) !== 0).length,
      balanceCents: state.families.reduce((sum, family) => sum + (family.billingAccount?.balanceCents ?? 0), 0),
      payments: history.payments.length,
      invoices: history.invoices.length,
      reconciliationLedgerEntries: state.families.reduce(
        (sum, family) => sum + (family.billingAccount?.ledgerEntries.length ?? 0),
        0,
      ),
      reconciliationAuditEntries: state.reconciliationAuditCount,
    },
    plan: {
      matchedTargets: plan.targets.length,
      targetAccountsToCreate: plan.targets.filter((item) => !item.family.billingAccount).length,
      targetBalancesToChange: plan.targets.filter((item) => item.family.billingAccount?.balanceCents !== item.desiredCents).length,
      targetBalancesAlreadyExact: plan.targets.filter((item) => item.family.billingAccount?.balanceCents === item.desiredCents).length,
      sourceAccountShellsToCreate: plan.missingAccountShells.length,
      otherNonzeroAccountsToZero: plan.zeroed.length,
      otherNonzeroCentsToZero: plan.zeroed.reduce((sum, item) => sum + (item.family.billingAccount?.balanceCents ?? 0), 0),
      finalBalanceCents: EXPECTED_SOURCE_TOTAL_CENTS,
      paymentsPreserved: history.payments.length,
      invoicesPreserved: history.invoices.length,
    },
    targets: plan.targets.map((item) => ({
      key: item.source.key,
      payer: item.source.payer,
      familyId: item.family.id,
      familyName: item.family.name,
      evidence: item.evidence,
      currentBalanceCents: item.family.billingAccount?.balanceCents ?? 0,
      desiredBalanceCents: item.desiredCents,
      payments: item.family.billingAccount?.payments.length ?? 0,
      invoices: item.family.billingAccount?.invoices.length ?? 0,
    })),
    otherNonzeroAccounts: plan.zeroed.map((item) => ({
      familyId: item.family.id,
      familyName: item.family.name,
      currentBalanceCents: item.family.billingAccount?.balanceCents ?? 0,
      desiredBalanceCents: 0,
      payments: item.family.billingAccount?.payments.length ?? 0,
      invoices: item.family.billingAccount?.invoices.length ?? 0,
    })),
    missingAccountShells: plan.missingAccountShells.map((row) => ({
      key: row.key,
      payer: row.payer,
      accountId: row.accountId,
      desiredBalanceCents: row.balanceCents,
      childAssignmentHeld: true,
      guardianCreationHeld: true,
      accessCreationHeld: true,
    })),
  };
}

async function applyPlan(state: LoadedState, plan: ReturnType<typeof buildPlan>) {
  const preflightHistory = historyIds(state);
  const appliedAt = new Date();
  let accountsCreated = 0;
  let accountsUpdated = 0;
  let ledgerEntriesCreated = 0;
  let alreadyApplied = 0;
  let familyShellsCreated = 0;

  await prisma.$transaction(async (tx) => {
    const transactionalState = await loadState(tx);
    invariant(transactionalState.center.id === state.center.id, "The Centennial center changed after preflight.");
    const transactionalHistory = historyIds(transactionalState);
    invariant(sameStrings(transactionalHistory.payments, preflightHistory.payments), "Centennial payments changed after preflight; stopping before reconciliation.");
    invariant(sameStrings(transactionalHistory.invoices, preflightHistory.invoices), "Centennial invoices changed after preflight; stopping before reconciliation.");
    const transactionalPrePlan = buildPlan(transactionalState, true);
    invariant(
      JSON.stringify(transactionalPrePlan.items.map((item) => [item.family.id, item.desiredCents, item.reason]).sort())
        === JSON.stringify(plan.items.map((item) => [item.family.id, item.desiredCents, item.reason]).sort()),
      "The Centennial reconciliation plan changed after preflight.",
    );
    invariant(
      JSON.stringify(transactionalPrePlan.missingAccountShells.map((row) => row.key).sort())
        === JSON.stringify(plan.missingAccountShells.map((row) => row.key).sort()),
      "The missing Centennial account-shell plan changed after preflight.",
    );

    for (const row of transactionalPrePlan.missingAccountShells) {
      invariant(row.allowMissingAccountShell === true, `Unexpected missing account shell ${row.key}.`);
      const family = await tx.family.create({
        data: {
          centerId: state.center.id,
          name: row.payer,
          billingEmail: null,
          notes: "Created from the user-provided Centennial balance reconciliation; child/account resolution remains held.",
          sourceSystem: "procare",
          externalId: row.key,
          customFields: {
            source: "centennial_balance_photo_2026_08_03",
            sourceImageSha256: SOURCE_IMAGE_SHA256,
            identityCsvSha256: IDENTITY_CSV_SHA256,
            sourceAccountId: row.accountId,
            payerPersonIds: row.personIds,
            billingOnlyShell: true,
            needsAccountResolution: true,
            childAssignmentHeld: true,
            guardianCreationHeld: true,
            billingActivationHeld: true,
            accessCreated: false,
            invitationsSent: false,
            createdAt: appliedAt.toISOString(),
          },
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: state.center.organization.tenantId,
          centerId: state.center.id,
          userId: null,
          action: "billing.centennial_source_account_shell_created",
          resource: "Family",
          resourceId: family.id,
          metadata: {
            authorization: "user_provided_centennial_account_balance_report",
            sourceImageSha256: SOURCE_IMAGE_SHA256,
            identityCsvSha256: IDENTITY_CSV_SHA256,
            sourceAsOf: SOURCE_AS_OF,
            accountKey: row.key,
            accountId: row.accountId,
            payer: row.payer,
            childAssignmentHeld: true,
            guardianCreationHeld: true,
            accessCreated: false,
            invitationsSent: false,
          },
        },
      });
      familyShellsCreated += 1;
    }

    const reconciledState = await loadState(tx);
    const transactionalPlan = buildPlan(reconciledState);

    for (const item of transactionalPlan.items) {
      const current = item.family.billingAccount;
      const previousBalanceCents = current?.balanceCents ?? 0;
      const ledgerExternalId = `centennial-photo-balance:${SOURCE_AS_OF}:${item.family.id}`;
      const existingLedger = await tx.ledgerEntry.findUnique({
        where: { sourceSystem_externalId: { sourceSystem: "procare", externalId: ledgerExternalId } },
        select: { billingAccountId: true, balanceAfterCents: true },
      });
      if (existingLedger) {
        invariant(current, `Existing reconciliation ledger has no current billing account for ${item.family.id}.`);
        invariant(existingLedger.billingAccountId === current.id, `Existing reconciliation ledger belongs to another account for ${item.family.id}.`);
        invariant(existingLedger.balanceAfterCents === item.desiredCents, `Existing reconciliation ledger differs for ${item.family.id}.`);
        invariant(current.balanceCents === item.desiredCents, `Family ${item.family.id} changed after its Centennial reconciliation; refusing to overwrite later activity.`);
        alreadyApplied += 1;
        continue;
      }

      const sourceMetadata = item.source
        ? { accountKey: item.source.key, accountId: item.source.accountId, payer: item.source.payer }
        : { omittedFromNonzeroReport: true };
      const account = await tx.billingAccount.upsert({
        where: { familyId: item.family.id },
        update: {
          balanceCents: item.desiredCents,
          ledgerSyncedAt: appliedAt,
          sourceSystem: current?.sourceSystem ?? "procare",
          externalId: current?.externalId ?? `centennial-photo:${item.family.id}`,
          customFields: {
            ...record(current?.customFields),
            centennialBalanceReconciliation: {
              sourceImageSha256: SOURCE_IMAGE_SHA256,
              identityCsvSha256: IDENTITY_CSV_SHA256,
              sourceAsOf: SOURCE_AS_OF,
              reconciledAt: appliedAt.toISOString(),
              reason: item.reason,
              ...sourceMetadata,
              paymentsMutated: false,
              invoicesMutated: false,
            },
          },
        },
        create: {
          familyId: item.family.id,
          balanceCents: item.desiredCents,
          ledgerSyncedAt: appliedAt,
          sourceSystem: "procare",
          externalId: `centennial-photo:${item.family.id}`,
          customFields: {
            centennialBalanceReconciliation: {
              sourceImageSha256: SOURCE_IMAGE_SHA256,
              identityCsvSha256: IDENTITY_CSV_SHA256,
              sourceAsOf: SOURCE_AS_OF,
              reconciledAt: appliedAt.toISOString(),
              reason: item.reason,
              ...sourceMetadata,
              paymentsMutated: false,
              invoicesMutated: false,
            },
          },
        },
        select: { id: true },
      });
      if (current) accountsUpdated += 1;
      else accountsCreated += 1;

      await tx.ledgerEntry.create({
        data: {
          billingAccountId: account.id,
          type: "procare_balance_reconciliation",
          description: "Centennial ProCare balance reconciled from August 3 account summary photo",
          amountCents: item.desiredCents - previousBalanceCents,
          balanceAfterCents: item.desiredCents,
          effectiveAt: appliedAt,
          sourceSystem: "procare",
          externalId: ledgerExternalId,
          metadata: {
            centerId: state.center.id,
            sourceImageSha256: SOURCE_IMAGE_SHA256,
            identityCsvSha256: IDENTITY_CSV_SHA256,
            sourceAsOf: SOURCE_AS_OF,
            reason: item.reason,
            ...sourceMetadata,
            previousBalanceCents,
            reconciledBalanceCents: item.desiredCents,
            paymentsMutated: false,
            invoicesMutated: false,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: state.center.organization.tenantId,
          centerId: state.center.id,
          userId: null,
          action: "billing.centennial_photo_balance_reconciled",
          resource: "Family",
          resourceId: item.family.id,
          metadata: {
            authorization: "user_provided_centennial_account_balance_report",
            sourceImageSha256: SOURCE_IMAGE_SHA256,
            identityCsvSha256: IDENTITY_CSV_SHA256,
            sourceAsOf: SOURCE_AS_OF,
            reason: item.reason,
            ...sourceMetadata,
            previousBalanceCents,
            reconciledBalanceCents: item.desiredCents,
            paymentsMutated: false,
            invoicesMutated: false,
          },
        },
      });
      ledgerEntriesCreated += 1;
    }

    const verifiedState = await loadState(tx);
    const verifiedPlan = buildPlan(verifiedState);
    invariant(verifiedPlan.targets.every((item) => item.family.billingAccount?.balanceCents === item.desiredCents), "A listed Centennial balance does not match the source report.");
    invariant(verifiedState.families.every((family) => verifiedPlan.targetFamilyIds.has(family.id) || (family.billingAccount?.balanceCents ?? 0) === 0), "A non-listed Centennial family still has a nonzero balance.");
    invariant(verifiedState.families.reduce((sum, family) => sum + (family.billingAccount?.balanceCents ?? 0), 0) === EXPECTED_SOURCE_TOTAL_CENTS, "The Centennial total does not match $6,592.10.");
    const verifiedHistory = historyIds(verifiedState);
    invariant(sameStrings(verifiedHistory.payments, preflightHistory.payments), "Centennial payments changed during reconciliation.");
    invariant(sameStrings(verifiedHistory.invoices, preflightHistory.invoices), "Centennial invoices changed during reconciliation.");
  }, {
    maxWait: 10_000,
    timeout: 180_000,
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return { familyShellsCreated, accountsCreated, accountsUpdated, ledgerEntriesCreated, alreadyApplied };
}

async function main() {
  const args = parseArgs();
  const evidence = verifySourceEvidence();
  const state = await loadState();
  const plan = buildPlan(state, true);
  console.log(JSON.stringify({ mode: args.apply ? "apply-preflight" : "dry-run", evidence, ...stateSummary(state, plan) }, null, 2));
  if (!args.apply) return;

  const result = await applyPlan(state, plan);
  const verifiedState = await loadState();
  const verifiedPlan = buildPlan(verifiedState);
  console.log(JSON.stringify({ mode: "apply-result", result, verification: stateSummary(verifiedState, verifiedPlan) }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
