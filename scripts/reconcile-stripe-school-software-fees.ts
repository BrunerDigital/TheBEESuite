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
  const amount = integer(item.amount_received) || integer(item.amount);
  return {
    kind: "payment_intent",
    id: clean(item.id),
    status: clean(item.status),
    amountCents: amount,
    feePeriod: clean(metadata.feePeriod) || clean(metadata.softwareFeePeriod) || null,
    referenceDate: clean(metadata.referenceDate) || clean(metadata.softwareFeeReferenceDate) || null,
    centerId: clean(metadata.centerId) || null,
    accountId: clean(metadata.connectedAccountId) || clean(metadata.accountId) || null,
    chargeId: clean(latestCharge.id) || clean(item.latest_charge) || null,
  };
}

function transferEvidence(item: JsonRecord) {
  const metadata = record(item.metadata);
  return {
    kind: "transfer",
    id: clean(item.id),
    status: item.reversed === true ? "reversed" : "paid",
    amountCents: integer(item.amount),
    feePeriod: clean(metadata.feePeriod) || clean(metadata.softwareFeePeriod) || null,
    referenceDate: clean(metadata.referenceDate) || clean(metadata.softwareFeeReferenceDate) || null,
    centerId: clean(metadata.centerId) || null,
    accountId: clean(metadata.connectedAccountId) || clean(item.destination) || null,
    chargeId: null,
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

  const [centers, paymentIntents, transfers, subscriptions] = await Promise.all([
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
    listAll(apiKey, `/v1/payment_intents?limit=100&created[gte]=${CREATED_SINCE}`),
    listAll(apiKey, `/v1/transfers?limit=100&created[gte]=${CREATED_SINCE}`),
    listAll(apiKey, "/v1/subscriptions?limit=100&status=all"),
  ]);

  const accountUsage = new Map<string, string[]>();
  for (const center of centers) {
    const accountId = readStripeConnectedAccountId(center.customFields);
    if (!accountId) continue;
    accountUsage.set(accountId, [...(accountUsage.get(accountId) ?? []), center.id]);
  }

  const softwarePayments = paymentIntents
    .filter((item) => clean(record(item.metadata).paymentScope) === "school_software_fee")
    .map(paymentEvidence);
  const softwareTransfers = transfers
    .filter((item) => ["school_software_fee", "school_software_fee_catchup"].includes(clean(record(item.metadata).purpose)))
    .map(transferEvidence);
  const softwareSubscriptions = subscriptions.filter((item) => clean(record(item.metadata).paymentScope) === "school_software_fee");

  const rows = await mapWithConcurrency(centers, 8, async (center) => {
    const policy = getSchoolSoftwareFeePolicyForCenter(center);
    const fields = record(center.customFields);
    const accountId = readStripeConnectedAccountId(fields);
    const idempotencyKey = accountId
      ? `school-software-fee:${JULY_REFERENCE_DATE}:${center.id}:${accountId}`
      : null;
    const evidence = [
      ...softwarePayments.filter((item) => item.centerId === center.id || (accountId && item.accountId === accountId)),
      ...softwareTransfers.filter((item) => item.centerId === center.id || (accountId && item.accountId === accountId)),
    ];
    const storedSubscriptionId = clean(fields.stripeSoftwareSubscriptionId);
    const stripeSubscriptions = softwareSubscriptions.filter((item) => {
      const metadata = record(item.metadata);
      return clean(item.id) === storedSubscriptionId || clean(metadata.centerId) === center.id;
    }).map((item) => ({ id: clean(item.id), status: clean(item.status), latestInvoiceId: clean(item.latest_invoice) || null }));

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
      const julyPaid = evidence.some((item) =>
        item.amountCents === policy.unitAmountCents &&
        (item.feePeriod === JULY_PERIOD || item.referenceDate === JULY_REFERENCE_DATE) &&
        ["succeeded", "paid"].includes(item.status),
      );
      const subscriptionActive = stripeSubscriptions.some((item) => ["active", "trialing"].includes(item.status));
      const accountExact = clean(account.id) === accountId;
      const cardPaymentsActive = clean(record(account.capabilities).card_payments) === "active";
      const status = !accountExact || !cardPaymentsActive
        ? "ambiguous"
        : julyPaid && subscriptionActive
          ? "paid"
          : availableBalanceCents < policy.unitAmountCents
            ? "deferred"
            : "missing";
      const proposedAction = status === "paid"
        ? "none"
        : status === "ambiguous"
          ? "stop_account_not_ready"
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
        accountReady: accountExact && cardPaymentsActive,
        julyPaid,
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
