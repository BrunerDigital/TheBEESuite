import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";
import {
  createStripeBalanceSoftwareSubscription,
  getStripeSecretKey,
  listStripeConnectedAccountPayoutBanks,
  listStripePayouts,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
} from "@/lib/integrations";
import { getKidCitySoftwareFeeUnitAmountCents } from "@/lib/kidcity-software-billing";
import { prisma } from "@/lib/prisma";
import { stripeConnectMigrationTargetIsReady } from "@/lib/stripe-connect-migration";

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

function jsonInput(value: JsonRecord): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function bankFingerprint(accountId: string, banks: Array<{
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

async function payoutInterval(apiKey: string, accountId: string) {
  const response = await fetch("https://api.stripe.com/v1/balance_settings", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Stripe-Version": process.env.STRIPE_API_VERSION || "2026-07-29.dahlia",
      "Stripe-Account": accountId,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => null) as JsonRecord | null;
  if (!response.ok || !json) throw new Error(clean(record(json?.error).message) || `Stripe returned ${response.status} for payout settings.`);
  return clean(record(record(record(json.payments).payouts).schedule).interval) || "unknown";
}

async function main() {
  const envDir = argValue("--env-dir") || process.cwd();
  loadEnvConfig(envDir);
  if (!process.env.DATABASE_URL?.trim()) process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;

  const centerId = argValue("--center-id");
  const apply = hasArg("--apply");
  const acknowledged = hasArg("--acknowledge-parent-payment-cutover");
  const confirmedFingerprint = argValue("--confirm-fingerprint");
  if (!centerId) throw new Error("--center-id is required. Cutovers are intentionally one school at a time.");
  if (apply && !acknowledged) throw new Error("--apply requires --acknowledge-parent-payment-cutover.");

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, name: true, customFields: true, organization: { select: { tenantId: true } } },
  });
  if (!center) throw new Error("School not found.");
  const fields = record(center.customFields);
  const sourceAccountId = clean(fields.stripeConnectMigrationSourceAccountId);
  const targetAccountId = clean(fields.stripeConnectMigrationTargetAccountId);
  const activeAccountId = readStripeConnectedAccountId(fields);
  if (!sourceAccountId.startsWith("acct_") || !targetAccountId.startsWith("acct_")) throw new Error("This school does not have a prepared source and target migration.");
  if (clean(fields.stripeConnectMigrationCutoverAt)) throw new Error("This school has already completed its Stripe cutover.");
  if (activeAccountId !== sourceAccountId) throw new Error("The active parent-payment account no longer matches the prepared source account.");

  const paymentMethodId = clean(fields.stripeConnectMigrationBalancePaymentMethodId);
  const priceId = clean(fields.stripeConnectMigrationBalancePriceId);
  const approvalAt = clean(fields.stripeConnectMigrationBalanceApprovalAt);
  if (!paymentMethodId.startsWith("pm_") || !priceId.startsWith("price_") || !approvalAt) {
    throw new Error("The authorized representative has not completed the $99 Stripe-balance authorization.");
  }
  if (clean(fields.stripeSoftwareSubscriptionId)) throw new Error("A software subscription already exists. Cutover stopped to prevent duplicate billing.");
  if (getKidCitySoftwareFeeUnitAmountCents() !== 9_900) throw new Error("The configured school software fee is not exactly $99 per month.");

  const [source, target, sourceBanks, targetBanks] = await Promise.all([
    retrieveStripeConnectedAccount(sourceAccountId, { tenantId: center.organization.tenantId }),
    retrieveStripeConnectedAccount(targetAccountId, { tenantId: center.organization.tenantId }),
    listStripeConnectedAccountPayoutBanks({ accountId: sourceAccountId, tenantId: center.organization.tenantId }),
    listStripeConnectedAccountPayoutBanks({ accountId: targetAccountId, tenantId: center.organization.tenantId }),
  ]);
  if (!source.ok || !source.account) throw new Error(source.error || "The source Stripe account could not be verified.");
  if (!target.ok || !target.account) throw new Error(target.error || "The target Stripe account could not be verified.");
  if (!sourceBanks.ok) throw new Error(sourceBanks.error || "The existing payout bank could not be verified.");
  if (!targetBanks.ok) throw new Error(targetBanks.error || "The new payout bank could not be verified.");
  const targetAccount = target.account;

  const storedSourceBankFingerprint = clean(fields.stripeConnectMigrationSourceBankFingerprint);
  const currentSourceBankFingerprint = bankFingerprint(sourceAccountId, sourceBanks.banks);
  if (!storedSourceBankFingerprint || currentSourceBankFingerprint !== storedSourceBankFingerprint) {
    throw new Error("The existing payout-bank fingerprint changed after preparation. Cutover stopped without changing the active account.");
  }
  const targetReady = stripeConnectMigrationTargetIsReady({
    chargesEnabled: targetAccount.chargesEnabled,
    payoutsEnabled: targetAccount.payoutsEnabled,
    detailsSubmitted: targetAccount.detailsSubmitted,
    requirementFields: targetAccount.requirementFields,
    feesCollector: targetAccount.feesCollector,
    lossesCollector: targetAccount.lossesCollector,
    payoutBankLast4: targetBanks.defaultBank?.last4,
  });
  if (!targetReady) throw new Error("The target account is not fully verified with Stripe-owned fees and losses and a confirmed payout bank.");

  const apiKey = await getStripeSecretKey({ tenantId: center.organization.tenantId });
  if (!apiKey) throw new Error("Stripe is not configured.");
  const [sourcePayoutInterval, targetPayoutInterval, recentSourcePayouts] = await Promise.all([
    payoutInterval(apiKey, sourceAccountId),
    payoutInterval(apiKey, targetAccountId),
    listStripePayouts({
      connectedAccountId: sourceAccountId,
      createdGte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000),
      createdLte: new Date(),
      limit: 100,
      tenantId: center.organization.tenantId,
    }),
  ]);
  if (sourcePayoutInterval !== "manual" || targetPayoutInterval !== "manual") throw new Error("Both source and target payout schedules must remain manual through cutover.");
  if (!recentSourcePayouts.ok) throw new Error(recentSourcePayouts.error || "Recent source payouts could not be verified.");
  const openPayouts = recentSourcePayouts.payouts.filter((payout) => ["pending", "in_transit"].includes(payout.status));
  if (openPayouts.length) throw new Error("The source account still has an open payout. Cutover stopped until it settles.");

  const plan = {
    centerId: center.id,
    sourceAccountId,
    targetAccountId,
    currentSourceBankFingerprint,
    targetBankFingerprint: bankFingerprint(targetAccountId, targetBanks.banks),
    sourcePayoutInterval,
    targetPayoutInterval,
    paymentMethodId,
    priceId,
    approvalAt,
    targetChargesEnabled: targetAccount.chargesEnabled,
    targetPayoutsEnabled: targetAccount.payoutsEnabled,
    targetFeesCollector: targetAccount.feesCollector,
    targetLossesCollector: targetAccount.lossesCollector,
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  if (!apply) {
    console.log(JSON.stringify({ mode: "preview", fingerprint, school: center.name, ready: true, parentPaymentsAccountBefore: sourceAccountId, parentPaymentsAccountAfter: targetAccountId, sourceBankUnchanged: true, sourcePayoutsHeld: true, targetPayoutsHeld: true, monthlySoftwareFeeCents: 9_900 }, null, 2));
    return;
  }
  if (confirmedFingerprint !== fingerprint) throw new Error("The confirmation fingerprint does not match the current live cutover plan.");

  const subscription = await createStripeBalanceSoftwareSubscription({
    accountId: targetAccountId,
    paymentMethodId,
    priceId,
    tenantId: center.organization.tenantId,
    centerId: center.id,
  });
  if (!subscription.ok || !subscription.subscription) throw new Error(subscription.error || "The $99 target-account subscription could not be created.");

  const cutoverAt = new Date().toISOString();
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.center.findUnique({ where: { id: center.id }, select: { customFields: true } });
    if (!fresh) throw new Error("The school disappeared during cutover.");
    const current = record(fresh.customFields);
    if (readStripeConnectedAccountId(current) !== sourceAccountId || clean(current.stripeConnectMigrationTargetAccountId) !== targetAccountId) {
      throw new Error("The school Stripe binding changed during cutover. The database switch was stopped.");
    }
    if (clean(current.stripeConnectMigrationBalanceApprovalAt) !== approvalAt) throw new Error("The $99 balance authorization changed during cutover.");
    await tx.center.update({
      where: { id: center.id },
      data: { customFields: jsonInput({
        ...current,
        stripeConnectAccountId: targetAccountId,
        stripeChargesEnabled: targetAccount.chargesEnabled,
        stripePayoutsEnabled: targetAccount.payoutsEnabled,
        stripeDetailsSubmitted: targetAccount.detailsSubmitted,
        stripePayoutRequirementFields: targetAccount.requirementFields,
        stripePayoutStatus: "ready",
        stripeConnectLastSyncedAt: cutoverAt,
        stripeConnectFeesCollector: "stripe",
        stripeConnectLossesCollector: "stripe",
        stripeConnectMigrationStatus: "cutover_complete",
        stripeConnectMigrationCutoverAt: cutoverAt,
        stripeConnectMigrationCutoverFingerprint: fingerprint,
        stripeConnectMigrationParentPaymentsAccountId: targetAccountId,
        stripeConnectMigrationParentPaymentsRemainActive: true,
        stripeConnectMigrationSourceAccountRetainedForReconciliation: true,
        stripeConnectMigrationSourcePayoutHoldStatus: "manual_confirmed",
        stripeConnectMigrationTargetPayoutHoldStatus: "manual_confirmed",
        stripeConnectMigrationPayoutReleaseStatus: "blocked_until_software_invoice_and_reconciliation_verified",
        stripeSoftwareCustomerId: targetAccountId,
        stripeSoftwareDefaultPaymentMethodId: paymentMethodId,
        stripeSoftwarePaymentMethodType: "stripe_balance",
        stripeSoftwarePaymentPreference: "stripe_balance",
        stripeSoftwarePaymentStatus: subscription.subscription.status === "active" ? "authorized" : "cutover_payment_pending",
        stripeSoftwareBalanceApprovalAt: approvalAt,
        stripeSoftwareSubscriptionId: subscription.subscription.id,
        stripeSoftwareSubscriptionStatus: subscription.subscription.status,
        stripeSoftwarePriceId: subscription.subscription.priceId,
        stripeSoftwareSubscriptionItemId: subscription.subscription.itemId,
        stripeSoftwareQuantity: subscription.subscription.quantity,
        stripeSoftwareCurrentPeriodStart: subscription.subscription.currentPeriodStart,
        stripeSoftwareCurrentPeriodEnd: subscription.subscription.currentPeriodEnd,
        stripeSoftwareCancelAtPeriodEnd: subscription.subscription.cancelAtPeriodEnd,
        stripeSoftwareLatestInvoiceId: subscription.subscription.latestInvoiceId,
        stripeSoftwareSubscriptionSyncedAt: cutoverAt,
        stripeSoftwareMonthlyAmountCents: 9_900,
        stripeSoftwareBillingBasis: "per_school",
      }) },
    });
  });

  console.log(JSON.stringify({ mode: "apply", school: center.name, cutoverAt, parentPaymentsAccount: targetAccountId, sourceAccountRetained: sourceAccountId, sourceBankUnchanged: true, sourcePayoutsHeld: true, targetPayoutsHeld: true, subscriptionId: subscription.subscription.id, subscriptionStatus: subscription.subscription.status, payoutReleaseStatus: "blocked" }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
