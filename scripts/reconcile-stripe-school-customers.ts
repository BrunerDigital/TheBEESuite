import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";

type JsonRecord = Record<string, unknown>;
type PrismaClient = typeof import("../src/lib/prisma").prisma;

let prisma: PrismaClient | null = null;

const MAX_PAGES = 50;
const ACTIVITY_CONCURRENCY = 3;
const LEGACY_CUSTOMER_CREATED_BEFORE = Math.floor(Date.parse("2026-08-15T00:00:00.000Z") / 1000);
const LEGACY_UNLABELED_BATCH_START = Math.floor(Date.parse("2026-08-14T01:15:00.000Z") / 1000);
const LEGACY_UNLABELED_BATCH_END = Math.floor(Date.parse("2026-08-14T01:25:00.000Z") / 1000);
const LEGACY_CONNECT_PURPOSES = new Set([
  "school_connect_full_dashboard_migration",
  "school_connect_responsibility_migration",
]);

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

function normalizeName(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function argValue(name: string) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = process.argv.indexOf(name);
  return index >= 0 ? clean(process.argv[index + 1]) : "";
}

function collectCustomerIds(value: unknown, output = new Set<string>()) {
  if (typeof value === "string" && value.startsWith("cus_")) output.add(value);
  else if (Array.isArray(value)) value.forEach((item) => collectCustomerIds(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectCustomerIds(item, output));
  return output;
}

async function stripeRequest(apiKey: string, path: string, method: "GET" | "DELETE" = "GET") {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`https://api.stripe.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Stripe-Version": process.env.STRIPE_API_VERSION || "2026-07-29.dahlia",
      },
      signal: AbortSignal.timeout(20_000),
    });
    const json = await response.json().catch(() => null) as JsonRecord | null;
    if (response.ok && json) return json;
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const retryAfterSeconds = Math.max(1, Math.min(5, Number.parseInt(response.headers.get("retry-after") || "1", 10) || 1));
      await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
      continue;
    }
    throw new Error(clean(record(json?.error).message) || `Stripe returned ${response.status} for ${path}.`);
  }
  throw new Error(`Stripe retries were exhausted for ${path}.`);
}

async function listAll(apiKey: string, path: string) {
  const output: JsonRecord[] = [];
  let startingAfter = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await stripeRequest(apiKey, `${path}${startingAfter ? `${separator}starting_after=${encodeURIComponent(startingAfter)}` : ""}`);
    const data = rows(response.data);
    output.push(...data);
    if (response.has_more !== true || data.length === 0) return output;
    startingAfter = clean(data.at(-1)?.id);
  }
  throw new Error(`Stripe pagination exceeded ${MAX_PAGES} pages for ${path}.`);
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await work(items[index]);
    }
  }));
  return output;
}

async function loadDatabaseReferences() {
  if (!prisma) throw new Error("The selected database environment has not been loaded.");
  const db = prisma;
  const [centers, ownerGroups, billingAccounts] = await Promise.all([
    db.center.findMany({ select: { id: true, name: true, email: true, status: true, customFields: true, organization: { select: { tenantId: true } } } }),
    db.ownerGroup.findMany({ select: { id: true, customFields: true } }),
    db.billingAccount.findMany({ select: { id: true, customFields: true } }),
  ]);
  const references = new Map<string, string[]>();
  const add = (customerId: string, label: string) => references.set(customerId, [...(references.get(customerId) ?? []), label]);
  centers.forEach((center) => collectCustomerIds(center.customFields).forEach((id) => add(id, `center:${center.id}`)));
  ownerGroups.forEach((ownerGroup) => collectCustomerIds(ownerGroup.customFields).forEach((id) => add(id, `owner_group:${ownerGroup.id}`)));
  billingAccounts.forEach((account) => collectCustomerIds(account.customFields).forEach((id) => add(id, `billing_account:${account.id}`)));
  const centersByName = new Map<string, typeof centers>();
  centers.forEach((center) => centersByName.set(normalizeName(center.name), [...(centersByName.get(normalizeName(center.name)) ?? []), center]));
  const centersById = new Map(centers.map((center) => [center.id, center]));
  return { references, centersByName, centersById };
}

function schoolCustomerEvidence(customer: JsonRecord, center: { id: string; name: string; email: string | null; organization: { tenantId: string } }) {
  const metadata = record(customer.metadata);
  const created = integer(customer.created);
  const customerEmail = clean(customer.email).toLowerCase();
  const centerEmail = clean(center.email).toLowerCase();
  if (clean(metadata.tenantId) === center.organization.tenantId
    && clean(metadata.centerId) === center.id
    && clean(metadata.paymentScope) === "school_software_fee") return "school_software_metadata";
  if (clean(metadata.bee_suite_center_id) === center.id
    && LEGACY_CONNECT_PURPOSES.has(clean(metadata.bee_suite_purpose))
    && clean(metadata.bee_suite_migration_source).startsWith("acct_")) return "legacy_connect_migration_metadata";
  const isKnownBatch = created >= LEGACY_UNLABELED_BATCH_START
    && created <= LEGACY_UNLABELED_BATCH_END
    && (customerEmail.endsWith("@kidcityusa.com") || customerEmail.endsWith("@misshoneyslearningcenter.com"));
  if (Object.keys(metadata).length === 0
    && created > 0
    && created < LEGACY_CUSTOMER_CREATED_BEFORE
    && normalizeName(customer.name) === normalizeName(center.name)
    && ((customerEmail.length > 0 && centerEmail.length > 0 && customerEmail === centerEmail) || isKnownBatch)) return "legacy_unlabeled_school_batch";
  return null;
}

async function customerActivity(apiKey: string, customer: JsonRecord) {
  const customerId = clean(customer.id);
  const encodedId = encodeURIComponent(customerId);
  const activityPaths = {
    subscriptions: `/v1/subscriptions?customer=${encodedId}&status=all&limit=1`,
    invoices: `/v1/invoices?customer=${encodedId}&limit=1`,
    pendingInvoiceItems: `/v1/invoiceitems?customer=${encodedId}&pending=true&limit=1`,
    paymentIntents: `/v1/payment_intents?customer=${encodedId}&limit=1`,
    setupIntents: `/v1/setup_intents?customer=${encodedId}&limit=1`,
    charges: `/v1/charges?customer=${encodedId}&limit=1`,
    checkoutSessions: `/v1/checkout/sessions?customer=${encodedId}&limit=1`,
    quotes: `/v1/quotes?customer=${encodedId}&limit=1`,
    paymentMethods: `/v1/customers/${encodedId}/payment_methods?limit=1`,
    taxIds: `/v1/customers/${encodedId}/tax_ids?limit=1`,
  } as const;
  const entries = await Promise.all(Object.entries(activityPaths).map(async ([key, path]) => {
    const response = await stripeRequest(apiKey, path);
    return [key, rows(response.data).length] as const;
  }));
  const cashBalance = await stripeRequest(apiKey, `/v1/customers/${encodedId}/cash_balance`);
  const availableCash = Object.values(record(cashBalance.available)).reduce<number>((sum, value) => sum + Math.abs(integer(value)), 0);
  const counts = Object.fromEntries(entries) as Record<keyof typeof activityPaths, number>;
  const sourceCount = rows(record(customer.sources).data).length;
  const immediate = {
    customerBalanceCents: integer(customer.balance),
    cashBalanceCents: availableCash,
    defaultSource: clean(customer.default_source) || null,
    defaultPaymentMethod: clean(record(customer.invoice_settings).default_payment_method) || null,
    sourceCount,
  };
  const reasons = [
    ...Object.entries(counts).filter(([, count]) => count > 0).map(([key]) => key),
    ...(immediate.customerBalanceCents !== 0 ? ["customerBalance"] : []),
    ...(immediate.cashBalanceCents !== 0 ? ["cashBalance"] : []),
    ...(immediate.defaultSource ? ["defaultSource"] : []),
    ...(immediate.defaultPaymentMethod ? ["defaultPaymentMethod"] : []),
    ...(immediate.sourceCount > 0 ? ["sources"] : []),
  ];
  return { counts, immediate, reasons };
}

async function main() {
  loadEnvConfig(argValue("--env-dir") || process.cwd());
  const apiKey = clean(process.env.STRIPE_SECRET_KEY);
  if (!/^(sk|rk)_live_/.test(apiKey)) throw new Error("A live Stripe secret or restricted key is required.");
  prisma = (await import("../src/lib/prisma")).prisma;
  const apply = process.argv.includes("--apply");
  const expectedTargetCount = Number.parseInt(argValue("--expected-target-count"), 10);

  const [{ references, centersByName, centersById }, customers] = await Promise.all([
    loadDatabaseReferences(),
    listAll(apiKey, "/v1/customers?limit=100"),
  ]);
  const possibleDuplicates = customers.flatMap((customer) => {
    const customerId = clean(customer.id);
    if (references.has(customerId)) return [];
    const metadata = record(customer.metadata);
    const metadataCenterId = clean(metadata.centerId) || clean(metadata.bee_suite_center_id);
    const metadataCenter = centersById.get(metadataCenterId);
    if (metadataCenter) {
      const evidence = schoolCustomerEvidence(customer, metadataCenter);
      if (evidence) return [{ customer, center: metadataCenter, evidence }];
    }
    const matches = centersByName.get(normalizeName(customer.name)) ?? [];
    if (matches.length !== 1) return [];
    const center = matches[0];
    const evidence = schoolCustomerEvidence(customer, center);
    if (!evidence) return [];
    return [{ customer, center, evidence }];
  });
  const audited = await mapWithConcurrency(possibleDuplicates, ACTIVITY_CONCURRENCY, async ({ customer, center, evidence }) => ({
    customerId: clean(customer.id),
    school: center.name,
    centerId: center.id,
    tenantId: center.organization.tenantId,
    centerEmail: center.email,
    evidence,
    centerStatus: center.status,
    createdAt: integer(customer.created) ? new Date(integer(customer.created) * 1000).toISOString() : null,
    activity: await customerActivity(apiKey, customer),
  }));
  const targets = audited.filter((row) => row.activity.reasons.length === 0);
  const held = audited.filter((row) => row.activity.reasons.length > 0);
  const canonical = JSON.stringify(targets.map(({ customerId, centerId, tenantId, evidence, createdAt }) => ({ customerId, centerId, tenantId, evidence, createdAt })));
  const fingerprint = createHash("sha256").update(canonical).digest("hex");

  if (apply && argValue("--confirm-fingerprint") !== fingerprint) {
    throw new Error("The confirmation fingerprint does not match the current live deletion plan.");
  }
  if (apply && !process.argv.includes("--acknowledge-delete-unreferenced-empty-school-customers")) {
    throw new Error("Applying deletion requires the explicit empty-school-customer acknowledgement flag.");
  }
  if (apply && (!Number.isInteger(expectedTargetCount) || expectedTargetCount !== targets.length)) {
    throw new Error(`The expected target count must equal the current ${targets.length}-customer deletion plan.`);
  }

  const results: Array<{ customerId: string; school: string; status: string }> = [];
  if (apply) {
    for (const target of targets) {
      const customer = await stripeRequest(apiKey, `/v1/customers/${encodeURIComponent(target.customerId)}`);
      if (customer.deleted === true) {
        results.push({ customerId: target.customerId, school: target.school, status: "already_deleted" });
        continue;
      }
      const liveEvidence = schoolCustomerEvidence(customer, { id: target.centerId, name: target.school, email: target.centerEmail, organization: { tenantId: target.tenantId } });
      if (liveEvidence !== target.evidence) {
        results.push({ customerId: target.customerId, school: target.school, status: "held_metadata_drift" });
        continue;
      }
      const liveActivity = await customerActivity(apiKey, customer);
      if (liveActivity.reasons.length > 0) {
        results.push({ customerId: target.customerId, school: target.school, status: `held_new_activity:${liveActivity.reasons.join(",")}` });
        continue;
      }
      const liveReferences = (await loadDatabaseReferences()).references;
      if (liveReferences.has(target.customerId)) {
        results.push({ customerId: target.customerId, school: target.school, status: "held_new_database_reference" });
        continue;
      }
      const deleted = await stripeRequest(apiKey, `/v1/customers/${encodeURIComponent(target.customerId)}`, "DELETE");
      if (deleted.deleted !== true || clean(deleted.id) !== target.customerId) {
        throw new Error(`${target.school}: Stripe did not confirm customer deletion.`);
      }
      results.push({ customerId: target.customerId, school: target.school, status: "deleted" });
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "read_only_preview",
    fingerprint,
    summary: {
      platformCustomers: customers.length,
      databaseReferencedCustomers: customers.filter((customer) => references.has(clean(customer.id))).length,
      exactUnreferencedSchoolMatches: possibleDuplicates.length,
      deletionTargets: targets.length,
      heldForActivity: held.length,
      deleted: results.filter((row) => row.status === "deleted").length,
      heldDuringApply: results.filter((row) => row.status.startsWith("held_")).length,
    },
    targets: targets.map((target) => ({
      customerId: target.customerId,
      school: target.school,
      centerId: target.centerId,
      tenantId: target.tenantId,
      evidence: target.evidence,
      centerStatus: target.centerStatus,
      createdAt: target.createdAt,
    })),
    held,
    results,
  }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
