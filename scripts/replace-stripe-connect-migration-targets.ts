import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
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
const ONBOARDING_RESERVED_ACTION = "billing.connect.migration.onboarding_reserved";
const ONBOARDING_OPENED_ACTION = "billing.connect.migration.onboarding_opened";
const ONBOARDING_RELEASED_ACTION = "billing.connect.migration.onboarding_reservation_released";
const FAILED_RESERVATION_COOLDOWN_MS = 15 * 60 * 1_000;
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
  const selectedCenterId = argValue("--center-id");
  const allowFailedReservationReplacement = hasArg("--allow-failed-reservation-replacement");
  const allowSameTenantNonportfolioCenter = hasArg("--allow-same-tenant-nonportfolio-center");

  if (!Number.isInteger(expectedCount) || expectedCount < 0) {
    throw new Error("Pass --expected-count with the exact previewed replacement count.");
  }
  if (!Number.isInteger(expectedReplacedCount) || expectedReplacedCount < 0) {
    throw new Error("--expected-replaced-count must be zero or a positive integer.");
  }
  if (apply && (!acknowledgeProviderMutation || !acknowledgeDatabaseMutation)) {
    throw new Error("--apply requires --acknowledge-provider-mutation and --acknowledge-database-mutation.");
  }

  const grantNow = new Date();
  const portfolio = await prisma.user.findFirst({
    where: { email: CORPORATE_SCHOOLS_EMAIL, isActive: true },
    select: {
      tenantId: true,
      accessGrants: {
        where: {
          isActive: true,
          scopeType: "CENTER",
          centerId: { not: null },
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: grantNow } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: grantNow } }] },
          ],
        },
        select: { centerId: true },
      },
    },
  });
  if (!portfolio) throw new Error("The corporate schools portfolio user could not be found.");
  const centerIds = Array.from(new Set(portfolio.accessGrants.map((grant) => grant.centerId).filter(Boolean))) as string[];
  if (!centerIds.length) throw new Error("The corporate schools portfolio has no active center grants.");
  if (allowSameTenantNonportfolioCenter && !selectedCenterId) {
    throw new Error("--allow-same-tenant-nonportfolio-center requires one explicit --center-id.");
  }
  if (selectedCenterId && !centerIds.includes(selectedCenterId) && !allowSameTenantNonportfolioCenter) {
    throw new Error("The selected center is not in the active corporate schools portfolio. Use the explicit same-tenant acknowledgment only after verifying the school.");
  }

  const centers = await prisma.center.findMany({
    where: {
      id: selectedCenterId || { in: centerIds },
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
    const [openedAudit, reservedAudit, releasedAudit] = await Promise.all([
      prisma.auditLog.findFirst({
        where: {
          centerId: center.id,
          action: ONBOARDING_OPENED_ACTION,
          metadata: { path: ["targetAccountId"], equals: targetAccountId },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      }),
      prisma.auditLog.findFirst({
        where: {
          centerId: center.id,
          action: ONBOARDING_RESERVED_ACTION,
          metadata: { path: ["targetAccountId"], equals: targetAccountId },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      }),
      prisma.auditLog.findFirst({
        where: {
          centerId: center.id,
          action: ONBOARDING_RELEASED_ACTION,
          metadata: { path: ["targetAccountId"], equals: targetAccountId },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      }),
    ]);
    if (openedAudit) {
      throw new Error(`${center.name}: Stripe onboarding successfully opened for the prepared target, so it cannot be replaced automatically.`);
    }
    const reservationPending = Boolean(reservedAudit && (!releasedAudit || releasedAudit.createdAt < reservedAudit.createdAt));
    const storedReservationAt = clean(fields.stripeConnectMigrationLastOnboardingAt);
    const failedReservationAt = reservedAudit?.createdAt ?? (storedReservationAt ? new Date(storedReservationAt) : null);
    const hasFailedReservation = reservationPending || clean(fields.stripeConnectMigrationStatus) === "onboarding_opened" || Boolean(storedReservationAt);
    if (hasFailedReservation) {
      if (!allowFailedReservationReplacement) {
        throw new Error(`${center.name}: a failed onboarding reservation exists. Re-run with --allow-failed-reservation-replacement only after verifying no Stripe link opened.`);
      }
      if (!failedReservationAt || Number.isNaN(failedReservationAt.getTime()) || Date.now() - failedReservationAt.getTime() < FAILED_RESERVATION_COOLDOWN_MS) {
        throw new Error(`${center.name}: the failed onboarding reservation has not completed the safety cooldown.`);
      }
    }
    const onboardingAudit = await prisma.auditLog.findFirst({
      where: {
        centerId: center.id,
        action: ONBOARDING_OPENED_ACTION,
        metadata: { path: ["targetAccountId"], equals: targetAccountId },
      },
      select: { id: true },
    });
    if (onboardingAudit) {
      throw new Error(`${center.name}: Stripe onboarding successfully opened for the prepared target.`);
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

    plans.push({
      center,
      fields,
      sourceAccountId,
      sourceAccount: source.account,
      oldTargetAccountId: targetAccountId,
      setup,
      failedReservationAt: hasFailedReservation ? failedReservationAt?.toISOString() || null : null,
    });
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
    failedReservationAt: plan.failedReservationAt,
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
    if (BLOCKED_MIGRATION_STATUSES.has(clean(freshFields.stripeConnectMigrationStatus))) {
      throw new Error(`${plan.center.name}: the migration advanced after preview, so replacement was stopped.`);
    }
    const freshOnboardingAudit = await prisma.auditLog.findFirst({
      where: {
        centerId: plan.center.id,
        action: { in: [ONBOARDING_RESERVED_ACTION, ONBOARDING_OPENED_ACTION, ONBOARDING_RELEASED_ACTION] },
        metadata: { path: ["targetAccountId"], equals: plan.oldTargetAccountId },
      },
      orderBy: { createdAt: "desc" },
      select: { action: true, createdAt: true },
    });
    if (
      freshOnboardingAudit && !(
        freshOnboardingAudit.action === ONBOARDING_RESERVED_ACTION && freshOnboardingAudit.createdAt.toISOString() === plan.failedReservationAt ||
        freshOnboardingAudit.action === ONBOARDING_RELEASED_ACTION && !plan.failedReservationAt
      )
    ) {
      throw new Error(`${plan.center.name}: Stripe onboarding activity changed after preview, so replacement was stopped.`);
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
    const verifiedAccount = verified.account;
    if (
      !beforeSwap ||
      readStripeConnectedAccountId(beforeSwapFields) !== plan.sourceAccountId ||
      clean(beforeSwapFields.stripeConnectMigrationTargetAccountId) !== plan.oldTargetAccountId
    ) {
      throw new Error(`${plan.center.name}: the production mapping changed before the database swap.`);
    }
    if (BLOCKED_MIGRATION_STATUSES.has(clean(beforeSwapFields.stripeConnectMigrationStatus))) {
      throw new Error(`${plan.center.name}: the migration advanced before the database swap, so replacement was stopped.`);
    }

    const now = new Date().toISOString();
    const swapped = await prisma.$transaction(async (transaction) => {
      const onboardingAudit = await transaction.auditLog.findFirst({
        where: {
          centerId: plan.center.id,
          action: { in: [ONBOARDING_RESERVED_ACTION, ONBOARDING_OPENED_ACTION, ONBOARDING_RELEASED_ACTION] },
          metadata: { path: ["targetAccountId"], equals: plan.oldTargetAccountId },
        },
        orderBy: { createdAt: "desc" },
        select: { action: true, createdAt: true },
      });
      if (
        onboardingAudit && !(
          onboardingAudit.action === ONBOARDING_RESERVED_ACTION && onboardingAudit.createdAt.toISOString() === plan.failedReservationAt ||
          onboardingAudit.action === ONBOARDING_RELEASED_ACTION && !plan.failedReservationAt
        )
      ) {
        throw new Error(`${plan.center.name}: Stripe onboarding activity changed before the database swap, so replacement was stopped.`);
      }
      const transactionCenter = await transaction.center.findUnique({
        where: { id: plan.center.id },
        select: { customFields: true },
      });
      const transactionFields = record(transactionCenter?.customFields);
      if (
        !transactionCenter ||
        readStripeConnectedAccountId(transactionFields) !== plan.sourceAccountId ||
        clean(transactionFields.stripeConnectMigrationTargetAccountId) !== plan.oldTargetAccountId ||
        BLOCKED_MIGRATION_STATUSES.has(clean(transactionFields.stripeConnectMigrationStatus)) ||
        clean(transactionFields.stripeConnectMigrationLastOnboardingAt)
      ) {
        throw new Error(`${plan.center.name}: a concurrent migration update stopped the database swap.`);
      }
      const updated = await transaction.center.updateMany({
        where: {
          id: plan.center.id,
          customFields: { equals: transactionFields as Prisma.InputJsonValue },
        },
        data: { customFields: jsonInput({
          ...transactionFields,
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
          stripeConnectMigrationTargetChargesEnabled: verifiedAccount.chargesEnabled,
          stripeConnectMigrationTargetPayoutsEnabled: verifiedAccount.payoutsEnabled,
          stripeConnectMigrationTargetDetailsSubmitted: verifiedAccount.detailsSubmitted,
          stripeConnectMigrationTargetRequirementFields: verifiedAccount.requirementFields,
          stripeConnectMigrationTargetFeesCollector: verifiedAccount.feesCollector,
          stripeConnectMigrationTargetLossesCollector: verifiedAccount.lossesCollector,
          stripeConnectMigrationLinksSent: false,
          stripeConnectMigrationParentPaymentsAccountId: plan.sourceAccountId,
          stripeConnectMigrationParentPaymentsRemainActive: plan.sourceAccount.chargesEnabled,
        }) },
      });
      if (updated.count === 1) {
        await transaction.auditLog.create({
          data: {
            tenantId: plan.center.organization.tenantId,
            centerId: plan.center.id,
            action: plan.failedReservationAt
              ? "billing.connect.migration.target_replaced_after_failed_link"
              : "billing.connect.migration.target_replaced",
            resource: "Center",
            resourceId: plan.center.id,
            metadata: {
              sourceAccountId: plan.sourceAccountId,
              previousTargetAccountId: plan.oldTargetAccountId,
              replacementTargetAccountId: newTargetAccountId,
              failedReservationAt: plan.failedReservationAt,
              payoutBankCount: banks.banks.length,
              payoutInterval,
            },
          },
        });
      }
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (swapped.count !== 1) {
      throw new Error(`${plan.center.name}: a concurrent migration update stopped the database swap.`);
    }

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
      dashboard: verifiedAccount.dashboard,
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
