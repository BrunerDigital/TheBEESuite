import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";
import { readStripeConnectedAccountId } from "@/lib/integrations";
import { getSchoolSoftwareFeePolicyForCenter } from "@/lib/kidcity-software-billing";

type JsonRecord = Record<string, unknown>;

const TENANT_SLUG = "kid-city-usa";
const JULY_REFERENCE_DATE = "2026-07-01";
const JULY_PERIOD = "2026-07";
const AUGUST_PERIOD = "2026-08";
const CREATED_SINCE = Math.floor(new Date(`${JULY_REFERENCE_DATE}T00:00:00.000Z`).getTime() / 1000);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

function argValue(name: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = process.argv.indexOf(name);
  return index >= 0 ? clean(process.argv[index + 1]) : "";
}

async function stripeGet(apiKey: string, path: string, accountId?: string) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Stripe-Version": process.env.STRIPE_API_VERSION || "2026-07-29.dahlia",
      ...(accountId ? { "Stripe-Account": accountId } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const json = await response.json().catch(() => null) as JsonRecord | null;
  if (!response.ok || !json) {
    throw new Error(clean(record(json?.error).message) || `Stripe returned ${response.status} for ${path}.`);
  }
  return json;
}

async function listAll(apiKey: string, path: string, accountId?: string, maxPages = 20) {
  const rows: JsonRecord[] = [];
  let startingAfter = "";
  for (let page = 0; page < maxPages; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await stripeGet(
      apiKey,
      `${path}${startingAfter ? `${separator}starting_after=${encodeURIComponent(startingAfter)}` : ""}`,
      accountId,
    );
    const data = array(response.data);
    rows.push(...data);
    if (response.has_more !== true || data.length === 0) return rows;
    startingAfter = clean(data.at(-1)?.id);
  }
  throw new Error(`Stripe pagination exceeded ${maxPages} pages for ${path}.`);
}

function usdAmount(rows: JsonRecord[]) {
  return rows.filter((item) => clean(item.currency).toLowerCase() === "usd")
    .reduce((sum, item) => sum + integer(item.amount), 0);
}

function paymentEvidence(item: JsonRecord) {
  const metadata = record(item.metadata);
  const latestCharge = record(item.latest_charge);
  const grossAmountCents = integer(item.amount_received) || integer(item.amount);
  const chargeId = clean(latestCharge.id) || clean(item.latest_charge) || null;
  const refundStateKnown = !chargeId || clean(latestCharge.id) === chargeId;
  const amountRefundedCents = refundStateKnown ? integer(latestCharge.amount_refunded) : 0;
  const amountCents = Math.max(0, grossAmountCents - amountRefundedCents);
  const providerStatus = clean(item.status);
  const status = !refundStateKnown
    ? "refund_state_unknown"
    : amountRefundedCents > 0
      ? amountCents === 0 ? "refunded" : "partially_refunded"
      : providerStatus;
  return {
    kind: "payment_intent",
    id: clean(item.id),
    status,
    amountCents,
    grossAmountCents,
    amountRefundedCents,
    refundStateKnown,
    feePeriod: clean(metadata.feePeriod) || clean(metadata.softwareFeePeriod) || null,
    referenceDate: clean(metadata.referenceDate) || clean(metadata.softwareFeeReferenceDate) || null,
    centerId: clean(metadata.centerId) || null,
    accountId: clean(metadata.connectedAccountId) || clean(metadata.accountId) || null,
    chargeId,
  };
}

function transferEvidence(item: JsonRecord) {
  const metadata = record(item.metadata);
  const grossAmountCents = integer(item.amount);
  const amountReversedCents = integer(item.amount_reversed);
  const amountCents = Math.max(0, grossAmountCents - amountReversedCents);
  return {
    kind: "transfer",
    id: clean(item.id),
    status: item.reversed === true || amountReversedCents > 0
      ? amountCents === 0 ? "reversed" : "partially_reversed"
      : "paid",
    amountCents,
    grossAmountCents,
    amountReversedCents,
    feePeriod: clean(metadata.feePeriod) || clean(metadata.softwareFeePeriod) || null,
    referenceDate: clean(metadata.referenceDate) || clean(metadata.softwareFeeReferenceDate) || null,
    centerId: clean(metadata.centerId) || null,
    accountId: clean(metadata.connectedAccountId) || clean(item.destination) || null,
    chargeId: null,
  };
}

function subscriptionIdFromInvoice(item: JsonRecord) {
  const parent = record(item.parent);
  const subscriptionDetails = record(parent.subscription_details);
  return clean(subscriptionDetails.subscription) || clean(item.subscription) || null;
}

function subscriptionMetadataFromInvoice(item: JsonRecord) {
  const parent = record(item.parent);
  const subscriptionDetails = record(parent.subscription_details);
  return record(subscriptionDetails.metadata);
}

function subscriptionInvoiceEvidence(
  item: JsonRecord,
  paymentIntentsById: Map<string, ReturnType<typeof paymentEvidence>>,
) {
  const metadata = subscriptionMetadataFromInvoice(item);
  const payments = array(record(item.payments).data);
  const paymentIds = payments.map((payment) => clean(record(payment.payment).payment_intent)).filter(Boolean);
  const paymentSnapshots = paymentIds.map((id) => paymentIntentsById.get(id) ?? null);
  const refundStateKnown = paymentIds.length > 0 && paymentSnapshots.every((payment) => payment?.refundStateKnown);
  const grossAmountCents = integer(item.amount_paid);
  const amountCents = refundStateKnown
    ? Math.min(grossAmountCents, paymentSnapshots.reduce((sum, payment) => sum + (payment?.amountCents ?? 0), 0))
    : 0;
  const status = clean(item.status) !== "paid"
    ? clean(item.status)
    : !refundStateKnown
      ? "refund_state_unknown"
      : amountCents === grossAmountCents
        ? "paid"
        : amountCents === 0 ? "refunded" : "partially_refunded";
  return {
    kind: "subscription_invoice",
    id: clean(item.id),
    status,
    amountCents,
    grossAmountCents,
    refundStateKnown,
    feePeriod: clean(metadata.feePeriod) || clean(metadata.softwareFeePeriod) || null,
    referenceDate: clean(metadata.referenceDate) || clean(metadata.softwareFeeReferenceDate) || null,
    centerId: clean(metadata.centerId) || null,
    accountId: clean(metadata.connectedAccountId) || clean(metadata.accountId) || null,
    chargeId: payments.map((payment) => {
      const details = record(payment.payment);
      return clean(details.payment_intent) || clean(details.charge) || clean(details.payment_record);
    }).filter(Boolean).join(",") || null,
    subscriptionId: subscriptionIdFromInvoice(item),
    created: integer(item.created),
    currency: clean(item.currency).toLowerCase(),
  };
}

function subscriptionConfiguration(item: JsonRecord) {
  const items = array(record(item.items).data);
  const normalized = items.map((entry) => {
    const price = record(entry.price);
    const recurring = record(price.recurring);
    const quantity = Math.max(1, integer(entry.quantity) || 1);
    const unitAmountCents = integer(price.unit_amount);
    const exactMonthlyLicensedPrice =
      clean(price.currency).toLowerCase() === "usd" &&
      clean(price.billing_scheme || "per_unit") === "per_unit" &&
      clean(recurring.interval) === "month" &&
      integer(recurring.interval_count || 1) === 1 &&
      clean(recurring.usage_type || "licensed") === "licensed" &&
      unitAmountCents >= 0;
    return {
      priceId: clean(price.id) || null,
      quantity,
      unitAmountCents,
      recurringInterval: clean(recurring.interval) || null,
      recurringIntervalCount: integer(recurring.interval_count || 1),
      usageType: clean(recurring.usage_type || "licensed"),
      currency: clean(price.currency).toLowerCase() || null,
      exactMonthlyLicensedPrice,
    };
  });
  return {
    items: normalized,
    effectiveMonthlyAmountCents: normalized.reduce(
      (sum, entry) => sum + (entry.exactMonthlyLicensedPrice ? entry.unitAmountCents * entry.quantity : 0),
      0,
    ),
    exactMonthlyConfiguration: normalized.length > 0 && normalized.every((entry) => entry.exactMonthlyLicensedPrice),
  };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await work(items[index]);
    }
  });
  await Promise.all(workers);
  return output;
}

async function main() {
  const envDir = argValue("--env-dir") || process.env.BEE_SUITE_ENV_DIR || process.cwd();
  loadEnvConfig(envDir);
  const apiKey = clean(process.env.STRIPE_SECRET_KEY);
  if (!/^(sk|rk)_live_/.test(apiKey)) throw new Error("A live Stripe secret or restricted key is required.");
  if (process.argv.includes("--apply")) throw new Error("This reconciliation build is preview-only until its exact table is reviewed.");

  const [centers, allCenterAccountMappings, paymentIntents, transfers, subscriptions, invoices] = await Promise.all([
    prisma.center.findMany({
      where: {
        status: { notIn: ["closed", "archived", "inactive"] },
        organization: { tenant: { slug: TENANT_SLUG } },
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        locationId: true,
        crmLocationId: true,
        status: true,
        customFields: true,
        organization: { select: { tenantId: true, tenant: { select: { slug: true, name: true } } } },
        ownerGroup: {
          select: {
            name: true,
            ownerType: true,
            billingEmail: true,
            contactName: true,
            customFields: true,
          },
        },
      },
    }),
    prisma.center.findMany({
      select: { id: true, name: true, status: true, customFields: true },
    }),
    listAll(apiKey, `/v1/payment_intents?limit=100&created[gte]=${CREATED_SINCE}&expand[]=data.latest_charge`),
    listAll(apiKey, `/v1/transfers?limit=100&created[gte]=${CREATED_SINCE}`),
    listAll(apiKey, "/v1/subscriptions?limit=100&status=all"),
    listAll(apiKey, `/v1/invoices?limit=100&created[gte]=${CREATED_SINCE}&expand[]=data.payments`),
  ]);

  const accountUsage = new Map<string, string[]>();
  for (const center of allCenterAccountMappings) {
    const accountId = readStripeConnectedAccountId(center.customFields);
    if (!accountId) continue;
    accountUsage.set(accountId, [...(accountUsage.get(accountId) ?? []), center.id]);
  }

  const paymentIntentEvidence = paymentIntents.map(paymentEvidence);
  const paymentIntentsById = new Map(paymentIntentEvidence.map((item) => [item.id, item]));
  const softwarePayments = paymentIntentEvidence
    .filter((item) => {
      const source = paymentIntents.find((candidate) => clean(candidate.id) === item.id);
      return clean(record(source?.metadata).paymentScope) === "school_software_fee";
    });
  const softwareTransfers = transfers
    .filter((item) => ["school_software_fee", "school_software_fee_catchup"].includes(clean(record(item.metadata).purpose)))
    .map(transferEvidence);
  const softwareSubscriptions = subscriptions.filter((item) => clean(record(item.metadata).paymentScope) === "school_software_fee");
  const softwareSubscriptionIds = new Set(softwareSubscriptions.map((item) => clean(item.id)).filter(Boolean));
  const softwareInvoices = invoices.filter((item) => {
    const subscriptionId = subscriptionIdFromInvoice(item);
    const metadata = subscriptionMetadataFromInvoice(item);
    return (subscriptionId && softwareSubscriptionIds.has(subscriptionId)) || clean(metadata.paymentScope) === "school_software_fee";
  }).map((item) => subscriptionInvoiceEvidence(item, paymentIntentsById));

  const rows = await mapWithConcurrency(centers, 8, async (center) => {
    const policy = getSchoolSoftwareFeePolicyForCenter(center);
    const fields = record(center.customFields);
    const accountId = readStripeConnectedAccountId(fields);
    const idempotencyKey = accountId
      ? `school-software-fee:${JULY_REFERENCE_DATE}:${center.id}:${accountId}`
      : null;
    const directEvidenceCandidates = [...softwarePayments, ...softwareTransfers];
    const directEvidence = directEvidenceCandidates.filter((item) =>
      item.centerId === center.id || (!item.centerId && accountId && item.accountId === accountId),
    );
    const conflictingDirectEvidence = directEvidenceCandidates.filter((item) =>
      Boolean(item.centerId) && item.centerId !== center.id && accountId && item.accountId === accountId,
    );
    const storedSubscriptionId = clean(fields.stripeSoftwareSubscriptionId);
    const conflictingStoredSubscription = softwareSubscriptions.find((item) => {
      if (clean(item.id) !== storedSubscriptionId) return false;
      const metadataCenterId = clean(record(item.metadata).centerId);
      return Boolean(metadataCenterId) && metadataCenterId !== center.id;
    });
    const matchingSubscriptionObjects = softwareSubscriptions.filter((item) => {
      const metadata = record(item.metadata);
      const metadataCenterId = clean(metadata.centerId);
      return metadataCenterId === center.id || (clean(item.id) === storedSubscriptionId && !metadataCenterId);
    });
    const stripeSubscriptions = matchingSubscriptionObjects.map((item) => ({
      id: clean(item.id),
      status: clean(item.status),
      latestInvoiceId: clean(item.latest_invoice) || null,
      cancelAtPeriodEnd: item.cancel_at_period_end === true,
      cancelAt: integer(item.cancel_at) || null,
      ...subscriptionConfiguration(item),
    }));
    const subscriptionInvoices = softwareInvoices.filter((item) =>
      stripeSubscriptions.some((subscription) => subscription.id === item.subscriptionId),
    );
    const evidence = [...directEvidence, ...subscriptionInvoices];

    if (!accountId) {
      return {
        school: center.name,
        centerId: center.id,
        classification: policy.tier,
        connectedAccountId: null,
        expectedFeeCents: policy.unitAmountCents,
        existingFeeEvidence: evidence,
        status: "ambiguous",
        availableBalanceCents: null,
        pendingBalanceCents: null,
        eligibleProceedsSinceJulyCents: null,
        proposedAction: "stop_missing_connected_account",
        idempotencyKey,
        subscriptions: stripeSubscriptions,
      };
    }

    if ((accountUsage.get(accountId) ?? []).length !== 1) {
      return {
        school: center.name,
        centerId: center.id,
        classification: policy.tier,
        connectedAccountId: accountId,
        expectedFeeCents: policy.unitAmountCents,
        existingFeeEvidence: evidence,
        status: "ambiguous",
        availableBalanceCents: null,
        pendingBalanceCents: null,
        eligibleProceedsSinceJulyCents: null,
        proposedAction: "stop_account_mapped_to_multiple_centers",
        idempotencyKey,
        subscriptions: stripeSubscriptions,
      };
    }

    try {
      const [account, balance, balanceTransactions] = await Promise.all([
        stripeGet(apiKey, `/v1/accounts/${encodeURIComponent(accountId)}`),
        stripeGet(apiKey, "/v1/balance", accountId),
        listAll(apiKey, `/v1/balance_transactions?limit=100&created[gte]=${CREATED_SINCE}`, accountId, 10),
      ]);
      const availableBalanceCents = usdAmount(array(balance.available));
      const pendingBalanceCents = usdAmount(array(balance.pending));
      const eligibleProceeds = balanceTransactions.filter((item) =>
        ["charge", "payment"].includes(clean(item.type)) && integer(item.net) > 0,
      );
      const eligibleProceedsSinceJulyCents = eligibleProceeds.reduce((sum, item) => sum + integer(item.net), 0);
      const julySubscriptionEvidence = subscriptionInvoices.filter((item) => {
        const created = item.created ? new Date(item.created * 1000) : null;
        const createdInJuly = created !== null && created.getUTCFullYear() === 2026 && created.getUTCMonth() === 6;
        return item.status === "paid" &&
          item.currency === "usd" &&
          item.amountCents === policy.unitAmountCents &&
          (item.feePeriod === JULY_PERIOD || item.referenceDate === JULY_REFERENCE_DATE || createdInJuly);
      });
      const julyPaid = evidence.some((item) =>
        item.amountCents === policy.unitAmountCents &&
        (item.feePeriod === JULY_PERIOD || item.referenceDate === JULY_REFERENCE_DATE) &&
        ["succeeded", "paid"].includes(item.status),
      ) || julySubscriptionEvidence.length > 0;
      const activeSubscriptions = stripeSubscriptions.filter((item) => ["active", "trialing"].includes(item.status));
      const unresolvedSubscriptions = stripeSubscriptions.filter((item) =>
        !["active", "trialing", "canceled", "incomplete_expired"].includes(item.status),
      );
      const scheduledCancellation = activeSubscriptions.some((item) => item.cancelAtPeriodEnd || item.cancelAt);
      const subscriptionConfigured = activeSubscriptions.length === 1 &&
        !scheduledCancellation &&
        activeSubscriptions[0].exactMonthlyConfiguration &&
        activeSubscriptions[0].effectiveMonthlyAmountCents === policy.unitAmountCents;
      const subscriptionConfigurationAmbiguous =
        unresolvedSubscriptions.length > 0 ||
        scheduledCancellation ||
        (activeSubscriptions.length > 0 && !subscriptionConfigured);
      const accountExact = clean(account.id) === accountId;
      const cardPaymentsActive = clean(record(account.capabilities).card_payments) === "active";
      const status = !accountExact || !cardPaymentsActive || conflictingStoredSubscription || conflictingDirectEvidence.length > 0
        ? "ambiguous"
        : subscriptionConfigurationAmbiguous
          ? "ambiguous"
        : julyPaid && subscriptionConfigured
          ? "paid"
          : availableBalanceCents < policy.unitAmountCents
            ? "deferred"
            : "missing";
      const proposedAction = status === "paid"
        ? "none"
        : status === "ambiguous"
          ? !accountExact || !cardPaymentsActive
            ? "stop_account_not_ready"
            : conflictingStoredSubscription
              ? "stop_subscription_center_mismatch"
              : conflictingDirectEvidence.length > 0
                ? "stop_evidence_center_mismatch"
              : "stop_subscription_configuration_mismatch"
          : status === "deferred"
            ? "carry_forward_until_available_balance"
            : julyPaid
              ? "start_monthly_connected_balance_collection"
              : availableBalanceCents >= policy.unitAmountCents * 2
                ? "collect_july_catchup_then_start_august_monthly_collection"
                : "collect_july_catchup_then_defer_august_until_funded";
      return {
        school: center.name,
        centerId: center.id,
        classification: policy.tier,
        connectedAccountId: accountId,
        expectedFeeCents: policy.unitAmountCents,
        existingFeeEvidence: evidence,
        status,
        availableBalanceCents,
        pendingBalanceCents,
        eligibleProceedsSinceJulyCents,
        proposedAction,
        idempotencyKey,
        subscriptions: stripeSubscriptions,
        subscriptionInvoiceEvidence: subscriptionInvoices,
        accountReady: accountExact && cardPaymentsActive,
        julyPaid,
        subscriptionConfigured,
        conflictingStoredSubscriptionId: conflictingStoredSubscription ? clean(conflictingStoredSubscription.id) : null,
        conflictingEvidenceIds: conflictingDirectEvidence.map((item) => item.id),
        unresolvedSubscriptionIds: unresolvedSubscriptions.map((item) => item.id),
        scheduledCancellation,
        augustPeriod: AUGUST_PERIOD,
      };
    } catch (error) {
      return {
        school: center.name,
        centerId: center.id,
        classification: policy.tier,
        connectedAccountId: accountId,
        expectedFeeCents: policy.unitAmountCents,
        existingFeeEvidence: evidence,
        status: "ambiguous",
        availableBalanceCents: null,
        pendingBalanceCents: null,
        eligibleProceedsSinceJulyCents: null,
        proposedAction: "stop_stripe_read_failed",
        idempotencyKey,
        subscriptions: stripeSubscriptions,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const fingerprint = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  console.log(JSON.stringify({
    mode: "read_only_preview",
    tenant: TENANT_SLUG,
    julyReferenceDate: JULY_REFERENCE_DATE,
    augustPeriod: AUGUST_PERIOD,
    fingerprint,
    summary: {
      schools: rows.length,
      exactConnectedAccounts: rows.filter((row) => row.connectedAccountId && !row.error).length,
      paid: rows.filter((row) => row.status === "paid").length,
      missing: rows.filter((row) => row.status === "missing").length,
      deferred: rows.filter((row) => row.status === "deferred").length,
      ambiguous: rows.filter((row) => row.status === "ambiguous").length,
    },
    rows,
  }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
