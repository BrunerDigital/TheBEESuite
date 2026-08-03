import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const APPLY_FLAG = "--apply";
const CONFIRM_SCOPE_FLAG = "--confirm-cordera-pdf-balances";
const CONFIRM_HISTORY_FLAG = "--confirm-preserve-payments-and-invoices";
const CENTER_NAME = "Kid City USA - Cordera (Colorado Springs)";
const CENTER_LOCATION_ID = "Kid City USA - CO | Colorado Springs - Cordera";
const SOURCE_AS_OF = "2026-08-09";
const SOURCE_PDF_SHA256 = "c501f8b2c4cdfb9a7ff2e299ab4d0b81140cab46e41cb1a57a67de4be993a52d";
const IDENTITY_CSV_SHA256 = "765209f82fd364f48449b05c6ca68444c49531e3d84bb04c6de9785053518e03";
const IDENTITY_CSV_PATH = resolve(
  process.cwd(),
  "docs/procare-exports/CO - Colorado Springs - Cordera/raw/CO - Colorado Springs - Cordera - childenrollment.csv",
);
const EXPECTED_SOURCE_ROWS = 52;
const EXPECTED_VISIBLE_ROWS = 31;
const EXPECTED_HIDDEN_ROWS = 21;
const EXPECTED_VISIBLE_CENTS = 77_900;
const EXPECTED_HIDDEN_CENTS = 374_600;
const EXPECTED_TOTAL_CENTS = 452_500;
const EXPECTED_IDENTITY_ROWS = 1_106;

type Section = "visible" | "hidden";
type SourceRow = { section: Section; key: string; payer: string; balanceCents: number };
type CsvRow = Record<string, string>;

type SourcePlan = {
  sourceAsOf: string;
  rows: SourceRow[];
};

const SOURCE_PLAN_PATH = resolve(
  process.cwd(),
  "docs/procare-exports/CO - Colorado Springs - Cordera/raw/cordera-balance-plan.json",
);
const SOURCE_PLAN_SHA256 = "1f77fe24c5d60c8d66448576fe7bd9b3769daa17d6dbbacae0c09504cb197538";

function readSourceRows() {
  const raw = readFileSync(SOURCE_PLAN_PATH, "utf8");
  invariant(
    createHash("sha256").update(raw).digest("hex") === SOURCE_PLAN_SHA256,
    "The local Cordera balance plan changed after review.",
  );
  const plan = JSON.parse(raw) as SourcePlan;
  invariant(plan.sourceAsOf === SOURCE_AS_OF, "The Cordera balance plan as-of date changed.");
  invariant(Array.isArray(plan.rows), "The Cordera balance plan rows are missing.");
  invariant(plan.rows.every((row) => (
    (row.section === "visible" || row.section === "hidden")
    && clean(row.key)
    && clean(row.payer)
    && Number.isInteger(row.balanceCents)
  )), "The Cordera balance plan contains an incomplete row.");
  return plan.rows;
}

const SOURCE_ROWS = readSourceRows();

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

function parseCsv(text: string) {
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\r" || char === "\n") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) matrix.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  invariant(!quoted, "The Cordera identity CSV contains an unterminated quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) matrix.push(row);
  return matrix;
}

function parseIdentityRows() {
  const matrix = parseCsv(readFileSync(IDENTITY_CSV_PATH, "utf8"));
  const headers = (matrix[0] ?? []).map((header) => header.replace(/^\ufeff/, "").trim());
  const rows = matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, clean(values[index])]))) as CsvRow[];
  invariant(rows.length === EXPECTED_IDENTITY_ROWS, `Expected ${EXPECTED_IDENTITY_ROWS} Cordera identity rows; found ${rows.length}.`);
  return rows;
}

function sourcePersonIds(rows: CsvRow[]) {
  const byPayer = new Map<string, Set<string>>();
  for (const row of rows) {
    for (let index = 1; index <= 3; index += 1) {
      const first = clean(row[`Relationship ${index} First Name`]);
      const last = clean(row[`Relationship ${index} Last Name`]);
      const personId = clean(row[`Relationship ${index} Id`]);
      if (!personId || (!first && !last)) continue;
      const name = normalizedName(`${last}, ${first}`);
      const ids = byPayer.get(name) ?? new Set<string>();
      ids.add(personId);
      byPayer.set(name, ids);
    }
  }
  return new Map([...byPayer].map(([name, ids]) => [name, sorted([...ids])]));
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { apply: false, confirmScope: false, confirmHistory: false };
  for (const arg of argv) {
    if (arg === APPLY_FLAG) args.apply = true;
    else if (arg === CONFIRM_SCOPE_FLAG) args.confirmScope = true;
    else if (arg === CONFIRM_HISTORY_FLAG) args.confirmHistory = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (args.apply && (!args.confirmScope || !args.confirmHistory)) {
    throw new Error(`Apply mode requires ${APPLY_FLAG} ${CONFIRM_SCOPE_FLAG} ${CONFIRM_HISTORY_FLAG}.`);
  }
  return args;
}

function verifySourceEvidence() {
  const pdfPath = clean(process.env.CORDERA_BALANCE_PDF_PATH);
  invariant(pdfPath, "CORDERA_BALANCE_PDF_PATH is required.");
  invariant(sha256File(pdfPath) === SOURCE_PDF_SHA256, "The Cordera balance PDF does not match the reviewed source.");
  invariant(sha256File(IDENTITY_CSV_PATH) === IDENTITY_CSV_SHA256, "The Cordera identity export changed after review.");
  invariant(SOURCE_ROWS.length === EXPECTED_SOURCE_ROWS, "The Cordera source row count changed.");
  invariant(SOURCE_ROWS.filter((row) => row.section === "visible").length === EXPECTED_VISIBLE_ROWS, "The visible row count changed.");
  invariant(SOURCE_ROWS.filter((row) => row.section === "hidden").length === EXPECTED_HIDDEN_ROWS, "The hidden row count changed.");
  invariant(SOURCE_ROWS.filter((row) => row.section === "visible").reduce((sum, row) => sum + row.balanceCents, 0) === EXPECTED_VISIBLE_CENTS, "The visible balance total changed.");
  invariant(SOURCE_ROWS.filter((row) => row.section === "hidden").reduce((sum, row) => sum + row.balanceCents, 0) === EXPECTED_HIDDEN_CENTS, "The hidden balance total changed.");
  invariant(SOURCE_ROWS.reduce((sum, row) => sum + row.balanceCents, 0) === EXPECTED_TOTAL_CENTS, "The Cordera total changed.");
  invariant(
    new Set(SOURCE_ROWS.map((row) => `${row.section}:${row.key}:${row.payer}`)).size === SOURCE_ROWS.length,
    "The Cordera source contains a duplicate row identity.",
  );
  const identityRows = parseIdentityRows();
  return { pdfPath, identityRows, personIdsByPayer: sourcePersonIds(identityRows) };
}

async function loadState(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const centers = await client.center.findMany({
    where: { OR: [{ name: CENTER_NAME }, { crmLocationId: CENTER_LOCATION_ID }, { locationId: CENTER_LOCATION_ID }] },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      status: true,
      organization: { select: { tenantId: true, name: true } },
    },
  });
  invariant(centers.length === 1, `Expected exactly one Cordera center; found ${centers.length}.`);
  const center = centers[0];
  invariant(center.name === CENTER_NAME, `Expected ${CENTER_NAME}; found ${center.name}.`);
  invariant(center.crmLocationId === CENTER_LOCATION_ID, `Expected ${CENTER_LOCATION_ID}; found ${center.crmLocationId}.`);
  invariant(center.locationId === CENTER_LOCATION_ID, `Expected ${CENTER_LOCATION_ID}; found ${center.locationId}.`);
  invariant(center.status === "active", `Expected active Cordera center; found ${center.status}.`);

  const families = await client.family.findMany({
    where: { centerId: center.id },
    select: {
      id: true,
      name: true,
      externalId: true,
      sourceSystem: true,
      customFields: true,
      guardians: { select: { id: true, fullName: true, externalId: true, sourceSystem: true } },
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
            where: { sourceSystem: "procare", externalId: { startsWith: `cordera-pdf-balance:${SOURCE_AS_OF}:` } },
            select: { id: true, amountCents: true, balanceAfterCents: true },
          },
        },
      },
    },
  });
  invariant(families.length > 0, "Cordera has no family records.");
  const reconciliationAuditCount = await client.auditLog.count({
    where: { centerId: center.id, action: "billing.cordera_pdf_balance_reconciled" },
  });
  return { center, families, reconciliationAuditCount };
}

type LoadedState = Awaited<ReturnType<typeof loadState>>;
type FamilyRecord = LoadedState["families"][number];

function scoreFamily(row: SourceRow, personIds: string[], family: FamilyRecord) {
  const payer = normalizedName(row.payer);
  const surname = normalizedName(row.payer.split(",")[0]);
  const accountKey = normalizedKey(family.externalId) === normalizedKey(row.key);
  const guardianPersonId = family.guardians.some((guardian) => personIds.includes(clean(guardian.externalId)));
  const guardianName = family.guardians.some((guardian) => normalizedName(guardian.fullName) === payer);
  const exactFamilyName = normalizedName(family.name) === payer;
  const familySurname = normalizedName(family.name) === surname;
  const deterministic = guardianPersonId || guardianName || (accountKey && (exactFamilyName || familySurname));
  const score = (accountKey ? 16 : 0) + (guardianPersonId ? 14 : 0) + (guardianName ? 10 : 0) + (exactFamilyName ? 8 : 0) + (familySurname ? 4 : 0);
  return {
    deterministic,
    score,
    evidence: [
      ...(accountKey ? ["procare_account_key"] : []),
      ...(guardianPersonId ? ["procare_person_id"] : []),
      ...(guardianName ? ["exact_guardian_name"] : []),
      ...(exactFamilyName ? ["exact_family_name"] : []),
      ...(familySurname ? ["exact_family_surname"] : []),
    ],
  };
}

function buildPlan(
  state: LoadedState,
  personIdsByPayer: Map<string, string[]>,
  allowMissingNonzeroShells = false,
) {
  const mappedRows: Array<{ family: FamilyRecord; source: SourceRow; evidence: string[] }> = [];
  const missingNonzeroShells: SourceRow[] = [];
  const unmatchedZeroRows: SourceRow[] = [];
  const ambiguous: Array<{ source: SourceRow; candidates: unknown[] }> = [];

  for (const row of SOURCE_ROWS) {
    const personIds = personIdsByPayer.get(normalizedName(row.payer)) ?? [];
    const candidates = state.families
      .map((family) => ({ family, ...scoreFamily(row, personIds, family) }))
      .filter((candidate) => candidate.deterministic)
      .sort((left, right) => right.score - left.score);
    const top = candidates[0];
    const ties = top ? candidates.filter((candidate) => candidate.score === top.score) : [];
    if (ties.length > 1) {
      if (row.balanceCents === 0) {
        unmatchedZeroRows.push(row);
      } else {
        ambiguous.push({
          source: row,
          candidates: ties.map((candidate) => ({ familyId: candidate.family.id, familyName: candidate.family.name, evidence: candidate.evidence })),
        });
      }
      continue;
    }
    if (!top) {
      if (row.balanceCents === 0) unmatchedZeroRows.push(row);
      else if (allowMissingNonzeroShells) missingNonzeroShells.push(row);
      else ambiguous.push({ source: row, candidates: [] });
      continue;
    }
    invariant(clean(top.family.sourceSystem).toLowerCase() === "procare", `${row.key} matched a non-ProCare family.`);
    mappedRows.push({ family: top.family, source: row, evidence: top.evidence });
  }
  invariant(ambiguous.length === 0, `Cordera source rows need manual identity resolution: ${JSON.stringify(ambiguous)}`);
  invariant(
    mappedRows.length + missingNonzeroShells.length + unmatchedZeroRows.length === SOURCE_ROWS.length,
    "Not every Cordera source row has a safe disposition.",
  );

  const grouped = new Map<string, {
    family: FamilyRecord;
    rows: SourceRow[];
    evidence: string[];
    desiredCents: number;
    reason: "reported_pdf_balance";
  }>();
  for (const item of mappedRows) {
    const current = grouped.get(item.family.id) ?? {
      family: item.family,
      rows: [],
      evidence: [],
      desiredCents: 0,
      reason: "reported_pdf_balance" as const,
    };
    current.rows.push(item.source);
    current.evidence.push(...item.evidence);
    current.desiredCents += item.source.balanceCents;
    grouped.set(item.family.id, current);
  }
  const targets = [...grouped.values()].map((item) => ({ ...item, evidence: [...new Set(item.evidence)].sort() }));
  const targetFamilyIds = new Set(targets.map((target) => target.family.id));
  const zeroed = state.families
    .filter((family) => !targetFamilyIds.has(family.id) && (family.billingAccount?.balanceCents ?? 0) !== 0)
    .map((family) => ({
      family,
      rows: [] as SourceRow[],
      evidence: ["omitted_from_2026_08_09_primary_account_report"],
      desiredCents: 0,
      reason: "unlisted_account_zero" as const,
    }));
  invariant(
    targets.reduce((sum, target) => sum + target.desiredCents, 0)
      + missingNonzeroShells.reduce((sum, row) => sum + row.balanceCents, 0)
      === EXPECTED_TOTAL_CENTS,
    "The mapped Cordera total changed.",
  );
  return {
    mappedRows,
    targets,
    targetFamilyIds,
    zeroed,
    items: [...targets, ...zeroed],
    missingNonzeroShells,
    unmatchedZeroRows,
  };
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
      visibleRows: EXPECTED_VISIBLE_ROWS,
      visibleCents: EXPECTED_VISIBLE_CENTS,
      hiddenRows: EXPECTED_HIDDEN_ROWS,
      hiddenCents: EXPECTED_HIDDEN_CENTS,
      totalCents: EXPECTED_TOTAL_CENTS,
      pdfSha256: SOURCE_PDF_SHA256,
      identityCsvSha256: IDENTITY_CSV_SHA256,
    },
    current: {
      families: state.families.length,
      billingAccounts: state.families.filter((family) => family.billingAccount).length,
      nonzeroAccounts: state.families.filter((family) => (family.billingAccount?.balanceCents ?? 0) !== 0).length,
      balanceCents: state.families.reduce((sum, family) => sum + (family.billingAccount?.balanceCents ?? 0), 0),
      payments: history.payments.length,
      invoices: history.invoices.length,
      reconciliationLedgerEntries: state.families.reduce((sum, family) => sum + (family.billingAccount?.ledgerEntries.length ?? 0), 0),
      reconciliationAuditEntries: state.reconciliationAuditCount,
    },
    plan: {
      sourceRowsMapped: plan.mappedRows.length,
      targetFamilies: plan.targets.length,
      targetAccountsToCreate: plan.targets.filter((item) => !item.family.billingAccount).length,
      targetBalancesToChange: plan.targets.filter((item) => item.family.billingAccount?.balanceCents !== item.desiredCents).length,
      targetBalancesAlreadyExact: plan.targets.filter((item) => item.family.billingAccount?.balanceCents === item.desiredCents).length,
      missingNonzeroAccountShellsToCreate: plan.missingNonzeroShells.length,
      unmatchedZeroRowsHeld: plan.unmatchedZeroRows.length,
      otherNonzeroAccountsToZero: plan.zeroed.length,
      finalBalanceCents: EXPECTED_TOTAL_CENTS,
      paymentsPreserved: history.payments.length,
      invoicesPreserved: history.invoices.length,
    },
    targets: plan.targets.map((item) => ({
      familyId: item.family.id,
      familyName: item.family.name,
      sourceAccounts: item.rows.map((row) => ({ section: row.section, key: row.key, payer: row.payer, balanceCents: row.balanceCents })),
      evidence: item.evidence,
      currentBalanceCents: item.family.billingAccount?.balanceCents ?? 0,
      desiredBalanceCents: item.desiredCents,
      payments: item.family.billingAccount?.payments.length ?? 0,
      invoices: item.family.billingAccount?.invoices.length ?? 0,
    })),
    missingNonzeroAccountShells: plan.missingNonzeroShells,
    unmatchedZeroRows: plan.unmatchedZeroRows,
    otherNonzeroAccounts: plan.zeroed.map((item) => ({
      familyId: item.family.id,
      familyName: item.family.name,
      currentBalanceCents: item.family.billingAccount?.balanceCents ?? 0,
      desiredBalanceCents: 0,
      payments: item.family.billingAccount?.payments.length ?? 0,
      invoices: item.family.billingAccount?.invoices.length ?? 0,
    })),
  };
}

async function applyPlan(
  state: LoadedState,
  plan: ReturnType<typeof buildPlan>,
  personIdsByPayer: Map<string, string[]>,
) {
  const preflightHistory = historyIds(state);
  const appliedAt = new Date();
  let familyShellsCreated = 0;
  let accountsCreated = 0;
  let accountsUpdated = 0;
  let ledgerEntriesCreated = 0;
  let alreadyApplied = 0;

  await prisma.$transaction(async (tx) => {
    const transactionalState = await loadState(tx);
    invariant(transactionalState.center.id === state.center.id, "The Cordera center changed after preflight.");
    const transactionalHistory = historyIds(transactionalState);
    invariant(sameStrings(transactionalHistory.payments, preflightHistory.payments), "Cordera payments changed after preflight; stopping before reconciliation.");
    invariant(sameStrings(transactionalHistory.invoices, preflightHistory.invoices), "Cordera invoices changed after preflight; stopping before reconciliation.");
    const transactionalPrePlan = buildPlan(transactionalState, personIdsByPayer, true);
    invariant(
      JSON.stringify(transactionalPrePlan.items.map((item) => [item.family.id, item.desiredCents, item.reason]).sort())
        === JSON.stringify(plan.items.map((item) => [item.family.id, item.desiredCents, item.reason]).sort()),
      "The Cordera reconciliation plan changed after preflight.",
    );
    invariant(
      JSON.stringify(transactionalPrePlan.missingNonzeroShells.map((row) => [row.section, row.key, row.payer, row.balanceCents]).sort())
        === JSON.stringify(plan.missingNonzeroShells.map((row) => [row.section, row.key, row.payer, row.balanceCents]).sort()),
      "The missing Cordera account-shell plan changed after preflight.",
    );

    for (const row of transactionalPrePlan.missingNonzeroShells) {
      const family = await tx.family.create({
        data: {
          centerId: state.center.id,
          name: row.payer,
          billingEmail: null,
          notes: "Created from the user-provided Cordera balance reconciliation; child and guardian relationships remain held.",
          sourceSystem: "procare",
          externalId: row.key,
          customFields: {
            source: "cordera_balance_pdf_2026_08_09",
            sourcePdfSha256: SOURCE_PDF_SHA256,
            identityCsvSha256: IDENTITY_CSV_SHA256,
            sourceSection: row.section,
            sourceAccountKey: row.key,
            sourcePayer: row.payer,
            billingOnlyShell: true,
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
          action: "billing.cordera_source_account_shell_created",
          resource: "Family",
          resourceId: family.id,
          metadata: {
            authorization: "user_provided_cordera_account_balance_report",
            sourcePdfSha256: SOURCE_PDF_SHA256,
            sourceAsOf: SOURCE_AS_OF,
            section: row.section,
            accountKey: row.key,
            payer: row.payer,
            balanceCents: row.balanceCents,
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
    const transactionalPlan = buildPlan(reconciledState, personIdsByPayer);
    for (const item of transactionalPlan.items) {
      const current = item.family.billingAccount;
      const previousBalanceCents = current?.balanceCents ?? 0;
      const ledgerExternalId = `cordera-pdf-balance:${SOURCE_AS_OF}:${item.family.id}`;
      const existingLedger = await tx.ledgerEntry.findUnique({
        where: { sourceSystem_externalId: { sourceSystem: "procare", externalId: ledgerExternalId } },
        select: { billingAccountId: true, balanceAfterCents: true },
      });
      if (existingLedger) {
        invariant(current, `Existing Cordera reconciliation ledger has no account for ${item.family.id}.`);
        invariant(existingLedger.billingAccountId === current.id, `Existing Cordera ledger belongs to another account for ${item.family.id}.`);
        invariant(existingLedger.balanceAfterCents === item.desiredCents, `Existing Cordera ledger differs for ${item.family.id}.`);
        invariant(current.balanceCents === item.desiredCents, `Family ${item.family.id} changed after reconciliation; refusing to overwrite later activity.`);
        alreadyApplied += 1;
        continue;
      }

      const sourceAccounts = item.rows.map((row) => ({ section: row.section, key: row.key, payer: row.payer, balanceCents: row.balanceCents }));
      const account = await tx.billingAccount.upsert({
        where: { familyId: item.family.id },
        update: {
          balanceCents: item.desiredCents,
          ledgerSyncedAt: appliedAt,
          sourceSystem: current?.sourceSystem ?? "procare",
          externalId: current?.externalId ?? `cordera-pdf:${item.family.id}`,
          customFields: {
            ...record(current?.customFields),
            corderaBalanceReconciliation: {
              sourcePdfSha256: SOURCE_PDF_SHA256,
              identityCsvSha256: IDENTITY_CSV_SHA256,
              sourceAsOf: SOURCE_AS_OF,
              reconciledAt: appliedAt.toISOString(),
              reason: item.reason,
              sourceAccounts,
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
          externalId: `cordera-pdf:${item.family.id}`,
          customFields: {
            corderaBalanceReconciliation: {
              sourcePdfSha256: SOURCE_PDF_SHA256,
              identityCsvSha256: IDENTITY_CSV_SHA256,
              sourceAsOf: SOURCE_AS_OF,
              reconciledAt: appliedAt.toISOString(),
              reason: item.reason,
              sourceAccounts,
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
          description: "Cordera ProCare balance reconciled from account summary PDF",
          amountCents: item.desiredCents - previousBalanceCents,
          balanceAfterCents: item.desiredCents,
          effectiveAt: appliedAt,
          sourceSystem: "procare",
          externalId: ledgerExternalId,
          metadata: {
            centerId: state.center.id,
            sourcePdfSha256: SOURCE_PDF_SHA256,
            identityCsvSha256: IDENTITY_CSV_SHA256,
            sourceAsOf: SOURCE_AS_OF,
            reason: item.reason,
            sourceAccounts,
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
          action: "billing.cordera_pdf_balance_reconciled",
          resource: "Family",
          resourceId: item.family.id,
          metadata: {
            authorization: "user_provided_cordera_account_balance_report",
            sourcePdfSha256: SOURCE_PDF_SHA256,
            identityCsvSha256: IDENTITY_CSV_SHA256,
            sourceAsOf: SOURCE_AS_OF,
            reason: item.reason,
            sourceAccounts,
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
    const verifiedPlan = buildPlan(verifiedState, personIdsByPayer);
    invariant(verifiedPlan.targets.every((item) => item.family.billingAccount?.balanceCents === item.desiredCents), "A mapped Cordera balance does not match the PDF.");
    invariant(verifiedState.families.every((family) => verifiedPlan.targetFamilyIds.has(family.id) || (family.billingAccount?.balanceCents ?? 0) === 0), "An unlisted Cordera family still has a nonzero balance.");
    invariant(verifiedState.families.reduce((sum, family) => sum + (family.billingAccount?.balanceCents ?? 0), 0) === EXPECTED_TOTAL_CENTS, "The Cordera total does not match $4,525.00.");
    const verifiedHistory = historyIds(verifiedState);
    invariant(sameStrings(verifiedHistory.payments, preflightHistory.payments), "Cordera payments changed during reconciliation.");
    invariant(sameStrings(verifiedHistory.invoices, preflightHistory.invoices), "Cordera invoices changed during reconciliation.");
  }, {
    maxWait: 10_000,
    timeout: 180_000,
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return { familyShellsCreated, accountsCreated, accountsUpdated, ledgerEntriesCreated, alreadyApplied };
}

async function main() {
  const args = parseArgs();
  const source = verifySourceEvidence();
  const state = await loadState();
  const plan = buildPlan(state, source.personIdsByPayer, true);
  console.log(JSON.stringify({
    mode: args.apply ? "apply-preflight" : "dry-run",
    evidence: {
      pdfPath: source.pdfPath,
      pdfSha256: SOURCE_PDF_SHA256,
      identityCsvSha256: IDENTITY_CSV_SHA256,
      sourcePlanSha256: SOURCE_PLAN_SHA256,
    },
    ...stateSummary(state, plan),
  }, null, 2));
  if (!args.apply) return;

  const result = await applyPlan(state, plan, source.personIdsByPayer);
  const verifiedState = await loadState();
  const verifiedPlan = buildPlan(verifiedState, source.personIdsByPayer);
  console.log(JSON.stringify({ mode: "apply-result", result, verification: stateSummary(verifiedState, verifiedPlan) }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
