import "./load-env";
import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cms3g2the000i6a7wdd8pa20s";
const CENTER_LOCATION_ID = "Miss Honey's Learning Center - CO | Centennial";
const APPLY_FLAG = "--apply";
const CONFIRM_FINGERPRINT = "--confirm-fingerprint";
const SOURCE_DATE = "2026-08-03";
const REVIEW_DATE = "2026-09-08";
const LEDGER_PREFIX = `centennial-reported-opening-balance-clear:${REVIEW_DATE}`;

const TARGETS = [
  {
    key: "CARRILLO",
    familyId: "cms7gdy9t01b9l704890q1dsy",
    familyName: "Carrillo Family",
    externalId: "37874",
    billingAccountId: "cmsne9vr30001l5046qmp230n",
    childId: "cms3lpgwm02zn6avwy0pnd1od",
    childName: "Aveyn Trevizo",
    expectedBalanceCents: 53_100,
    sourceLedgerExternalId: "centennial-photo-balance:2026-08-03:cms7gdy9t01b9l704890q1dsy",
  },
  {
    key: "SMITH",
    familyId: "cms7gdfoq017hl704wyl5ua2h",
    familyName: "Smith Family",
    externalId: "34280",
    billingAccountId: "4ec5a5eb-dd6f-4e2a-8a84-65cc02d74fb3",
    childId: "cms3lpd2p02y56avw6cw494cp",
    childName: "Logan Smith",
    expectedBalanceCents: 39_200,
    sourceLedgerExternalId: "centennial-photo-balance:2026-08-03:cms7gdfoq017hl704wyl5ua2h",
  },
  {
    key: "EVANS",
    familyId: "cms7g84ig00bul704f7mlrpgx",
    familyName: "Evans Family",
    externalId: "38996",
    billingAccountId: "cmsdej9b7000a6ajwoze61zh6",
    childId: "cms3loebv02kj6avwshgy5y0y",
    childName: "Felix Evans",
    expectedBalanceCents: 14_490,
    sourceLedgerExternalId: "centennial-photo-balance:2026-08-03:cms7g84ig00bul704f7mlrpgx",
  },
] as const;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseArgs(argv = process.argv.slice(2)) {
  let apply = false;
  let confirmFingerprint: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === APPLY_FLAG) apply = true;
    else if (arg === CONFIRM_FINGERPRINT) {
      confirmFingerprint = argv[index + 1] ?? null;
      index += 1;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  invariant(!apply || confirmFingerprint, `Apply mode requires ${CONFIRM_FINGERPRINT} <dry-run fingerprint>.`);
  return { apply, confirmFingerprint };
}

async function loadState(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const center = await client.center.findUnique({
    where: { id: CENTER_ID },
    select: { id: true, name: true, locationId: true, status: true, organization: { select: { tenantId: true } } },
  });
  invariant(center, "Centennial was not found.");
  invariant(center.locationId === CENTER_LOCATION_ID && center.status === "active", "Centennial identity or status changed.");
  const families = await client.family.findMany({
    where: { id: { in: TARGETS.map((target) => target.familyId) }, centerId: CENTER_ID },
    select: {
      id: true,
      centerId: true,
      name: true,
      externalId: true,
      sourceSystem: true,
      children: { select: { id: true, fullName: true, enrollmentStatus: true, classroomId: true } },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          customFields: true,
          invoices: { select: { id: true, number: true, status: true, totalCents: true, dueDate: true, createdAt: true } },
          payments: { select: { id: true, status: true, amountCents: true, paidAt: true, provider: true } },
          ledgerEntries: {
            select: { id: true, type: true, amountCents: true, balanceAfterCents: true, effectiveAt: true, sourceSystem: true, externalId: true },
          },
        },
      },
    },
  });
  invariant(families.length === TARGETS.length, `Expected ${TARGETS.length} target families; found ${families.length}.`);
  return { center, families };
}

type State = Awaited<ReturnType<typeof loadState>>;

function historySnapshot(state: State) {
  return state.families.map((family) => ({
    familyId: family.id,
    invoices: (family.billingAccount?.invoices ?? []).map((invoice) => ({
      ...invoice,
      dueDate: invoice.dueDate.toISOString(),
      createdAt: invoice.createdAt.toISOString(),
    })).sort((left, right) => left.id.localeCompare(right.id)),
    payments: (family.billingAccount?.payments ?? []).map((payment) => ({
      ...payment,
      paidAt: payment.paidAt?.toISOString() ?? null,
    })).sort((left, right) => left.id.localeCompare(right.id)),
  })).sort((left, right) => left.familyId.localeCompare(right.familyId));
}

function buildPlan(state: State) {
  const rows = TARGETS.map((target) => {
    const family = state.families.find((candidate) => candidate.id === target.familyId);
    invariant(family, `${target.key} family is missing.`);
    invariant(family.name === target.familyName && family.externalId === target.externalId, `${target.key} family identity changed.`);
    invariant(family.sourceSystem === "procare" && family.centerId === CENTER_ID, `${target.key} source or school changed.`);
    invariant(family.billingAccount?.id === target.billingAccountId, `${target.key} billing account changed.`);
    const child = family.children.find((candidate) => candidate.id === target.childId);
    invariant(child?.fullName === target.childName && child.enrollmentStatus === "enrolled" && child.classroomId, `${target.key} enrolled-child identity changed.`);
    const sourceLedger = family.billingAccount.ledgerEntries.find((entry) => entry.externalId === target.sourceLedgerExternalId);
    invariant(
      sourceLedger?.type === "procare_balance_reconciliation"
        && sourceLedger.sourceSystem === "procare"
        && sourceLedger.amountCents === target.expectedBalanceCents,
      `${target.key} August 3 opening-balance evidence changed.`,
    );
    const correctionExternalId = `${LEDGER_PREFIX}:${target.key}`;
    const correction = family.billingAccount.ledgerEntries.find((entry) => entry.externalId === correctionExternalId);
    const unsupportedInvoices = family.billingAccount.invoices.filter((invoice) => (
      invoice.status !== PaymentStatus.PAID && invoice.status !== PaymentStatus.VOID
    ));
    invariant(unsupportedInvoices.length === 0, `${target.key} now has an unpaid invoice; stop and review before correcting the balance.`);
    const alreadyApplied = Boolean(correction);
    if (alreadyApplied) {
      invariant(family.billingAccount.balanceCents === 0, `${target.key} balance changed after correction.`);
      invariant(correction?.type === "billing_correction" && correction.amountCents === -target.expectedBalanceCents && correction.balanceAfterCents === 0, `${target.key} correction ledger changed.`);
    } else {
      invariant(family.billingAccount.balanceCents === target.expectedBalanceCents, `${target.key} balance changed after director review.`);
    }
    return { target, family, correctionExternalId, alreadyApplied };
  });
  const history = historySnapshot(state);
  const reviewFingerprint = fingerprint({
    centerId: state.center.id,
    sourceDate: SOURCE_DATE,
    reviewDate: REVIEW_DATE,
    rows: rows.map(({ target, family, alreadyApplied }) => ({
      key: target.key,
      familyId: family.id,
      billingAccountId: family.billingAccount?.id,
      balanceCents: family.billingAccount?.balanceCents,
      expectedBalanceCents: target.expectedBalanceCents,
      sourceLedgerExternalId: target.sourceLedgerExternalId,
      alreadyApplied,
    })),
    history,
  });
  return { rows, history, fingerprint: reviewFingerprint };
}

function summarize(state: State, plan: ReturnType<typeof buildPlan>) {
  return {
    center: { id: state.center.id, name: state.center.name, locationId: state.center.locationId },
    fingerprint: plan.fingerprint,
    changes: plan.rows.filter((row) => !row.alreadyApplied).length,
    invoicesPreserved: plan.history.reduce((total, item) => total + item.invoices.length, 0),
    paymentsPreserved: plan.history.reduce((total, item) => total + item.payments.length, 0),
    balances: plan.rows.map(({ target, family, alreadyApplied }) => ({
      key: target.key,
      familyId: family.id,
      familyName: family.name,
      beforeCents: family.billingAccount?.balanceCents,
      afterCents: 0,
      unsupportedInvoices: 0,
      alreadyApplied,
    })),
  };
}

async function applyPlan(initial: State, expectedFingerprint: string) {
  const initialHistory = historySnapshot(initial);
  const appliedAt = new Date();
  let accountsUpdated = 0;
  let ledgerEntriesCreated = 0;
  let auditEntriesCreated = 0;
  await prisma.$transaction(async (tx) => {
    const locked = await loadState(tx);
    invariant(JSON.stringify(historySnapshot(locked)) === JSON.stringify(initialHistory), "Centennial invoice or payment history changed after preflight.");
    const plan = buildPlan(locked);
    invariant(plan.fingerprint === expectedFingerprint, "Centennial reviewed state changed after preflight.");
    for (const row of plan.rows) {
      if (row.alreadyApplied) continue;
      const account = row.family.billingAccount;
      invariant(account, `${row.target.key} billing account is missing.`);
      await tx.billingAccount.update({
        where: { id: account.id },
        data: {
          balanceCents: 0,
          ledgerSyncedAt: appliedAt,
          customFields: {
            ...record(account.customFields),
            centennialReportedOpeningBalanceClear: {
              reviewDate: REVIEW_DATE,
              sourceDate: SOURCE_DATE,
              previousBalanceCents: row.target.expectedBalanceCents,
              correctedBalanceCents: 0,
              sourceLedgerExternalId: row.target.sourceLedgerExternalId,
              invoicesMutated: false,
              paymentsMutated: false,
              correctedAt: appliedAt.toISOString(),
            },
          },
        },
      });
      await tx.ledgerEntry.create({
        data: {
          billingAccountId: account.id,
          type: "billing_correction",
          description: "Cleared unsupported August 3 imported opening balance after Centennial director review",
          amountCents: -row.target.expectedBalanceCents,
          balanceAfterCents: 0,
          effectiveAt: appliedAt,
          sourceSystem: "bee_suite_manual",
          externalId: row.correctionExternalId,
          metadata: {
            centerId: CENTER_ID,
            familyId: row.family.id,
            reviewDate: REVIEW_DATE,
            sourceDate: SOURCE_DATE,
            sourceLedgerExternalId: row.target.sourceLedgerExternalId,
            authorization: "user_confirmed_centennial_director_reported_zero_balance",
            invoicesMutated: false,
            paymentsMutated: false,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: locked.center.organization.tenantId,
          centerId: CENTER_ID,
          userId: null,
          action: "billing.centennial_reported_opening_balance_cleared",
          resource: "BillingAccount",
          resourceId: account.id,
          metadata: {
            familyId: row.family.id,
            familyName: row.family.name,
            previousBalanceCents: row.target.expectedBalanceCents,
            correctedBalanceCents: 0,
            sourceLedgerExternalId: row.target.sourceLedgerExternalId,
            reviewFingerprint: expectedFingerprint,
            authorization: "user_confirmed_centennial_director_reported_zero_balance",
            invoicesMutated: false,
            paymentsMutated: false,
            newChargeCreated: false,
          },
        },
      });
      accountsUpdated += 1;
      ledgerEntriesCreated += 1;
      auditEntriesCreated += 1;
    }
    const verified = await loadState(tx);
    invariant(JSON.stringify(historySnapshot(verified)) === JSON.stringify(initialHistory), "Centennial invoice or payment history changed during correction.");
    const verifiedPlan = buildPlan(verified);
    invariant(verifiedPlan.rows.every((row) => row.alreadyApplied && row.family.billingAccount?.balanceCents === 0), "Centennial balance correction failed verification.");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 });
  return { accountsUpdated, ledgerEntriesCreated, auditEntriesCreated, invoicesMutated: 0, paymentsMutated: 0 };
}

async function main() {
  const args = parseArgs();
  const state = await loadState();
  const plan = buildPlan(state);
  console.log(JSON.stringify({ mode: args.apply ? "apply-preflight" : "dry-run", ...summarize(state, plan) }, null, 2));
  if (!args.apply) return;
  invariant(args.confirmFingerprint === plan.fingerprint, `Fingerprint mismatch. Re-run dry-run and pass ${CONFIRM_FINGERPRINT} ${plan.fingerprint}.`);
  const result = await applyPlan(state, plan.fingerprint);
  const verified = await loadState();
  console.log(JSON.stringify({ mode: "apply-result", result, verification: summarize(verified, buildPlan(verified)) }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
