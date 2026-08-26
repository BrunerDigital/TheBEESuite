import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";
import {
  getSchoolSoftwareBillingStartAt,
  getSchoolSoftwareFeePolicyForCenter,
  isSchoolSoftwareBillingCenter,
} from "@/lib/kidcity-software-billing";

type JsonRecord = Record<string, unknown>;

const TENANT_SLUG = "kid-city-usa";
const EVIDENCE_START_AT = "2026-01-01T00:00:00.000Z";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function rows(value: unknown) {
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

async function stripeGet(apiKey: string, path: string) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Stripe-Version": process.env.STRIPE_API_VERSION || "2026-07-29.dahlia",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const json = await response.json().catch(() => null) as JsonRecord | null;
  if (!response.ok || !json) {
    throw new Error(clean(record(json?.error).message) || `Stripe returned ${response.status} for ${path}.`);
  }
  return json;
}

async function listAll(apiKey: string, path: string, maxPages = 20) {
  const output: JsonRecord[] = [];
  let startingAfter = "";
  for (let page = 0; page < maxPages; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await stripeGet(
      apiKey,
      `${path}${startingAfter ? `${separator}starting_after=${encodeURIComponent(startingAfter)}` : ""}`,
    );
    const data = rows(response.data);
    output.push(...data);
    if (response.has_more !== true || data.length === 0) return output;
    startingAfter = clean(data.at(-1)?.id);
  }
  throw new Error(`Stripe pagination exceeded ${maxPages} pages for ${path}.`);
}

function subscriptionConfiguration(item: JsonRecord) {
  const subscriptionItems = rows(record(item.items).data);
  const normalized = subscriptionItems.map((entry) => {
    const price = record(entry.price);
    const recurring = record(price.recurring);
    return {
      quantity: Math.max(1, integer(entry.quantity) || 1),
      unitAmountCents: integer(price.unit_amount),
      currency: clean(price.currency).toLowerCase(),
      interval: clean(recurring.interval),
      intervalCount: Math.max(1, integer(recurring.interval_count) || 1),
    };
  });
  return {
    effectiveMonthlyAmountCents: normalized.reduce(
      (sum, item) => sum + item.unitAmountCents * item.quantity,
      0,
    ),
    exactMonthlyConfiguration: normalized.length === 1 && normalized.every((item) =>
      item.currency === "usd" && item.interval === "month" && item.intervalCount === 1,
    ),
  };
}

function softwareEvidence(item: JsonRecord, kind: "payment_intent" | "transfer" | "invoice") {
  const metadata = kind === "invoice"
    ? record(record(record(item.parent).subscription_details).metadata)
    : record(item.metadata);
  const createdAt = integer(item.created) ? new Date(integer(item.created) * 1000).toISOString() : null;
  const latestCharge = record(item.latest_charge);
  const grossAmountCents = integer(item.amount_received) || integer(item.amount_paid) || integer(item.amount);
  const reversedOrRefundedCents = kind === "payment_intent"
    ? integer(latestCharge.amount_refunded)
    : kind === "transfer"
      ? integer(item.amount_reversed)
      : 0;
  const amountCents = Math.max(0, grossAmountCents - reversedOrRefundedCents);
  const settledPositive = amountCents > 0 && (
    (kind === "payment_intent" && clean(item.status) === "succeeded") ||
    (kind === "transfer" && item.reversed !== true) ||
    (kind === "invoice" && clean(item.status) === "paid")
  );
  return {
    kind,
    id: clean(item.id),
    createdAt,
    amountCents,
    status: clean(item.status) || (item.paid === true ? "paid" : "unknown"),
    centerId: clean(metadata.centerId) || null,
    paymentScope: clean(metadata.paymentScope) || clean(metadata.purpose) || null,
    beforeApprovedStart: Boolean(createdAt && createdAt < getSchoolSoftwareBillingStartAt().toISOString()),
    settledPositive,
  };
}

async function main() {
  const envDir = argValue("--env-dir") || process.env.BEE_SUITE_ENV_DIR || process.cwd();
  loadEnvConfig(envDir);
  const apiKey = clean(process.env.STRIPE_SECRET_KEY);
  if (!/^(sk|rk)_live_/.test(apiKey)) throw new Error("A live Stripe secret or restricted key is required.");
  if (process.argv.includes("--apply")) {
    throw new Error("This audit is preview-only. A school must authorize its own ACH or card before a subscription can be created.");
  }

  const createdSince = Math.floor(new Date(EVIDENCE_START_AT).getTime() / 1000);
  const [centerRows, subscriptions, paymentIntents, transfers, invoices] = await Promise.all([
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
    listAll(apiKey, "/v1/subscriptions?limit=100&status=all"),
    listAll(apiKey, `/v1/payment_intents?limit=100&created[gte]=${createdSince}&expand[]=data.latest_charge`),
    listAll(apiKey, `/v1/transfers?limit=100&created[gte]=${createdSince}`),
    listAll(apiKey, `/v1/invoices?limit=100&created[gte]=${createdSince}`),
  ]);

  const centers = centerRows.filter(isSchoolSoftwareBillingCenter);
  const softwareSubscriptions = subscriptions.filter(
    (item) => clean(record(item.metadata).paymentScope) === "school_software_fee",
  );
  const softwareSubscriptionIds = new Set(softwareSubscriptions.map((item) => clean(item.id)).filter(Boolean));
  const evidence = [
    ...paymentIntents
      .filter((item) => clean(record(item.metadata).paymentScope) === "school_software_fee")
      .map((item) => softwareEvidence(item, "payment_intent")),
    ...transfers
      .filter((item) => ["school_software_fee", "school_software_fee_catchup"].includes(clean(record(item.metadata).purpose)))
      .map((item) => softwareEvidence(item, "transfer")),
    ...invoices
      .filter((item) => {
        const details = record(record(item.parent).subscription_details);
        const metadata = record(details.metadata);
        return softwareSubscriptionIds.has(clean(details.subscription)) || clean(metadata.paymentScope) === "school_software_fee";
      })
      .map((item) => softwareEvidence(item, "invoice")),
  ];

  const subscriptionUse = new Map<string, string[]>();
  for (const center of centers) {
    const subscriptionId = clean(record(center.customFields).stripeSoftwareSubscriptionId);
    if (!subscriptionId) continue;
    subscriptionUse.set(subscriptionId, [...(subscriptionUse.get(subscriptionId) ?? []), center.id]);
  }

  const auditRows = centers.map((center) => {
    const fields = record(center.customFields);
    const policy = getSchoolSoftwareFeePolicyForCenter(center);
    const customerId = clean(fields.stripeSoftwareCustomerId);
    const paymentMethodId = clean(fields.stripeSoftwareDefaultPaymentMethodId);
    const storedSubscriptionId = clean(fields.stripeSoftwareSubscriptionId);
    const matches = softwareSubscriptions.filter((item) => {
      const metadata = record(item.metadata);
      return clean(item.id) === storedSubscriptionId || clean(metadata.centerId) === center.id;
    });
    const active = matches.filter((item) => ["active", "trialing"].includes(clean(item.status)));
    const unresolved = matches.filter((item) => ["past_due", "unpaid", "paused", "incomplete"].includes(clean(item.status)));
    const exactSubscription = active.length === 1 && (() => {
      const configuration = subscriptionConfiguration(active[0]);
      return configuration.exactMonthlyConfiguration &&
        configuration.effectiveMonthlyAmountCents === policy.unitAmountCents &&
        clean(record(active[0].metadata).centerId) === center.id &&
        active[0].cancel_at_period_end !== true &&
        !(integer(active[0].cancel_at) > 0);
    })();
    const subscriptionShared = Boolean(storedSubscriptionId && (subscriptionUse.get(storedSubscriptionId) ?? []).length > 1);
    const preStartEvidence = evidence.filter((item) =>
      item.centerId === center.id &&
      item.beforeApprovedStart &&
      item.settledPositive &&
      item.kind !== "invoice"
    );

    let status = "ready_for_september";
    let proposedAction = "none";
    if (preStartEvidence.length) {
      status = "manual_review";
      proposedAction = "review_pre_september_software_charge";
    } else if (subscriptionShared || unresolved.length > 0 || active.length > 1 || (active.length > 0 && !exactSubscription)) {
      status = "ambiguous";
      proposedAction = "stop_subscription_configuration_mismatch";
    } else if (!paymentMethodId.startsWith("pm_")) {
      status = "awaiting_school_authorization";
      proposedAction = "school_authorizes_ach_or_card";
    } else if (!customerId.startsWith("cus_")) {
      status = "ambiguous";
      proposedAction = "stop_missing_customer_for_saved_payment_method";
    } else if (!exactSubscription) {
      status = "authorized_subscription_missing";
      proposedAction = "create_september_subscription_from_saved_school_payment_method";
    }

    return {
      school: center.name,
      centerId: center.id,
      classification: policy.tier,
      monthlyAmountCents: policy.unitAmountCents,
      firstPaidBillingAt: getSchoolSoftwareBillingStartAt().toISOString(),
      customerId: customerId || null,
      paymentMethodId: paymentMethodId || null,
      storedSubscriptionId: storedSubscriptionId || null,
      matchingSubscriptionIds: matches.map((item) => clean(item.id)),
      unresolvedSubscriptionIds: unresolved.map((item) => clean(item.id)),
      status,
      proposedAction,
      preStartEvidence,
    };
  });

  const fingerprint = createHash("sha256").update(JSON.stringify(auditRows)).digest("hex");
  console.log(JSON.stringify({
    mode: "read_only_preview",
    tenant: TENANT_SLUG,
    firstPaidBillingAt: getSchoolSoftwareBillingStartAt().toISOString(),
    fingerprint,
    summary: {
      schools: auditRows.length,
      corporateSchools: auditRows.filter((row) => row.classification === "corporate").length,
      partnerSchools: auditRows.filter((row) => row.classification === "partner").length,
      monthlyTotalCents: auditRows.reduce((sum, row) => sum + row.monthlyAmountCents, 0),
      readyForSeptember: auditRows.filter((row) => row.status === "ready_for_september").length,
      awaitingSchoolAuthorization: auditRows.filter((row) => row.status === "awaiting_school_authorization").length,
      authorizedSubscriptionMissing: auditRows.filter((row) => row.status === "authorized_subscription_missing").length,
      ambiguous: auditRows.filter((row) => row.status === "ambiguous").length,
      preStartChargesRequiringReview: auditRows.filter((row) => row.proposedAction === "review_pre_september_software_charge").length,
    },
    rows: auditRows,
  }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
