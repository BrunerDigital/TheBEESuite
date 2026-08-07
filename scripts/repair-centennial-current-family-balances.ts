import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const APPLY_FLAG = "--apply";
const CONFIRM_FINGERPRINT_OPTION = "--confirm-fingerprint";
const CENTER_ID = "cms3g2the000i6a7wdd8pa20s";
const CENTER_LOCATION_ID = "Miss Honey's Learning Center - CO | Centennial";
const SOURCE_AS_OF = "2026-08-06";
const SOURCE_IMAGE_SHA256 = "d1a9ed2de28cc78e92c07a50d33f72b61e8d55cd15d2e62293181d1af57da4e2";
const IDENTITY_CSV_SHA256 = "ce0078045997d86f4711a8956771934301f1540ec1120f3f34e2cc4b06c7bec4";
const IDENTITY_CSV_PATH = resolve(
  process.cwd(),
  "docs/procare-exports/CO - Centennial - Miss Honeys/raw/CO - Centennial - Miss Honeys - Account Balance Summary.csv",
);
const LEDGER_PREFIX = `centennial-current-family-balance:${SOURCE_AS_OF}`;
const AUDIT_ACTION = "billing.centennial_current_family_balance_corrected";

const TARGETS = [
  {
    key: "GIPSON",
    payer: "Gipson, Meshelle",
    desiredCents: 36_800,
    currentFamily: {
      id: "cms3loapi02j46avw1fki0sas",
      name: "Meshelle Gipson Family",
      externalId: "GIPSON",
      billingAccountId: "776606fa-9034-4aa9-b200-2bf4e7cb23b6",
      expectedBeforeCents: 0,
      enrolledChildIds: ["cms3lobdo02je6avwysggowhe"],
    },
    duplicateFamily: {
      id: "cms7g7oyu009bl704dkz14e1w",
      name: "Gipson Household",
      externalId: "34232",
      billingAccountId: "cmsdej9uh000g6ajwfjabdtcl",
      expectedBeforeCents: 36_800,
      payerPersonIds: ["210628"],
    },
  },
  {
    key: "GRAY",
    payer: "Gray, James",
    desiredCents: 71_800,
    currentFamily: {
      id: "cms3lokoa02n06avwqwdhv2za",
      name: "James Gray Family",
      externalId: "GRAY",
      billingAccountId: "70120cb6-054f-456f-9cfa-a36fe431bb41",
      expectedBeforeCents: 0,
      enrolledChildIds: ["cms3lollm02ne6avw72rus00d"],
    },
    duplicateFamily: {
      id: "cms7g90ex00gel704a8xj7fw9",
      name: "Gray Household",
      externalId: "34238",
      billingAccountId: "cmsdejadm000m6ajwtkh5phu0",
      expectedBeforeCents: 71_800,
      payerPersonIds: ["210649", "210650"],
    },
  },
  {
    key: "MCINTUR",
    payer: "McInturf, Margo",
    desiredCents: 77_400,
    currentFamily: {
      id: "cms7gb60p00tyl704e2z5ksdj",
      name: "McInturf Household",
      externalId: "34361",
      billingAccountId: "cmsdejd1d001g6ajwnd3r75fr",
      expectedBeforeCents: 38_700,
      enrolledChildIds: ["cms7gb6em00u4l704q1q2xoet"],
    },
    duplicateFamily: {
      id: "cms3lowfp02rm6avwvlpwqyfl",
      name: "Margo McInturf Family",
      externalId: "MCINTUR",
      billingAccountId: "cmsgdz0xl0012l104xy4mmst4",
      expectedBeforeCents: 77_400,
      payerPersonIds: ["211161", "231244"],
    },
  },
] as const;

type Args = { apply: boolean; confirmFingerprint: string | null };

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path: string) {
  return sha256(readFileSync(path));
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const args: Args = { apply: false, confirmFingerprint: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === APPLY_FLAG) args.apply = true;
    else if (arg === CONFIRM_FINGERPRINT_OPTION) {
      args.confirmFingerprint = argv[index + 1] ?? null;
      index += 1;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (args.apply) invariant(args.confirmFingerprint, `Apply mode requires ${CONFIRM_FINGERPRINT_OPTION}.`);
  return args;
}

function verifySourceEvidence() {
  const imagePath = String(process.env.CENTENNIAL_CURRENT_BALANCE_IMAGE_PATH ?? "").trim();
  invariant(imagePath, "CENTENNIAL_CURRENT_BALANCE_IMAGE_PATH is required.");
  invariant(sha256File(imagePath) === SOURCE_IMAGE_SHA256, "The Centennial correction screenshot does not match the reviewed source.");
  invariant(sha256File(IDENTITY_CSV_PATH) === IDENTITY_CSV_SHA256, "The Centennial identity export changed after review.");
  return { imagePath, imageSha256: SOURCE_IMAGE_SHA256, identityCsvSha256: IDENTITY_CSV_SHA256 };
}

async function loadState(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const center = await client.center.findUnique({
    where: { id: CENTER_ID },
    select: {
      id: true,
      name: true,
      locationId: true,
      status: true,
      organization: { select: { tenantId: true } },
    },
  });
  invariant(center, "Centennial was not found.");
  invariant(center.locationId === CENTER_LOCATION_ID, "The Centennial location identifier changed.");
  invariant(center.status === "active", "Centennial is not active.");

  const familyIds = TARGETS.flatMap((target) => [target.currentFamily.id, target.duplicateFamily.id]);
  const families = await client.family.findMany({
    where: { id: { in: familyIds }, centerId: CENTER_ID },
    select: {
      id: true,
      centerId: true,
      name: true,
      externalId: true,
      sourceSystem: true,
      guardians: { select: { id: true, fullName: true, externalId: true } },
      children: { select: { id: true, fullName: true, externalId: true, enrollmentStatus: true, classroomId: true } },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          customFields: true,
          invoices: {
            select: { id: true, number: true, status: true, dueDate: true, totalCents: true, createdAt: true },
          },
          payments: {
            select: { id: true, amountCents: true, status: true, provider: true, externalIdPlaceholder: true, paidAt: true },
          },
          ledgerEntries: {
            where: { sourceSystem: "procare", externalId: { startsWith: LEDGER_PREFIX } },
            select: { id: true, externalId: true, amountCents: true, balanceAfterCents: true },
          },
        },
      },
    },
  });
  invariant(families.length === familyIds.length, `Expected ${familyIds.length} scoped family records; found ${families.length}.`);
  return { center, families };
}

type LoadedState = Awaited<ReturnType<typeof loadState>>;
type FamilyRecord = LoadedState["families"][number];

function familyById(state: LoadedState, id: string) {
  const family = state.families.find((item) => item.id === id);
  invariant(family, `Missing scoped family ${id}.`);
  return family;
}

function sorted(values: readonly string[]) {
  return [...values].sort();
}

function historySnapshot(state: LoadedState) {
  return state.families
    .map((family) => ({
      familyId: family.id,
      invoices: (family.billingAccount?.invoices ?? [])
        .map((invoice) => ({ ...invoice, dueDate: invoice.dueDate.toISOString(), createdAt: invoice.createdAt.toISOString() }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      payments: (family.billingAccount?.payments ?? [])
        .map((payment) => ({ ...payment, paidAt: payment.paidAt?.toISOString() ?? null }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    }))
    .sort((left, right) => left.familyId.localeCompare(right.familyId));
}

function buildPlan(state: LoadedState) {
  const pairs = TARGETS.map((target) => {
    const current = familyById(state, target.currentFamily.id);
    const duplicate = familyById(state, target.duplicateFamily.id);
    invariant(current.name === target.currentFamily.name, `${target.key} current family name changed.`);
    invariant(current.externalId === target.currentFamily.externalId, `${target.key} current family identifier changed.`);
    invariant(duplicate.name === target.duplicateFamily.name, `${target.key} duplicate family name changed.`);
    invariant(duplicate.externalId === target.duplicateFamily.externalId, `${target.key} duplicate family identifier changed.`);
    invariant(current.sourceSystem === "procare" && duplicate.sourceSystem === "procare", `${target.key} family source changed.`);
    invariant(current.billingAccount?.id === target.currentFamily.billingAccountId, `${target.key} current billing account changed.`);
    invariant(duplicate.billingAccount?.id === target.duplicateFamily.billingAccountId, `${target.key} duplicate billing account changed.`);

    const currentEnrolledChildren = current.children.filter((child) => (
      ["enrolled", "active", "current"].includes(child.enrollmentStatus.trim().toLowerCase()) && Boolean(child.classroomId)
    ));
    invariant(
      JSON.stringify(sorted(currentEnrolledChildren.map((child) => child.id))) === JSON.stringify(sorted(target.currentFamily.enrolledChildIds)),
      `${target.key} current enrolled-child identity changed.`,
    );
    invariant(duplicate.children.length === 0, `${target.key} duplicate family unexpectedly has a child.`);
    invariant(
      target.duplicateFamily.payerPersonIds.every((personId) => duplicate.guardians.some((guardian) => guardian.externalId === personId)),
      `${target.key} duplicate payer identity changed.`,
    );

    const currentLedgerId = `${LEDGER_PREFIX}:${target.key}:current`;
    const duplicateLedgerId = `${LEDGER_PREFIX}:${target.key}:duplicate`;
    const currentLedger = current.billingAccount.ledgerEntries.find((entry) => entry.externalId === currentLedgerId);
    const duplicateLedger = duplicate.billingAccount.ledgerEntries.find((entry) => entry.externalId === duplicateLedgerId);
    invariant(Boolean(currentLedger) === Boolean(duplicateLedger), `${target.key} has a partial correction ledger.`);
    const alreadyApplied = Boolean(currentLedger && duplicateLedger);
    if (alreadyApplied) {
      invariant(current.billingAccount.balanceCents === target.desiredCents, `${target.key} current balance changed after correction.`);
      invariant(duplicate.billingAccount.balanceCents === 0, `${target.key} duplicate balance changed after correction.`);
      invariant(currentLedger?.balanceAfterCents === target.desiredCents, `${target.key} current ledger balance is incorrect.`);
      invariant(duplicateLedger?.balanceAfterCents === 0, `${target.key} duplicate ledger balance is incorrect.`);
    } else {
      invariant(current.billingAccount.balanceCents === target.currentFamily.expectedBeforeCents, `${target.key} current balance changed before correction.`);
      invariant(duplicate.billingAccount.balanceCents === target.duplicateFamily.expectedBeforeCents, `${target.key} duplicate balance changed before correction.`);
    }
    return {
      target,
      current,
      duplicate,
      currentLedgerId,
      duplicateLedgerId,
      alreadyApplied,
      currentDifferenceCents: target.desiredCents - current.billingAccount.balanceCents,
      duplicateDifferenceCents: -duplicate.billingAccount.balanceCents,
    };
  });

  const history = historySnapshot(state);
  const fingerprint = sha256(JSON.stringify({
    centerId: state.center.id,
    sourceAsOf: SOURCE_AS_OF,
    sourceImageSha256: SOURCE_IMAGE_SHA256,
    identityCsvSha256: IDENTITY_CSV_SHA256,
    pairs: pairs.map((pair) => ({
      key: pair.target.key,
      currentFamilyId: pair.current.id,
      duplicateFamilyId: pair.duplicate.id,
      currentBalanceCents: pair.current.billingAccount?.balanceCents,
      duplicateBalanceCents: pair.duplicate.billingAccount?.balanceCents,
      desiredCents: pair.target.desiredCents,
      alreadyApplied: pair.alreadyApplied,
    })),
    history,
  }));
  return { pairs, history, fingerprint };
}

function summary(state: LoadedState, plan: ReturnType<typeof buildPlan>) {
  return {
    center: { id: state.center.id, name: state.center.name, locationId: state.center.locationId },
    source: { asOf: SOURCE_AS_OF, imageSha256: SOURCE_IMAGE_SHA256, identityCsvSha256: IDENTITY_CSV_SHA256 },
    plan: {
      fingerprint: plan.fingerprint,
      pairs: plan.pairs.length,
      changes: plan.pairs.filter((pair) => !pair.alreadyApplied).length,
      alreadyApplied: plan.pairs.filter((pair) => pair.alreadyApplied).length,
      invoicesPreserved: plan.history.reduce((sum, item) => sum + item.invoices.length, 0),
      paymentsPreserved: plan.history.reduce((sum, item) => sum + item.payments.length, 0),
    },
    balances: plan.pairs.map((pair) => ({
      key: pair.target.key,
      payer: pair.target.payer,
      currentFamilyId: pair.current.id,
      currentFamilyName: pair.current.name,
      currentBeforeCents: pair.current.billingAccount?.balanceCents,
      currentAfterCents: pair.target.desiredCents,
      duplicateFamilyId: pair.duplicate.id,
      duplicateFamilyName: pair.duplicate.name,
      duplicateBeforeCents: pair.duplicate.billingAccount?.balanceCents,
      duplicateAfterCents: 0,
      pairBeforeCents: (pair.current.billingAccount?.balanceCents ?? 0) + (pair.duplicate.billingAccount?.balanceCents ?? 0),
      pairAfterCents: pair.target.desiredCents,
      invoices: (pair.current.billingAccount?.invoices.length ?? 0) + (pair.duplicate.billingAccount?.invoices.length ?? 0),
      payments: (pair.current.billingAccount?.payments.length ?? 0) + (pair.duplicate.billingAccount?.payments.length ?? 0),
      alreadyApplied: pair.alreadyApplied,
    })),
  };
}

async function applyPlan(initialState: LoadedState, expectedFingerprint: string) {
  const initialHistory = historySnapshot(initialState);
  const appliedAt = new Date();
  let accountsUpdated = 0;
  let ledgerEntriesCreated = 0;
  let auditEntriesCreated = 0;

  await prisma.$transaction(async (tx) => {
    const state = await loadState(tx);
    invariant(JSON.stringify(historySnapshot(state)) === JSON.stringify(initialHistory), "Centennial invoice or payment history changed after preflight.");
    const plan = buildPlan(state);
    invariant(plan.fingerprint === expectedFingerprint, "The Centennial correction fingerprint changed after preflight.");

    for (const pair of plan.pairs) {
      if (pair.alreadyApplied) continue;
      const updates = [
        {
          role: "current_family",
          family: pair.current,
          account: pair.current.billingAccount,
          balanceCents: pair.target.desiredCents,
          differenceCents: pair.currentDifferenceCents,
          ledgerExternalId: pair.currentLedgerId,
        },
        {
          role: "duplicate_family",
          family: pair.duplicate,
          account: pair.duplicate.billingAccount,
          balanceCents: 0,
          differenceCents: pair.duplicateDifferenceCents,
          ledgerExternalId: pair.duplicateLedgerId,
        },
      ] as const;

      for (const update of updates) {
        invariant(update.account, `${pair.target.key} ${update.role} has no billing account.`);
        const previousBalanceCents = update.account.balanceCents;
        await tx.billingAccount.update({
          where: { id: update.account.id },
          data: {
            balanceCents: update.balanceCents,
            ledgerSyncedAt: appliedAt,
            customFields: {
              ...record(update.account.customFields),
              centennialCurrentFamilyBalanceCorrection: {
                sourceAsOf: SOURCE_AS_OF,
                sourceImageSha256: SOURCE_IMAGE_SHA256,
                identityCsvSha256: IDENTITY_CSV_SHA256,
                accountKey: pair.target.key,
                payer: pair.target.payer,
                role: update.role,
                counterpartFamilyId: update.role === "current_family" ? pair.duplicate.id : pair.current.id,
                previousBalanceCents,
                correctedBalanceCents: update.balanceCents,
                currentFamiliesOnly: true,
                invoicesMutated: false,
                paymentsMutated: false,
                correctedAt: appliedAt.toISOString(),
              },
            },
          },
        });
        await tx.ledgerEntry.create({
          data: {
            billingAccountId: update.account.id,
            type: "procare_balance_reconciliation",
            description: "Centennial balance corrected to the enrolled family from the August 6 operator screenshot",
            amountCents: update.differenceCents,
            balanceAfterCents: update.balanceCents,
            effectiveAt: appliedAt,
            sourceSystem: "procare",
            externalId: update.ledgerExternalId,
            metadata: {
              centerId: CENTER_ID,
              sourceAsOf: SOURCE_AS_OF,
              sourceImageSha256: SOURCE_IMAGE_SHA256,
              identityCsvSha256: IDENTITY_CSV_SHA256,
              accountKey: pair.target.key,
              payer: pair.target.payer,
              role: update.role,
              counterpartFamilyId: update.role === "current_family" ? pair.duplicate.id : pair.current.id,
              previousBalanceCents,
              correctedBalanceCents: update.balanceCents,
              currentFamiliesOnly: true,
              invoicesMutated: false,
              paymentsMutated: false,
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
            resourceId: update.family.id,
            metadata: {
              authorization: "user_provided_centennial_current_family_balance_screenshot",
              sourceAsOf: SOURCE_AS_OF,
              sourceImageSha256: SOURCE_IMAGE_SHA256,
              identityCsvSha256: IDENTITY_CSV_SHA256,
              accountKey: pair.target.key,
              payer: pair.target.payer,
              role: update.role,
              counterpartFamilyId: update.role === "current_family" ? pair.duplicate.id : pair.current.id,
              previousBalanceCents,
              correctedBalanceCents: update.balanceCents,
              currentFamiliesOnly: true,
              invoicesMutated: false,
              paymentsMutated: false,
            },
          },
        });
        accountsUpdated += 1;
        ledgerEntriesCreated += 1;
        auditEntriesCreated += 1;
      }
    }

    const verifiedState = await loadState(tx);
    invariant(JSON.stringify(historySnapshot(verifiedState)) === JSON.stringify(initialHistory), "Centennial invoice or payment history changed during correction.");
    const verifiedPlan = buildPlan(verifiedState);
    invariant(verifiedPlan.pairs.every((pair) => pair.alreadyApplied), "A Centennial current-family balance correction is incomplete.");
    invariant(
      verifiedPlan.pairs.every((pair) => (
        pair.current.billingAccount?.balanceCents === pair.target.desiredCents
        && pair.duplicate.billingAccount?.balanceCents === 0
      )),
      "A Centennial corrected balance failed verification.",
    );
  }, {
    maxWait: 10_000,
    timeout: 60_000,
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return { accountsUpdated, ledgerEntriesCreated, auditEntriesCreated, invoicesMutated: 0, paymentsMutated: 0 };
}

async function main() {
  const args = parseArgs();
  const evidence = verifySourceEvidence();
  const state = await loadState();
  const plan = buildPlan(state);
  console.log(JSON.stringify({ mode: args.apply ? "apply-preflight" : "dry-run", evidence, ...summary(state, plan) }, null, 2));
  if (!args.apply) return;
  invariant(args.confirmFingerprint === plan.fingerprint, `Fingerprint mismatch. Re-run the dry run and pass ${CONFIRM_FINGERPRINT_OPTION} ${plan.fingerprint}.`);
  const result = await applyPlan(state, plan.fingerprint);
  const verifiedState = await loadState();
  const verifiedPlan = buildPlan(verifiedState);
  console.log(JSON.stringify({ mode: "apply-result", result, verification: summary(verifiedState, verifiedPlan) }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
