import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import test, { after, before } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type Stripe from "stripe";
import {
  createPlatformBillingAccount, reservePlatformBillingCharge, openPlatformBillingCheckout,
  findPlatformBillingCharge, readPlatformBillingDashboard, type PlatformChargeWithAccount,
} from "../src/lib/platform-billing";
import { handlePlatformBillingEvent, PlatformBillingRetryableError, syncPlatformBillingCharge } from "../src/lib/platform-billing-events";
import { PlatformBillingError } from "../src/lib/platform-billing-policy";

let pg: PGlite;
let server: PGLiteSocketServer;
let db: PrismaClient;
const actor = { id: "platform-executive", identityTenantId: "platform-tenant" };
type ObjectData = Record<string, unknown>;

before(async () => {
  pg = await PGlite.create();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL);
    CREATE TABLE "AuditLog" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "centerId" TEXT,
      "userId" TEXT, "action" TEXT NOT NULL, "resource" TEXT NOT NULL, "resourceId" TEXT, "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO "Tenant" VALUES ('platform-tenant', 'The BEE Suite'), ('other-platform', 'Other platform');
    CREATE TABLE "BillingAccount" ("id" TEXT PRIMARY KEY, "balanceCents" INTEGER);
    INSERT INTO "BillingAccount" VALUES ('family-preserved', 12345);
  `);
  await pg.exec(await readFile(new URL("../prisma/migrations/20261105120000_platform_billing/migration.sql", import.meta.url), "utf8"));
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  server = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port, maxConnections: 1 });
  await server.start();
  db = new PrismaClient({ datasources: { db: { url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?connection_limit=1&sslmode=disable` } } });
  await db.$connect();
});

after(async () => { await db?.$disconnect(); await server?.stop(); await pg?.close(); });

async function payer(tenant = true) {
  const requestId = crypto.randomUUID();
  const customerTenantId = tenant ? `tenant_${requestId}` : null;
  if (customerTenantId) await db.$executeRaw(Prisma.sql`INSERT INTO "Tenant" ("id", "name") VALUES (${customerTenantId}, 'Customer tenant')`);
  return createPlatformBillingAccount(db, actor, { requestId, name: "Tenant billing contact", email: "payer@example.test", customerTenantId });
}

async function reserve(kind = "ONE_TIME", accountId?: string, requestId = crypto.randomUUID()) {
  const account = accountId || (await payer()).id;
  return reservePlatformBillingCharge(db, actor, { requestId, accountId: account, description: "Software and services", amount: "79.00", kind });
}

function provider() {
  const customers = new Map<string, ObjectData>();
  const sessions = new Map<string, ObjectData>();
  const subscriptions = new Map<string, ObjectData>();
  const invoices = new Map<string, ObjectData>();
  const refunds = new Map<string, ObjectData>();
  const keys = new Map<string, ObjectData>();
  const seen: Array<{ params: unknown; key: string }> = [];
  let loseCheckoutResponse = false;
  let unavailable = false;
  const api = {
    customers: {
      search: async () => ({ data: [] }),
      create: async (params: ObjectData, options: { idempotencyKey: string }) => {
        if (keys.has(options.idempotencyKey)) return keys.get(options.idempotencyKey);
        const customer = { ...params, id: `cus_${crypto.randomUUID()}` };
        customers.set(customer.id, customer); keys.set(options.idempotencyKey, customer); return customer;
      },
      retrieve: async (id: string) => { const value = customers.get(id); assert.ok(value); return value; },
    },
    checkout: { sessions: {
      create: async (params: Stripe.Checkout.SessionCreateParams, options: { idempotencyKey: string }) => {
        seen.push({ params, key: options.idempotencyKey });
        if (keys.has(options.idempotencyKey)) return keys.get(options.idempotencyKey);
        const id = `cs_${crypto.randomUUID()}`;
        const session = { id, customer: params.customer, client_reference_id: params.client_reference_id, metadata: params.metadata,
          currency: "usd", amount_total: params.line_items![0].price_data!.unit_amount, mode: params.mode,
          url: `https://checkout.stripe.com/c/pay/${id}`, expires_at: Math.floor(Date.now() / 1000) + 3600,
          status: "open", payment_status: "unpaid", payment_intent: null, subscription: null, invoice: null };
        sessions.set(id, session); keys.set(options.idempotencyKey, session);
        if (loseCheckoutResponse) { loseCheckoutResponse = false; throw new Error("simulated network interruption after provider accepted request"); }
        return session;
      },
      retrieve: async (id: string) => { if (unavailable) throw new Error("provider unavailable"); const session = sessions.get(id); assert.ok(session); return session; },
    } },
    subscriptions: { retrieve: async (id: string) => { const subscription = subscriptions.get(id); assert.ok(subscription); return subscription; } },
    invoices: {
      retrieve: async (id: string) => { const invoice = invoices.get(id); assert.ok(invoice); return invoice; },
      list: async () => ({ data: [...invoices.values()] }),
    },
    charges: { retrieve: async (id: string) => { const refund = refunds.get(id); assert.ok(refund); return refund; } },
  };
  return { stripe: api as unknown as Stripe, customers, sessions, subscriptions, invoices, refunds, seen,
    loseNextResponse: () => { loseCheckoutResponse = true; }, setUnavailable: () => { unavailable = true; } };
}

function event(type: string, object: ObjectData, created = Math.floor(Date.now() / 1000)) {
  return { id: `evt_${crypto.randomUUID()}`, type, created, data: { object: structuredClone(object) } };
}

async function opened(kind = "ONE_TIME") {
  const p = provider();
  const charge = await reserve(kind);
  await openPlatformBillingCheckout(db, p.stripe, actor, charge, "https://thebeesuite.io");
  const saved = await findPlatformBillingCharge(db, actor, charge.id);
  const session = p.sessions.get(saved.stripeCheckoutSessionId!)!;
  return { ...p, charge: saved, session };
}

function subscriptionFor(charge: PlatformChargeWithAccount, session: ObjectData) {
  return { id: `sub_${crypto.randomUUID()}`, customer: charge.account.stripeCustomerId, metadata: session.metadata,
    status: "active", cancel_at_period_end: false,
    items: { data: [{ quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      price: { currency: "usd", unit_amount: charge.amountCents, recurring: { interval: "month", interval_count: 1 } } }] } };
}

test("migration enforces tenant payer uniqueness, amount bounds, and server-only table permissions", async () => {
  const account = await payer();
  await assert.rejects(() => db.platformBillingAccount.create({ data: { billerTenantId: actor.identityTenantId, customerTenantId: account.customerTenantId, name: "Duplicate", email: "other@example.test" } }), (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002");
  await assert.rejects(() => db.platformBillingCharge.create({ data: { accountId: account.id, createdById: actor.id, requestKey: crypto.randomUUID(), description: "Invalid", kind: "ONE_TIME", amountCents: 1 } }));
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(() => db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      await tx.$queryRaw`SELECT * FROM "PlatformBillingAccount"`;
    }));
  }
});

test("a non-tenant payer supports arbitrary one-time amounts but cannot acquire monthly billing", async () => {
  const account = await payer(false);
  const single = await reserve("ONE_TIME", account.id);
  assert.equal(single.amountCents, 7900);
  await assert.rejects(() => reserve("MONTHLY", account.id), /Monthly fees require a tenant/);
});

test("another platform identity cannot read or charge this payer", async () => {
  const charge = await reserve();
  const other = { ...actor, identityTenantId: "other-platform" };
  await assert.rejects(() => findPlatformBillingCharge(db, other, charge.id), /Charge not found/);
  await assert.rejects(() => reservePlatformBillingCharge(db, other, { requestId: crypto.randomUUID(), accountId: charge.accountId, description: "Out of scope", amount: "79", kind: "ONE_TIME" }), /Payer not found/);
  const result = await readPlatformBillingDashboard(db, other.identityTenantId);
  assert.equal(result.accounts.length, 0); assert.equal(result.charges.length, 0);
});

test("retrying the same request is idempotent and changing its amount is rejected", async () => {
  const account = await payer(); const id = crypto.randomUUID();
  const first = await reserve("ONE_TIME", account.id, id);
  const again = await reserve("ONE_TIME", account.id, id);
  assert.equal(first.id, again.id);
  await assert.rejects(() => reservePlatformBillingCharge(db, actor, { requestId: id, accountId: account.id, description: first.description, amount: "80", kind: "ONE_TIME" }), /different charge/);
});

test("competing monthly requests reserve only one subscription slot", async () => {
  const account = await payer();
  const results = await Promise.allSettled([reserve("MONTHLY", account.id), reserve("MONTHLY", account.id)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal(await db.platformBillingCharge.count({ where: { accountId: account.id } }), 1);
});

test("a lost checkout response retries the original provider request and produces one checkout", async () => {
  const p = provider(); const charge = await reserve(); p.loseNextResponse();
  await assert.rejects(() => openPlatformBillingCheckout(db, p.stripe, actor, charge, "https://thebeesuite.io"), /network interruption/);
  const retry = await findPlatformBillingCharge(db, actor, charge.id);
  const result = await openPlatformBillingCheckout(db, p.stripe, actor, retry, "https://thebeesuite.io");
  assert.ok(result.url); assert.equal(p.sessions.size, 1);
  assert.equal(p.seen[0].key, p.seen[1].key); assert.deepEqual(p.seen[0].params, p.seen[1].params);
  assert.equal((await findPlatformBillingCharge(db, actor, charge.id)).status, "checkout_open");
});

test("completed-but-unpaid checkout remains processing until verified provider settlement", async () => {
  const p = await opened();
  Object.assign(p.session, { status: "complete", payment_status: "unpaid", payment_intent: "pi_processing" });
  await handlePlatformBillingEvent(db, p.stripe, event("checkout.session.completed", p.session), null);
  assert.equal((await findPlatformBillingCharge(db, actor, p.charge.id)).status, "processing");
  Object.assign(p.session, { payment_status: "paid" });
  const success = event("checkout.session.async_payment_succeeded", p.session);
  await handlePlatformBillingEvent(db, p.stripe, success, null);
  await handlePlatformBillingEvent(db, p.stripe, success, null);
  assert.equal((await findPlatformBillingCharge(db, actor, p.charge.id)).status, "paid");
  const balance = await db.$queryRaw<Array<{ balanceCents: number }>>`SELECT "balanceCents" FROM "BillingAccount" WHERE "id" = 'family-preserved'`;
  assert.equal(balance[0].balanceCents, 12345);
});

test("tenant-signed and connected-account events cannot settle platform charges", async () => {
  const p = await opened(); Object.assign(p.session, { status: "complete", payment_status: "paid", payment_intent: "pi_isolation" });
  const e = event("checkout.session.completed", p.session);
  for (const [input, tenant] of [[e, "tenant-forged"], [{ ...e, account: "acct_school" }, null], [{ ...e, context: "acct_other" }, null]] as const) {
    const result = await handlePlatformBillingEvent(db, p.stripe, input, tenant);
    assert.equal(result?.ignored, true);
  }
  assert.equal((await findPlatformBillingCharge(db, actor, p.charge.id)).status, "checkout_open");
});

test("provider amount and customer mismatches leave the charge unsettled", async () => {
  const p = await opened(); const originalAmount = p.session.amount_total;
  Object.assign(p.session, { status: "complete", payment_status: "paid", payment_intent: "pi_mismatch", amount_total: 1 });
  await assert.rejects(() => handlePlatformBillingEvent(db, p.stripe, event("checkout.session.completed", p.session), null), PlatformBillingError);
  Object.assign(p.session, { amount_total: originalAmount, customer: "cus_wrong" });
  await assert.rejects(() => handlePlatformBillingEvent(db, p.stripe, event("checkout.session.completed", p.session), null), PlatformBillingError);
  assert.equal((await findPlatformBillingCharge(db, actor, p.charge.id)).status, "checkout_open");
});

test("provider outages stay retryable rather than acknowledging a paid charge", async () => {
  const p = await opened(); p.setUnavailable();
  await assert.rejects(() => handlePlatformBillingEvent(db, p.stripe, event("checkout.session.completed", p.session), null), PlatformBillingRetryableError);
  assert.equal((await findPlatformBillingCharge(db, actor, p.charge.id)).status, "checkout_open");
});

test("subscription events can arrive before checkout completion and cancellation releases the monthly slot", async () => {
  const p = await opened("MONTHLY"); const sub = subscriptionFor(p.charge, p.session); p.subscriptions.set(sub.id, sub);
  Object.assign(p.session, { status: "complete", payment_status: "paid", subscription: sub.id });
  await handlePlatformBillingEvent(db, p.stripe, event("customer.subscription.created", sub), null);
  await handlePlatformBillingEvent(db, p.stripe, event("checkout.session.completed", p.session), null);
  const active = await findPlatformBillingCharge(db, actor, p.charge.id);
  assert.equal(active.status, "active"); assert.equal(active.stripeSubscriptionId, sub.id);
  await assert.rejects(() => reserve("MONTHLY", p.charge.accountId), /outstanding monthly/);
  Object.assign(sub, { status: "canceled" });
  await handlePlatformBillingEvent(db, p.stripe, event("customer.subscription.deleted", sub), null);
  assert.equal((await findPlatformBillingCharge(db, actor, p.charge.id)).recurringKey, null);
  assert.ok(await reserve("MONTHLY", p.charge.accountId));
});

test("invoice failures and recovery keep one durable invoice without touching family balances", async () => {
  const p = await opened("MONTHLY"); const sub = subscriptionFor(p.charge, p.session); p.subscriptions.set(sub.id, sub);
  Object.assign(p.session, { status: "complete", payment_status: "paid", subscription: sub.id });
  await handlePlatformBillingEvent(db, p.stripe, event("checkout.session.completed", p.session), null);
  const invoice = { id: `in_${crypto.randomUUID()}`, number: "BEE-001", customer: p.charge.account.stripeCustomerId,
    metadata: {}, parent: { subscription_details: { subscription: sub.id, metadata: p.session.metadata } },
    currency: "usd", total: 7900, amount_due: 7900, amount_paid: 0, status: "open",
    hosted_invoice_url: "https://invoice.stripe.com/i/platform/invoice", status_transitions: { paid_at: null as number | null } };
  p.invoices.set(invoice.id, invoice);
  await handlePlatformBillingEvent(db, p.stripe, event("invoice.payment_failed", invoice), null);
  assert.equal((await db.platformBillingInvoice.findUniqueOrThrow({ where: { stripeInvoiceId: invoice.id } })).status, "payment_failed");
  Object.assign(invoice, { status: "paid", amount_paid: 7900, status_transitions: { paid_at: Math.floor(Date.now() / 1000) } });
  await handlePlatformBillingEvent(db, p.stripe, event("invoice.paid", invoice), null);
  await handlePlatformBillingEvent(db, p.stripe, event("invoice.payment_failed", invoice, 1), null);
  await syncPlatformBillingCharge(db, p.stripe, await findPlatformBillingCharge(db, actor, p.charge.id));
  const rows = await db.platformBillingInvoice.findMany({ where: { stripeInvoiceId: invoice.id } });
  assert.equal(rows.length, 1); assert.equal(rows[0].status, "paid"); assert.equal(rows[0].amountPaidCents, 7900);
});

test("an expired unpaid monthly checkout releases its slot while unrelated school events stay on the existing handler", async () => {
  const p = await opened("MONTHLY"); Object.assign(p.session, { status: "expired" });
  await handlePlatformBillingEvent(db, p.stripe, event("checkout.session.expired", p.session), null);
  assert.equal((await findPlatformBillingCharge(db, actor, p.charge.id)).status, "expired");
  assert.ok(await reserve("MONTHLY", p.charge.accountId));
  const unrelated = event("invoice.paid", { metadata: { paymentScope: "school_software_fee" } });
  assert.equal(await handlePlatformBillingEvent(db, p.stripe, unrelated, null), null);
});

test("settled one-time payments cannot be downgraded by a delayed unpaid snapshot", async () => {
  const p = await opened(); Object.assign(p.session, { status: "complete", payment_status: "paid", payment_intent: "pi_final" });
  await handlePlatformBillingEvent(db, p.stripe, event("checkout.session.completed", p.session), null);
  Object.assign(p.session, { payment_status: "unpaid" });
  await handlePlatformBillingEvent(db, p.stripe, event("checkout.session.completed", p.session, 1), null);
  assert.equal((await findPlatformBillingCharge(db, actor, p.charge.id)).status, "paid");
});

test("out-of-order refunds remain visible after a later checkout completion event", async () => {
  const p = await opened();
  const refund = { id: "ch_refund", amount: 7900, amount_refunded: 2000, currency: "usd", payment_intent: "pi_refunded", customer: p.charge.account.stripeCustomerId, metadata: p.session.metadata };
  p.refunds.set(refund.id, refund);
  await handlePlatformBillingEvent(db, p.stripe, event("charge.refunded", refund), null);
  assert.equal((await findPlatformBillingCharge(db, actor, p.charge.id)).status, "partially_refunded");
  Object.assign(p.session, { status: "complete", payment_status: "paid", payment_intent: "pi_refunded" });
  await handlePlatformBillingEvent(db, p.stripe, event("checkout.session.completed", p.session), null);
  assert.equal((await findPlatformBillingCharge(db, actor, p.charge.id)).refundedAmountCents, 2000);
  Object.assign(refund, { amount_refunded: 7900 });
  await handlePlatformBillingEvent(db, p.stripe, event("charge.refunded", refund), null);
  assert.equal((await findPlatformBillingCharge(db, actor, p.charge.id)).status, "refunded");
});

test("reopening a checkout validates its customer and amount before exposing the payment link", async () => {
  const p = await opened(); Object.assign(p.session, { amount_total: 1 });
  await assert.rejects(() => openPlatformBillingCheckout(db, p.stripe, actor, p.charge, "https://thebeesuite.io"), /identity mismatch/);
});

test("ambiguous drafts older than the provider idempotency window do not create another payment", async () => {
  const p = provider(); const charge = await reserve();
  await db.platformBillingCharge.update({ where: { id: charge.id }, data: { createdAt: new Date(Date.now() - 25 * 3600000) } });
  await assert.rejects(() => findPlatformBillingCharge(db, actor, charge.id).then((old) => openPlatformBillingCheckout(db, p.stripe, actor, old, "https://thebeesuite.io")), /provider review/);
  assert.equal(p.sessions.size, 0);
});

test("an active subscription outranks a checkout snapshot that has not attached its subscription yet", async () => {
  const p = await opened("MONTHLY"); const sub = subscriptionFor(p.charge, p.session); p.subscriptions.set(sub.id, sub);
  await handlePlatformBillingEvent(db, p.stripe, event("customer.subscription.created", sub), null);
  await handlePlatformBillingEvent(db, p.stripe, event("checkout.session.completed", p.session), null);
  const latest = await findPlatformBillingCharge(db, actor, p.charge.id);
  assert.equal(latest.status, "active"); assert.equal(latest.recurringKey, latest.accountId);
});

test("an older monthly agreement remains manageable after more than 100 newer charges", async () => {
  const charge = await reserve("MONTHLY");
  await db.platformBillingCharge.update({ where: { id: charge.id }, data: { createdAt: new Date("2020-01-01") } });
  await db.platformBillingCharge.createMany({ data: Array.from({ length: 101 }, () => ({
    accountId: charge.accountId, createdById: actor.id, requestKey: crypto.randomUUID(), description: "Recent one-time fee", kind: "ONE_TIME", amountCents: 500,
  })) });
  const dashboard = await readPlatformBillingDashboard(db, actor.identityTenantId);
  assert.ok(dashboard.charges.some((row) => row.id === charge.id));
});
