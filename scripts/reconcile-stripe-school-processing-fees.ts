import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import {
  calculateStripeSchoolProcessingFeeAmount,
  type StripeSchoolProcessingFeeCategory,
} from "../src/lib/stripe-school-processing-fees";

type JsonRecord = Record<string, unknown>;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
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

function cents(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  const [headers = [], ...data] = rows;
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function paymentCategory(charge: JsonRecord): StripeSchoolProcessingFeeCategory {
  const details = record(charge.payment_method_details);
  const type = clean(details.type);
  if (type === "us_bank_account") return "ach";
  if (type === "link") return "link_bank";
  if (type === "card_present") return "card_present";
  return "card";
}

function dateWindow(date: string, utcOffset: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must use YYYY-MM-DD.");
  if (!/^[+-]\d{2}:\d{2}$/.test(utcOffset)) throw new Error("--utc-offset must use +HH:MM or -HH:MM.");
  const start = new Date(`${date}T00:00:00${utcOffset}`);
  if (!Number.isFinite(start.getTime())) throw new Error("The requested date window is invalid.");
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}

async function stripeRequest(
  apiKey: string,
  path: string,
  input: { accountId?: string; method?: "GET" | "POST"; body?: URLSearchParams; idempotencyKey?: string } = {},
) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: input.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Stripe-Version": process.env.STRIPE_API_VERSION || "2026-06-24.dahlia",
      ...(input.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(input.accountId ? { "Stripe-Account": input.accountId } : {}),
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
    },
    body: input.body,
    signal: AbortSignal.timeout(20_000),
  });
  const json = await response.json().catch(() => null) as JsonRecord | null;
  if (!response.ok || !json) {
    throw new Error(clean(record(json?.error).message) || `Stripe returned ${response.status} for ${path}.`);
  }
  return json;
}

async function listAll(
  apiKey: string,
  path: string,
  input: { accountId?: string } = {},
) {
  const rows: JsonRecord[] = [];
  let startingAfter = "";
  for (let page = 0; page < 20; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const pagePath = `${path}${startingAfter ? `${separator}starting_after=${encodeURIComponent(startingAfter)}` : ""}`;
    const response = await stripeRequest(apiKey, pagePath, input);
    const data = array(response.data).map(record);
    rows.push(...data);
    if (response.has_more !== true || data.length === 0) return rows;
    startingAfter = clean(data.at(-1)?.id);
  }
  throw new Error(`Stripe pagination exceeded the safety limit for ${path}.`);
}

async function exactProcessingFeeAllocation(
  apiKey: string,
  startSeconds: number,
  endSeconds: number,
) {
  const reportTypeId = "connected_account_stripe_fees.incurred_at.itemized.1";
  const reportType = await stripeRequest(apiKey, `/v1/reporting/report_types/${reportTypeId}`);
  if (cents(reportType.data_available_end) < endSeconds) return null;

  let reportRun = await stripeRequest(apiKey, "/v1/reporting/report_runs", {
    method: "POST",
    body: new URLSearchParams({
      report_type: reportTypeId,
      "parameters[interval_start]": String(startSeconds),
      "parameters[interval_end]": String(endSeconds),
      "parameters[timezone]": "UTC",
    }),
  });
  for (let attempt = 0; attempt < 30 && !["succeeded", "failed"].includes(clean(reportRun.status)); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    reportRun = await stripeRequest(apiKey, `/v1/reporting/report_runs/${encodeURIComponent(clean(reportRun.id))}`);
  }
  if (clean(reportRun.status) !== "succeeded") return null;
  const resultUrl = clean(record(reportRun.result).url);
  if (!resultUrl.startsWith("https://")) return null;
  const response = await fetch(resultUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Stripe report download returned ${response.status}.`);
  const rows = parseCsv(await response.text());
  const allocation = new Map<string, number>();
  for (const row of rows) {
    if (row.fee_category !== "payment_processing_fees" || row.incurred_by_type !== "charge") continue;
    const accountId = clean(row.account);
    const amountCents = Math.round(Number.parseFloat(row.amount || "0") * 100);
    if (!accountId.startsWith("acct_") || !Number.isFinite(amountCents)) continue;
    allocation.set(accountId, (allocation.get(accountId) || 0) + amountCents);
  }
  return allocation;
}

async function main() {
  const envDir = argValue("--env-dir") || process.cwd();
  loadEnvConfig(envDir);
  const apiKey = clean(process.env.STRIPE_SECRET_KEY);
  if (!/^(sk|rk)_live_/.test(apiKey)) throw new Error("A live Stripe secret or restricted key is required.");

  const date = argValue("--date");
  const utcOffset = argValue("--utc-offset") || "-04:00";
  const { start, end } = dateWindow(date, utcOffset);
  const startSeconds = Math.floor(start.getTime() / 1000);
  const endSeconds = Math.floor(end.getTime() / 1000);

  const applicationFees = await listAll(
    apiKey,
    `/v1/application_fees?limit=100&created[gte]=${startSeconds}&created[lt]=${endSeconds}`,
  );
  const accountIds = [...new Set(applicationFees.map((fee) => clean(fee.account)).filter((id) => id.startsWith("acct_")))];
  const accounts = new Map<string, JsonRecord>();
  for (const accountId of accountIds) {
    accounts.set(accountId, await stripeRequest(apiKey, `/v1/accounts/${encodeURIComponent(accountId)}`));
  }

  const recoverable: Array<{
    accountId: string;
    accountName: string;
    chargeId: string;
    category: StripeSchoolProcessingFeeCategory;
    amountCents: number;
    processingFeeCents: number;
  }> = [];
  for (const fee of applicationFees) {
    const accountId = clean(fee.account);
    const account = accounts.get(accountId);
    const feePayer = clean(record(record(account?.controller).fees).payer);
    if (feePayer === "account") continue;
    const chargeId = clean(fee.charge || fee.originating_transaction);
    if (!chargeId) continue;
    const charge = await stripeRequest(
      apiKey,
      `/v1/charges/${encodeURIComponent(chargeId)}`,
      { accountId },
    );
    const category = paymentCategory(charge);
    const amountCents = cents(charge.amount);
    const dashboardSettings = record(record(account?.settings).dashboard);
    recoverable.push({
      accountId,
      accountName: clean(dashboardSettings.display_name) || clean(record(account?.business_profile).name) || accountId,
      chargeId,
      category,
      amountCents,
      processingFeeCents: calculateStripeSchoolProcessingFeeAmount(amountCents, category),
    });
  }

  const feeTransactions = await listAll(
    apiKey,
    `/v1/balance_transactions?limit=100&type=stripe_fee&created[gte]=${startSeconds}&created[lt]=${Math.floor((end.getTime() + 24 * 60 * 60 * 1000) / 1000)}`,
  );
  const providerProcessingFees = feeTransactions.filter((transaction) => {
    const description = clean(transaction.description);
    return description.includes(`(${date})`) && /^(Card|Link|ACH Debit)\b/.test(description);
  });
  const providerFeeCents = providerProcessingFees.reduce((sum, transaction) => sum + Math.abs(cents(transaction.amount)), 0);
  const calculatedFeeCents = recoverable.reduce((sum, charge) => sum + charge.processingFeeCents, 0);
  const exactAllocation = await exactProcessingFeeAllocation(apiKey, startSeconds, endSeconds);
  const exactAllocationCents = exactAllocation
    ? [...exactAllocation.values()].reduce((sum, amount) => sum + amount, 0)
    : 0;
  const exactAllocationReady = exactAllocation !== null && exactAllocationCents === providerFeeCents;

  const grouped = new Map<string, typeof recoverable>();
  for (const charge of recoverable) grouped.set(charge.accountId, [...(grouped.get(charge.accountId) || []), charge]);

  const plans = [];
  for (const [accountId, charges] of grouped) {
    const balance = await stripeRequest(apiKey, "/v1/balance", { accountId });
    const availableUsd = array(balance.available).map(record).find((item) => clean(item.currency) === "usd");
    const pendingUsd = array(balance.pending).map(record).find((item) => clean(item.currency) === "usd");
    const balanceSettings = await stripeRequest(apiKey, "/v1/balance_settings", { accountId });
    const payoutSchedule = record(record(record(balanceSettings.payments).payouts).schedule);
    const estimatedRecoveryCents = charges.reduce((sum, charge) => sum + charge.processingFeeCents, 0);
    const recoveryCents = exactAllocationReady ? exactAllocation?.get(accountId) || 0 : estimatedRecoveryCents;
    plans.push({
      accountId,
      accountName: charges[0].accountName,
      chargeCount: charges.length,
      chargeAmountCents: charges.reduce((sum, charge) => sum + charge.amountCents, 0),
      recoveryCents,
      estimatedRecoveryCents,
      availableCents: cents(availableUsd?.amount),
      pendingCents: cents(pendingUsd?.amount),
      payoutInterval: clean(payoutSchedule.interval),
      categories: [...new Set(charges.map((charge) => charge.category))].sort(),
    });
  }
  plans.sort((left, right) => left.accountId.localeCompare(right.accountId));

  const canonical = JSON.stringify({
    date,
    providerTransactions: providerProcessingFees.map((transaction) => ({ id: transaction.id, amount: transaction.amount })).sort((left, right) => clean(left.id).localeCompare(clean(right.id))),
    plans: plans.map((plan) => ({ accountId: plan.accountId, recoveryCents: plan.recoveryCents })),
  });
  const fingerprint = createHash("sha256").update(canonical).digest("hex");
  const apply = hasArg("--apply");
  const confirmFingerprint = argValue("--confirm-fingerprint");
  const consentAcknowledged = hasArg("--acknowledge-connected-account-debit-consent");
  const holdPayouts = hasArg("--hold-payouts");
  const restoreDailyPayouts = hasArg("--restore-daily-payouts");
  if (apply && confirmFingerprint !== fingerprint) throw new Error("The confirmation fingerprint does not match the live plan.");
  const hasReadyDebit = plans.some((plan) => plan.availableCents >= plan.recoveryCents && plan.recoveryCents > 0);
  if (apply && hasReadyDebit && !exactAllocationReady) {
    throw new Error("Stripe's itemized connected-account fee report is not available yet; payout holds are allowed, account debits are not.");
  }
  if (apply && hasReadyDebit && !consentAcknowledged) throw new Error("Applying account debits requires --acknowledge-connected-account-debit-consent.");

  const results = [];
  for (const plan of plans) {
    let payoutAction = "unchanged";
    if (apply && holdPayouts && plan.availableCents < plan.recoveryCents && plan.payoutInterval !== "manual") {
      await stripeRequest(apiKey, "/v1/balance_settings", {
        accountId: plan.accountId,
        method: "POST",
        body: new URLSearchParams({ "payments[payouts][schedule][interval]": "manual" }),
      });
      payoutAction = "held_manual";
    }
    if (!apply) {
      results.push({ accountId: plan.accountId, status: plan.availableCents >= plan.recoveryCents ? "ready" : "awaiting_available_balance", payoutAction });
      continue;
    }
    if (plan.availableCents < plan.recoveryCents) {
      results.push({ accountId: plan.accountId, status: "awaiting_available_balance", payoutAction });
      continue;
    }
    const body = new URLSearchParams({
      amount: String(plan.recoveryCents),
      currency: "usd",
      source: plan.accountId,
      description: `Stripe processing fee correction ${date}`,
      "metadata[reconciliationDate]": date,
      "metadata[reconciliationFingerprint]": fingerprint,
      "metadata[purpose]": "school_processing_fee_correction",
    });
    const debit = await stripeRequest(apiKey, "/v1/charges", {
      method: "POST",
      body,
      idempotencyKey: `school-processing-fee-correction:${date}:${plan.accountId}`,
    });
    if (restoreDailyPayouts) {
      await stripeRequest(apiKey, "/v1/balance_settings", {
        accountId: plan.accountId,
        method: "POST",
        body: new URLSearchParams({ "payments[payouts][schedule][interval]": "daily" }),
      });
      payoutAction = "restored_daily";
    }
    results.push({ accountId: plan.accountId, status: clean(debit.status) || "submitted", debitId: clean(debit.id), payoutAction });
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "preview",
    date,
    fingerprint,
    providerFeeCents,
    calculatedFeeCents,
    calculatedFeeDeltaCents: calculatedFeeCents - providerFeeCents,
    allocationSource: exactAllocationReady ? "stripe_itemized_fee_report" : "estimated_awaiting_stripe_itemized_fee_report",
    plans,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
