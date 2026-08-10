import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";
import {
  createStripeConnectedAccount,
  getStripeSecretKey,
  listStripeConnectedAccountPayoutBanks,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
  setStripeConnectedAccountManualPayouts,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { buildSchoolPayoutSetupInput } from "@/lib/school-payout-onboarding";
import { normalizeStripeConnectSetupInput } from "@/lib/stripe-connect-setup";

type JsonRecord = Record<string, unknown>;

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

function maskAccountId(accountId: string | null) {
  return accountId ? `${accountId.slice(0, 8)}...${accountId.slice(-4)}` : null;
}

function jsonInput(value: JsonRecord): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function payoutBankFingerprint(accountId: string, banks: Array<{
  id: string;
  last4: string | null;
  status: string | null;
  currency: string | null;
  country: string | null;
  defaultForCurrency: boolean;
}>) {
  const rows = banks.map((bank) => [
    accountId,
    bank.id,
    bank.last4 || "",
    bank.status || "",
    bank.currency || "",
    bank.country || "",
    bank.defaultForCurrency ? "default" : "secondary",
  ].join("|")).sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex");
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
  const createTargets = hasArg("--create-target-accounts");
  const holdPayouts = hasArg("--hold-source-payouts");
  const acknowledgeStripeState = hasArg("--acknowledge-stripe-state");
  const confirmedFingerprint = argValue("--confirm-fingerprint");
  const selectedCenterId = argValue("--center-id");
  const limit = Number.parseInt(argValue("--limit") || "0", 10);

  if ((createTargets || holdPayouts) && !apply) {
    throw new Error("--create-target-accounts and --hold-source-payouts require --apply.");
  }
  if (apply && !acknowledgeStripeState) {
    throw new Error("--apply requires --acknowledge-stripe-state.");
  }

  const centers = await prisma.center.findMany({
    where: {
      status: { notIn: ["closed", "archived", "inactive"] },
      ...(selectedCenterId ? { id: selectedCenterId } : {}),
    },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  });

  const mapped = centers
    .map((center) => ({ center, sourceAccountId: readStripeConnectedAccountId(center.customFields) }))
    .filter((row): row is { center: typeof centers[number]; sourceAccountId: string } => Boolean(row.sourceAccountId));

  const plans = [];
  for (const { center, sourceAccountId } of mapped) {
    const source = await retrieveStripeConnectedAccount(sourceAccountId, { tenantId: center.organization.tenantId });
    if (!source.ok || !source.account) throw new Error(`${center.name}: source connected account could not be read.`);
    if (source.account.feesCollector === "stripe" && source.account.lossesCollector === "stripe") continue;

    const apiKey = await getStripeSecretKey({ tenantId: center.organization.tenantId });
    if (!apiKey) throw new Error(`${center.name}: Stripe key is unavailable.`);
    const sourceBanks = await listStripeConnectedAccountPayoutBanks({
      accountId: sourceAccountId,
      tenantId: center.organization.tenantId,
    });
    if (!sourceBanks.ok) throw new Error(`${center.name}: source payout bank could not be verified.`);
    const fields = record(center.customFields);
    const storedSourceId = clean(fields.stripeConnectMigrationSourceAccountId);
    if (storedSourceId && storedSourceId !== sourceAccountId) {
      throw new Error(`${center.name}: stored migration source does not match the live payment account.`);
    }
    const targetAccountId = clean(fields.stripeConnectMigrationTargetAccountId) || null;
    let targetVerified = false;
    let targetPayoutInterval: string | null = null;
    if (targetAccountId) {
      const target = await retrieveStripeConnectedAccount(targetAccountId, { tenantId: center.organization.tenantId });
      if (!target.ok || !target.account) throw new Error(`${center.name}: migration target could not be read.`);
      targetVerified = target.account.feesCollector === "stripe" && target.account.lossesCollector === "stripe";
      if (!targetVerified) throw new Error(`${center.name}: migration target has the wrong Stripe fee or loss responsibility.`);
      targetPayoutInterval = await retrievePayoutInterval(apiKey, targetAccountId);
    }
    const setup = normalizeStripeConnectSetupInput(buildSchoolPayoutSetupInput({}, center), center);
    plans.push({
      center,
      sourceAccountId,
      sourceAccount: source.account,
      sourcePayoutInterval: await retrievePayoutInterval(apiKey, sourceAccountId),
      sourceBanks: sourceBanks.banks,
      sourceBankFingerprint: payoutBankFingerprint(sourceAccountId, sourceBanks.banks),
      targetAccountId,
      targetVerified,
      targetPayoutInterval,
      setup,
    });
  }

  if (limit > 0) plans.splice(limit);
  const canonical = plans.map((plan) => ({
    centerId: plan.center.id,
    sourceAccountId: plan.sourceAccountId,
    sourceBankFingerprint: plan.sourceBankFingerprint,
    sourcePayoutInterval: plan.sourcePayoutInterval,
    targetAccountId: plan.targetAccountId,
  }));
  const fingerprint = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  if (apply && confirmedFingerprint !== fingerprint) {
    throw new Error("The confirmation fingerprint does not match the current live migration plan.");
  }

  const results = [];
  for (const plan of plans) {
    if (!plan.setup.ok) {
      results.push({ centerId: plan.center.id, school: plan.center.name, status: "profile_validation_failed", errors: plan.setup.errors });
      continue;
    }
    if (!apply) {
      results.push({
        centerId: plan.center.id,
        school: plan.center.name,
        status: plan.targetAccountId ? "target_prepared" : "ready_to_prepare",
        sourceAccount: maskAccountId(plan.sourceAccountId),
        sourcePayoutInterval: plan.sourcePayoutInterval,
        sourceBankCount: plan.sourceBanks.length,
        targetAccount: maskAccountId(plan.targetAccountId),
        targetPayoutInterval: plan.targetPayoutInterval,
      });
      continue;
    }

    const fresh = await prisma.center.findUnique({ where: { id: plan.center.id }, select: { customFields: true } });
    if (!fresh || readStripeConnectedAccountId(fresh.customFields) !== plan.sourceAccountId) {
      throw new Error(`${plan.center.name}: live parent-payment account changed after preview.`);
    }

    let sourcePayoutInterval = plan.sourcePayoutInterval;
    if (holdPayouts && sourcePayoutInterval !== "manual") {
      const held = await setStripeConnectedAccountManualPayouts({
        accountId: plan.sourceAccountId,
        tenantId: plan.center.organization.tenantId,
      });
      if (!held.ok) throw new Error(`${plan.center.name}: source payout hold failed: ${held.error || "Stripe rejected the update."}`);
      sourcePayoutInterval = "manual";
    }

    let targetAccountId = plan.targetAccountId;
    let targetPayoutInterval = plan.targetPayoutInterval;
    if (createTargets && !targetAccountId) {
      const setup = plan.setup.details;
      const created = await createStripeConnectedAccount({
        businessName: setup.legalBusinessName,
        displayName: setup.displayName,
        email: setup.payoutContactEmail,
        phone: setup.payoutContactPhone,
        supportEmail: setup.supportEmail,
        supportPhone: setup.supportPhone,
        address: setup.addressLine1,
        addressLine2: setup.addressLine2,
        city: setup.city,
        state: setup.state,
        postalCode: setup.postalCode,
        businessUrl: setup.businessUrl,
        productDescription: setup.productDescription,
        idempotencyKey: `bee-suite-connect-migration-v2-${plan.center.id}`,
        metadata: {
          bee_suite_center_id: plan.center.id,
          bee_suite_location_id: plan.center.locationId || plan.center.crmLocationId,
          bee_suite_migration_source: plan.sourceAccountId,
          bee_suite_purpose: "school_connect_responsibility_migration",
        },
        tenantId: plan.center.organization.tenantId,
      });
      if (!created.ok || !created.id || !created.account) {
        throw new Error(`${plan.center.name}: target account creation failed: ${created.error || "Stripe rejected the request."}`);
      }
      if (created.account.feesCollector !== "stripe" || created.account.lossesCollector !== "stripe") {
        throw new Error(`${plan.center.name}: created target has the wrong Stripe responsibility model.`);
      }
      targetAccountId = created.id;
      await prisma.center.update({
        where: { id: plan.center.id },
        data: { customFields: jsonInput({
          ...record(fresh.customFields),
          stripeConnectMigrationVersion: "2026-08-kokomo-responsibility-v1",
          stripeConnectMigrationStatus: "prepared",
          stripeConnectMigrationPreparedAt: new Date().toISOString(),
          stripeConnectMigrationSourceAccountId: plan.sourceAccountId,
          stripeConnectMigrationTargetAccountId: targetAccountId,
          stripeConnectMigrationSourceBankFingerprint: plan.sourceBankFingerprint,
          stripeConnectMigrationSourceBankCount: plan.sourceBanks.length,
          stripeConnectMigrationParentPaymentsAccountId: plan.sourceAccountId,
          stripeConnectMigrationParentPaymentsRemainActive: plan.sourceAccount.chargesEnabled,
          stripeConnectMigrationLinksSent: false,
          stripeConnectMigrationTargetPayoutHoldStatus: "pending_confirmation",
        }) },
      });
      const targetHeld = await setStripeConnectedAccountManualPayouts({
        accountId: targetAccountId,
        tenantId: plan.center.organization.tenantId,
      });
      if (!targetHeld.ok) throw new Error(`${plan.center.name}: target payout hold failed: ${targetHeld.error || "Stripe rejected the update."}`);
      targetPayoutInterval = "manual";
    }

    const latest = await prisma.center.findUnique({ where: { id: plan.center.id }, select: { customFields: true } });
    if (!latest || readStripeConnectedAccountId(latest.customFields) !== plan.sourceAccountId) {
      throw new Error(`${plan.center.name}: live parent-payment account changed during preparation.`);
    }
    const currentFields = record(latest.customFields);
    const preparedAt = clean(currentFields.stripeConnectMigrationPreparedAt) || new Date().toISOString();
    await prisma.center.update({
      where: { id: plan.center.id },
      data: { customFields: jsonInput({
        ...currentFields,
        stripeConnectMigrationVersion: "2026-08-kokomo-responsibility-v1",
        stripeConnectMigrationStatus: "prepared",
        stripeConnectMigrationPreparedAt: preparedAt,
        stripeConnectMigrationSourceAccountId: plan.sourceAccountId,
        stripeConnectMigrationTargetAccountId: targetAccountId,
        stripeConnectMigrationSourcePayoutScheduleBefore: plan.sourcePayoutInterval,
        stripeConnectMigrationSourcePayoutHoldStatus: sourcePayoutInterval === "manual" ? "manual_confirmed" : "unchanged",
        stripeConnectMigrationSourcePayoutHoldAt: sourcePayoutInterval === "manual" ? new Date().toISOString() : null,
        stripeConnectMigrationTargetPayoutHoldStatus: targetPayoutInterval === "manual" ? "manual_confirmed" : "not_confirmed",
        stripeConnectMigrationSourceBankFingerprint: plan.sourceBankFingerprint,
        stripeConnectMigrationSourceBankCount: plan.sourceBanks.length,
        stripeConnectMigrationParentPaymentsAccountId: plan.sourceAccountId,
        stripeConnectMigrationParentPaymentsRemainActive: plan.sourceAccount.chargesEnabled,
        stripeConnectMigrationLinksSent: false,
        stripeConnectMigrationLastPreparedAt: new Date().toISOString(),
      }) },
    });
    results.push({
      centerId: plan.center.id,
      school: plan.center.name,
      status: "prepared",
      sourceAccount: maskAccountId(plan.sourceAccountId),
      sourcePayoutInterval,
      sourceBankCount: plan.sourceBanks.length,
      targetAccount: maskAccountId(targetAccountId),
      targetPayoutInterval,
      parentPaymentsRemainOnSource: true,
      linksSent: false,
    });
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "preview",
    fingerprint,
    legacySchools: plans.length,
    validationFailed: results.filter((result) => result.status === "profile_validation_failed").length,
    sourcePayoutHoldsRequested: apply && holdPayouts,
    targetAccountsRequested: apply && createTargets,
    linksCreated: 0,
    results,
  }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
