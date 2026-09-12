import { createHash } from "node:crypto";
import { PaymentStatus, Prisma, type PrismaClient } from "@prisma/client";
import { activeStripeCheckoutPaymentSummary, isActiveStripeCheckoutPayment, jsonRecord } from "@/lib/billing-guardrails";
import { createStripeCheckoutSession, createStripeCustomer, type IntegrationSendResult } from "@/lib/integrations";
import { createStripePaymentClaim, reconcileIdempotentStripeSubmission, stripePaymentClaimConflict } from "@/lib/stripe-payment-claims";
import { resolveStripeCheckoutDraftBlocker } from "@/lib/stripe-checkout-drafts";
import { stripeCustomerCustomFieldPatch, stripeCustomerIdForAccount } from "@/lib/stripe-customer-scope";
import { prisma } from "@/lib/prisma";
import { readStripeConnectAccountId } from "@/lib/stripe-connect-readiness";
import { invoiceCheckoutSessionIdentityMatches, invoiceCheckoutSessionRequestMatches } from "@/lib/invoice-checkout-session";
import { retrySerialization } from "@/lib/retry-serialization";
import { invoiceResponsibilityReviewExempt, invoiceResponsibilitySeparation } from "@/lib/invoice-responsibility-separation";
import { AGENCY_LEDGER_ENTRY_TYPES, AGENCY_LEDGER_SOURCE_SYSTEM, paymentCollectionResponsibilityHoldRequired } from "@/lib/parent-billing-visibility";
import { invoiceCheckoutAmountsAndFieldsMatch, invoiceCheckoutAttemptIdentityMatches, invoiceCheckoutAttemptMatches, invoiceCheckoutPreparation, newInvoiceCheckoutAttempt,
  type InvoiceCheckoutAttempt, type InvoiceCheckoutCustomerRequest, type InvoiceCheckoutRequest, type InvoiceCheckoutTopology } from "@/lib/invoice-checkout-attempt";

const pendingMessage = "Payment confirmation is pending. Another payment will not be started. Refresh to review this attempt or contact the school if it remains unresolved.";
const jsonInput = (value: Record<string, unknown>) => value as Prisma.InputJsonObject;
type Database = Pick<PrismaClient, "$transaction" | "payment" | "billingAccount">;
type CheckoutResult = { ok: boolean; statusCode: number; error?: string; paymentId?: string; url?: string; stripeSessionId?: string;
  status?: string; configured?: boolean; pendingPayment?: ReturnType<typeof activeStripeCheckoutPaymentSummary> };

/** Shared by authenticated invoice Checkout and the validated signed-link route. */
export async function startInvoiceCheckout(input: {
  topology: InvoiceCheckoutTopology; billingAccountId: string; invoiceId: string; invoiceTotalCents: number;
  request: InvoiceCheckoutRequest; customer: InvoiceCheckoutCustomerRequest;
  keyPrefix: InvoiceCheckoutAttempt["keyPrefix"]; fields: Record<string, unknown>;
  authorize: (tx: Prisma.TransactionClient) => Promise<boolean>;
  authorizeRequest?: () => Promise<boolean>;
  audit: (tx: Prisma.TransactionClient, paymentId: string, session: IntegrationSendResult) => Promise<void>;
  database?: Database;
  submitCheckout?: typeof createStripeCheckoutSession;
  submitCustomer?: typeof createStripeCustomer;
  resolveDraft?: typeof resolveStripeCheckoutDraftBlocker;
  now?: () => Date;
}): Promise<CheckoutResult> {
  const { topology, billingAccountId, invoiceId, invoiceTotalCents, keyPrefix, authorize, audit,
    database = prisma, submitCheckout = createStripeCheckoutSession, submitCustomer = createStripeCustomer,
    resolveDraft = resolveStripeCheckoutDraftBlocker, now = () => new Date() } = input;
  // Capture all inputs once; concurrent caller mutation cannot alter an in-flight retry.
  const request = structuredClone(input.request), customer = structuredClone(input.customer), fields = structuredClone(input.fields);
  if (!invoiceCheckoutAmountsAndFieldsMatch({ invoiceTotalCents, request, fields })) {
    return { ok: false, statusCode: 409, error: "Payment details changed. Refresh before continuing." };
  }
  delete request.customerId;
  // A fallback mode has a different provider key. Keep one deterministic mode
  // per Payment so later capability/config changes cannot create two Sessions.
  request.allowPaymentMethodFallback = false;
  request.metadata = { ...request.metadata, stripeCustomerId: "", billingAccountId, accountCreditAppliedCents: "0" };
  const preparation = invoiceCheckoutPreparation({ topology, billingAccountId, invoiceId, request, customer, keyPrefix, now: now() });
  const reject = (paymentId?: string, error = pendingMessage): CheckoutResult => ({ ok: false, statusCode: 409, error, paymentId });
  const pending = (paymentId: string): CheckoutResult => ({ ...reject(paymentId), statusCode: 503, status: "confirmation_pending" });
  const active = await database.payment.findMany({ where: { billingAccountId, provider: { in: ["stripe", "stripe_terminal"] }, status: PaymentStatus.DRAFT },
    select: { id: true, amountCents: true, status: true, provider: true, externalIdPlaceholder: true, customFields: true }, orderBy: { id: "asc" } });
  const blockers = active.filter(payment => stripePaymentClaimConflict({ scope: "invoice_collection", invoiceId, payment }));
  if (blockers.length > 1) return reject();
  let existing: (typeof active)[number] | null = blockers[0] ?? null;
  if (existing && (!isActiveStripeCheckoutPayment(existing) || jsonRecord(existing.customFields).invoiceId !== invoiceId)) return reject(existing.id);

  const authorizeClaim = async (tx: Prisma.TransactionClient) => {
    if (!await authorize(tx)) return false;
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, billingAccountId, status: PaymentStatus.OPEN, totalCents: invoiceTotalCents },
      include: { items: { select: { description: true } }, billingAccount: { include: {
        family: { include: { children: { select: { id: true, customFields: true } } } },
        ledgerEntries: { where: { OR: [{ type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } }, { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM }] },
          select: { type: true, sourceSystem: true, amountCents: true, invoiceId: true, externalId: true, metadata: true } },
      } } } });
    if (!invoice) return false;
    return invoiceResponsibilityReviewExempt(invoice.customFields, invoice.totalCents, ...invoice.billingAccount.family.children)
      || !paymentCollectionResponsibilityHoldRequired({ accountBalanceCents: invoice.billingAccount.balanceCents,
        agencyLedgerEntries: invoice.billingAccount.ledgerEntries, invoiceId, enforceCollectionHold: true,
        invoiceResponsibilitySeparated: invoiceResponsibilitySeparation(invoice.customFields) !== null,
        responsibilityEvidence: [invoice.customFields, invoice.items.map(item => item.description)] });
  };
  const claim = async (existingPaymentId: string | null, amountCents = invoiceTotalCents) => {
    if (input.authorizeRequest && !await input.authorizeRequest()) {
      return { created: false as const, blockingPaymentId: existingPaymentId, reason: "payment_authority_changed" as const };
    }
    return createStripePaymentClaim({
    database, billingAccountId, scope: "invoice_collection", invoiceId, existingPaymentId,
    expectedInvoiceTotalCents: invoiceTotalCents, expectedAccountCreditAppliedCents: 0, accountCreditPolicy: "preserve",
    expectedTopology: topology, authorize: authorizeClaim,
    paymentData: { amountCents, provider: "stripe", status: PaymentStatus.DRAFT, externalIdPlaceholder: "checkout_session_pending",
      customFields: jsonInput({ ...fields, invoiceId, invoiceAmountCents: invoiceTotalCents, paymentScope: "invoice", accountCreditAppliedCents: 0,
        stripeConnectedAccountId: topology.connectedAccountId, status: "checkout_pending", checkoutPreparationV1: preparation }) },
    });
  };

  if (existing && activeStripeCheckoutPaymentSummary(existing).stripeCheckoutSessionId) {
    const existingClaim = await claim(existing.id, existing.amountCents);
    if (!existingClaim.created) return reject(existingClaim.blockingPaymentId ?? undefined);
    const known = existingClaim.payment;
    const saved = jsonRecord(known.customFields);
    const knownSessionId = activeStripeCheckoutPaymentSummary(known).stripeCheckoutSessionId!;
    if (known.externalIdPlaceholder?.startsWith("cs_") && known.externalIdPlaceholder !== knownSessionId) return reject(known.id);
    const recordedAccount = saved.stripeConnectedAccountId;
    if (!(recordedAccount === null || typeof recordedAccount === "string" && recordedAccount.startsWith("acct_"))) return reject(known.id);
    const account = await database.billingAccount.findUnique({ where: { id: billingAccountId }, select: { customFields: true } });
    const knownCustomer = stripeCustomerIdForAccount(account?.customFields, recordedAccount);
    if (!knownCustomer || saved.stripeCustomerId !== knownCustomer || saved.stripeCustomerConnectedAccountId !== recordedAccount
      || Number(saved.accountCreditAppliedCents ?? 0) !== 0) return reject(known.id);
    const knownRequest = { ...request, customerId: knownCustomer, metadata: { ...request.metadata, stripeCustomerId: knownCustomer } };
    const actualCandidate = newInvoiceCheckoutAttempt({ topology, billingAccountId, invoiceId, request: knownRequest, keyPrefix, now: now() });
    const identityMatches = recordedAccount === topology.connectedAccountId
      && (!saved.checkoutPreparationV1 || invoiceCheckoutAttemptIdentityMatches(saved.checkoutPreparationV1, preparation))
      && (!saved.checkoutAttemptV1 || invoiceCheckoutAttemptIdentityMatches(saved.checkoutAttemptV1, actualCandidate));
    const resolution = await resolveDraft({ payment: existingClaim.payment, connectedAccountId: topology.connectedAccountId, tenantId: topology.tenantId,
      database,
      validateSession: session => invoiceCheckoutSessionIdentityMatches({ session, sessionId: knownSessionId, paymentId: known.id,
        invoiceId, customerId: knownCustomer, topology: { ...topology, connectedAccountId: recordedAccount }, originalPrincipalCents: known.amountCents }),
      canResumeSession: session => identityMatches && invoiceCheckoutSessionRequestMatches(session, knownRequest),
      scope: "invoice", requestedPaymentMethodCategory: request.paymentMethodCategory, expectedAmountCents: invoiceTotalCents,
      expectedCheckoutTotalCents: request.amountCents, expectedFeeDisclosureVersion: typeof fields.feeDisclosureVersion === "string" ? fields.feeDisclosureVersion : undefined });
    if (!resolution.blocked && resolution.url) return { ok: true, statusCode: 200, status: "checkout_session_reused", url: resolution.url,
      paymentId: existing.id, stripeSessionId: resolution.pendingPayment?.stripeCheckoutSessionId ?? undefined };
    if (resolution.blocked) return { ...reject(existing.id, resolution.message || pendingMessage), pendingPayment: resolution.pendingPayment };
    existing = null;
  }
  if (existing && !invoiceCheckoutAttemptMatches(jsonRecord(existing.customFields).checkoutPreparationV1, preparation, now())) return reject(existing.id);
  const claimed = await claim(existing?.id ?? null);
  if (!claimed.created) return reject(claimed.blockingPaymentId ?? undefined);
  const payment = claimed.payment;
  if (!invoiceCheckoutAttemptMatches(jsonRecord(payment.customFields).checkoutPreparationV1, preparation, now())) return reject(payment.id);
  const originalPreparation = jsonRecord(jsonRecord(payment.customFields).checkoutPreparationV1);
  let expectedAttempt: InvoiceCheckoutAttempt | null = null;

  async function withDraft<T>(operation: (tx: Prisma.TransactionClient, fresh: typeof payment) => Promise<T>): Promise<T | null> {
    return retrySerialization(() => database.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BillingAccount" WHERE "id" = ${billingAccountId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`);
      const fresh = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!fresh || fresh.status !== PaymentStatus.DRAFT || fresh.billingAccountId !== billingAccountId) return null;
      if (!invoiceCheckoutAttemptMatches(jsonRecord(fresh.customFields).checkoutPreparationV1, preparation, now())) return null;
      if (expectedAttempt && !invoiceCheckoutAttemptMatches(jsonRecord(fresh.customFields).checkoutAttemptV1, expectedAttempt, now())) return null;
      return operation(tx, fresh);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
  async function markUnknown() {
    await withDraft(async (tx, fresh) => {
      const saved = jsonRecord(fresh.customFields);
      if (["checkout_created", "paid_processing"].includes(String(saved.status))) return;
      await tx.payment.update({ where: { id: fresh.id }, data: { customFields: jsonInput({ ...saved,
        status: "checkout_submission_unknown", submissionStateUnknownAt: now().toISOString(), submissionRetryUsesPaymentId: fresh.id }) } });
    });
  }
  let stripeCustomerId = stripeCustomerIdForAccount((await database.billingAccount.findUnique({ where: { id: billingAccountId }, select: { customFields: true } }))?.customFields, topology.connectedAccountId);
  const savedAttempt = jsonRecord(jsonRecord(payment.customFields).checkoutAttemptV1);
  if (typeof savedAttempt.customerId === "string") {
    if (stripeCustomerId !== savedAttempt.customerId) return reject(payment.id);
    stripeCustomerId = savedAttempt.customerId;
  }
  if (!stripeCustomerId) {
    if (!(await claim(payment.id)).created) return reject(payment.id);
    // Both routes use identical account-level customer parameters and keys, not
    // the signed-link recipient or request-specific source.
    const customerKey = `invoice-customer:${createHash("sha256").update(JSON.stringify([topology.tenantId, billingAccountId, topology.connectedAccountId])).digest("hex")}`;
    const response = await reconcileIdempotentStripeSubmission(() => submitCustomer({ ...customer, idempotencyKey: customerKey }));
    if (!response.resolved || !response.value.ok || !response.value.id?.startsWith("cus_")) { await markUnknown(); return pending(payment.id); }
    const customerId = response.value.id;
    const mapping = await withDraft(async (tx) => {
      const account = await tx.billingAccount.findUniqueOrThrow({ where: { id: billingAccountId } });
      const currentCenter = await tx.center.findFirst({ where: { id: topology.centerId,
        organization: { tenantId: topology.tenantId } }, select: { customFields: true } });
      if (!currentCenter || readStripeConnectAccountId(currentCenter.customFields) !== topology.connectedAccountId) return false;
      const current = stripeCustomerIdForAccount(account.customFields, topology.connectedAccountId);
      if (current && current !== customerId) return false;
      if (!current) await tx.billingAccount.update({ where: { id: billingAccountId }, data: { customFields: jsonInput({ ...jsonRecord(account.customFields),
        ...stripeCustomerCustomFieldPatch(account.customFields, customerId, topology.connectedAccountId) }) } });
      return true;
    });
    if (!mapping) return reject(payment.id);
    stripeCustomerId = customerId;
  }
  const checkoutRequest: InvoiceCheckoutRequest = { ...request, customerId: stripeCustomerId, metadata: { ...request.metadata, stripeCustomerId } };
  const candidate = newInvoiceCheckoutAttempt({ topology, billingAccountId, invoiceId, request: checkoutRequest, keyPrefix, now: now() });
  const prepared = await withDraft(async (tx, fresh) => {
    const saved = jsonRecord(fresh.customFields);
    if (saved.checkoutAttemptV1 && !invoiceCheckoutAttemptMatches(saved.checkoutAttemptV1, candidate, now())) return false;
    if (!saved.checkoutAttemptV1) await tx.payment.update({ where: { id: payment.id }, data: { customFields: jsonInput({ ...saved,
      stripeCustomerId, stripeCustomerConnectedAccountId: topology.connectedAccountId,
      checkoutAttemptV1: { ...candidate, startedAt: originalPreparation.startedAt, retryUntil: originalPreparation.retryUntil } }) } });
    return true;
  });
  if (!prepared) return reject(payment.id);
  expectedAttempt = candidate;
  // Revalidate topology/authority immediately before the provider mutation too.
  const submissionClaim = await claim(payment.id);
  if (!submissionClaim.created
    || !invoiceCheckoutAttemptMatches(jsonRecord(submissionClaim.payment.customFields).checkoutAttemptV1, candidate, now())) return reject(payment.id);
  const submission = await reconcileIdempotentStripeSubmission(() => submitCheckout({ ...checkoutRequest,
    metadata: { ...checkoutRequest.metadata, paymentId: payment.id }, idempotencyKey: `${keyPrefix}:${payment.id}` }));
  if (!submission.resolved) { await markUnknown(); return pending(payment.id); }
  const session = submission.value;
  if (session.ok && (!session.id || !session.url)) { await markUnknown(); return pending(payment.id); }
  const finalized = await withDraft(async (tx, fresh) => {
    const saved = jsonRecord(fresh.customFields);
    if (["checkout_created", "paid_processing"].includes(String(saved.status))) return { alreadyFinalized: true,
      canReturnUrl: saved.status === "checkout_created" && saved.stripeCheckoutSessionId === session.id };
    if (!session.ok) {
      // Another request's indeterminate result cannot be downgraded to failure.
      if (saved.status === "checkout_submission_unknown") return { alreadyFinalized: true, canReturnUrl: false };
      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED, externalIdPlaceholder: "stripe_checkout_failed",
        customFields: jsonInput({ ...saved, status: "checkout_failed", stripeProviderStatus: session.providerStatus ?? null,
          checkoutFailedAt: now().toISOString() }) } });
      await tx.center.update({ where: { id: topology.centerId }, data: { updatedAt: now() } });
      return { alreadyFinalized: false, canReturnUrl: false };
    }
    await tx.payment.update({ where: { id: payment.id }, data: { externalIdPlaceholder: session.id,
      customFields: jsonInput({ ...saved, stripeCheckoutSessionId: session.id, stripeCheckoutSessionCreatedAt: session.createdAt ?? null,
        stripeCheckoutSessionExpiresAt: session.expiresAt ?? null, stripeCheckoutSessionStatus: session.status ?? null,
        stripeCheckoutPaymentStatus: session.paymentStatus ?? null, status: "checkout_created" }) } });
    await audit(tx, payment.id, session);
    return { alreadyFinalized: false, canReturnUrl: true };
  });
  if (!finalized) return reject(payment.id, "This payment changed while confirmation arrived. Refresh to review its recorded status before continuing.");
  if (!session.ok) return finalized.alreadyFinalized ? pending(payment.id) : { ok: false, statusCode: session.configured ? 502 : 503,
    configured: session.configured, error: "Payment checkout could not be created. Refresh before trying again.", paymentId: payment.id };
  if (!finalized.canReturnUrl) return reject(payment.id);
  return { ok: true, statusCode: 200, url: session.url, stripeSessionId: session.id, paymentId: payment.id };
}
