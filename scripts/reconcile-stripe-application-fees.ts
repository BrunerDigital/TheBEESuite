import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { prisma } from "../src/lib/prisma";
import { readStripeConnectedAccountId } from "../src/lib/integrations";

type JsonRecord = Record<string, unknown>;

const PURPOSE = "bee_suite_application_fee_catchup";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function cents(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

function argValue(name: string) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = process.argv.indexOf(name);
  return index >= 0 ? clean(process.argv[index + 1]) : "";
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function utcDate(value: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) throw new Error(`${name} is invalid.`);
  return date;
}

function accountReferences(value: unknown, output = new Set<string>()) {
  if (typeof value === "string" && value.startsWith("acct_")) output.add(value);
  else if (Array.isArray(value)) value.forEach((item) => accountReferences(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => accountReferences(item, output));
  return output;
}

async function stripeRequest(apiKey: string, path: string, input: {
  accountId?: string;
  method?: "GET" | "POST";
  body?: URLSearchParams;
  idempotencyKey?: string;
} = {}) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: input.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Stripe-Version": process.env.STRIPE_API_VERSION || "2026-07-29.dahlia",
      ...(input.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(input.accountId ? { "Stripe-Account": input.accountId } : {}),
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
    },
    body: input.body,
    signal: AbortSignal.timeout(20_000),
  });
  const json = await response.json().catch(() => null) as JsonRecord | null;
  if (!response.ok || !json) throw new Error(clean(record(json?.error).message) || `Stripe returned ${response.status} for ${path}.`);
  return json;
}

async function listAll(apiKey: string, path: string, accountId?: string, maxPages = 25) {
  const rows: JsonRecord[] = [];
  let startingAfter = "";
  for (let page = 0; page < maxPages; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await stripeRequest(apiKey, `${path}${startingAfter ? `${separator}starting_after=${encodeURIComponent(startingAfter)}` : ""}`, { accountId });
    const data = array(response.data);
    rows.push(...data);
    if (response.has_more !== true || data.length === 0) return rows;
    startingAfter = clean(data.at(-1)?.id);
  }
  throw new Error(`Stripe pagination exceeded ${maxPages} pages for ${path}.`);
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await work(items[index]);
    }
  });
  await Promise.all(workers);
  return output;
}

function tuitionPrincipalCents(intent: JsonRecord) {
  const metadata = record(intent.metadata);
  const explicit = Number.parseInt(clean(metadata.invoiceAmountCents) || clean(metadata.stripeChargePrincipalCents) || "0", 10);
  return Math.max(0, Number.isFinite(explicit) && explicit > 0 ? explicit : cents(intent.amount_received) || cents(intent.amount));
}

function isBeeSuiteTuitionPayment(intent: JsonRecord, centerId: string) {
  const metadata = record(intent.metadata);
  const metadataCenterId = clean(metadata.centerId);
  const hasFamilyEvidence = Boolean(clean(metadata.invoiceId) || clean(metadata.billingAccountId) || clean(metadata.familyId));
  const excludedScope = ["school_software_fee", "terminal_store", "product_purchase"].includes(clean(metadata.paymentScope));
  return clean(intent.status) === "succeeded" && metadataCenterId === centerId && hasFamilyEvidence && !excludedScope;
}

async function main() {
  loadEnvConfig(argValue("--env-dir") || process.cwd());
  const apiKey = clean(process.env.STRIPE_SECRET_KEY);
  if (!/^(sk|rk)_live_/.test(apiKey)) throw new Error("A live Stripe secret or restricted key is required.");
  const startDate = argValue("--start-date") || "2026-01-01";
  const endDateExclusive = argValue("--end-date-exclusive") || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const startSeconds = Math.floor(utcDate(startDate, "--start-date").getTime() / 1000);
  const endSeconds = Math.floor(utcDate(endDateExclusive, "--end-date-exclusive").getTime() / 1000);
  if (endSeconds <= startSeconds) throw new Error("The reconciliation end date must be after its start date.");
  const apply = hasArg("--apply");

  const centers = await prisma.center.findMany({
    where: { status: { notIn: ["closed", "archived", "inactive"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true, customFields: true, organization: { select: { tenantId: true } } },
  });
  const accountUsage = new Map<string, typeof centers>();
  for (const center of centers) {
    for (const accountId of accountReferences(center.customFields)) {
      accountUsage.set(accountId, [...(accountUsage.get(accountId) || []), center]);
    }
  }
  const exactCenters = centers.map((center) => ({ center, accountId: readStripeConnectedAccountId(center.customFields) }))
    .filter((item): item is { center: typeof centers[number]; accountId: string } => Boolean(item.accountId))
    .filter((item) => (accountUsage.get(item.accountId) || []).length === 1);

  // A correction for an in-window tuition payment can be created after the
  // historical payment window closes. Search forward from the payment-window
  // start so reruns always find those later corrections.
  const priorCorrections = await listAll(apiKey, `/v1/charges?limit=100&created[gte]=${startSeconds}`);
  const priorByIntent = new Map<string, number>();
  for (const charge of priorCorrections) {
    const metadata = record(charge.metadata);
    if (clean(metadata.purpose) !== PURPOSE || clean(charge.status) !== "succeeded") continue;
    const intentId = clean(metadata.originalPaymentIntentId);
    if (intentId) priorByIntent.set(intentId, (priorByIntent.get(intentId) || 0) + Math.max(0, cents(charge.amount) - cents(charge.amount_refunded)));
  }

  const accountResults = await mapWithConcurrency(exactCenters, 6, async ({ center, accountId }) => {
    const [intents, balance] = await Promise.all([
      listAll(apiKey, `/v1/payment_intents?limit=100&created[gte]=${startSeconds}&created[lt]=${endSeconds}&expand[]=data.latest_charge.application_fee`, accountId),
      stripeRequest(apiKey, "/v1/balance", { accountId }),
    ]);
    const availableUsd = array(balance.available).find((item) => clean(item.currency).toLowerCase() === "usd");
    const rows = [];
    const tuitionIntents = intents.filter((item) => isBeeSuiteTuitionPayment(item, center.id));
    for (const intent of tuitionIntents) {
      const charge = record(intent.latest_charge);
      if (!clean(charge.id)) {
        rows.push({ school: center.name, centerId: center.id, accountId, paymentIntentId: clean(intent.id), status: "manual_review_charge_not_expanded" });
        continue;
      }
      const grossChargeCents = cents(charge.amount) || cents(intent.amount_received) || cents(intent.amount);
      const refundedChargeCents = Math.min(grossChargeCents, cents(charge.amount_refunded));
      const netChargeCents = Math.max(0, grossChargeCents - refundedChargeCents);
      const principalCents = tuitionPrincipalCents(intent);
      const netPrincipalCents = grossChargeCents > 0 ? Math.round(principalCents * (netChargeCents / grossChargeCents)) : 0;
      const originalExpectedBeeFeeCents = Math.round(principalCents * 0.01);
      const refundedExpectedBeeFeeCents = grossChargeCents > 0
        ? Math.round(originalExpectedBeeFeeCents * (refundedChargeCents / grossChargeCents))
        : originalExpectedBeeFeeCents;
      const expectedBeeFeeCents = Math.max(0, originalExpectedBeeFeeCents - refundedExpectedBeeFeeCents);
      const applicationFeeId = clean(charge.application_fee);
      const applicationFee = Object.keys(record(charge.application_fee)).length
        ? record(charge.application_fee)
        : applicationFeeId.startsWith("fee_")
          ? await stripeRequest(apiKey, `/v1/application_fees/${encodeURIComponent(applicationFeeId)}`)
          : {};
      const retainedApplicationFeeCents = Math.max(0, cents(applicationFee.amount) - cents(applicationFee.amount_refunded));
      const priorCorrectionCents = priorByIntent.get(clean(intent.id)) || 0;
      const missingBeeFeeCents = Math.max(0, expectedBeeFeeCents - retainedApplicationFeeCents - priorCorrectionCents);
      if (missingBeeFeeCents > 0) rows.push({
        school: center.name,
        centerId: center.id,
        tenantId: center.organization.tenantId,
        accountId,
        paymentIntentId: clean(intent.id),
        chargeId: clean(charge.id),
        created: typeof intent.created === "number" ? new Date(intent.created * 1000).toISOString() : null,
        netPrincipalCents,
        originalExpectedBeeFeeCents,
        refundedExpectedBeeFeeCents,
        expectedBeeFeeCents,
        retainedApplicationFeeCents,
        priorCorrectionCents,
        missingBeeFeeCents,
        status: "missing",
      });
    }
    return { center, accountId, availableCents: cents(availableUsd?.amount), reviewedCount: tuitionIntents.length, rows };
  });

  const rows = accountResults.flatMap((result) => result.rows);
  const actionableRows = rows.filter((row) => row.status === "missing" && typeof row.missingBeeFeeCents === "number");
  const canonical = JSON.stringify({
    startDate,
    endDateExclusive,
    rows: actionableRows.map((row) => ({ accountId: row.accountId, centerId: row.centerId, paymentIntentId: row.paymentIntentId, missingBeeFeeCents: row.missingBeeFeeCents })),
  });
  const fingerprint = createHash("sha256").update(canonical).digest("hex");
  if (apply && argValue("--confirm-fingerprint") !== fingerprint) throw new Error("The confirmation fingerprint does not match the current live plan.");
  if (apply && !hasArg("--acknowledge-connected-account-debit-consent")) throw new Error("Applying school debits requires documented connected-account debit consent.");

  const results = [];
  const availableByAccount = new Map(accountResults.map((result) => [result.accountId, result.availableCents]));
  for (const row of actionableRows) {
    const missingCents = row.missingBeeFeeCents as number;
    const availableCents = availableByAccount.get(row.accountId) || 0;
    if (availableCents < missingCents) {
      results.push({ paymentIntentId: row.paymentIntentId, school: row.school, status: "awaiting_available_balance", missingBeeFeeCents: missingCents, availableCents });
      continue;
    }
    if (!apply) {
      results.push({ paymentIntentId: row.paymentIntentId, school: row.school, status: "ready", missingBeeFeeCents: missingCents, availableCents });
      continue;
    }
    const debit = await stripeRequest(apiKey, "/v1/charges", {
      method: "POST",
      idempotencyKey: `${PURPOSE}:${row.paymentIntentId}`,
      body: new URLSearchParams({
        amount: String(missingCents),
        currency: "usd",
        source: row.accountId,
        description: `BEE Suite 1% tuition application-fee correction for ${row.paymentIntentId}`,
        "metadata[purpose]": PURPOSE,
        "metadata[connectedAccountId]": row.accountId,
        "metadata[centerId]": row.centerId,
        "metadata[originalPaymentIntentId]": row.paymentIntentId,
        "metadata[reconciliationFingerprint]": fingerprint,
      }),
    });
    if (clean(debit.status) !== "succeeded" || debit.paid !== true) throw new Error(`${row.school}: correction debit did not succeed.`);
    availableByAccount.set(row.accountId, availableCents - missingCents);
    results.push({ paymentIntentId: row.paymentIntentId, school: row.school, status: "succeeded", missingBeeFeeCents: missingCents, debitId: clean(debit.id) });
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "preview",
    startDate,
    endDateExclusive,
    fingerprint,
    exactConnectedAccounts: exactCenters.length,
    tuitionPaymentsReviewed: accountResults.reduce((sum, result) => sum + result.reviewedCount, 0),
    missingPaymentCount: actionableRows.length,
    missingBeeFeeCents: actionableRows.reduce((sum, row) => sum + (row.missingBeeFeeCents as number), 0),
    rows,
    results,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
