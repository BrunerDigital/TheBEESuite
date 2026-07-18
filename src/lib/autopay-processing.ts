import { PaymentStatus, Prisma } from "@prisma/client";
import {
  isActiveStripeAutopayPayment,
  isActiveStripeCheckoutPayment,
  jsonRecord,
} from "@/lib/billing-guardrails";
import {
  createStripeOffSessionPaymentIntent,
  getStripeCheckoutAmounts,
  getStripeProcessingRecoveryAmount,
  getStripeSecretKey,
  getStripeWebhookSecret,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
  shouldWaiveStripePaymentOperationsFee,
} from "@/lib/integrations";
import {
  canChargeSavedPaymentMethod,
  canRunAutopay,
  paymentMethodAutopayCategory,
  paymentMethodManagementSummary,
} from "@/lib/payment-method-management";
import { prisma } from "@/lib/prisma";
import {
  stripeConnectCustomFieldPatch,
  stripeConnectReadinessFromFields,
  stripeConnectReadinessFromSnapshot,
} from "@/lib/stripe-connect-readiness";
import { stripeCustomerIdForAccount } from "@/lib/stripe-customer-scope";
import { applySucceededStripeInvoicePayment } from "@/lib/stripe-payment-application";

export type AutopayRunResultStatus = "would_charge" | "paid" | "processing" | "failed" | "skipped";

export type AutopayRunInvoiceResult = {
  invoiceId: string;
  invoiceNumber: string;
  familyName: string;
  centerId: string | null;
  centerName: string | null;
  amountCents: number;
  status: AutopayRunResultStatus;
  reason: string | null;
  paymentId: string | null;
  stripePaymentIntentId: string | null;
};

export type AutopayRunSummary = {
  ok: true;
  dryRun: boolean;
  asOf: string;
  scanned: number;
  eligible: number;
  wouldCharge: number;
  paid: number;
  processing: number;
  failed: number;
  skipped: number;
  totalCents: number;
  results: AutopayRunInvoiceResult[];
};

type ProcessAutopayInput = {
  dryRun?: boolean;
  asOf?: Date;
  limit?: number;
  centerIds?: string[];
  invoiceId?: string | null;
  retryFailed?: boolean;
  requireDueDate?: boolean;
  collectionMode?: "autopay" | "stored_method";
  cardProcessingRecoveryAccepted?: boolean;
  requestedByUserId?: string | null;
};

type TenantStripeConfig = {
  stripeConfigured: boolean;
  webhookConfigured: boolean;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonInput(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function safeDate(value?: Date) {
  if (!value || Number.isNaN(value.getTime())) return new Date();
  return value;
}

function safeLimit(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(parsed, 1), 100);
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));
}

function paymentStatusText(payment: { customFields?: unknown }) {
  return clean(jsonRecord(payment.customFields).status);
}

function isAutopayFailureForInvoice(payment: {
  status: PaymentStatus;
  provider: string;
  customFields?: unknown;
}) {
  const status = paymentStatusText(payment);
  return payment.provider === "stripe" &&
    payment.status === PaymentStatus.FAILED &&
    (status.startsWith("autopay_") || status.startsWith("stored_method_"));
}

async function tenantStripeConfig(tenantId: string, cache: Map<string, TenantStripeConfig>) {
  const cached = cache.get(tenantId);
  if (cached) return cached;
  const config = {
    stripeConfigured: Boolean(await getStripeSecretKey({ tenantId })),
    webhookConfigured: Boolean(await getStripeWebhookSecret({ tenantId })),
  };
  cache.set(tenantId, config);
  return config;
}

export async function processAutopayInvoices(input: ProcessAutopayInput = {}): Promise<AutopayRunSummary> {
  const dryRun = input.dryRun !== false;
  const asOf = safeDate(input.asOf);
  const limit = safeLimit(input.limit);
  const collectionMode = input.collectionMode === "stored_method" ? "stored_method" : "autopay";
  const statusPrefix = collectionMode === "stored_method" ? "stored_method" : "autopay";
  const collectionLabel = collectionMode === "stored_method" ? "saved-method payment" : "autopay";
  const requireDueDate = input.requireDueDate !== false;
  const allowPlatformOnlyPayments = process.env.STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS === "true";
  const requireActiveConnectedAccount = process.env.STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT !== "false";
  const requireWebhook = process.env.STRIPE_REQUIRE_WEBHOOK_FOR_AUTOPAY !== "false";
  const centerIds = unique(input.centerIds ?? []);

  const invoiceWhere: Prisma.InvoiceWhereInput = {
    status: PaymentStatus.OPEN,
    totalCents: { gt: 0 },
  };
  if (requireDueDate) invoiceWhere.dueDate = { lte: asOf };
  if (input.invoiceId) invoiceWhere.id = input.invoiceId;
  if (centerIds.length) {
    invoiceWhere.billingAccount = { family: { is: { centerId: { in: centerIds } } } };
  }

  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere,
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: limit,
    include: {
      billingAccount: {
        select: {
          id: true,
          familyId: true,
          autopayPlaceholder: true,
          customFields: true,
          family: {
            select: {
              id: true,
              name: true,
              billingEmail: true,
              centerId: true,
            },
          },
        },
      },
    },
  });

  const billingAccountIds = unique(invoices.map((invoice) => invoice.billingAccountId));
  const familyCenterIds = unique(invoices.map((invoice) => invoice.billingAccount.family.centerId));
  const [payments, centers] = await Promise.all([
    billingAccountIds.length
      ? prisma.payment.findMany({
          where: {
            provider: "stripe",
            billingAccountId: { in: billingAccountIds },
            status: { in: [PaymentStatus.DRAFT, PaymentStatus.PAID, PaymentStatus.FAILED] },
          },
          select: { id: true, billingAccountId: true, status: true, provider: true, customFields: true },
          take: 1000,
        })
      : [],
    familyCenterIds.length
      ? prisma.center.findMany({
          where: { id: { in: familyCenterIds } },
          select: {
            id: true,
            name: true,
            customFields: true,
            organization: {
              select: {
                tenantId: true,
                tenant: { select: { name: true, slug: true } },
                brand: { select: { name: true, slug: true } },
              },
            },
          },
        })
      : [],
  ]);

  const centersById = new Map(centers.map((center) => [center.id, center]));
  const paymentsByInvoiceId = new Map<string, typeof payments>();
  for (const payment of payments) {
    const invoiceId = clean(jsonRecord(payment.customFields).invoiceId);
    if (!invoiceId) continue;
    const list = paymentsByInvoiceId.get(invoiceId) ?? [];
    list.push(payment);
    paymentsByInvoiceId.set(invoiceId, list);
  }

  const configCache = new Map<string, TenantStripeConfig>();
  const connectedAccountCache = new Map<string, {
    ok: boolean;
    accountId: string | null;
    reason: string | null;
  }>();
  const results: AutopayRunInvoiceResult[] = [];

  for (const invoice of invoices) {
    const family = invoice.billingAccount.family;
    const center = family.centerId ? centersById.get(family.centerId) : null;
    const baseResult = {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      familyName: family.name,
      centerId: family.centerId,
      centerName: center?.name ?? null,
      amountCents: invoice.totalCents,
      paymentId: null,
      stripePaymentIntentId: null,
    };

    const attempts = paymentsByInvoiceId.get(invoice.id) ?? [];
    if (attempts.some((payment) => payment.status === PaymentStatus.PAID)) {
      results.push({ ...baseResult, status: "skipped", reason: "Invoice already has a paid Stripe payment." });
      continue;
    }
    if (attempts.some((payment) => isActiveStripeCheckoutPayment(payment) || isActiveStripeAutopayPayment(payment))) {
      results.push({ ...baseResult, status: "skipped", reason: "Invoice already has a pending payment attempt." });
      continue;
    }
    if (!input.retryFailed && attempts.some(isAutopayFailureForInvoice)) {
      results.push({ ...baseResult, status: "skipped", reason: `${collectionLabel} already failed for this invoice; parent follow-up is in dunning.` });
      continue;
    }
    if (!center) {
      results.push({ ...baseResult, status: "skipped", reason: "Family is not linked to a school." });
      continue;
    }

    const paymentMethod = paymentMethodManagementSummary({
      autopayPlaceholder: invoice.billingAccount.autopayPlaceholder,
      customFields: invoice.billingAccount.customFields,
    });
    const canChargeSavedMethod = collectionMode === "stored_method"
      ? canChargeSavedPaymentMethod(paymentMethod)
      : canRunAutopay(paymentMethod);
    if (!canChargeSavedMethod) {
      results.push({
        ...baseResult,
        status: "skipped",
        reason: collectionMode === "stored_method"
          ? "Family does not have a selected payment method saved in Stripe."
          : "Autopay is not enabled with a saved payment method.",
      });
      continue;
    }
    const autopayPaymentMethodCategory = paymentMethodAutopayCategory(paymentMethod);
    let billingAccountFields = jsonRecord(invoice.billingAccount.customFields);
    const cardRecoveryRequiresAcceptance =
      autopayPaymentMethodCategory === "card" &&
      getStripeProcessingRecoveryAmount(invoice.totalCents, "card") > 0;
    const oneTimeCardRecoveryAccepted =
      collectionMode === "stored_method" && input.cardProcessingRecoveryAccepted === true;
    if (cardRecoveryRequiresAcceptance && !clean(billingAccountFields.cardProcessingRecoveryAcceptedAt) && !oneTimeCardRecoveryAccepted) {
      results.push({
        ...baseResult,
        status: "skipped",
        reason: "Card payments using a saved method need the card processing recovery disclosure accepted before charging.",
      });
      continue;
    }
    const cardRecoveryAcceptedAt =
      cardRecoveryRequiresAcceptance && !clean(billingAccountFields.cardProcessingRecoveryAcceptedAt) && oneTimeCardRecoveryAccepted
        ? new Date().toISOString()
        : null;

    const tenantId = center.organization.tenantId;
    const config = await tenantStripeConfig(tenantId, configCache);
    if (!config.stripeConfigured) {
      results.push({ ...baseResult, status: "skipped", reason: "Stripe secret key is not configured for this tenant." });
      continue;
    }
    if (requireWebhook && !config.webhookConfigured) {
      results.push({ ...baseResult, status: "skipped", reason: "Stripe webhook signing secret is not configured for this tenant." });
      continue;
    }

    const connectedAccountId = readStripeConnectedAccountId(center.customFields);
    if (!connectedAccountId && !allowPlatformOnlyPayments) {
      results.push({ ...baseResult, status: "skipped", reason: "School payout account is not connected." });
      continue;
    }

    if (connectedAccountId && requireActiveConnectedAccount) {
      let accountReadiness = connectedAccountCache.get(center.id);
      if (!accountReadiness) {
        if (dryRun) {
          const readiness = stripeConnectReadinessFromFields(center.customFields);
          accountReadiness = {
            ok: readiness.canAcceptParentPayments,
            accountId: readiness.accountId,
            reason: readiness.blockingReason,
          };
        } else {
          const retrieved = await retrieveStripeConnectedAccount(connectedAccountId, { tenantId });
          if (retrieved.ok && retrieved.account) {
            const readiness = stripeConnectReadinessFromSnapshot(retrieved.account);
            await prisma.center.update({
              where: { id: center.id },
              data: {
                customFields: jsonInput({
                  ...jsonRecord(center.customFields),
                  ...stripeConnectCustomFieldPatch(readiness),
                  stripeMerchantCapabilityStatus: retrieved.account.merchantCapabilityStatus || null,
                  stripeRecipientTransferStatus: retrieved.account.recipientTransferStatus || null,
                }),
              },
            });
            accountReadiness = {
              ok: readiness.canAcceptParentPayments,
              accountId: readiness.accountId,
              reason: readiness.blockingReason,
            };
          } else {
            accountReadiness = {
              ok: false,
              accountId: connectedAccountId,
              reason: retrieved.error || "School payout status could not be confirmed.",
            };
          }
        }
        connectedAccountCache.set(center.id, accountReadiness);
      }
      if (!accountReadiness.ok) {
        results.push({ ...baseResult, status: "skipped", reason: accountReadiness.reason || "School payout account is not ready." });
        continue;
      }
    }
    const scopedStripeCustomerId = stripeCustomerIdForAccount(billingAccountFields, connectedAccountId);
    if (!scopedStripeCustomerId) {
      results.push({
        ...baseResult,
        status: "skipped",
        reason: connectedAccountId
          ? "Family needs a saved payment method in this school's payout account."
          : `Family needs a saved payment customer record before ${collectionLabel} can run.`,
      });
      continue;
    }

    const waiveBeeSuitePaymentOperationsFee = shouldWaiveStripePaymentOperationsFee({
      tenantSlug: center.organization.tenant.slug,
      tenantName: center.organization.tenant.name,
      brandSlug: center.organization.brand?.slug,
      brandName: center.organization.brand?.name,
    });
    const amounts = getStripeCheckoutAmounts(invoice.totalCents, {
      paymentMethodCategory: autopayPaymentMethodCategory,
      waiveBeeSuitePaymentOperationsFee,
    });

    if (dryRun) {
      results.push({ ...baseResult, status: "would_charge", reason: null });
      continue;
    }

    if (cardRecoveryAcceptedAt) {
      billingAccountFields = {
        ...billingAccountFields,
        cardProcessingRecoveryAcceptedAt: cardRecoveryAcceptedAt,
        cardProcessingRecoveryAcceptedByUserId: input.requestedByUserId || null,
        cardProcessingRecoveryAcceptedSource: "director_stored_method_charge",
      };
      await prisma.billingAccount.update({
        where: { id: invoice.billingAccountId },
        data: { customFields: jsonInput(billingAccountFields) },
      });
    }

    const payment = await prisma.payment.create({
      data: {
        billingAccountId: invoice.billingAccountId,
        amountCents: invoice.totalCents,
        status: PaymentStatus.DRAFT,
        provider: "stripe",
        externalIdPlaceholder: "payment_intent_pending",
        customFields: jsonInput({
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          familyId: family.id,
          centerId: center.id,
          invoiceAmountCents: amounts.invoiceAmountCents,
          parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
          parentProcessingRecoveryAmountCents: amounts.parentProcessingRecoveryAmountCents,
          beeSuitePaymentOperationsFeeAmountCents: amounts.beeSuitePaymentOperationsFeeAmountCents,
          beeSuitePaymentOperationsFeeWaived: waiveBeeSuitePaymentOperationsFee,
          checkoutTotalCents: amounts.checkoutTotalCents,
          applicationFeeAmountCents: amounts.applicationFeeAmountCents,
          requestedPaymentMethodCategory: autopayPaymentMethodCategory,
          paymentMethodCategory: amounts.paymentMethodCategory,
          stripeConnectedAccountId: connectedAccountId || null,
          stripeCustomerId: scopedStripeCustomerId,
          stripeCustomerConnectedAccountId: connectedAccountId || null,
          stripeChargeType: connectedAccountId ? "direct" : "platform",
          collectionMode,
          cardProcessingRecoveryAcceptedAt: clean(billingAccountFields.cardProcessingRecoveryAcceptedAt) || null,
          cardProcessingRecoveryAcceptedByUserId: clean(billingAccountFields.cardProcessingRecoveryAcceptedByUserId) || input.requestedByUserId || null,
          status: `${statusPrefix}_pending`,
          attemptedAt: new Date().toISOString(),
          requestedByUserId: input.requestedByUserId || null,
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
        }),
      },
    });

    const intent = await createStripeOffSessionPaymentIntent({
      amountCents: amounts.checkoutTotalCents,
      invoiceAmountCents: amounts.invoiceAmountCents,
      parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
      invoiceNumber: invoice.number,
      centerName: center.name,
      customerId: scopedStripeCustomerId,
      paymentMethodId: paymentMethod.stripeDefaultPaymentMethodId!,
      paymentMethodType: paymentMethod.paymentMethodType,
      customerEmail: family.billingEmail,
      metadata: {
        tenantId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        familyId: family.id,
        centerId: center.id,
        stripeConnectedAccountId: connectedAccountId || "",
        stripeCustomerId: scopedStripeCustomerId,
        stripeChargeType: connectedAccountId ? "direct" : "platform",
        collectionMode,
        invoiceAmountCents: String(amounts.invoiceAmountCents),
        parentSurchargeAmountCents: String(amounts.parentSurchargeAmountCents),
        parentProcessingRecoveryAmountCents: String(amounts.parentProcessingRecoveryAmountCents),
        beeSuitePaymentOperationsFeeAmountCents: String(amounts.beeSuitePaymentOperationsFeeAmountCents),
        beeSuitePaymentOperationsFeeWaived: String(waiveBeeSuitePaymentOperationsFee),
        requestedPaymentMethodCategory: autopayPaymentMethodCategory,
        paymentMethodCategory: amounts.paymentMethodCategory,
        checkoutTotalCents: String(amounts.checkoutTotalCents),
        applicationFeeAmountCents: String(amounts.applicationFeeAmountCents),
        cardProcessingRecoveryAcceptedAt: clean(billingAccountFields.cardProcessingRecoveryAcceptedAt) || "",
        cardProcessingRecoveryAcceptedByUserId: clean(billingAccountFields.cardProcessingRecoveryAcceptedByUserId) || input.requestedByUserId || "",
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      },
      connectedAccountId,
      applicationFeeAmountCents: amounts.applicationFeeAmountCents,
      onBehalfOfConnectedAccount: process.env.STRIPE_CHECKOUT_ON_BEHALF_OF === "true",
      idempotencyKey: `${collectionMode}:${payment.id}`,
      descriptionLabel: collectionLabel,
      tenantId,
    });

    const intentStatus = intent.paymentIntent?.status || null;
    const accepted = intent.ok && (intentStatus === "succeeded" || intentStatus === "processing");
    let appliedImmediately = false;
    let immediateApplicationReason: string | null = null;

    if (accepted && intentStatus === "succeeded" && intent.paymentIntent?.id) {
      const application = await prisma.$transaction((tx) => applySucceededStripeInvoicePayment(tx, {
        invoiceId: invoice.id,
        paymentId: payment.id,
        externalId: intent.paymentIntent!.id,
        stripePaymentIntentId: intent.paymentIntent!.id,
        stripePaymentIntentStatus: intentStatus,
        stripeAmountTotalCents: intent.paymentIntent?.amountCents ?? amounts.checkoutTotalCents,
        metadata: jsonRecord(payment.customFields),
      }));
      appliedImmediately = application.applied;
      immediateApplicationReason = application.reason;
    } else {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: accepted ? PaymentStatus.DRAFT : PaymentStatus.FAILED,
          externalIdPlaceholder: intent.paymentIntent?.id || intent.error || `${statusPrefix}_payment_intent_failed`,
          customFields: jsonInput({
            ...jsonRecord(payment.customFields),
            stripePaymentIntentId: intent.paymentIntent?.id || null,
            stripePaymentIntentStatus: intentStatus,
            stripeError: intent.ok ? null : intent.error || `${statusPrefix}_payment_intent_failed`,
            failedAt: accepted ? null : new Date().toISOString(),
            status: accepted ? `${statusPrefix}_processing` : `${statusPrefix}_failed`,
          }),
        },
      });
    }

    const auditAction = appliedImmediately
      ? collectionMode === "stored_method"
        ? "billing.stored_method.completed"
        : "billing.autopay.completed"
      : accepted
        ? collectionMode === "stored_method"
          ? "billing.stored_method.payment_intent_created"
          : "billing.autopay.payment_intent_created"
        : collectionMode === "stored_method"
          ? "billing.stored_method.failed"
          : "billing.autopay.failed";

    await prisma.auditLog.create({
      data: {
        tenantId,
        centerId: center.id,
        userId: input.requestedByUserId || null,
        action: auditAction,
        resource: "Invoice",
        resourceId: invoice.id,
        metadata: jsonInput({
          paymentId: payment.id,
          stripePaymentIntentId: intent.paymentIntent?.id || null,
          amountCents: invoice.totalCents,
          checkoutTotalCents: amounts.checkoutTotalCents,
          status: intentStatus,
          error: intent.ok ? null : intent.error || null,
          appliedImmediately,
          immediateApplicationReason,
        }),
      },
    });

    const resultStatus: AutopayRunResultStatus = appliedImmediately
      ? "paid"
      : accepted && intentStatus === "processing"
        ? "processing"
        : "failed";
    const resultReason = appliedImmediately
      ? "Payment confirmed and the Bee Suite ledger was updated."
      : accepted && intentStatus === "processing"
        ? "Bank payment is processing; the ledger will update when Stripe confirms settlement."
        : immediateApplicationReason
          ? `Payment succeeded in Stripe but could not be applied automatically: ${immediateApplicationReason}.`
          : intent.error || `${collectionLabel} could not be submitted.`;

    results.push({
      ...baseResult,
      status: resultStatus,
      reason: resultReason,
      paymentId: payment.id,
      stripePaymentIntentId: intent.paymentIntent?.id || null,
    });
  }

  const wouldCharge = results.filter((result) => result.status === "would_charge").length;
  const paid = results.filter((result) => result.status === "paid").length;
  const processing = results.filter((result) => result.status === "processing").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  const totalCents = results
    .filter((result) => result.status === "would_charge" || result.status === "paid" || result.status === "processing")
    .reduce((sum, result) => sum + result.amountCents, 0);

  return {
    ok: true,
    dryRun,
    asOf: asOf.toISOString(),
    scanned: invoices.length,
    eligible: wouldCharge + paid + processing + failed,
    wouldCharge,
    paid,
    processing,
    failed,
    skipped,
    totalCents,
    results,
  };
}
