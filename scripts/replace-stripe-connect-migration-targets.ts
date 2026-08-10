import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";
import {
  completeStripeConnectedAccountBusinessProfile,
  createStripeConnectedAccount,
  getStripeSecretKey,
  listStripeConnectedAccountPayoutBanks,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
  setStripeConnectedAccountManualPayouts,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { buildSchoolPayoutSetupInput } from "@/lib/school-payout-onboarding";
import { readSchoolEin } from "@/lib/school-tax-id";
import { normalizeStripeConnectSetupInput } from "@/lib/stripe-connect-setup";

type JsonRecord = Record<string, unknown>;

const CORPORATE_SCHOOLS_EMAIL = "corpschools@kidcityusa.com";
const INACTIVE_CENTER_STATUSES = ["closed", "archived", "inactive"];
const BLOCKED_MIGRATION_STATUSES = new Set(["ready_for_cutover", "cutover_complete"]);
const REPLACEMENT_VERSION = "2026-08-full-dashboard-target-v1";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function jsonInput(value: JsonRecord): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function argValue(name: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = process.argv.indexOf(name);
  return index >= 0 ? clean(process.argv[index + 1]) : "";
}

function maskAccountId(accountId: string | null) {
  return accountId ? `${accountId.slice(0, 8)}...${accountId.slice(-4)}` : null;
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
  const acknowledgeProviderMutation = hasArg("--acknowledge-provider-mutation");
  const acknowledgeDatabaseMutation = hasArg("--acknowledge-database-mutation");
  const confirmedFingerprint = argValue("--confirm-fingerprint");
  const expectedCount = Number.parseInt(argValue("--expected-count"), 10);
  const expectedReplacedCount = Number.parseInt(argValue("--expected-replaced-count") || "0", 10);

  if (!Number.isInteger(expectedCount) || expectedCount < 0) {
    throw new Error("Pass --expected-count with the exact previewed replacement count.");
  }
  if (!Number.isInteger(expectedReplacedCount) || expectedReplacedCount < 0) {
    throw new Error("--expected-replaced-count must be zero or a positive integer.");
  }
  if (apply && (!acknowledgeProviderMutation || !acknowledgeDatabaseMutation)) {
    throw new Error("--apply requires --acknowledge-provider-mutation and --acknowledge-database-mutation.");
  }

  const portfolio = await prisma.user.findFirst({
    where: { email: CORPORATE_SCHOOLS_EMAIL, isActive: true },
    select: {
      tenantId: true,
      accessGrants: {
        where: { isActive: true, scopeType: "CENTER", centerId: { not: null } },
        select: { centerId: true },
      },
    },
  });
  if (!portfolio) throw new Error("The corporate schools portfolio user could not be found.");
  const centerIds = Array.from(new Set(portfolio.accessGrants.map((grant) => grant.centerId).filter(Boolean))) as string[];
  if (!centerIds.length) throw new Error("The corporate schools portfolio has no active center grants.");

  const centers = await prisma.center.findMany({
    where: {
      id: { in: centerIds },
      organization: { tenantId: portfolio.tenantId },
      status: { notIn: INACTIVE_CENTER_STATUSES },
    },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      locationId: true,
      crmLocationId: true,
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

  const plans = [];
  const skipped = [];
  let verifiedReplacements = 0;
  for (const center of centers) {
    const fields = record(center.customFields);
    const sourceAccountId = clean(fields.stripeConnectMigrationSourceAccountId) || readStripeConnectedAccountId(fields);
    const targetAccountId = clean(fields.stripeConnectMigrationTargetAccountId);
    if (!sourceAccountId || !targetAccountId) {
      skipped.push({ school: center.name, reason: "no_prepared_migration_target" });
      continue;
    }
    if (sourceAccountId !== readStripeConnectedAccountId(fields)) {
      throw new Error(`${center.name}: the stored migration source does not match the active parent-payment account.`);
    }
    if (BLOCKED_MIGRATION_STATUSES.has(clean(fields.stripeConnectMigrationStatus))) {
      throw new Error(`${center.name}: the migration is already at or past the cutover gate.`);
    }

    const tenantId = center.organization.tenantId;
    const [source, target, targetBanks, apiKey] = await Promise.all([
      retrieveStripeConnectedAccount(sourceAccountId, { tenantId }),
      retrieveStripeConnectedAccount(targetAccountId, { tenantId }),
      listStripeConnectedAccountPayoutBanks({ accountId: targetAccountId, tenantId }),
      getStripeSecretKey({ tenantId }),
    ]);
    if (!source.ok || !source.account || source.account.id !== sourceAccountId) {
      throw new Error(`${center.name}: the active source account could not be verified.`);
    }
    if (!target.ok || !target.account || target.account.id !== targetAccountId) {
      throw new Error(`${center.name}: the prepared migration target could not be verified.`);
    }
    if (!targetBanks.ok) throw new Error(`${center.name}: the prepared target payout banks could not be verified.`);
    if (!apiKey) throw new Error(`${center.name}: the Stripe key is unavailable.`);

    if (target.account.feesCollector !== "stripe" || target.account.lossesCollector !== "stripe") {
      throw new Error(`${center.name}: the prepared target has unexpected fee or loss responsibility.`);
    }
    if (targetBanks.banks.length !== 0) {
      throw new Error(`${center.name}: the prepared target already has a payout bank and cannot be replaced automatically.`);
    }
    const targetPayoutInterval = await retrievePayoutInterval(apiKey, targetAccountId);
    if (targetPayoutInterval !== "manual") {
      throw new Error(`${center.name}: the prepared target payout schedule is ${targetPayoutInterval}, not manual.`);
    }
    if (target.account.dashboard === "full") {
      if (
        clean(fields.stripeConnectMigrationVersion) !== REPLACEMENT_VERSION ||
        !clean(fields.stripeConnectMigrationPreviousTargetAccountId) ||
        fields.stripeConnectMigrationLinksSent === true
      ) {
        throw new Error(`${center.name}: the Full Dashboard target is missing replacement audit state or was already sent.`);
      }
      verifiedReplacements += 1;
      skipped.push({ school: center.name, reason: "replacement_verified" });
      continue;
    }
    if (target.account.dashboard !== "none") {
      throw new Error(`${center.name}: expected dashboard none, found ${target.account.dashboard || "unknown"}.`);
    }
    const setup = normalizeStripeConnectSetupInput(buildSchoolPayoutSetupInput({}, center), center);
    if (!setup.ok) throw new Error(`${center.name}: the saved school profile is incomplete: ${JSON.stringify(setup.errors)}.`);

    plans.push({ center, fields, sourceAccountId, sourceAccount: source.account, oldTargetAccountId: targetAccountId, setup });
  }

  if (plans.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} eligible targets but verified ${plans.length}.`);
  }
  if (verifiedReplacements !== expectedReplacedCount) {
    throw new Error(`Expected ${expectedReplacedCount} completed replacements but verified ${verifiedReplacements}.`);
  }
  const canonical = plans.map((plan) => ({
    centerId: plan.center.id,
    sourceAccountId: plan.sourceAccountId,
    oldTargetAccountId: plan.oldTargetAccountId,
  }));
  const fingerprint = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  if (apply && confirmedFingerprint !== fingerprint) {
    throw new Error("The confirmation fingerprint does not match the current live replacement plan.");
  }

  const results = [];
  for (const plan of plans) {
    if (!apply) {
      results.push({
        school: plan.center.name,
        centerId: plan.center.id,
        status: "ready_to_replace",
        sourceAccount: maskAccountId(plan.sourceAccountId),
        oldTargetAccount: maskAccountId(plan.oldTargetAccountId),
        storedEinAvailable: Boolean(readSchoolEin(plan.center.customFields)),
      });
      continue;
    }

    const fresh = await prisma.center.findUnique({ where: { id: plan.center.id }, select: { customFields: true } });
    const freshFields = record(fresh?.customFields);
    if (
      !fresh ||
      readStripeConnectedAccountId(freshFields) !== plan.sourceAccountId ||
      clean(freshFields.stripeConnectMigrationTargetAccountId) !== plan.oldTargetAccountId
    ) {
      throw new Error(`${plan.center.name}: the production mapping changed after preview.`);
    }

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
      idempotencyKey: `bee-suite-full-dashboard-replacement-${plan.center.id}-${plan.oldTargetAccountId}`,
      metadata: {
        bee_suite_center_id: plan.center.id,
        bee_suite_location_id: plan.center.locationId || plan.center.crmLocationId,
        bee_suite_migration_source: plan.sourceAccountId,
        bee_suite_replaces_target: plan.oldTargetAccountId,
        bee_suite_purpose: "school_connect_full_dashboard_migration",
      },
      tenantId: plan.center.organization.tenantId,
    });
    if (!created.ok || !created.id || !created.account) {
      throw new Error(`${plan.center.name}: replacement creation failed: ${created.error || "Stripe rejected the request."}`);
    }
    const newTargetAccountId = created.id;
    if (
      created.account.dashboard !== "full" ||
      created.account.feesCollector !== "stripe" ||
      created.account.lossesCollector !== "stripe" ||
      !["customer", "merchant", "recipient"].every((key) => created.account?.configurations.includes(key as "customer" | "merchant" | "recipient"))
    ) {
      throw new Error(`${plan.center.name}: Stripe created a replacement with unexpected configuration.`);
    }

    const schoolEin = readSchoolEin(plan.center.customFields);
    const profile = await completeStripeConnectedAccountBusinessProfile({
      accountId: newTargetAccountId,
      businessPhone: setup.payoutContactPhone,
      ein: schoolEin,
      tenantId: plan.center.organization.tenantId,
      idempotencyKey: `bee-suite-full-dashboard-profile-${plan.center.id}-${plan.oldTargetAccountId}`,
    });
    if (!profile.ok) {
      throw new Error(`${plan.center.name}: replacement business profile failed: ${profile.error || "Stripe rejected the profile."}`);
    }

    const held = await setStripeConnectedAccountManualPayouts({
      accountId: newTargetAccountId,
      tenantId: plan.center.organization.tenantId,
    });
    if (!held.ok) {
      throw new Error(`${plan.center.name}: replacement payout hold failed: ${held.error || "Stripe rejected the payout schedule."}`);
    }

    const [verified, banks, payoutInterval, beforeSwap] = await Promise.all([
      retrieveStripeConnectedAccount(newTargetAccountId, { tenantId: plan.center.organization.tenantId }),
      listStripeConnectedAccountPayoutBanks({ accountId: newTargetAccountId, tenantId: plan.center.organization.tenantId }),
      getStripeSecretKey({ tenantId: plan.center.organization.tenantId }).then((key) => {
        if (!key) throw new Error(`${plan.center.name}: the Stripe key became unavailable.`);
        return retrievePayoutInterval(key, newTargetAccountId);
      }),
      prisma.center.findUnique({ where: { id: plan.center.id }, select: { customFields: true } }),
    ]);
    const beforeSwapFields = record(beforeSwap?.customFields);
    if (
      !verified.ok || !verified.account || verified.account.dashboard !== "full" ||
      verified.account.feesCollector !== "stripe" || verified.account.lossesCollector !== "stripe" ||
      !banks.ok || banks.banks.length !== 0 || payoutInterval !== "manual"
    ) {
      throw new Error(`${plan.center.name}: replacement verification failed before the database swap.`);
    }
    if (
      !beforeSwap ||
      readStripeConnectedAccountId(beforeSwapFields) !== plan.sourceAccountId ||
      clean(beforeSwapFields.stripeConnectMigrationTargetAccountId) !== plan.oldTargetAccountId
    ) {
      throw new Error(`${plan.center.name}: the production mapping changed before the database swap.`);
    }

    const now = new Date().toISOString();
    await prisma.center.update({
      where: { id: plan.center.id },
      data: { customFields: jsonInput({
        ...beforeSwapFields,
        stripeConnectMigrationVersion: REPLACEMENT_VERSION,
        stripeConnectMigrationStatus: "prepared",
        stripeConnectMigrationTargetAccountId: newTargetAccountId,
        stripeConnectMigrationPreviousTargetAccountId: plan.oldTargetAccountId,
        stripeConnectMigrationTargetReplacedAt: now,
        stripeConnectMigrationTargetPayoutHoldStatus: "manual_confirmed",
        stripeConnectMigrationTargetPayoutBankName: null,
        stripeConnectMigrationTargetPayoutBankLast4: null,
        stripeConnectMigrationTargetPayoutBankStatus: null,
        stripeConnectMigrationTargetPayoutBankCount: 0,
        stripeConnectMigrationTargetChargesEnabled: verified.account.chargesEnabled,
        stripeConnectMigrationTargetPayoutsEnabled: verified.account.payoutsEnabled,
        stripeConnectMigrationTargetDetailsSubmitted: verified.account.detailsSubmitted,
        stripeConnectMigrationTargetRequirementFields: verified.account.requirementFields,
        stripeConnectMigrationTargetFeesCollector: verified.account.feesCollector,
        stripeConnectMigrationTargetLossesCollector: verified.account.lossesCollector,
        stripeConnectMigrationLinksSent: false,
        stripeConnectMigrationParentPaymentsAccountId: plan.sourceAccountId,
        stripeConnectMigrationParentPaymentsRemainActive: plan.sourceAccount.chargesEnabled,
      }) },
    });

    const afterSwap = await prisma.center.findUnique({ where: { id: plan.center.id }, select: { customFields: true } });
    const afterSwapFields = record(afterSwap?.customFields);
    if (
      readStripeConnectedAccountId(afterSwapFields) !== plan.sourceAccountId ||
      clean(afterSwapFields.stripeConnectMigrationTargetAccountId) !== newTargetAccountId
    ) {
      throw new Error(`${plan.center.name}: post-swap mapping verification failed.`);
    }
    results.push({
      school: plan.center.name,
      centerId: plan.center.id,
      status: "replaced",
      sourceAccount: maskAccountId(plan.sourceAccountId),
      previousTargetAccount: maskAccountId(plan.oldTargetAccountId),
      replacementTargetAccount: maskAccountId(newTargetAccountId),
      dashboard: verified.account.dashboard,
      payoutInterval,
      payoutBankCount: banks.banks.length,
      storedEinSubmitted: Boolean(schoolEin),
      parentPaymentsRemainOnSource: true,
    });
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "preview",
    fingerprint,
    corporateCenters: centers.length,
    eligibleTargets: plans.length,
    verifiedReplacements,
    skipped,
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
