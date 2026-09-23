import { INSTANT_BANK_CHECKOUT_UNAVAILABLE_MESSAGE } from "@/lib/parent-payment-errors";
import { PaymentStatus, Prisma, type Payment, type PrismaClient } from "@prisma/client";
import { activeStripeCheckoutPaymentSummary, jsonRecord } from "./billing-guardrails";
import { createStripeCheckoutSession, createStripeCustomer, createStripeOffSessionPaymentIntent, retrieveStripePaymentIntent, type IntegrationSendResult } from "./integrations";
import { createStripePaymentClaim, reconcileIdempotentStripeSubmission, stripePaymentClaimConflict } from "./stripe-payment-claims";
import { resolveStripeCheckoutDraftBlocker } from "./stripe-checkout-drafts";
import { stripeCustomerCustomFieldPatch, stripeCustomerIdForAccount } from "./stripe-customer-scope";
import { applySucceededStripeFamilyBalancePayment } from "./stripe-payment-application";
import { retrySerialization } from "./retry-serialization";
import { prisma } from "./prisma";
import { familyPaymentAttemptIdentityMatches, familyPaymentAttemptMatches, newFamilyPaymentAttempt,
  type FamilyCheckoutRequest, type FamilyIntentRequest, type FamilyCustomerRequest, type FamilyPaymentAttempt, type FamilyPaymentTopology } from "./family-payment-attempt";
import { familyCheckoutSessionIdentityMatches, familyCheckoutSessionRequestMatches, familyPaymentIntentReceiptMatches } from "./family-payment-receipt";

export const FAMILY_PAYMENT_ID_TOKEN = "__BEE_FAMILY_PAYMENT_ID__";
type Database = Pick<PrismaClient, "$transaction" | "payment" | "billingAccount">;
type FamilyPaymentResult = { ok: boolean; statusCode: number; error?: string; paymentId?: string; status?: string;
  url?: string; stripeSessionId?: string; stripePaymentIntentId?: string; configured?: boolean };
type Input = { topology: FamilyPaymentTopology; fields: Record<string, unknown>;
  authorize: (tx: Prisma.TransactionClient) => Promise<boolean>; authorizeRequest: () => Promise<boolean>;
  audit: (tx: Prisma.TransactionClient, paymentId: string, event: "checkout_created" | "checkout_failed" | "payment_intent_succeeded" | "payment_intent_created" | "payment_intent_failed", providerId: string | null) => Promise<void>;
  acceptProcessingRecovery?: { userId: string; version: string };
  database?: Database; now?: () => Date; submitCheckout?: typeof createStripeCheckoutSession; submitIntent?: typeof createStripeOffSessionPaymentIntent;
  submitCustomer?: typeof createStripeCustomer; retrieveIntent?: typeof retrieveStripePaymentIntent; resolveDraft?: typeof resolveStripeCheckoutDraftBlocker;
} & ({ kind: "checkout"; request: FamilyCheckoutRequest; customer: FamilyCustomerRequest } | { kind: "saved_method"; request: FamilyIntentRequest });
const asJson = (value: Record<string, unknown>) => value as Prisma.InputJsonObject;
const pendingMessage = "Payment confirmation is pending. Another payment will not be started. Refresh the payment status or contact the school before trying again.";
const held = (paymentId?: string): FamilyPaymentResult => ({ ok: false, statusCode: 409, status: "confirmation_pending", error: pendingMessage, paymentId });
const pending = (paymentId: string): FamilyPaymentResult => ({ ...held(paymentId), statusCode: 503 });
const secureUrl = (value: unknown): value is string => { try { return typeof value === "string" && new URL(value).protocol === "https:" && !new URL(value).username && !new URL(value).password; } catch { return false; } };

/** One immutable, bounded, account-serialized attempt; provider calls never run inside retryable DB transactions. */
export async function startFamilyPayment(input: Input): Promise<FamilyPaymentResult> {
  if (input.kind === "checkout" && input.request.paymentMethodCategory === "link_bank") {
    return { ok: false, statusCode: 409, error: INSTANT_BANK_CHECKOUT_UNAVAILABLE_MESSAGE };
  }
  const { kind, authorize, authorizeRequest, audit, database = prisma, now = () => new Date(),
    submitCheckout = createStripeCheckoutSession, submitIntent = createStripeOffSessionPaymentIntent, submitCustomer = createStripeCustomer,
    retrieveIntent = retrieveStripePaymentIntent, resolveDraft = resolveStripeCheckoutDraftBlocker } = input;
  const topology = structuredClone(input.topology), request = structuredClone(input.request), fields = structuredClone(input.fields);
  const customer = input.kind === "checkout" ? structuredClone(input.customer) : undefined;
  if (kind === "checkout") { delete request.customerId; request.metadata.stripeCustomerId = ""; (request as FamilyCheckoutRequest).allowPaymentMethodFallback = false; }
  let preparation: FamilyPaymentAttempt;
  try { preparation = newFamilyPaymentAttempt(kind === "checkout"
    ? { topology, kind, phase: "prepare", request: request as FamilyCheckoutRequest, customer, now: now() }
    : { topology, kind, phase: "prepare", request: request as FamilyIntentRequest, now: now() }); }
  catch { return { ok: false, statusCode: 409, error: "Payment details changed. Refresh before continuing." }; }
  const principal = request.invoiceAmountCents!;
  const receiptFieldsMatch = (saved: Record<string, unknown>) => !saved.invoiceId
    && ["tenantId", "centerId", "familyId", "billingAccountId", "paymentScope", "invoiceAmountCents", "checkoutTotalCents", "parentSurchargeAmountCents", "applicationFeeAmountCents"]
      .every(key => String(saved[key]) === request.metadata[key]);
  if (!receiptFieldsMatch(fields)) return { ok: false, statusCode: 409, error: "Payment details changed. Refresh before continuing." };
  if (!await authorizeRequest()) return held();
  const active = await database.$transaction(async tx => await authorize(tx) ? tx.payment.findMany({ where: {
    billingAccountId: topology.billingAccountId, provider: { in: ["stripe", "stripe_terminal"] }, status: PaymentStatus.DRAFT }, orderBy: { id: "asc" } }) : null,
  { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  if (!active) return held();
  const blockers = active.filter(payment => stripePaymentClaimConflict({ scope: "family_balance", payment }));
  if (blockers.length > 1) return held();
  let existing: Payment | null = blockers[0] ?? null;
  if (existing && (existing.provider !== "stripe" || jsonRecord(existing.customFields).paymentScope !== "family_balance" || jsonRecord(existing.customFields).invoiceId)) return held(existing.id);
  const claim = async (paymentId: string | null, claimedPrincipal = principal) => {
    if (!await authorizeRequest()) return { created: false as const, blockingPaymentId: paymentId };
    return createStripePaymentClaim({ database, billingAccountId: topology.billingAccountId, scope: "family_balance", existingPaymentId: paymentId,
      expectedTopology: topology, authorize, paymentData: { provider: "stripe", amountCents: claimedPrincipal, status: PaymentStatus.DRAFT,
        externalIdPlaceholder: kind === "checkout" ? "checkout_session_pending" : "payment_intent_pending",
        customFields: asJson({ ...fields, paymentScope: "family_balance", stripeConnectedAccountId: topology.connectedAccountId,
          status: kind === "checkout" ? "checkout_pending" : "director_saved_method_pending", familyPaymentPreparationV1: preparation }) } });
  };
  const checkoutWithIdentity = (customerId: string, paymentId: string): FamilyCheckoutRequest => ({ ...request as FamilyCheckoutRequest, customerId,
    successUrl: (request as FamilyCheckoutRequest).successUrl.replaceAll(FAMILY_PAYMENT_ID_TOKEN, paymentId),
    cancelUrl: (request as FamilyCheckoutRequest).cancelUrl.replaceAll(FAMILY_PAYMENT_ID_TOKEN, paymentId),
    metadata: { ...request.metadata, stripeCustomerId: customerId } });
  const attemptFor = (preparedRequest: FamilyCheckoutRequest | FamilyIntentRequest) => newFamilyPaymentAttempt(kind === "checkout"
    ? { topology, kind, phase: "submit", request: preparedRequest as FamilyCheckoutRequest, now: now() }
    : { topology, kind, phase: "submit", request: preparedRequest as FamilyIntentRequest, now: now() });

  // A known Session can be read after the retry window. Never resume/expire an unproven provider object.
  const knownSessionId = existing && activeStripeCheckoutPaymentSummary(existing).stripeCheckoutSessionId;
  if (existing && knownSessionId) {
    if (kind !== "checkout") return held(existing.id);
    const proof = await claim(existing.id, existing.amountCents);
    if (!proof.created) return held(proof.blockingPaymentId ?? undefined);
    const saved = jsonRecord(proof.payment.customFields);
    const customerId = stripeCustomerIdForAccount((await database.billingAccount.findUnique({ where: { id: topology.billingAccountId }, select: { customFields: true } }))?.customFields, topology.connectedAccountId);
    if (!customerId || saved.stripeCustomerId !== customerId || saved.stripeConnectedAccountId !== topology.connectedAccountId
      || saved.stripeCustomerConnectedAccountId !== topology.connectedAccountId || proof.payment.externalIdPlaceholder?.startsWith("cs_") && proof.payment.externalIdPlaceholder !== knownSessionId) return held(existing.id);
    const knownRequest = checkoutWithIdentity(customerId, existing.id), candidate = attemptFor(knownRequest);
    const identityMatches = (!saved.familyPaymentPreparationV1 || familyPaymentAttemptIdentityMatches(saved.familyPaymentPreparationV1, preparation))
      && (!saved.familyPaymentAttemptV1 || familyPaymentAttemptIdentityMatches(saved.familyPaymentAttemptV1, candidate));
    const resolution = await resolveDraft({ database, payment: proof.payment, tenantId: topology.tenantId, connectedAccountId: topology.connectedAccountId,
      scope: "family_balance", requestedPaymentMethodCategory: knownRequest.paymentMethodCategory, expectedAmountCents: principal,
      expectedCheckoutTotalCents: request.amountCents, expectedFeeDisclosureVersion: request.metadata.feeDisclosureVersion,
      validateSession: session => familyCheckoutSessionIdentityMatches({ session, sessionId: knownSessionId, paymentId: proof.payment.id,
        customerId, topology, originalPrincipalCents: proof.payment.amountCents, invoiceNumber: knownRequest.invoiceNumber }),
      canResumeSession: session => saved.paymentMethodCategory !== "link_bank" && saved.requestedPaymentMethodCategory !== "link_bank"
        && identityMatches && familyCheckoutSessionRequestMatches(session, knownRequest) });
    if (!resolution.blocked && "url" in resolution && secureUrl(resolution.url)) return { ok: true, statusCode: 200, status: "checkout_session_reused",
      paymentId: existing.id, stripeSessionId: knownSessionId, url: resolution.url };
    if (resolution.blocked) return held(existing.id);
    existing = null;
  }
  // Legacy unknown outcomes lack a reconstructable provider contract. Do not guess their parameters or mint a replacement key.
  if (existing && !familyPaymentAttemptIdentityMatches(jsonRecord(existing.customFields).familyPaymentPreparationV1, preparation)) return held(existing.id);
  const claimed = await claim(existing?.id ?? null);
  if (!claimed.created) return held(claimed.blockingPaymentId ?? undefined);
  const payment = claimed.payment;
  if (!familyPaymentAttemptIdentityMatches(jsonRecord(payment.customFields).familyPaymentPreparationV1, preparation)) return held(payment.id);
  let expectedAttempt: FamilyPaymentAttempt | null = null;
  const original = jsonRecord(jsonRecord(payment.customFields).familyPaymentPreparationV1);

  async function withPayment<T>(operation: (tx: Prisma.TransactionClient, fresh: Payment, saved: Record<string, unknown>) => Promise<T>): Promise<T | null> {
    return retrySerialization(() => database.$transaction(async tx => {
      // Webhooks lock Payment first. Use the same order before touching account/ledger/invoice state.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BillingAccount" WHERE "id" = ${topology.billingAccountId} FOR UPDATE`);
      const fresh = await tx.payment.findUnique({ where: { id: payment.id } }), saved = jsonRecord(fresh?.customFields);
      if (!fresh || fresh.billingAccountId !== topology.billingAccountId || fresh.provider !== "stripe" || fresh.amountCents !== principal
        || !receiptFieldsMatch(saved) || !familyPaymentAttemptIdentityMatches(saved.familyPaymentPreparationV1, preparation)
        || expectedAttempt && !familyPaymentAttemptIdentityMatches(saved.familyPaymentAttemptV1, expectedAttempt)) return null;
      const account = await tx.billingAccount.findUnique({ where: { id: topology.billingAccountId }, select: { familyId: true, family: { select: { centerId: true } } } });
      const center = await tx.center.findFirst({ where: { id: topology.centerId, organization: { tenantId: topology.tenantId } }, select: { id: true } });
      if (!account || !center || account.familyId !== topology.familyId || account.family.centerId !== topology.centerId) return null;
      return operation(tx, fresh, saved);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
  const advanced = (saved: Record<string, unknown>) => Boolean(saved.stripeCheckoutSessionId || saved.stripePaymentIntentId
    || ["checkout_created", "paid_processing", "director_saved_method_processing", "director_saved_method_succeeded_pending_webhook"].includes(String(saved.status)));
  async function markUnknown() {
    await withPayment(async (tx, fresh, saved) => {
      if (fresh.status !== PaymentStatus.DRAFT || advanced(saved)) return;
      await tx.payment.update({ where: { id: payment.id }, data: { customFields: asJson({ ...saved,
        status: kind === "checkout" ? "checkout_submission_unknown" : "director_saved_method_submission_unknown",
        submissionStateUnknownAt: saved.submissionStateUnknownAt || now().toISOString(), submissionRetryUsesPaymentId: payment.id }) } });
    });
  }
  async function failUntouched(configured: boolean, providerStatus?: number, customerFailure = false): Promise<FamilyPaymentResult> {
    const failed = await withPayment(async (tx, fresh, saved) => {
      if (fresh.status !== PaymentStatus.DRAFT || advanced(saved) || saved.submissionStateUnknownAt
        || String(saved.status).includes("unknown") || customerFailure && saved.familyPaymentAttemptV1) return false;
      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED,
        externalIdPlaceholder: customerFailure ? "stripe_customer_failed" : kind === "checkout" ? "stripe_checkout_failed" : "stripe_payment_intent_failed",
        customFields: asJson({ ...saved, status: kind === "checkout" ? "checkout_failed" : "director_saved_method_failed",
          stripeProviderStatus: providerStatus ?? null, paymentFailedAt: now().toISOString() }) } });
      await audit(tx, payment.id, kind === "checkout" ? "checkout_failed" : "payment_intent_failed", null);
      return true;
    });
    return failed ? { ok: false, statusCode: configured ? 502 : 503, configured, paymentId: payment.id,
      error: "Payment could not be started. Refresh the payment status before trying again." } : pending(payment.id);
  }

  let customerId = stripeCustomerIdForAccount((await database.billingAccount.findUnique({ where: { id: topology.billingAccountId }, select: { customFields: true } }))?.customFields, topology.connectedAccountId);
  const savedAttempt = jsonRecord(jsonRecord(payment.customFields).familyPaymentAttemptV1);
  if (typeof savedAttempt.customerId === "string" && customerId !== savedAttempt.customerId) return held(payment.id);
  if (kind === "saved_method" && customerId !== request.customerId) return held(payment.id);
  if (!customerId) {
    if (!customer || !familyPaymentAttemptMatches(original, preparation, now()) || !(await claim(payment.id)).created) return held(payment.id);
    const response = await reconcileIdempotentStripeSubmission(() => submitCustomer({ ...customer, idempotencyKey: `family-payment:customer:${payment.id}` }));
    if (!response.resolved) { await markUnknown(); return pending(payment.id); }
    if (!response.value.ok) return failUntouched(response.value.configured, response.value.providerStatus, true);
    if (!response.value.id || !/^cus_[A-Za-z0-9]+$/.test(response.value.id)) { await markUnknown(); return pending(payment.id); }
    const createdId = response.value.id;
    const mapped = await withPayment(async (tx, fresh) => {
      if (fresh.status !== PaymentStatus.DRAFT || !await authorize(tx)) return false;
      const account = await tx.billingAccount.findUniqueOrThrow({ where: { id: topology.billingAccountId } });
      const current = stripeCustomerIdForAccount(account.customFields, topology.connectedAccountId);
      if (current && current !== createdId) return false;
      if (!current) await tx.billingAccount.update({ where: { id: topology.billingAccountId }, data: { customFields: asJson({ ...jsonRecord(account.customFields),
        ...stripeCustomerCustomFieldPatch(account.customFields, createdId, topology.connectedAccountId) }) } });
      return true;
    });
    if (!mapped) return held(payment.id);
    customerId = createdId;
  }
  const preparedRequest = kind === "checkout" ? checkoutWithIdentity(customerId, payment.id) : request as FamilyIntentRequest;
  const candidate = attemptFor(preparedRequest);
  const prepared = await withPayment(async (tx, fresh, saved) => {
    if (fresh.status !== PaymentStatus.DRAFT) return false;
    if (saved.familyPaymentAttemptV1) return familyPaymentAttemptIdentityMatches(saved.familyPaymentAttemptV1, candidate);
    if (!familyPaymentAttemptMatches(saved.familyPaymentPreparationV1, preparation, now()) || !await authorize(tx)) return false;
    if (input.acceptProcessingRecovery) {
      const account = await tx.billingAccount.findUniqueOrThrow({ where: { id: topology.billingAccountId } });
      const accountFields = jsonRecord(account.customFields);
      if (!accountFields.cardProcessingRecoveryAcceptedAt) await tx.billingAccount.update({ where: { id: account.id }, data: { customFields: asJson({ ...accountFields,
        cardProcessingRecoveryAcceptedAt: now().toISOString(), cardProcessingRecoveryAcceptedByUserId: input.acceptProcessingRecovery.userId,
        cardProcessingRecoveryDisclosureVersion: input.acceptProcessingRecovery.version }) } });
    }
    await tx.payment.update({ where: { id: payment.id }, data: { customFields: asJson({ ...saved, stripeCustomerId: customerId,
      stripeCustomerConnectedAccountId: topology.connectedAccountId,
      familyPaymentAttemptV1: { ...candidate, startedAt: original.startedAt, retryUntil: original.retryUntil } }) } });
    return true;
  });
  if (!prepared) return held(payment.id);
  expectedAttempt = candidate;

  async function finalizeIntent(response: Awaited<ReturnType<typeof submitIntent>>): Promise<FamilyPaymentResult> {
    const intent = response.paymentIntent, intentRequest = preparedRequest as FamilyIntentRequest;
    if (!intent) return response.ok ? (await markUnknown(), pending(payment.id)) : failUntouched(response.configured, response.providerStatus);
    if (!familyPaymentIntentReceiptMatches(intent, intentRequest, topology, payment.id)) { await markUnknown(); return pending(payment.id); }
    const result = await withPayment(async (tx, fresh, saved) => {
      const storedId = typeof saved.stripePaymentIntentId === "string" ? saved.stripePaymentIntentId : fresh.externalIdPlaceholder?.startsWith("pi_") ? fresh.externalIdPlaceholder : null;
      if (fresh.externalIdPlaceholder?.startsWith("pi_") && fresh.externalIdPlaceholder !== intent.id) return held(payment.id);
      if (storedId && storedId !== intent.id) return held(payment.id);
      if (fresh.status === PaymentStatus.PAID) return storedId === intent.id
        ? { ok: true, statusCode: 200, status: "paid", paymentId: payment.id, stripePaymentIntentId: intent.id } : held(payment.id);
      if (fresh.status !== PaymentStatus.DRAFT && !(fresh.status === PaymentStatus.FAILED && storedId === intent.id && intent.status === "succeeded")) return held(payment.id);
      if (intent.status === "succeeded") {
        const applied = await applySucceededStripeFamilyBalancePayment(tx, { paymentId: payment.id, externalId: intent.id, stripePaymentIntentId: intent.id,
          stripePaymentStatus: intent.status, stripePaymentIntentStatus: intent.status, stripeAmountTotalCents: intent.amountCents,
          metadata: { ...saved, paymentId: payment.id }, descriptionFallback: "Director saved method payment" });
        if (!applied.applied) return held(payment.id);
        await audit(tx, payment.id, "payment_intent_succeeded", intent.id);
        return { ok: true, statusCode: 200, status: "paid", paymentId: payment.id, stripePaymentIntentId: intent.id };
      }
      if (saved.status === "paid_processing" || saved.status === "director_saved_method_succeeded_pending_webhook") return held(payment.id);
      const failed = ["requires_payment_method", "canceled"].includes(String(intent.status));
      // A late decline cannot undo a stronger processing result from another request/webhook.
      if (failed && (advanced(saved) || saved.submissionStateUnknownAt || String(saved.status).includes("unknown"))) return held(payment.id);
      if (saved.stripePaymentIntentStatus === "processing" && intent.status !== "processing") return held(payment.id);
      await tx.payment.update({ where: { id: payment.id }, data: { status: failed ? PaymentStatus.FAILED : PaymentStatus.DRAFT, externalIdPlaceholder: intent.id,
        customFields: asJson({ ...saved, stripePaymentIntentId: intent.id, stripePaymentIntentStatus: intent.status,
          stripeAmountTotalCents: intent.amountCents, status: failed ? "director_saved_method_failed" : "director_saved_method_processing" }) } });
      await audit(tx, payment.id, failed ? "payment_intent_failed" : "payment_intent_created", intent.id);
      return failed ? { ok: false, statusCode: 409, status: "failed", paymentId: payment.id, error: "The payment was not completed. Review its status before trying again." }
        : intent.status === "processing" ? { ok: true, statusCode: 200, status: "processing", paymentId: payment.id, stripePaymentIntentId: intent.id }
        : { ...held(payment.id), error: "This payment needs additional verification. Ask the school to review this attempt before starting another payment." };
    });
    return result ?? held(payment.id);
  }
  const submissionClaim = await claim(payment.id);
  if (!submissionClaim.created || !familyPaymentAttemptIdentityMatches(jsonRecord(submissionClaim.payment.customFields).familyPaymentAttemptV1, candidate)) return held(payment.id);
  const submissionFields = jsonRecord(submissionClaim.payment.customFields);
  if (kind === "saved_method" && typeof submissionFields.stripePaymentIntentId === "string") {
    const response = await retrieveIntent({ paymentIntentId: submissionFields.stripePaymentIntentId, connectedAccountId: topology.connectedAccountId, tenantId: topology.tenantId });
    return response.ok && response.paymentIntent ? finalizeIntent(response) : pending(payment.id);
  }
  if (advanced(submissionFields) || !familyPaymentAttemptMatches(submissionFields.familyPaymentAttemptV1, candidate, now())) return held(payment.id);
  if (kind === "saved_method") {
    const submission = await reconcileIdempotentStripeSubmission(() => submitIntent({ ...preparedRequest as FamilyIntentRequest,
      metadata: { ...preparedRequest.metadata, paymentId: payment.id }, idempotencyKey: `family-payment:intent:${payment.id}` }));
    if (!submission.resolved) { await markUnknown(); return pending(payment.id); }
    return finalizeIntent(submission.value);
  }
  const submission = await reconcileIdempotentStripeSubmission(() => submitCheckout({ ...preparedRequest as FamilyCheckoutRequest,
    metadata: { ...preparedRequest.metadata, paymentId: payment.id }, idempotencyKey: `family-payment:checkout:${payment.id}` }));
  if (!submission.resolved) { await markUnknown(); return pending(payment.id); }
  const session: IntegrationSendResult = submission.value;
  if (!session.ok) return failUntouched(session.configured, session.providerStatus);
  if (!session.id || !/^cs_[A-Za-z0-9_]+$/.test(session.id) || !secureUrl(session.url)) { await markUnknown(); return pending(payment.id); }
  const finalized = await withPayment(async (tx, fresh, saved) => {
    if (fresh.status !== PaymentStatus.DRAFT) return false;
    if (advanced(saved)) return saved.status === "checkout_created" && saved.stripeCheckoutSessionId === session.id;
    await tx.payment.update({ where: { id: payment.id }, data: { externalIdPlaceholder: session.id,
      customFields: asJson({ ...saved, stripeCheckoutSessionId: session.id, stripeCheckoutSessionCreatedAt: session.createdAt ?? null,
        stripeCheckoutSessionExpiresAt: session.expiresAt ?? null, stripeCheckoutSessionStatus: session.status ?? null,
        stripeCheckoutPaymentStatus: session.paymentStatus ?? null, status: "checkout_created" }) } });
    await audit(tx, payment.id, "checkout_created", session.id!);
    return true;
  });
  return finalized ? { ok: true, statusCode: 200, paymentId: payment.id, stripeSessionId: session.id, url: session.url } : held(payment.id);
}
