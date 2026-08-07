import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";
import {
  parseRenderedProcareBalanceRows,
  type RenderedProcareBalanceRow,
} from "@/lib/procare-rendered-report-import";

const APPLY_FLAG = "--apply";
const CONFIRM_FINGERPRINT_OPTION = "--confirm-fingerprint";
const CONFIRM_CURRENT_FLAG = "--confirm-current-families-only";
const CONFIRM_HISTORY_FLAG = "--confirm-preserve-payments-and-invoices";
const CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6";
const CENTER_NAME = "Kid City USA - Oakleaf";
const CENTER_LOCATION_ID = "Kid City USA - FL | Jacksonville - Oakleaf";
const SOURCE_AS_OF = "2026-08-02";
const SOURCE_SHA256 = "1d28dd395fe6c89c82dd0567e8aaa292e118cae346311c78f5fe4e4357e89425";
const EXPECTED_RENDERED_ROWS = 722;
const EXPECTED_CANONICAL_ACCOUNTS = 348;
const EXPECTED_CURRENT_FAMILIES = 45;
const EXPECTED_MATCHED_CURRENT_FAMILIES = 44;
const EXPECTED_UNMATCHED_CURRENT_FAMILIES = 1;
const RECONCILIATION_SOURCE = "oakleaf_procare_balance_2026_08_02";
const AUDIT_ACTION = "billing.oakleaf_procare_balance_reconciled";

type Args = {
  apply: boolean;
  confirmFingerprint: string;
  confirmCurrentFamilies: boolean;
  confirmHistory: boolean;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedId(value: unknown) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

function normalizedName(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/\b(family|household)\b/g, "")
    .match(/[a-z0-9]+/g)
    ?.sort()
    .join("\0") ?? "";
}

function record(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

type SourceBalanceConflict = {
  accountKey: string;
  payerName: string;
  hidden: boolean;
  duplicateRows: number;
  balances: number[];
  selectedBalanceCents: number;
};

function sourceFamilyIdentity(row: RenderedProcareBalanceRow) {
  return `${row.accountKey}||${normalizedName(row.payerName)}||${row.hidden}`;
}

function hasManualCollisionRepairMarker(row: Prisma.JsonValue | null) {
  const fields = record(row);
  const source = clean(fields.source).toLowerCase();
  return (
    /^manual_procare_household_collision_repair_/.test(source)
    || typeof fields.accountKeyCollisionWithFamilyId === "string"
    || fields.billingActivationHeld === true
  );
}

function sourceFamilyBalanceDeduplication(rows: RenderedProcareBalanceRow[]) {
  const rowsByIdentity = new Map<string, RenderedProcareBalanceRow[]>();
  for (const row of rows) {
    const familyKey = `${row.accountKey}||${normalizedName(row.payerName)}||${row.hidden}`;
    rowsByIdentity.set(familyKey, [...(rowsByIdentity.get(familyKey) ?? []), row]);
  }
  const canonicalRows: RenderedProcareBalanceRow[] = [];
  const familyBalanceConflicts: SourceBalanceConflict[] = [];
  for (const bucket of rowsByIdentity.values()) {
    const rowsByBalance = new Map<number, { row: RenderedProcareBalanceRow; count: number; firstIndex: number }>();
    for (let index = 0; index < bucket.length; index += 1) {
      const row = bucket[index];
      const entry = rowsByBalance.get(row.balanceCents);
      if (entry) entry.count += 1;
      else rowsByBalance.set(row.balanceCents, { row, count: 1, firstIndex: index });
    }
    const rowsByFrequency = [...rowsByBalance.values()].sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.firstIndex - right.firstIndex;
    });
    const chosen = rowsByFrequency[0];
    canonicalRows.push(chosen.row);

    if (rowsByFrequency.length > 1) {
      const balances = rowsByFrequency.map((item) => item.row.balanceCents).sort((left, right) => left - right);
      familyBalanceConflicts.push({
        accountKey: chosen.row.accountKey,
        payerName: chosen.row.payerName,
        hidden: chosen.row.hidden,
        duplicateRows: bucket.length,
        balances,
        selectedBalanceCents: chosen.row.balanceCents,
      });
    }
  }
  return { canonicalRows, familyBalanceConflicts };
}

function sourceEvidence() {
  const sourcePath = clean(process.env.OAKLEAF_PROCARE_BALANCE_CSV_PATH);
  invariant(sourcePath, "OAKLEAF_PROCARE_BALANCE_CSV_PATH is required.");
  const sourceBuffer = readFileSync(sourcePath);
  invariant(sha256(sourceBuffer) === SOURCE_SHA256, "The Oakleaf balance report does not match the reviewed source fingerprint.");
  const renderedRows = parseRenderedProcareBalanceRows(sourceBuffer);
  const { canonicalRows, familyBalanceConflicts } = sourceFamilyBalanceDeduplication(renderedRows);
  const withdrawnBalanceIdentitySet = new Set<string>();
  for (const conflict of familyBalanceConflicts) {
    if (!conflict.hidden) continue;
    withdrawnBalanceIdentitySet.add(sourceFamilyIdentity({
      accountKey: conflict.accountKey,
      payerName: conflict.payerName,
      hidden: conflict.hidden,
      balanceCents: conflict.selectedBalanceCents,
    }));
  }
  if (familyBalanceConflicts.length > 0) {
    console.error(`NOTICE: Oakleaf source has ${familyBalanceConflicts.length} family identities with conflicting balance values.`
      + " The highest-frequency balance was chosen for each family during deduplication.");
    console.error(stableJson(familyBalanceConflicts));
  }
  invariant(renderedRows.length === EXPECTED_RENDERED_ROWS, "The Oakleaf rendered balance-row count changed.");
  invariant(canonicalRows.length === EXPECTED_CANONICAL_ACCOUNTS, "The Oakleaf canonical account count changed.");
  return {
    sourcePath,
    renderedRows,
    canonicalRows,
    familyBalanceConflicts,
    withdrawnBalanceIdentitySet: [...withdrawnBalanceIdentitySet],
  };
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const args: Args = { apply: false, confirmFingerprint: "", confirmCurrentFamilies: false, confirmHistory: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === APPLY_FLAG) args.apply = true;
    else if (arg === CONFIRM_CURRENT_FLAG) args.confirmCurrentFamilies = true;
    else if (arg === CONFIRM_HISTORY_FLAG) args.confirmHistory = true;
    else if (arg === CONFIRM_FINGERPRINT_OPTION) args.confirmFingerprint = argv[++index]?.trim() ?? "";
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (args.apply) {
    invariant(args.confirmFingerprint, `Apply mode requires ${CONFIRM_FINGERPRINT_OPTION}.`);
    invariant(args.confirmCurrentFamilies, `Apply mode requires ${CONFIRM_CURRENT_FLAG}.`);
    invariant(args.confirmHistory, `Apply mode requires ${CONFIRM_HISTORY_FLAG}.`);
  }
  return args;
}

function candidateIds(family: { externalId: string | null; customFields: Prisma.JsonValue | null }, importIds: Set<string>) {
  const customFields = record(family.customFields);
  return [...new Set([
    family.externalId,
    customFields.procareAccountKey,
    customFields.sourceAccountId,
    customFields.procareAccountId,
    ...importIds,
  ].map(normalizedId).filter(Boolean))];
}

async function loadState(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const [center, families, importRows, invoices, payments] = await Promise.all([
    client.center.findUnique({
      where: { id: CENTER_ID },
      select: { id: true, name: true, locationId: true, status: true, organization: { select: { tenantId: true } } },
    }),
    client.family.findMany({
      where: { centerId: CENTER_ID, children: { some: currentlyEnrolledChildWhere() } },
      select: {
        id: true,
        name: true,
        sourceSystem: true,
        externalId: true,
        customFields: true,
        guardians: { select: { fullName: true, sourceSystem: true } },
        billingAccount: {
          select: {
            id: true,
            balanceCents: true,
            sourceSystem: true,
            externalId: true,
            customFields: true,
            invoices: { select: { id: true } },
            payments: { select: { id: true } },
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    client.procareImportRow.findMany({
      where: { batch: { centerId: CENTER_ID }, createdFamilyId: { not: null } },
      select: { createdFamilyId: true, rawData: true },
    }),
    client.invoice.findMany({ where: { billingAccount: { family: { centerId: CENTER_ID } } }, select: { id: true }, orderBy: { id: "asc" } }),
    client.payment.findMany({ where: { billingAccount: { family: { centerId: CENTER_ID } } }, select: { id: true }, orderBy: { id: "asc" } }),
  ]);
  invariant(center, "The reviewed Oakleaf center was not found.");
  invariant(center.name === CENTER_NAME, `Expected ${CENTER_NAME}; found ${center.name}.`);
  invariant(center.locationId === CENTER_LOCATION_ID, `Expected ${CENTER_LOCATION_ID}; found ${center.locationId}.`);
  invariant(center.status === "active", `Expected active Oakleaf center; found ${center.status}.`);
  return { center, families, importRows, invoiceIds: invoices.map((invoice) => invoice.id), paymentIds: payments.map((payment) => payment.id) };
}

type LoadedState = Awaited<ReturnType<typeof loadState>>;

function buildPlan(state: LoadedState, canonicalRows: RenderedProcareBalanceRow[], withdrawnBalanceIdentitySet: string[]) {
  const ignoredWithdrawnBalanceFamilyIds = new Set<string>(withdrawnBalanceIdentitySet);
  invariant(state.families.length === EXPECTED_CURRENT_FAMILIES, "Oakleaf's current-family count changed after review.");
  const importIdsByFamily = new Map<string, Set<string>>();
  for (const row of state.importRows) {
    if (!row.createdFamilyId) continue;
    const rawData = record(row.rawData);
    const target = importIdsByFamily.get(row.createdFamilyId) ?? new Set<string>();
    for (const key of ["account key", "account id", "account number", "family id", "procare account id"]) {
      const value = normalizedId(rawData[key]);
      if (value) target.add(value);
    }
    importIdsByFamily.set(row.createdFamilyId, target);
  }
  const sourceByKey = new Map<string, RenderedProcareBalanceRow[]>();
  for (const row of canonicalRows) sourceByKey.set(row.accountKey, [...(sourceByKey.get(row.accountKey) ?? []), row]);

  const excludedFamilyInfo = new Map<string, string>();
  const proposed = state.families.map((family) => {
    const ids = candidateIds(family, importIdsByFamily.get(family.id) ?? new Set());
    const sourceCandidates = [...new Set(ids.flatMap((id) => sourceByKey.get(id) ?? []))]
      .filter((row) => !ignoredWithdrawnBalanceFamilyIds.has(sourceFamilyIdentity(row)));
    const activeCandidates = sourceCandidates.filter((row) => !row.hidden);
    const disambiguatedCandidates = activeCandidates.length ? activeCandidates : sourceCandidates;
    const productionNames = new Set([
      normalizedName(family.name),
      ...family.guardians.map((guardian) => normalizedName(guardian.fullName)),
    ].filter(Boolean));
    const exactNameMatches = disambiguatedCandidates.filter((row) => productionNames.has(normalizedName(row.payerName)));
    const hiddenNameMatches = sourceCandidates.filter((row) => row.hidden && productionNames.has(normalizedName(row.payerName)));
    if (hasManualCollisionRepairMarker(family.customFields) || (hiddenNameMatches.length > 0 && exactNameMatches.length === 0)) {
      excludedFamilyInfo.set(family.id, hiddenNameMatches.length > 0 ? "withdrawn_source_marker" : "manual_collision_repair");
      return null;
    }
    const sourceAccounts = exactNameMatches.length ? exactNameMatches : disambiguatedCandidates.length === 1 ? disambiguatedCandidates : [];
    return {
      family,
      stableIds: ids,
      sourceAccounts,
      sourceCandidates,
      evidence: exactNameMatches.length ? "account_key_and_payer_name" as const : sourceAccounts.length ? "unique_account_key" as const : "unresolved" as const,
      desiredBalanceCents: sourceAccounts.reduce((sum, source) => sum + source.balanceCents, 0),
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  const sourceAssignments = new Map<RenderedProcareBalanceRow, string[]>();
  for (const item of proposed) for (const source of item.sourceAccounts) sourceAssignments.set(source, [...(sourceAssignments.get(source) ?? []), item.family.id]);
  const ambiguous = proposed.filter((item) => item.sourceAccounts.some((source) => (sourceAssignments.get(source)?.length ?? 0) !== 1));
  const matched = proposed.filter((item) => item.sourceAccounts.length && !ambiguous.includes(item));
  const unmatched = proposed.filter((item) => !item.sourceAccounts.length);
  invariant(ambiguous.length === 0, `Oakleaf source accounts match multiple current families: ${stableJson(ambiguous.map((item) => item.family.id))}`);
  invariant(matched.length + unmatched.length === state.families.length - excludedFamilyInfo.size, "The Oakleaf target family count changed after review.");
  invariant(matched.length === EXPECTED_MATCHED_CURRENT_FAMILIES - excludedFamilyInfo.size, "Oakleaf's matched current-family count changed after review.");
  invariant(unmatched.length === EXPECTED_UNMATCHED_CURRENT_FAMILIES, "Oakleaf's unmatched current-family count changed after review.");
  invariant(unmatched.every((item) => (item.family.billingAccount?.balanceCents ?? 0) === 0), "An unmatched non-withdrawn Oakleaf current family has a nonzero balance.");
  const targets = matched.map((item) => ({
    ...item,
    currentBalanceCents: item.family.billingAccount?.balanceCents ?? 0,
  }));
  const changes = targets.filter((item) => item.currentBalanceCents !== item.desiredBalanceCents);
  invariant(changes.every((item) => item.family.billingAccount), "A source-backed Oakleaf family is missing its billing account.");
  invariant(changes.every((item) => (item.family.billingAccount?.invoices.length ?? 0) === 0 && (item.family.billingAccount?.payments.length ?? 0) === 0), "An Oakleaf balance change has invoice or payment activity after the reviewed source date.");
  const fingerprint = sha256(stableJson({
    centerId: state.center.id,
    sourceAsOf: SOURCE_AS_OF,
    sourceSha256: SOURCE_SHA256,
    invoiceIds: state.invoiceIds,
    paymentIds: state.paymentIds,
    targets: targets.map((item) => ({
      familyId: item.family.id,
      currentBalanceCents: item.currentBalanceCents,
      desiredBalanceCents: item.desiredBalanceCents,
      sourceAccounts: item.sourceAccounts,
      evidence: item.evidence,
    })),
      unmatched: unmatched.map((item) => ({ familyId: item.family.id, currentBalanceCents: item.family.billingAccount?.balanceCents ?? 0 })),
      excludedCurrentFamilies: [...excludedFamilyInfo.entries()].map(([familyId, reason]) => ({ familyId, reason })),
  }));
  return { targets, changes, unmatched, fingerprint };
}

function summary(state: LoadedState, evidence: ReturnType<typeof sourceEvidence>, plan: ReturnType<typeof buildPlan>) {
  return {
    center: { id: state.center.id, name: state.center.name, locationId: state.center.locationId, status: state.center.status },
    source: {
      asOf: SOURCE_AS_OF,
      sha256: SOURCE_SHA256,
      renderedRows: evidence.renderedRows.length,
      duplicateRenderedRowsRemoved: evidence.renderedRows.length - evidence.canonicalRows.length,
      canonicalAccounts: evidence.canonicalRows.length,
      familyBalanceConflicts: evidence.familyBalanceConflicts.length,
      withdrawnBalanceConflicts: evidence.withdrawnBalanceIdentitySet.length,
    },
    current: {
      families: state.families.length,
      balanceCents: state.families.reduce((sum, family) => sum + (family.billingAccount?.balanceCents ?? 0), 0),
      invoices: state.invoiceIds.length,
      payments: state.paymentIds.length,
    },
    plan: {
      fingerprint: plan.fingerprint,
      matchedCurrentFamilies: plan.targets.length,
      changes: plan.changes.length,
      unchanged: plan.targets.length - plan.changes.length,
      unmatchedCurrentFamiliesHeld: plan.unmatched.length,
      currentMatchedBalanceCents: plan.targets.reduce((sum, item) => sum + item.currentBalanceCents, 0),
      sourceMatchedBalanceCents: plan.targets.reduce((sum, item) => sum + item.desiredBalanceCents, 0),
      finalCurrentBalanceCents: plan.targets.reduce((sum, item) => sum + item.desiredBalanceCents, 0),
      invoicesPreserved: state.invoiceIds.length,
      paymentsPreserved: state.paymentIds.length,
    },
    changes: plan.changes.map((item) => ({
      familyId: item.family.id,
      familyName: item.family.name,
      accountKeys: [...new Set(item.sourceAccounts.map((source) => source.accountKey))],
      evidence: item.evidence,
      currentBalanceCents: item.currentBalanceCents,
      desiredBalanceCents: item.desiredBalanceCents,
      differenceCents: item.desiredBalanceCents - item.currentBalanceCents,
      invoices: item.family.billingAccount?.invoices.length ?? 0,
      payments: item.family.billingAccount?.payments.length ?? 0,
    })),
    unmatchedHeld: plan.unmatched.map((item) => ({
      familyId: item.family.id,
      familyName: item.family.name,
      stableIds: item.stableIds,
      currentBalanceCents: item.family.billingAccount?.balanceCents ?? 0,
    })),
    largestSourceBackedCurrentBalances: plan.targets
      .slice()
      .sort((left, right) => right.desiredBalanceCents - left.desiredBalanceCents)
      .slice(0, 10)
      .map((item) => ({ familyId: item.family.id, familyName: item.family.name, balanceCents: item.desiredBalanceCents, exact: item.currentBalanceCents === item.desiredBalanceCents })),
  };
}

async function applyPlan(initialState: LoadedState, evidence: ReturnType<typeof sourceEvidence>, expectedFingerprint: string) {
  const appliedAt = new Date();
  let accountsUpdated = 0;
  let ledgerEntriesCreated = 0;
  await prisma.$transaction(async (tx) => {
    const state = await loadState(tx);
    invariant(stableJson(state.invoiceIds) === stableJson(initialState.invoiceIds), "Oakleaf invoices changed after preflight.");
    invariant(stableJson(state.paymentIds) === stableJson(initialState.paymentIds), "Oakleaf payments changed after preflight.");
    const plan = buildPlan(state, evidence.canonicalRows, evidence.withdrawnBalanceIdentitySet);
    invariant(plan.fingerprint === expectedFingerprint, "The Oakleaf reconciliation fingerprint changed after preflight.");
    for (const item of plan.changes) {
      const account = item.family.billingAccount;
      invariant(account, `Oakleaf family ${item.family.id} has no billing account.`);
      const ledgerExternalId = `${RECONCILIATION_SOURCE}:${item.family.id}`;
      const existingLedger = await tx.ledgerEntry.findUnique({
        where: { sourceSystem_externalId: { sourceSystem: "procare", externalId: ledgerExternalId } },
        select: { billingAccountId: true, balanceAfterCents: true },
      });
      invariant(!existingLedger, `Oakleaf family ${item.family.id} already has a reconciliation ledger entry but its balance is not exact.`);
      await tx.billingAccount.update({
        where: { id: account.id },
        data: {
          balanceCents: item.desiredBalanceCents,
          ledgerSyncedAt: appliedAt,
          customFields: {
            ...record(account.customFields),
            oakleafBalanceReconciliation: {
              source: RECONCILIATION_SOURCE,
              sourceSha256: SOURCE_SHA256,
              sourceAsOf: SOURCE_AS_OF,
              reconciledAt: appliedAt.toISOString(),
              accountKeys: [...new Set(item.sourceAccounts.map((source) => source.accountKey))],
              payerNames: [...new Set(item.sourceAccounts.map((source) => source.payerName))],
              evidence: item.evidence,
              previousBalanceCents: item.currentBalanceCents,
              reconciledBalanceCents: item.desiredBalanceCents,
              currentFamiliesOnly: true,
              paymentsMutated: false,
              invoicesMutated: false,
            },
          },
        },
      });
      await tx.ledgerEntry.create({
        data: {
          billingAccountId: account.id,
          type: "procare_balance_reconciliation",
          description: "Oakleaf ProCare balance reconciled from August 2 Account Balance Summary",
          amountCents: item.desiredBalanceCents - item.currentBalanceCents,
          balanceAfterCents: item.desiredBalanceCents,
          effectiveAt: appliedAt,
          sourceSystem: "procare",
          externalId: ledgerExternalId,
          metadata: {
            centerId: CENTER_ID,
            source: RECONCILIATION_SOURCE,
            sourceSha256: SOURCE_SHA256,
            sourceAsOf: SOURCE_AS_OF,
            accountKeys: [...new Set(item.sourceAccounts.map((source) => source.accountKey))],
            payerNames: [...new Set(item.sourceAccounts.map((source) => source.payerName))],
            evidence: item.evidence,
            previousBalanceCents: item.currentBalanceCents,
            reconciledBalanceCents: item.desiredBalanceCents,
            currentFamiliesOnly: true,
            paymentsMutated: false,
            invoicesMutated: false,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: state.center.organization.tenantId,
          centerId: CENTER_ID,
          userId: null,
          action: AUDIT_ACTION,
          resource: "Family",
          resourceId: item.family.id,
          metadata: {
            authorization: "user_requested_oakleaf_procare_balance_correction",
            source: RECONCILIATION_SOURCE,
            sourceSha256: SOURCE_SHA256,
            sourceAsOf: SOURCE_AS_OF,
            accountKeys: [...new Set(item.sourceAccounts.map((source) => source.accountKey))],
            evidence: item.evidence,
            previousBalanceCents: item.currentBalanceCents,
            reconciledBalanceCents: item.desiredBalanceCents,
            currentFamiliesOnly: true,
            paymentsMutated: false,
            invoicesMutated: false,
          },
        },
      });
      accountsUpdated += 1;
      ledgerEntriesCreated += 1;
    }
    const verifiedState = await loadState(tx);
    invariant(stableJson(verifiedState.invoiceIds) === stableJson(initialState.invoiceIds), "Oakleaf invoices changed during reconciliation.");
    invariant(stableJson(verifiedState.paymentIds) === stableJson(initialState.paymentIds), "Oakleaf payments changed during reconciliation.");
    const verifiedPlan = buildPlan(verifiedState, evidence.canonicalRows, evidence.withdrawnBalanceIdentitySet);
    invariant(verifiedPlan.changes.length === 0, "Oakleaf still has source-backed current-family balance differences.");
    invariant(verifiedPlan.unmatched.every((item) => (item.family.billingAccount?.balanceCents ?? 0) === 0), "The unmatched Oakleaf current family changed from zero.");
  }, {
    maxWait: 10_000,
    timeout: 60_000,
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
  return { accountsUpdated, ledgerEntriesCreated, invoicesMutated: 0, paymentsMutated: 0 };
}

async function main() {
  const args = parseArgs();
  const evidence = sourceEvidence();
  const state = await loadState();
  const plan = buildPlan(state, evidence.canonicalRows, evidence.withdrawnBalanceIdentitySet);
  console.log(JSON.stringify({ mode: args.apply ? "apply-preflight" : "dry-run", ...summary(state, evidence, plan) }, null, 2));
  if (!args.apply) return;
  invariant(args.confirmFingerprint === plan.fingerprint, `Fingerprint mismatch. Re-run the dry run and pass ${CONFIRM_FINGERPRINT_OPTION} ${plan.fingerprint}.`);
  const result = await applyPlan(state, evidence, plan.fingerprint);
  const verifiedState = await loadState();
  const verifiedPlan = buildPlan(verifiedState, evidence.canonicalRows, evidence.withdrawnBalanceIdentitySet);
  console.log(JSON.stringify({ mode: "apply-result", result, verification: summary(verifiedState, evidence, verifiedPlan) }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
