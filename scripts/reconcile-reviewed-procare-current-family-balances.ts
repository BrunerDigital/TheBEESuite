import "./load-env";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";
import { parseCsvBuffer } from "./prepare-procare-location-workflow";

type Args = {
  centerId: string;
  expectedCenterName: string;
  filePath: string;
  userId: string | null;
  apply: boolean;
  confirmFingerprint: string;
  confirmCurrentFamiliesOnly: boolean;
  confirmPreserveHistory: boolean;
  holdMissingZeroBalances: boolean;
};

export type ReviewedBalanceRow = {
  accountId: string;
  accountKey: string;
  payerPersonId: string;
  payerName: string;
  balanceCents: number;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function record(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function moneyCents(value: string) {
  const normalized = clean(value).replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  invariant(/^-?\d+(?:\.\d{1,2})?$/.test(normalized), `Invalid balance value: ${value}`);
  return Math.round(Number(normalized) * 100);
}

export function parseReviewedBalanceRows(buffer: Buffer) {
  const parsed = parseCsvBuffer(buffer, "reviewed current-family balances");
  const rows: ReviewedBalanceRow[] = parsed.rows.map((row, index) => {
    const accountId = clean(row["Account ID"]);
    const scope = clean(row["BEE Scope"]);
    const hidden = clean(row["Is Hidden"]).toLowerCase();
    const reviewedCents = Number(clean(row["BEE Balance Cents"]));
    invariant(accountId, `Balance row ${index + 2} is missing Account ID.`);
    invariant(scope === "current_family", `Balance row ${index + 2} is outside the current-family scope.`);
    invariant(!["checked", "true", "yes", "1"].includes(hidden), `Balance row ${index + 2} is hidden and cannot be imported.`);
    invariant(Number.isInteger(reviewedCents), `Balance row ${index + 2} has an invalid reviewed balance.`);
    invariant(moneyCents(row.Balance) === reviewedCents, `Balance row ${index + 2} no longer matches its reviewed cents.`);
    return {
      accountId,
      accountKey: clean(row["Account Key"]),
      payerPersonId: clean(row["Person ID"]),
      payerName: clean(row["Full Name"]),
      balanceCents: reviewedCents,
    };
  });
  const ids = new Set<string>();
  for (const row of rows) {
    invariant(!ids.has(row.accountId), `Duplicate Account ID ${row.accountId} in reviewed balance file.`);
    ids.add(row.accountId);
  }
  return rows.sort((left, right) => left.accountId.localeCompare(right.accountId));
}

function option(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? clean(argv[index + 1]) : "";
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const centerId = option(argv, "--center");
  const expectedCenterName = option(argv, "--center-name");
  const filePath = option(argv, "--file");
  invariant(centerId && expectedCenterName && filePath, "Pass --center, --center-name, and --file.");
  const apply = argv.includes("--apply");
  const confirmFingerprint = option(argv, "--confirm-fingerprint");
  const confirmCurrentFamiliesOnly = argv.includes("--confirm-current-families-only");
  const confirmPreserveHistory = argv.includes("--confirm-preserve-payments-and-invoices");
  const holdMissingZeroBalances = argv.includes("--hold-missing-zero-balances");
  if (apply) {
    invariant(confirmFingerprint, "Apply mode requires --confirm-fingerprint.");
    invariant(confirmCurrentFamiliesOnly, "Apply mode requires --confirm-current-families-only.");
    invariant(confirmPreserveHistory, "Apply mode requires --confirm-preserve-payments-and-invoices.");
  }
  return {
    centerId,
    expectedCenterName,
    filePath: path.resolve(filePath),
    userId: option(argv, "--user-id") || null,
    apply,
    confirmFingerprint,
    confirmCurrentFamiliesOnly,
    confirmPreserveHistory,
    holdMissingZeroBalances,
  };
}

async function buildPlan(args: Args, sourceBuffer: Buffer) {
  const sourceRows = parseReviewedBalanceRows(sourceBuffer);
  const center = await prisma.center.findUnique({
    where: { id: args.centerId },
    select: { id: true, name: true, locationId: true, status: true, organization: { select: { tenantId: true } } },
  });
  invariant(center, "The reviewed center was not found.");
  invariant(center.name === args.expectedCenterName, `Expected ${args.expectedCenterName}; found ${center.name}.`);
  invariant(center.status === "active", `Expected an active center; found ${center.status}.`);
  if (args.userId) {
    const operator = await prisma.user.findFirst({ where: { id: args.userId, isActive: true }, select: { id: true } });
    invariant(operator, "The audit operator is not active.");
  }
  const families = await prisma.family.findMany({
    where: {
      centerId: center.id,
      sourceSystem: "procare",
      externalId: { in: sourceRows.map((row) => row.accountId) },
      children: { some: currentlyEnrolledChildWhere() },
    },
    select: {
      id: true,
      name: true,
      externalId: true,
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          sourceSystem: true,
          externalId: true,
          customFields: true,
          invoices: { select: { id: true }, orderBy: { id: "asc" } },
          payments: { select: { id: true }, orderBy: { id: "asc" } },
        },
      },
    },
    orderBy: { id: "asc" },
  });
  const familyByAccountId = new Map(families.map((family) => [clean(family.externalId), family]));
  invariant(familyByAccountId.size === families.length, "Multiple current families share a reviewed ProCare Account ID.");
  const missing = sourceRows.filter((row) => !familyByAccountId.has(row.accountId));
  invariant(
    missing.length === 0 || (args.holdMissingZeroBalances && missing.every((row) => row.balanceCents === 0)),
    `Reviewed balance rows are missing imported current families: ${missing.map((row) => `${row.accountId}:${row.balanceCents}`).join(", ")}`,
  );
  const targets = sourceRows.flatMap((source) => {
    const family = familyByAccountId.get(source.accountId);
    if (!family) return [];
    const account = family.billingAccount;
    return [{
      source,
      familyId: family.id,
      familyName: family.name,
      billingAccountId: account?.id ?? null,
      currentBalanceCents: account?.balanceCents ?? 0,
      invoiceIds: account?.invoices.map((item) => item.id) ?? [],
      paymentIds: account?.payments.map((item) => item.id) ?? [],
    }];
  });
  invariant(targets.every((item) => item.invoiceIds.length === 0 && item.paymentIds.length === 0), "A reviewed target has invoice or payment history; hold it for separate reconciliation.");
  const sourceSha256 = sha256(sourceBuffer);
  const fingerprint = sha256(stableJson({
    center: { id: center.id, name: center.name, locationId: center.locationId, status: center.status },
    sourceSha256,
    targets,
    missing,
  }));
  return { center, sourceSha256, sourceRows, targets, missing, fingerprint };
}

function publicPlan(plan: Awaited<ReturnType<typeof buildPlan>>) {
  return {
    center: { id: plan.center.id, name: plan.center.name, locationId: plan.center.locationId, status: plan.center.status },
    sourceSha256: plan.sourceSha256,
    fingerprint: plan.fingerprint,
    reviewedAccounts: plan.sourceRows.length,
    matchedCurrentFamilies: plan.targets.length,
    heldMissingZeroBalanceAccounts: plan.missing.map((row) => row.accountId),
    currentBalanceCents: plan.targets.reduce((sum, item) => sum + item.currentBalanceCents, 0),
    reviewedBalanceCents: plan.targets.reduce((sum, item) => sum + item.source.balanceCents, 0),
    nonzeroAccounts: plan.targets.filter((item) => item.source.balanceCents !== 0).length,
    billingAccountsToCreate: plan.targets.filter((item) => !item.billingAccountId).length,
    balanceChanges: plan.targets.filter((item) => item.currentBalanceCents !== item.source.balanceCents).length,
    invoiceIdsPreserved: plan.targets.flatMap((item) => item.invoiceIds).length,
    paymentIdsPreserved: plan.targets.flatMap((item) => item.paymentIds).length,
  };
}

async function applyPlan(args: Args, initialPlan: Awaited<ReturnType<typeof buildPlan>>, sourceBuffer: Buffer) {
  const appliedAt = new Date();
  let createdAccounts = 0;
  let updatedAccounts = 0;
  let ledgerEntriesCreated = 0;
  let alreadyApplied = 0;
  for (const target of initialPlan.targets) {
    await prisma.$transaction(async (tx) => {
      const family = await tx.family.findFirst({
        where: {
          id: target.familyId,
          centerId: args.centerId,
          sourceSystem: "procare",
          externalId: target.source.accountId,
          children: { some: currentlyEnrolledChildWhere() },
        },
        select: {
          id: true,
          billingAccount: {
            select: {
              id: true,
              balanceCents: true,
              customFields: true,
              invoices: { select: { id: true }, orderBy: { id: "asc" } },
              payments: { select: { id: true }, orderBy: { id: "asc" } },
            },
          },
        },
      });
      invariant(family, `Current family ${target.familyId} changed after preflight.`);
      invariant(stableJson(family.billingAccount?.invoices.map((item) => item.id) ?? []) === stableJson(target.invoiceIds), `Invoices changed for ${target.familyName}.`);
      invariant(stableJson(family.billingAccount?.payments.map((item) => item.id) ?? []) === stableJson(target.paymentIds), `Payments changed for ${target.familyName}.`);
      const ledgerExternalId = `reviewed-current-family-balance:${initialPlan.sourceSha256}:${target.source.accountId}`;
      const existingLedger = await tx.ledgerEntry.findUnique({
        where: { sourceSystem_externalId: { sourceSystem: "procare", externalId: ledgerExternalId } },
        select: { billingAccountId: true, balanceAfterCents: true, amountCents: true },
      });
      if (existingLedger) {
        invariant(family.billingAccount?.id === existingLedger.billingAccountId, `Reconciliation ledger ownership changed for ${target.familyName}.`);
        invariant(family.billingAccount.balanceCents === target.source.balanceCents, `Applied balance changed for ${target.familyName}.`);
        invariant(existingLedger.balanceAfterCents === target.source.balanceCents, `Applied ledger balance changed for ${target.familyName}.`);
        alreadyApplied += 1;
        return;
      }
      invariant((family.billingAccount?.balanceCents ?? 0) === target.currentBalanceCents, `Balance changed for ${target.familyName} after preflight.`);
      const reconciliationMetadata = {
        source: "reviewed_procare_current_family_balance",
        sourceSha256: initialPlan.sourceSha256,
        sourceFile: path.basename(args.filePath),
        accountId: target.source.accountId,
        accountKey: target.source.accountKey,
        payerPersonId: target.source.payerPersonId,
        payerName: target.source.payerName,
        previousBalanceCents: target.currentBalanceCents,
        reconciledBalanceCents: target.source.balanceCents,
        reconciledAt: appliedAt.toISOString(),
        currentFamiliesOnly: true,
        noPaymentSubmitted: true,
        invoicesMutated: false,
        paymentsMutated: false,
      };
      const account = family.billingAccount
        ? await tx.billingAccount.update({
            where: { id: family.billingAccount.id },
            data: {
              balanceCents: target.source.balanceCents,
              ledgerSyncedAt: appliedAt,
              sourceSystem: "procare",
              externalId: target.source.accountId,
              customFields: { ...record(family.billingAccount.customFields), reviewedProcareBalanceReconciliation: reconciliationMetadata },
            },
            select: { id: true },
          })
        : await tx.billingAccount.create({
            data: {
              familyId: family.id,
              balanceCents: target.source.balanceCents,
              ledgerSyncedAt: appliedAt,
              sourceSystem: "procare",
              externalId: target.source.accountId,
              customFields: { reviewedProcareBalanceReconciliation: reconciliationMetadata },
            },
            select: { id: true },
          });
      if (family.billingAccount) updatedAccounts += 1; else createdAccounts += 1;
      await tx.ledgerEntry.create({
        data: {
          billingAccountId: account.id,
          type: "procare_balance_reconciliation",
          description: "Reviewed ProCare current-family opening balance",
          amountCents: target.source.balanceCents - target.currentBalanceCents,
          balanceAfterCents: target.source.balanceCents,
          effectiveAt: appliedAt,
          sourceSystem: "procare",
          externalId: ledgerExternalId,
          metadata: reconciliationMetadata,
        },
      });
      ledgerEntriesCreated += 1;
      await tx.auditLog.create({
        data: {
          tenantId: initialPlan.center.organization.tenantId,
          centerId: args.centerId,
          userId: args.userId,
          action: "billing.reviewed_procare_current_family_balance_reconciled",
          resource: "Family",
          resourceId: family.id,
          metadata: { authorization: "user_requested_greenwood_southpointe_import", ...reconciliationMetadata },
        },
      });
    }, { maxWait: 10_000, timeout: 20_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  const verifiedPlan = await buildPlan(args, sourceBuffer);
  invariant(verifiedPlan.targets.every((item) => item.currentBalanceCents === item.source.balanceCents), "Balance verification failed.");
  invariant(verifiedPlan.targets.every((item) => item.invoiceIds.length === 0 && item.paymentIds.length === 0), "Invoice or payment history changed during balance reconciliation.");
  return { createdAccounts, updatedAccounts, ledgerEntriesCreated, alreadyApplied, verification: publicPlan(verifiedPlan) };
}

async function main() {
  const args = parseArgs();
  const sourceBuffer = fs.readFileSync(args.filePath);
  const plan = await buildPlan(args, sourceBuffer);
  console.log(JSON.stringify({ mode: args.apply ? "apply-preflight" : "dry-run", ...publicPlan(plan) }, null, 2));
  if (!args.apply) return;
  invariant(args.confirmFingerprint === plan.fingerprint, `Fingerprint mismatch. Re-run the dry run and pass --confirm-fingerprint ${plan.fingerprint}.`);
  const result = await applyPlan(args, plan, sourceBuffer);
  console.log(JSON.stringify({ mode: "apply-result", result }, null, 2));
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedScriptUrl === import.meta.url) {
  void main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
