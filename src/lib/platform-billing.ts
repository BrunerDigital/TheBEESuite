import { Prisma, type PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import type { CurrentUser } from "@/lib/auth";
import {
  billingText, PLATFORM_PAYMENT_SCOPE, PlatformBillingError, platformBillingAmount,
  platformBillingEmail, platformBillingRequestId, platformCheckoutUrl,
  platformObjectMetadata, stripeId,
} from "@/lib/platform-billing-policy";
import { platformCheckoutParams } from "@/lib/platform-billing-stripe";

type Actor = Pick<CurrentUser, "id" | "identityTenantId">;
type Db = PrismaClient;
const accountInclude = { account: true } as const;
export type PlatformChargeWithAccount = Prisma.PlatformBillingChargeGetPayload<{ include: typeof accountInclude }>;

export function validatePlatformBillingCheckout(charge: PlatformChargeWithAccount, session: Stripe.Checkout.Session) {
  const metadata = platformObjectMetadata(session);
  if (metadata.platformChargeId !== charge.id || metadata.platformAccountId !== charge.accountId
    || metadata.billerTenantId !== charge.account.billerTenantId || metadata.paymentScope !== PLATFORM_PAYMENT_SCOPE
    || (charge.account.stripeCustomerId && stripeId(session.customer) !== charge.account.stripeCustomerId)
    || session.client_reference_id !== charge.id || session.currency !== "usd" || session.amount_total !== charge.amountCents
    || session.mode !== (charge.kind === "MONTHLY" ? "subscription" : "payment")
    || (charge.stripeCheckoutSessionId && charge.stripeCheckoutSessionId !== session.id)) {
    throw new PlatformBillingError("Platform checkout amount or identity mismatch.", 409);
  }
}

function audit(actor: Actor, action: string, resourceId: string, metadata: Prisma.InputJsonObject = {}) {
  return { tenantId: actor.identityTenantId, userId: actor.id, action, resource: "PlatformBilling", resourceId, metadata };
}

export async function createPlatformBillingAccount(db: Db, actor: Actor, input: Record<string, unknown>) {
  const id = `pbacct_${platformBillingRequestId(input.requestId)}`;
  const name = billingText(input.name, "payer name", 160);
  const email = platformBillingEmail(input.email);
  const customerTenantId = input.customerTenantId ? billingText(input.customerTenantId, "tenant", 100) : null;
  if (customerTenantId && !await db.tenant.findUnique({ where: { id: customerTenantId }, select: { id: true } })) {
    throw new PlatformBillingError("Tenant not found.", 404);
  }
  const where = customerTenantId
    ? { billerTenantId_customerTenantId: { billerTenantId: actor.identityTenantId, customerTenantId } }
    : { id };
  const existing = await db.platformBillingAccount.findUnique({ where });
  if (existing) {
    if (existing.billerTenantId !== actor.identityTenantId || existing.name !== name || existing.email !== email) {
      throw new PlatformBillingError("This payer already has a billing profile. Use the existing profile.", 409);
    }
    return existing;
  }
  try {
    return await db.$transaction(async (tx) => {
      const account = await tx.platformBillingAccount.create({ data: { id, name, email, customerTenantId, billerTenantId: actor.identityTenantId } });
      await tx.auditLog.create({ data: audit(actor, "billing.platform.account_created", account.id, { customerTenantId }) });
      return account;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const account = await db.platformBillingAccount.findUnique({ where });
      if (account?.billerTenantId === actor.identityTenantId && account.name === name && account.email === email) return account;
      throw new PlatformBillingError("This tenant already has a billing profile. Refresh the payer list.", 409);
    }
    throw error;
  }
}

export async function reservePlatformBillingCharge(db: Db, actor: Actor, input: Record<string, unknown>) {
  const requestId = platformBillingRequestId(input.requestId);
  const accountId = billingText(input.accountId, "payer", 100);
  const description = billingText(input.description, "charge description", 200);
  const amountCents = platformBillingAmount(input.amount);
  if (input.kind !== "ONE_TIME" && input.kind !== "MONTHLY") throw new PlatformBillingError("Choose a one-time charge or monthly tenant fee.");
  const kind = input.kind;
  const account = await db.platformBillingAccount.findFirst({ where: { id: accountId, billerTenantId: actor.identityTenantId } });
  if (!account) throw new PlatformBillingError("Payer not found.", 404);
  if (kind === "MONTHLY" && !account.customerTenantId) throw new PlatformBillingError("Monthly fees require a tenant billing profile.");
  const requestKey = `${actor.identityTenantId}:${requestId}`;
  function assertSame(charge: PlatformChargeWithAccount) {
    if (charge.accountId !== accountId || charge.description !== description || charge.amountCents !== amountCents || charge.kind !== kind) {
      throw new PlatformBillingError("This request ID was already used for a different charge. Refresh before creating a new charge.", 409);
    }
    return charge;
  }
  const prior = await db.platformBillingCharge.findUnique({ where: { requestKey }, include: accountInclude });
  if (prior) return assertSame(prior);
  try {
    return await db.$transaction(async (tx) => {
      const charge = await tx.platformBillingCharge.create({ data: {
        id: `pbcharge_${requestId}`, accountId, createdById: actor.id, requestKey,
        description, amountCents, kind, recurringKey: kind === "MONTHLY" ? accountId : null,
      }, include: accountInclude });
      await tx.auditLog.create({ data: audit(actor, "billing.platform.charge_created", charge.id, { accountId, kind, amountCents, description }) });
      return charge;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const charge = await db.platformBillingCharge.findUnique({ where: { requestKey }, include: accountInclude });
      if (charge) return assertSame(charge);
      throw new PlatformBillingError("This tenant already has an outstanding monthly request or subscription. Review it before creating another.", 409);
    }
    throw error;
  }
}

export async function findPlatformBillingCharge(db: Db, actor: Actor, chargeId: unknown) {
  const id = billingText(chargeId, "charge", 100);
  const charge = await db.platformBillingCharge.findFirst({ where: { id, account: { billerTenantId: actor.identityTenantId } }, include: accountInclude });
  if (!charge) throw new PlatformBillingError("Charge not found.", 404);
  return charge;
}

export async function openPlatformBillingCheckout(db: Db, stripe: Stripe, actor: Actor, charge: PlatformChargeWithAccount, returnBaseUrl: string) {
  if (charge.account.billerTenantId !== actor.identityTenantId) throw new PlatformBillingError("Charge not found.", 404);
  if (charge.stripeCheckoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(charge.stripeCheckoutSessionId);
    validatePlatformBillingCheckout(charge, session);
    if (session.status !== "open" || !session.url || !platformCheckoutUrl(session.url)) {
      throw new PlatformBillingError("This checkout is no longer open. Refresh its status before creating another charge.", 409);
    }
    return { id: charge.id, url: session.url };
  }
  if (charge.status !== "draft") throw new PlatformBillingError("This request cannot open a new checkout.", 409);
  // Stripe forgets idempotency keys after 24 hours. Ambiguous old attempts need review.
  if (Date.now() - charge.createdAt.getTime() > 23 * 60 * 60 * 1000) {
    throw new PlatformBillingError("This unfinished request needs payment-provider review before retrying. A new checkout was not created.", 409);
  }
  let customerId = charge.account.stripeCustomerId;
  if (!customerId) {
    const matches = await stripe.customers.search({ query: `metadata['platformAccountId']:'${charge.account.id}' AND metadata['paymentScope']:'${PLATFORM_PAYMENT_SCOPE}'`, limit: 2 });
    if (matches.data.length > 1) throw new PlatformBillingError("Multiple payment profiles require platform review.", 409);
    const customer = matches.data[0] || await stripe.customers.create({
      name: charge.account.name, email: charge.account.email,
      metadata: { paymentScope: PLATFORM_PAYMENT_SCOPE, platformAccountId: charge.account.id, billerTenantId: actor.identityTenantId },
    }, { idempotencyKey: `platform-customer:${charge.account.id}` });
    customerId = customer.id;
    await db.platformBillingAccount.updateMany({ where: { id: charge.accountId, billerTenantId: actor.identityTenantId, stripeCustomerId: null }, data: { stripeCustomerId: customerId } });
    const saved = await db.platformBillingAccount.findUniqueOrThrow({ where: { id: charge.accountId } });
    if (saved.stripeCustomerId !== customerId) throw new PlatformBillingError("The billing profile changed. Refresh before continuing.", 409);
  }
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || customer.metadata.paymentScope !== PLATFORM_PAYMENT_SCOPE || customer.metadata.platformAccountId !== charge.accountId || customer.metadata.billerTenantId !== actor.identityTenantId) {
    throw new PlatformBillingError("The payer's payment profile does not match this BEE Suite billing account.", 409);
  }
  const session = await stripe.checkout.sessions.create(platformCheckoutParams({
    ...charge, customerId, billerTenantId: actor.identityTenantId, returnBaseUrl,
  }), { idempotencyKey: `platform-checkout:${charge.id}` });
  if (!session.url || !platformCheckoutUrl(session.url)) throw new PlatformBillingError("The payment provider did not return a secure checkout link.", 502);
  await db.$transaction(async (tx) => {
    // The webhook can settle the request before this API receives its response.
    await tx.platformBillingCharge.updateMany({ where: { id: charge.id, status: "draft", stripeCheckoutSessionId: null }, data: {
      stripeCheckoutSessionId: session.id, checkoutUrl: session.url, checkoutExpiresAt: new Date(session.expires_at * 1000), status: "checkout_open",
    } });
    await tx.auditLog.create({ data: audit(actor, "billing.platform.checkout_created", charge.id, { checkoutSessionId: session.id }) });
  });
  return { id: charge.id, url: session.url };
}

export async function readPlatformBillingDashboard(db: Db, billerTenantId: string) {
  const include = { account: { select: { name: true, email: true } }, invoices: { orderBy: { createdAt: "desc" as const }, take: 12 } };
  const [tenants, accounts, recentCharges, monthlyCharges] = await Promise.all([
    db.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.platformBillingAccount.findMany({ where: { billerTenantId }, select: { id: true, name: true, email: true, customerTenantId: true, customerTenant: { select: { name: true } } }, orderBy: { name: "asc" } }),
    db.platformBillingCharge.findMany({ where: { account: { billerTenantId } }, include, orderBy: { createdAt: "desc" }, take: 100 }),
    db.platformBillingCharge.findMany({ where: { account: { billerTenantId }, recurringKey: { not: null } }, include, orderBy: { createdAt: "desc" } }),
  ]);
  const charges = [...new Map([...recentCharges, ...monthlyCharges].map((c) => [c.id, c])).values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return { tenants, accounts: accounts.map((a) => ({ id: a.id, name: a.name, email: a.email, customerTenantId: a.customerTenantId, tenantName: a.customerTenant?.name || null })), charges: charges.map((c) => ({
    id: c.id, accountId: c.accountId, name: c.account.name, email: c.account.email, description: c.description,
    kind: c.kind, amountCents: c.amountCents, status: c.status, cancelAtPeriodEnd: c.cancelAtPeriodEnd,
    checkoutUrl: c.status === "checkout_open" && platformCheckoutUrl(c.checkoutUrl) && c.checkoutExpiresAt && c.checkoutExpiresAt > new Date() ? c.checkoutUrl : null,
    hasSubscription: Boolean(c.stripeSubscriptionId), currentPeriodEnd: c.currentPeriodEnd?.toISOString() || null,
    createdAt: c.createdAt.toISOString(), paidAt: c.paidAt?.toISOString() || null, refundedAmountCents: c.refundedAmountCents,
    invoices: c.invoices.map((i) => ({ id: i.id, number: i.number, status: i.status, amountDueCents: i.amountDueCents, amountPaidCents: i.amountPaidCents, hostedInvoiceUrl: i.hostedInvoiceUrl })),
  })) };
}

export type PlatformBillingDashboard = Awaited<ReturnType<typeof readPlatformBillingDashboard>>;
