import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { prisma } from "../src/lib/prisma";
import {
  allocateExactStripeFees,
  retainedProcessingFeeCents,
  schoolFeeCorrectionCents,
  type StripeFeeReportAllocationRow,
} from "../src/lib/stripe-school-fee-reconciliation";

type JsonRecord = Record<string, unknown>;
type CsvRow = Record<string, string>;

const REPORT_TYPE = "all_fees.balance_transaction_created.itemized.1";
const PURPOSE = "school_processing_fee_correction";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
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

function unixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function maskAccountId(accountId: string) {
  return `${accountId.slice(0, 8)}...${accountId.slice(-4)}`;
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
  return data.map((values): CsvRow =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

async function stripeRequest(
  apiKey: string,
  path: string,
  input: {
    accountId?: string;
    method?: "GET" | "POST";
    body?: URLSearchParams;
    idempotencyKey?: string;
  } = {},
) {
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
  for (let page = 0; page < 50; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await stripeRequest(
      apiKey,
      `${path}${startingAfter ? `${separator}starting_after=${encodeURIComponent(startingAfter)}` : ""}`,
      input,
    );
    const data = array(response.data).map(record);
    rows.push(...data);
    if (response.has_more !== true || data.length === 0) return rows;
    startingAfter = clean(data.at(-1)?.id);
  }
  throw new Error(`Stripe pagination exceeded the safety limit for ${path}.`);
}

async function downloadFeeReport(
  apiKey: string,
  startSeconds: number,
  endSeconds: number,
) {
  const reportType = await stripeRequest(apiKey, `/v1/reporting/report_types/${REPORT_TYPE}`);
  if (cents(reportType.data_available_end) < endSeconds) {
    return {
      ready: false as const,
      dataAvailableEnd: new Date(cents(reportType.data_available_end) * 1000).toISOString(),
      rows: [] as CsvRow[],
    };
  }
  let reportRun = await stripeRequest(apiKey, "/v1/reporting/report_runs", {
    method: "POST",
    body: new URLSearchParams({
      report_type: REPORT_TYPE,
      "parameters[interval_start]": String(startSeconds),
      "parameters[interval_end]": String(endSeconds),
      "parameters[timezone]": "UTC",
    }),
  });
  for (let attempt = 0; attempt < 45 && !["succeeded", "failed"].includes(clean(reportRun.status)); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    reportRun = await stripeRequest(apiKey, `/v1/reporting/report_runs/${encodeURIComponent(clean(reportRun.id))}`);
  }
  if (clean(reportRun.status) !== "succeeded") throw new Error("Stripe's All Fees report did not complete successfully.");
  const resultUrl = clean(record(reportRun.result).url);
  if (!resultUrl.startsWith("https://")) throw new Error("Stripe's All Fees report did not provide a download URL.");
  const response = await fetch(resultUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Stripe report download returned ${response.status}.`);
  return {
    ready: true as const,
    dataAvailableEnd: new Date(cents(reportType.data_available_end) * 1000).toISOString(),
    rows: parseCsv(await response.text()),
  };
}

function accountReferences(value: unknown, output = new Set<string>()) {
  if (typeof value === "string" && value.startsWith("acct_")) output.add(value);
  else if (Array.isArray(value)) value.forEach((item) => accountReferences(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => accountReferences(item, output));
  return output;
}

async function main() {
  loadEnvConfig(argValue("--env-dir") || process.cwd());
  const apiKey = clean(process.env.STRIPE_SECRET_KEY);
  if (!/^(sk|rk)_live_/.test(apiKey)) throw new Error("A live Stripe secret or restricted key is required.");

  const startDate = argValue("--start-date");
  const endDateExclusive = argValue("--end-date-exclusive");
  const apply = hasArg("--apply");
  const start = utcDate(startDate, "--start-date");
  const end = utcDate(endDateExclusive, "--end-date-exclusive");
  if (end <= start) throw new Error("--end-date-exclusive must be later than --start-date.");
  if (end.getTime() - start.getTime() > 31 * 86_400_000) throw new Error("The reconciliation window cannot exceed 31 days.");
  const startSeconds = unixSeconds(start);
  const endSeconds = unixSeconds(end);
  const report = await downloadFeeReport(apiKey, startSeconds, endSeconds);
  if (!report.ready) {
    console.log(JSON.stringify({
      mode: "waiting_for_stripe_itemization",
      startDate,
      endDateExclusive,
      reportType: REPORT_TYPE,
      dataAvailableEnd: report.dataAvailableEnd,
    }, null, 2));
    return;
  }

  const providerTransactions = (await listAll(
    apiKey,
    `/v1/balance_transactions?limit=100&type=stripe_fee&created[gte]=${startSeconds}&created[lt]=${endSeconds}`,
  )).filter((transaction) => /^(Card|Link|ACH Debit)\b/.test(clean(transaction.description)));
  const providerById = new Map(providerTransactions.map((transaction) => [clean(transaction.id), Math.abs(cents(transaction.amount))]));
  const providerFeeCents = [...providerById.values()].reduce((sum, amount) => sum + amount, 0);

  const feeRows = report.rows.filter((row) =>
    row.fee_category === "payment_processing_fees"
      && Number.parseFloat(row.amount || "0") > 0
      && clean(row.balance_transaction_id).startsWith("txn_"));
  const reportBalanceTransactionIds = new Set(feeRows.map((row) => clean(row.balance_transaction_id)));
  const missingReportTransactions = [...providerById.keys()].filter((id) => !reportBalanceTransactionIds.has(id));
  const unexpectedReportTransactions = [...reportBalanceTransactionIds].filter((id) => !providerById.has(id));
  if (unexpectedReportTransactions.length) {
    throw new Error(`Stripe's itemized report contains ${unexpectedReportTransactions.length} unexpected processing-fee transactions.`);
  }
  if (missingReportTransactions.length) {
    if (apply) throw new Error(`Stripe has not itemized ${missingReportTransactions.length} provider processing-fee transactions yet.`);
    console.log(JSON.stringify({
      mode: "waiting_for_complete_stripe_itemization",
      startDate,
      endDateExclusive,
      reportType: REPORT_TYPE,
      dataAvailableEnd: report.dataAvailableEnd,
      providerTransactions: providerById.size,
      itemizedProviderTransactions: reportBalanceTransactionIds.size,
      pendingProviderTransactions: missingReportTransactions.length,
      providerFeeCents,
    }, null, 2));
    return;
  }

  const lookupStartSeconds = startSeconds - 7 * 86_400;
  const applicationFees = await listAll(
    apiKey,
    `/v1/application_fees?limit=100&created[gte]=${lookupStartSeconds}&created[lt]=${endSeconds}`,
  );
  const accountCache = new Map<string, JsonRecord>();
  const chargeByReference = new Map<string, { accountId: string; charge: JsonRecord; fee: JsonRecord; account: JsonRecord }>();
  for (const fee of applicationFees) {
    const accountId = clean(fee.account);
    const reference = clean(fee.charge || fee.originating_transaction);
    if (!accountId.startsWith("acct_") || !reference) continue;
    let account = accountCache.get(accountId);
    if (!account) {
      account = await stripeRequest(apiKey, `/v1/accounts/${encodeURIComponent(accountId)}`);
      accountCache.set(accountId, account);
    }
    const charge = await stripeRequest(apiKey, `/v1/charges/${encodeURIComponent(reference)}`, { accountId });
    const item = { accountId, charge, fee, account };
    chargeByReference.set(reference, item);
    chargeByReference.set(clean(charge.id), item);
  }

  const allocationRows: StripeFeeReportAllocationRow[] = [];
  const matchedCharges = new Map<string, { accountId: string; charge: JsonRecord; fee: JsonRecord; account: JsonRecord }>();
  const unmappedRows: CsvRow[] = [];
  for (const row of feeRows) {
    const item = chargeByReference.get(clean(row.incurred_by));
    if (!item || clean(record(record(item.account.controller).fees).payer) !== "application") {
      unmappedRows.push(row);
      continue;
    }
    const amountMinorUnits = Number.parseFloat(row.amount || "0") * 100;
    allocationRows.push({
      accountId: item.accountId,
      balanceTransactionId: clean(row.balance_transaction_id),
      amountMinorUnits,
    });
    matchedCharges.set(clean(item.charge.id), item);
  }
  if (unmappedRows.length) throw new Error(`${unmappedRows.length} Stripe fee report rows could not be mapped to one fee-paying school account.`);

  const actualByAccount = allocateExactStripeFees(allocationRows, providerById);
  const allocatedFeeCents = [...actualByAccount.values()].reduce((sum, amount) => sum + amount, 0);
  if (allocatedFeeCents !== providerFeeCents) {
    throw new Error(`Allocated school fees (${allocatedFeeCents}) do not equal Stripe's provider total (${providerFeeCents}).`);
  }

  const retainedByAccount = new Map<string, number>();
  for (const item of matchedCharges.values()) {
    const metadata = record(item.charge.metadata);
    const retained = retainedProcessingFeeCents({
      processingFeeCents: Number.parseInt(clean(metadata.schoolProcessingFeeAmountCents) || "0", 10),
      applicationFeeCents: cents(item.fee.amount),
      applicationFeeRefundedCents: cents(item.fee.amount_refunded),
    });
    retainedByAccount.set(item.accountId, (retainedByAccount.get(item.accountId) || 0) + retained);
  }

  const priorCorrectionCharges = await listAll(
    apiKey,
    `/v1/charges?limit=100&created[gte]=${startSeconds}&created[lt]=${unixSeconds(new Date(end.getTime() + 31 * 86_400_000))}`,
  );
  const priorCorrectionsByAccount = new Map<string, number>();
  const priorCorrectionIdsByAccount = new Map<string, string[]>();
  for (const charge of priorCorrectionCharges) {
    const metadata = record(charge.metadata);
    if (clean(metadata.purpose) !== PURPOSE
      || clean(metadata.reconciliationStartDate) !== startDate
      || clean(metadata.reconciliationEndDateExclusive) !== endDateExclusive
      || clean(charge.status) !== "succeeded") continue;
    const accountId = clean(metadata.connectedAccountId);
    if (!accountId.startsWith("acct_")) continue;
    const netAmount = Math.max(0, cents(charge.amount) - cents(charge.amount_refunded));
    priorCorrectionsByAccount.set(accountId, (priorCorrectionsByAccount.get(accountId) || 0) + netAmount);
    priorCorrectionIdsByAccount.set(accountId, [...(priorCorrectionIdsByAccount.get(accountId) || []), clean(charge.id)]);
  }

  const centers = await prisma.center.findMany({
    select: {
      id: true,
      name: true,
      locationId: true,
      crmLocationId: true,
      status: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  });
  const plans = [];
  for (const [accountId, actualStripeFeeCents] of actualByAccount) {
    const matches = centers.filter((center) => accountReferences(center.customFields).has(accountId));
    const uniqueMatches = [...new Map(matches.map((center) => [center.id, center])).values()];
    if (uniqueMatches.length !== 1 || uniqueMatches[0].status !== "active") {
      throw new Error(`${maskAccountId(accountId)} has ${uniqueMatches.length} active-school mapping candidates.`);
    }
    const center = uniqueMatches[0];
    const account = accountCache.get(accountId) || await stripeRequest(apiKey, `/v1/accounts/${encodeURIComponent(accountId)}`);
    const v2Account = await stripeRequest(
      apiKey,
      `/v2/core/accounts/${encodeURIComponent(accountId)}?include%5B0%5D=configuration.merchant&include%5B1%5D=defaults`,
    );
    const v2Merchant = record(record(v2Account.configuration).merchant);
    const v2Capabilities = record(v2Merchant.capabilities);
    const v2CardPayments = record(v2Capabilities.card_payments);
    const v2Responsibilities = record(record(v2Account.defaults).responsibilities);
    if (clean(v2CardPayments.status) !== "active") {
      throw new Error(`${center.name}: Stripe v2 card-payments capability is not active.`);
    }
    if (clean(v2Responsibilities.fees_collector) !== "application") {
      throw new Error(`${center.name}: Stripe v2 no longer identifies The BEE Suite as the fee collector.`);
    }
    const balance = await stripeRequest(apiKey, "/v1/balance", { accountId });
    const availableUsd = array(balance.available).map(record).find((item) => clean(item.currency) === "usd");
    const retainedFeeCents = retainedByAccount.get(accountId) || 0;
    const priorCorrectionCents = priorCorrectionsByAccount.get(accountId) || 0;
    const correctionCents = schoolFeeCorrectionCents({
      actualStripeFeeCents,
      retainedProcessingFeeCents: retainedFeeCents,
      priorCorrectionCents,
    });
    const dashboard = record(record(account.settings).dashboard);
    plans.push({
      accountId,
      account: maskAccountId(accountId),
      accountName: clean(dashboard.display_name) || clean(record(account.business_profile).name) || center.name,
      centerId: center.id,
      centerName: center.name,
      locationId: center.locationId || center.crmLocationId,
      tenantId: center.organization.tenantId,
      actualStripeFeeCents,
      retainedProcessingFeeCents: retainedFeeCents,
      priorCorrectionCents,
      correctionCents,
      availableCents: cents(availableUsd?.amount),
      priorCorrectionIds: priorCorrectionIdsByAccount.get(accountId) || [],
    });
  }
  plans.sort((left, right) => left.centerName.localeCompare(right.centerName));

  const canonical = JSON.stringify({
    startDate,
    endDateExclusive,
    providerTransactions: [...providerById.entries()].sort(),
    plans: plans.map((plan) => ({
      accountId: plan.accountId,
      centerId: plan.centerId,
      actualStripeFeeCents: plan.actualStripeFeeCents,
      retainedProcessingFeeCents: plan.retainedProcessingFeeCents,
      priorCorrectionCents: plan.priorCorrectionCents,
      correctionCents: plan.correctionCents,
    })),
  });
  const fingerprint = createHash("sha256").update(canonical).digest("hex");
  if (apply && argValue("--confirm-fingerprint") !== fingerprint) {
    throw new Error("The confirmation fingerprint does not match the current live plan.");
  }
  if (apply && !hasArg("--acknowledge-connected-account-debit-consent")) {
    throw new Error("Applying school debits requires --acknowledge-connected-account-debit-consent.");
  }

  const results = [];
  for (const plan of plans) {
    if (plan.correctionCents === 0) {
      results.push({ school: plan.centerName, status: "already_reconciled", correctionCents: 0 });
      continue;
    }
    if (plan.availableCents < plan.correctionCents) {
      results.push({ school: plan.centerName, status: "awaiting_available_balance", correctionCents: plan.correctionCents });
      continue;
    }
    if (!apply) {
      results.push({ school: plan.centerName, status: "ready", correctionCents: plan.correctionCents });
      continue;
    }
    const debit = await stripeRequest(apiKey, "/v1/charges", {
      method: "POST",
      idempotencyKey: `school-processing-fee-correction:${startDate}:${endDateExclusive}:${plan.accountId}`,
      body: new URLSearchParams({
        amount: String(plan.correctionCents),
        currency: "usd",
        source: plan.accountId,
        description: `Stripe processing fee correction ${startDate} through ${endDateExclusive} (exclusive)`,
        "metadata[purpose]": PURPOSE,
        "metadata[connectedAccountId]": plan.accountId,
        "metadata[centerId]": plan.centerId,
        "metadata[reconciliationStartDate]": startDate,
        "metadata[reconciliationEndDateExclusive]": endDateExclusive,
        "metadata[reconciliationFingerprint]": fingerprint,
        "metadata[actualStripeFeeCents]": String(plan.actualStripeFeeCents),
        "metadata[retainedProcessingFeeCents]": String(plan.retainedProcessingFeeCents),
        "metadata[priorCorrectionCents]": String(plan.priorCorrectionCents),
      }),
    });
    const debitId = clean(debit.id);
    if (clean(debit.status) !== "succeeded" || !debitId.startsWith("ch_")) {
      throw new Error(`${plan.centerName}: Stripe correction debit did not succeed.`);
    }
    const existingAudit = await prisma.auditLog.findFirst({
      where: { tenantId: plan.tenantId, centerId: plan.centerId, resourceId: debitId, action: PURPOSE },
      select: { id: true },
    });
    if (!existingAudit) {
      await prisma.auditLog.create({
        data: {
          tenantId: plan.tenantId,
          centerId: plan.centerId,
          action: PURPOSE,
          resource: "stripe_charge",
          resourceId: debitId,
          metadata: {
            reconciliationStartDate: startDate,
            reconciliationEndDateExclusive: endDateExclusive,
            reconciliationFingerprint: fingerprint,
            actualStripeFeeCents: plan.actualStripeFeeCents,
            retainedProcessingFeeCents: plan.retainedProcessingFeeCents,
            priorCorrectionCents: plan.priorCorrectionCents,
            correctionCents: plan.correctionCents,
          },
        },
      });
    }
    results.push({ school: plan.centerName, status: "succeeded", correctionCents: plan.correctionCents, debitId });
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "preview",
    startDate,
    endDateExclusive,
    reportType: REPORT_TYPE,
    dataAvailableEnd: report.dataAvailableEnd,
    fingerprint,
    providerFeeCents,
    retainedProcessingFeeCents: plans.reduce((sum, plan) => sum + plan.retainedProcessingFeeCents, 0),
    priorCorrectionCents: plans.reduce((sum, plan) => sum + plan.priorCorrectionCents, 0),
    correctionCents: plans.reduce((sum, plan) => sum + plan.correctionCents, 0),
    plans: plans.map((plan) => ({
      account: plan.account,
      accountName: plan.accountName,
      centerName: plan.centerName,
      locationId: plan.locationId,
      actualStripeFeeCents: plan.actualStripeFeeCents,
      retainedProcessingFeeCents: plan.retainedProcessingFeeCents,
      priorCorrectionCents: plan.priorCorrectionCents,
      correctionCents: plan.correctionCents,
      availableCents: plan.availableCents,
      priorCorrectionIds: plan.priorCorrectionIds,
    })),
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
