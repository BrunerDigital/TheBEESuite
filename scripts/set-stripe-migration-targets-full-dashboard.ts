import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";
import {
  getStripeSecretKey,
  listStripeConnectedAccountPayoutBanks,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
  setStripeConnectedAccountFullDashboard,
  type StripeConnectedAccountSnapshot,
  type StripePayoutBankSnapshot,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { readStripeConnectMigration } from "@/lib/stripe-connect-migration";

type JsonRecord = Record<string, unknown>;

const CORPORATE_SCHOOLS_EMAIL = "corpschools@kidcityusa.com";
const EXPECTED_TARGET_COUNT = 12;
const EXPECTED_CONFIGURATIONS = ["customer", "merchant", "recipient"];

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function argValue(name: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = process.argv.indexOf(name);
  return index >= 0 ? clean(process.argv[index + 1]) : "";
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function jsonRecord(value: Prisma.JsonValue | null | undefined) {
  return record(value);
}

function payoutBankFingerprint(banks: StripePayoutBankSnapshot[]) {
  const rows = banks.map((bank) => [
    bank.id,
    bank.bankName || "",
    bank.last4 || "",
    bank.status || "",
    bank.currency || "",
    bank.country || "",
    bank.defaultForCurrency ? "default" : "secondary",
  ].join("|")).sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

function configurationSignature(account: StripeConnectedAccountSnapshot) {
  return [...account.configurations].sort().join(",");
}

async function retrievePayoutInterval(apiKey: string, accountId: string) {
  const response = await fetch("https://api.stripe.com/v1/balance_settings", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Stripe-Version": process.env.STRIPE_API_VERSION || "2026-07-29.dahlia",
      "Stripe-Account": accountId,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => null) as JsonRecord | null;
  if (!response.ok || !json) {
    throw new Error(clean(record(json?.error).message) || `Stripe returned ${response.status} for payout settings.`);
  }
  return clean(record(record(record(json.payments).payouts).schedule).interval) || "unknown";
}

async function main() {
  const envDir = argValue("--env-dir") || process.cwd();
  loadEnvConfig(envDir);
  if (!process.env.DATABASE_URL?.trim()) {
    process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
  }

  const apply = hasArg("--apply");
  const acknowledged = hasArg("--acknowledge-full-dashboard-access");
  if (apply !== acknowledged) {
    throw new Error("Live updates require both --apply and --acknowledge-full-dashboard-access.");
  }

  const now = new Date();
  const portfolio = await prisma.user.findFirst({
    where: { email: CORPORATE_SCHOOLS_EMAIL, isActive: true },
    select: {
      tenantId: true,
      accessGrants: {
        where: {
          isActive: true,
          scopeType: "CENTER",
          centerId: { not: null },
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        },
        select: { centerId: true },
      },
    },
  });
  if (!portfolio) throw new Error("The corporate school portfolio user was not found.");

  const centerIds = Array.from(new Set(portfolio.accessGrants.map((grant) => grant.centerId).filter((id): id is string => Boolean(id))));
  const centers = await prisma.center.findMany({
    where: {
      id: { in: centerIds },
      organization: { tenantId: portfolio.tenantId },
      status: { notIn: ["closed", "archived", "inactive"] },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, customFields: true },
  });

  const targets = centers.map((center) => {
    const fields = jsonRecord(center.customFields);
    return { center, fields, migration: readStripeConnectMigration(fields) };
  }).filter(({ migration }) => Boolean(migration.sourceAccountId && migration.targetAccountId));

  if (targets.length !== EXPECTED_TARGET_COUNT || new Set(targets.map(({ migration }) => migration.targetAccountId)).size !== EXPECTED_TARGET_COUNT) {
    throw new Error(`Expected ${EXPECTED_TARGET_COUNT} unique prepared targets; found ${targets.length}.`);
  }

  const apiKey = await getStripeSecretKey({ tenantId: portfolio.tenantId });
  if (!apiKey) throw new Error("Stripe is not configured for the corporate tenant.");

  const preflight: Array<{
    school: string;
    targetAccountId: string;
    dashboard: string | null | undefined;
    configurations: string;
    bankFingerprint: string;
    bankCount: number;
    payoutInterval: string;
  }> = [];

  for (const { center, fields, migration } of targets) {
    if (!migration.sourceAccountId || !migration.targetAccountId) throw new Error(`${center.name}: migration target is incomplete.`);
    if (migration.cutoverAt || readStripeConnectedAccountId(fields) !== migration.sourceAccountId) {
      throw new Error(`${center.name}: parent payments are no longer safely anchored to the prepared source account.`);
    }

    const [accountResult, bankResult, payoutInterval] = await Promise.all([
      retrieveStripeConnectedAccount(migration.targetAccountId, { tenantId: portfolio.tenantId }),
      listStripeConnectedAccountPayoutBanks({ accountId: migration.targetAccountId, tenantId: portfolio.tenantId }),
      retrievePayoutInterval(apiKey, migration.targetAccountId),
    ]);
    if (!accountResult.ok || !accountResult.account) throw new Error(`${center.name}: ${accountResult.error || "target account could not be read"}.`);
    if (!bankResult.ok) throw new Error(`${center.name}: ${bankResult.error || "target payout banks could not be read"}.`);

    const configurations = configurationSignature(accountResult.account);
    if (configurations !== EXPECTED_CONFIGURATIONS.join(",")) throw new Error(`${center.name}: unexpected applied configurations ${configurations || "none"}.`);
    if (accountResult.account.feesCollector !== "stripe" || accountResult.account.lossesCollector !== "stripe") {
      throw new Error(`${center.name}: Stripe fee or loss responsibility does not match the approved Full Dashboard model.`);
    }
    if (accountResult.account.dashboard !== "none" && accountResult.account.dashboard !== "full") {
      throw new Error(`${center.name}: unexpected dashboard setting ${accountResult.account.dashboard || "unset"}.`);
    }

    preflight.push({
      school: center.name,
      targetAccountId: migration.targetAccountId,
      dashboard: accountResult.account.dashboard,
      configurations,
      bankFingerprint: payoutBankFingerprint(bankResult.banks),
      bankCount: bankResult.banks.length,
      payoutInterval,
    });
  }

  if (!apply) {
    console.log(JSON.stringify({ ok: true, mode: "dry-run", targetCount: preflight.length, changesNeeded: preflight.filter((row) => row.dashboard !== "full").length, schools: preflight.map((row) => ({ school: row.school, dashboard: row.dashboard, bankCount: row.bankCount, payoutInterval: row.payoutInterval })) }, null, 2));
    return;
  }

  const results = [];
  for (const before of preflight) {
    if (before.dashboard !== "full") {
      const updated = await setStripeConnectedAccountFullDashboard({ accountId: before.targetAccountId, tenantId: portfolio.tenantId });
      if (!updated.ok || updated.account?.dashboard !== "full") throw new Error(`${before.school}: ${updated.error || "Full Dashboard access was not applied"}.`);
    }

    const [afterAccountResult, afterBankResult, afterPayoutInterval] = await Promise.all([
      retrieveStripeConnectedAccount(before.targetAccountId, { tenantId: portfolio.tenantId }),
      listStripeConnectedAccountPayoutBanks({ accountId: before.targetAccountId, tenantId: portfolio.tenantId }),
      retrievePayoutInterval(apiKey, before.targetAccountId),
    ]);
    if (!afterAccountResult.ok || !afterAccountResult.account) throw new Error(`${before.school}: post-update account verification failed.`);
    if (!afterBankResult.ok) throw new Error(`${before.school}: post-update payout-bank verification failed.`);

    const afterAccount = afterAccountResult.account;
    const afterBankFingerprint = payoutBankFingerprint(afterBankResult.banks);
    if (afterAccount.dashboard !== "full") throw new Error(`${before.school}: Full Dashboard access was not retained.`);
    if (configurationSignature(afterAccount) !== before.configurations) throw new Error(`${before.school}: applied configurations changed unexpectedly.`);
    if (afterAccount.feesCollector !== "stripe" || afterAccount.lossesCollector !== "stripe") throw new Error(`${before.school}: fee or loss responsibility changed unexpectedly.`);
    if (afterBankFingerprint !== before.bankFingerprint || before.payoutInterval !== afterPayoutInterval) {
      throw new Error(`${before.school}: payout-bank or payout-schedule state changed unexpectedly.`);
    }

    results.push({ school: before.school, dashboard: afterAccount.dashboard, bankCount: afterBankResult.banks.length, payoutInterval: afterPayoutInterval });
  }

  console.log(JSON.stringify({ ok: true, mode: "apply", updatedCount: results.length, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
