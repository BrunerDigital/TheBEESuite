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
import { paymentMethodAutopayCategory, paymentMethodManagementSummary } from "@/lib/payment-method-management";
import { prisma } from "@/lib/prisma";
import {
  stripeConnectCustomFieldPatch,
  stripeConnectReadinessFromFields,
  stripeConnectReadinessFromSnapshot,
} from "@/lib/stripe-connect-readiness";

export type AutopayRunResultStatus = "would_charge" | "processing" | "failed" | "skipped";

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
  return payment.provider === "stripe" &&
    payment.status === PaymentStatus.FAILED &&
    paymentStatusText(payment).startsWith("autopay_");
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
  const allowPlatformOnlyPayments = process.env.STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS === "true";
  const requireActiveConnectedAccount = process.env.STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT !== "false";
  const requireWebhook = process.env.STRIPE_REQUIRE_WEBHOOK_FOR_AUTOPAY !== "false";
  const centerIds = unique(input.centerIds ?? []);

  const invoiceWhere: Prisma.InvoiceWhereInput = {
    status: PaymentStatus.OPEN,
    totalCents: { gt: 0 },
    dueDate: { lte: asOf },
  };
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
      results.push({ ...baseResult, status: "skipped", reason: "Autopay already failed for this invoice; parent follow-up is in dunning." });
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
    if (paymentMethod.autopayStatus !== "enabled" || !paymentMethod.hasStripeCustomer || !paymentMethod.hasSavedPaymentMethod) {
      results.push({ ...baseResult, status: "skipped", reason: "Autopay is not enabled with a saved payment method." });
      continue;
    }
    const autopayPaymentMethodCategory = paymentMethodAutopayCategory(paymentMethod);
    const billingAccountFields = jsonRecord(invoice.billingAccount.customFields);
    const cardRecoveryRequiresAcceptance =
      autopayPaymentMethodCategory === "card" &&
      getStripeProcessingRecoveryAmount(invoice.totalCents, "card") > 0;
    if (cardRecoveryRequiresAcceptance && !clean(billingAccountFields.cardProcessingRecoveryAcceptedAt)) {
      results.push({
        ...baseResult,
        status: "skipped",
        reason: "Card autopay needs the card processing recovery disclosure accepted before charging.",
      });
      continue;
    }

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
          collectionMode: "autopay",
          status: "autopay_pending",
          autopayAttemptedAt: new Date().toISOString(),
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
      customerId: paymentMethod.stripeCustomerId!,
      paymentMethodId: paymentMethod.stripeDefaultPaymentMethodId!,
      customerEmail: family.billingEmail,
      metadata: {
        tenantId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        familyId: family.id,
        centerId: center.id,
        stripeConnectedAccountId: connectedAccountId || "",
        collectionMode: "autopay",
        invoiceAmountCents: String(amounts.invoiceAmountCents),
        parentSurchargeAmountCents: String(amounts.parentSurchargeAmountCents),
        parentProcessingRecoveryAmountCents: String(amounts.parentProcessingRecoveryAmountCents),
        beeSuitePaymentOperationsFeeAmountCents: String(amounts.beeSuitePaymentOperationsFeeAmountCents),
        beeSuitePaymentOperationsFeeWaived: String(waiveBeeSuitePaymentOperationsFee),
        requestedPaymentMethodCategory: autopayPaymentMethodCategory,
        paymentMethodCategory: amounts.paymentMethodCategory,
        checkoutTotalCents: String(amounts.checkoutTotalCents),
        applicationFeeAmountCents: String(amounts.applicationFeeAmountCents),
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      },
      connectedAccountId,
      applicationFeeAmountCents: amounts.applicationFeeAmountCents,
      onBehalfOfConnectedAccount: process.env.STRIPE_CHECKOUT_ON_BEHALF_OF === "true",
      idempotencyKey: `autopay:${payment.id}`,
      tenantId,
    });

    const intentStatus = intent.paymentIntent?.status || null;
    const accepted = intent.ok && (intentStatus === "succeeded" || intentStatus === "processing");
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: accepted ? PaymentStatus.DRAFT : PaymentStatus.FAILED,
        externalIdPlaceholder: intent.paymentIntent?.id || intent.error || "autopay_payment_intent_failed",
        customFields: jsonInput({
          ...jsonRecord(payment.customFields),
          stripePaymentIntentId: intent.paymentIntent?.id || null,
          stripePaymentIntentStatus: intentStatus,
          stripeError: intent.ok ? null : intent.error || "autopay_payment_intent_failed",
          failedAt: accepted ? null : new Date().toISOString(),
          status: accepted
            ? intentStatus === "succeeded"
              ? "autopay_succeeded_pending_webhook"
              : "autopay_processing"
            : "autopay_failed",
        }),
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        centerId: center.id,
        userId: input.requestedByUserId || null,
        action: accepted ? "billing.autopay.payment_intent_created" : "billing.autopay.failed",
        resource: "Invoice",
        resourceId: invoice.id,
        metadata: jsonInput({
          paymentId: payment.id,
          stripePaymentIntentId: intent.paymentIntent?.id || null,
          amountCents: invoice.totalCents,
          checkoutTotalCents: amounts.checkoutTotalCents,
          status: intentStatus,
          error: intent.ok ? null : intent.error || null,
        }),
      },
    });

    results.push({
      ...baseResult,
      status: accepted ? "processing" : "failed",
      reason: accepted ? "Awaiting signed Stripe webhook reconciliation." : intent.error || "Autopay could not be submitted.",
      paymentId: payment.id,
      stripePaymentIntentId: intent.paymentIntent?.id || null,
    });
  }

  const wouldCharge = results.filter((result) => result.status === "would_charge").length;
  const processing = results.filter((result) => result.status === "processing").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  const totalCents = results
    .filter((result) => result.status === "would_charge" || result.status === "processing")
    .reduce((sum, result) => sum + result.amountCents, 0);

  return {
    ok: true,
    dryRun,
    asOf: asOf.toISOString(),
    scanned: invoices.length,
    eligible: wouldCharge + processing + failed,
    wouldCharge,
    processing,
    failed,
    skipped,
    totalCents,
    results,
  };
}
