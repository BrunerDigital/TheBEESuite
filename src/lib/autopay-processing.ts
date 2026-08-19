import { PaymentStatus, Prisma } from "@prisma/client";
import {
  allocateAccountCreditToInvoice,
  availableAccountCreditCents,
} from "@/lib/account-credit-autopay";
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
  stripeConnectedAccountPaysFeesDirectly,
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
import { stripeConnectSavedMethodAccount } from "@/lib/stripe-connect-migration";
import { stripeCustomerIdForAccount } from "@/lib/stripe-customer-scope";
import {
  applyAccountCreditToInvoice,
  applySucceededStripeInvoicePayment,
} from "@/lib/stripe-payment-application";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import {
  AGENCY_LEDGER_ENTRY_TYPES,
  AGENCY_LEDGER_SOURCE_SYSTEM,
  paymentCollectionResponsibilityHoldRequired,
} from "@/lib/parent-billing-visibility";
import { invoiceResponsibilityReviewExempt, invoiceResponsibilitySeparation } from "@/lib/invoice-responsibility-separation";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";

export type AutopayRunResultStatus = "would_charge" | "paid" | "processing" | "failed" | "skipped";

export type AutopayRunInvoiceResult = {
  invoiceId: string;
  invoiceNumber: string;
  familyName: string;
  centerId: string | null;
  centerName: string | null;
  amountCents: number;
  invoiceAmountCents: number;
  accountCreditAppliedCents: number;
  stripeChargePrincipalCents: number;
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
  hasMore: boolean;
  nextCursor: string | null;
  results: AutopayRunInvoiceResult[];
};

type ProcessAutopayInput = {
  dryRun?: boolean;
  asOf?: Date;
  limit?: number;
  centerIds?: string[];
  invoiceId?: string | null;
  invoiceIds?: string[];
  cursorInvoiceId?: string | null;
  expectedAmountCentsByInvoiceId?: Record<string, number>;
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
    billingAccount: {
      family: {
        is: { children: { some: currentlyEnrolledChildWhere() } },
      },
    },
  };
  if (requireDueDate) invoiceWhere.dueDate = { lte: asOf };
  if (input.invoiceId) invoiceWhere.id = input.invoiceId;
  else if (input.invoiceIds?.length) invoiceWhere.id = { in: unique(input.invoiceIds) };
  if (centerIds.length) {
    invoiceWhere.billingAccount = {
      family: {
        is: {
          centerId: { in: centerIds },
          children: { some: currentlyEnrolledChildWhere() },
        },
      },
    };
  }

  const invoiceCandidates = await prisma.invoice.findMany({
    where: invoiceWhere,
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: limit + 1,
    ...(input.cursorInvoiceId && !input.invoiceId && !input.invoiceIds?.length
      ? { cursor: { id: input.cursorInvoiceId }, skip: 1 }
      : {}),
    include: {
      items: { select: { description: true } },
      billingAccount: {
        select: {
          id: true,
          familyId: true,
          balanceCents: true,
          autopayPlaceholder: true,
          customFields: true,
          ledgerEntries: {
            where: {
              OR: [
                { type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } },
                { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM },
              ],
            },
            select: { type: true, sourceSystem: true, amountCents: true, invoiceId: true, externalId: true, metadata: true },
          },
          family: {
            select: {
              id: true,
              name: true,
              billingEmail: true,
              centerId: true,
              customFields: true,
              guardians: { select: { userId: true } },
              children: { select: { customFields: true } },
            },
          },
        },
      },
    },
  });
  const hasMore = invoiceCandidates.length > limit;
  const invoices = invoiceCandidates.slice(0, limit);
  const nextCursor = hasMore && invoices.length ? invoices[invoices.length - 1].id : null;

  const billingAccountIds = unique(invoices.map((invoice) => invoice.billingAccountId));
  const familyCenterIds = unique(invoices.map((invoice) => invoice.billingAccount.family.centerId));
  const [payments, centers, openInvoiceTotals] = await Promise.all([
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
    billingAccountIds.length
      ? prisma.invoice.groupBy({
          by: ["billingAccountId"],
          where: {
            billingAccountId: { in: billingAccountIds },
            status: PaymentStatus.OPEN,
            totalCents: { gt: 0 },
          },
          _sum: { totalCents: true },
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
  const reservedCreditByAccountId = new Map<string, number>();
  for (const payment of payments) {
    if (!isActiveStripeAutopayPayment(payment)) continue;
    const fields = jsonRecord(payment.customFields);
    const reservedCents = Math.max(0, Number(fields.accountCreditAppliedCents) || 0);
    if (!reservedCents) continue;
    reservedCreditByAccountId.set(
      payment.billingAccountId,
      (reservedCreditByAccountId.get(payment.billingAccountId) ?? 0) + reservedCents,
    );
  }
  const openInvoiceTotalByAccountId = new Map(
    openInvoiceTotals.map((row) => [row.billingAccountId, row._sum.totalCents ?? 0]),
  );
  const availableCreditByAccountId = new Map<string, number>();
  for (const invoice of invoices) {
    if (availableCreditByAccountId.has(invoice.billingAccountId)) continue;
    availableCreditByAccountId.set(invoice.billingAccountId, availableAccountCreditCents({
      balanceCents: invoice.billingAccount.balanceCents,
      openInvoiceTotalCents: openInvoiceTotalByAccountId.get(invoice.billingAccountId) ?? 0,
      reservedCreditCents: reservedCreditByAccountId.get(invoice.billingAccountId) ?? 0,
    }));
  }

  const configCache = new Map<string, TenantStripeConfig>();
  const connectedAccountCache = new Map<string, {
    ok: boolean;
    accountId: string | null;
    reason: string | null;
    schoolPaysStripeFeesDirectly: boolean;
  }>();
  const results: AutopayRunInvoiceResult[] = [];
  const blockedBillingAccountIds = new Set<string>();

  for (const invoice of invoices) {
    const family = invoice.billingAccount.family;
    const center = family.centerId ? centersById.get(family.centerId) : null;
    const invoiceFields = jsonRecord(invoice.customFields);
    let baseResult = {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      familyName: family.name,
      centerId: family.centerId,
      centerName: center?.name ?? null,
      amountCents: invoice.totalCents,
      invoiceAmountCents: invoice.totalCents,
      accountCreditAppliedCents: 0,
      stripeChargePrincipalCents: invoice.totalCents,
      paymentId: null,
      stripePaymentIntentId: null,
    };

    if (collectionMode === "autopay" && invoiceFields.autopaySuppressed === true) {
      results.push({
        ...baseResult,
        status: "skipped",
        reason: "Automatic collection is paused for this recovery invoice pending billing review.",
      });
      continue;
    }

    if (blockedBillingAccountIds.has(invoice.billingAccountId)) {
      results.push({
        ...baseResult,
        status: "skipped",
        reason: "An earlier invoice for this family failed; account credit remains allocated to the oldest balance.",
      });
      continue;
    }

    const attempts = paymentsByInvoiceId.get(invoice.id) ?? [];
    if (attempts.some((payment) => payment.status === PaymentStatus.PAID)) {
      results.push({ ...baseResult, status: "skipped", reason: "Invoice already has a completed online payment." });
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

    const billingApproval = stripeSchoolBillingApproval({ customFields: center.customFields, centerName: center.name });
    if (!billingApproval.approved) {
      results.push({ ...baseResult, status: "skipped", reason: billingApproval.blockingReason });
      continue;
    }

    if (!invoiceResponsibilityReviewExempt(invoice.customFields) && paymentCollectionResponsibilityHoldRequired({
      accountBalanceCents: invoice.billingAccount.balanceCents,
      agencyLedgerEntries: invoice.billingAccount.ledgerEntries,
      invoiceId: invoice.id,
      invoiceResponsibilitySeparated: invoiceResponsibilitySeparation(invoice.customFields) !== null,
      responsibilityEvidence: [
        invoiceFields,
        invoice.items.map((item) => item.description),
      ],
      enforceCollectionHold: true,
    })) {
      results.push({
        ...baseResult,
        status: "skipped",
        reason: "Automated payment is blocked until the school separates agency and family responsibility.",
      });
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
          ? "Family does not have a selected payment method saved yet."
          : "Autopay is not enabled with a saved payment method.",
      });
      continue;
    }
    if (collectionMode === "autopay") {
      const consentUserId = clean(jsonRecord(invoice.billingAccount.customFields).autopayEnabledByUserId);
      const consentedPaymentMethodId = clean(jsonRecord(invoice.billingAccount.customFields).autopayPaymentMethodId);
      const consentIsFromLinkedGuardian = Boolean(
        consentUserId && family.guardians.some((guardian) => guardian.userId === consentUserId),
      );
      const consentAllowsSavedMethod = !consentedPaymentMethodId
        || consentedPaymentMethodId === paymentMethod.stripeDefaultPaymentMethodId;
      if (!consentIsFromLinkedGuardian || !consentAllowsSavedMethod) {
        results.push({
          ...baseResult,
          status: "skipped",
          reason: "A linked parent or guardian must re-enable autopay in the Parent Portal before this invoice can be charged.",
        });
        continue;
      }
    }
    const availableCreditCents = availableCreditByAccountId.get(invoice.billingAccountId) ?? 0;
    const creditAllocation = allocateAccountCreditToInvoice({
      invoiceTotalCents: invoice.totalCents,
      availableCreditCents,
    });
    baseResult = {
      ...baseResult,
      amountCents: creditAllocation.stripeChargePrincipalCents,
      accountCreditAppliedCents: creditAllocation.accountCreditAppliedCents,
      stripeChargePrincipalCents: creditAllocation.stripeChargePrincipalCents,
    };

    const expectedAmountCents = input.expectedAmountCentsByInvoiceId?.[invoice.id];
    if (expectedAmountCents !== undefined && expectedAmountCents !== creditAllocation.stripeChargePrincipalCents) {
      results.push({
        ...baseResult,
        status: "skipped",
        reason: "The family balance or available account credit changed after review. Review this balance again before processing.",
      });
      continue;
    }

    if (creditAllocation.fullyCoveredByCredit) {
      if (dryRun) {
        availableCreditByAccountId.set(
          invoice.billingAccountId,
          Math.max(0, availableCreditCents - creditAllocation.accountCreditAppliedCents),
        );
        results.push({
          ...baseResult,
          status: "would_charge",
          reason: "Account credit would pay this invoice in full; no processor payment is needed.",
        });
        continue;
      }

      const application = await prisma.$transaction(async (tx) => {
        const applied = await applyAccountCreditToInvoice(tx, { invoiceId: invoice.id });
        if (applied.applied) {
          await tx.auditLog.create({
            data: {
              tenantId: center.organization.tenantId,
              centerId: center.id,
              userId: input.requestedByUserId || null,
              action: collectionMode === "stored_method"
                ? "billing.stored_method.credit_applied"
                : "billing.autopay.credit_applied",
              resource: "Invoice",
              resourceId: invoice.id,
              metadata: jsonInput({
                invoiceAmountCents: invoice.totalCents,
                accountCreditAppliedCents: applied.accountCreditAppliedCents ?? invoice.totalCents,
                stripeChargePrincipalCents: 0,
                noStripePaymentSubmitted: true,
              }),
            },
          });
          await tx.center.update({ where: { id: center.id }, data: { updatedAt: new Date() } });
        }
        return applied;
      }, { maxWait: 10_000, timeout: 30_000 });

      if (!application.applied) {
        results.push({
          ...baseResult,
          status: "skipped",
          reason: application.reason === "insufficient_account_credit"
            ? "Account credit changed before it could be applied; the invoice was left open for a safe retry."
            : `Account credit could not be applied: ${application.reason || "unknown_error"}.`,
        });
        continue;
      }
      availableCreditByAccountId.set(
        invoice.billingAccountId,
        Math.max(0, availableCreditCents - (application.accountCreditAppliedCents ?? invoice.totalCents)),
      );
      results.push({
        ...baseResult,
        amountCents: 0,
        accountCreditAppliedCents: application.accountCreditAppliedCents ?? invoice.totalCents,
        stripeChargePrincipalCents: 0,
        status: "paid",
        reason: "Invoice paid from account credit; no processor payment was submitted.",
      });
      continue;
    }

    const autopayPaymentMethodCategory = paymentMethodAutopayCategory(paymentMethod);
    let billingAccountFields = jsonRecord(invoice.billingAccount.customFields);
    const cardRecoveryRequiresAcceptance =
      autopayPaymentMethodCategory === "card" &&
      getStripeProcessingRecoveryAmount(creditAllocation.stripeChargePrincipalCents, "card") > 0;
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

    const activeConnectedAccountId = readStripeConnectedAccountId(center.customFields);
    const savedMethodConnectedAccountId = clean(billingAccountFields.stripeDefaultPaymentMethodConnectedAccountId);
    const connectedAccountId = stripeConnectSavedMethodAccount({
      activeAccountId: activeConnectedAccountId,
      savedMethodAccountId: savedMethodConnectedAccountId,
      centerCustomFields: center.customFields,
    });
    if (savedMethodConnectedAccountId && !connectedAccountId) {
      results.push({
        ...baseResult,
        status: "skipped",
        reason: "The saved payment method is not linked to this school's active or retained transition account.",
      });
      continue;
    }
    let schoolPaysStripeFeesDirectly = jsonRecord(center.customFields).stripeFeesCollector === "stripe";
    if (!connectedAccountId && !allowPlatformOnlyPayments) {
      results.push({ ...baseResult, status: "skipped", reason: "School payout account is not connected." });
      continue;
    }

    if (connectedAccountId && requireActiveConnectedAccount) {
      let accountReadiness = connectedAccountCache.get(connectedAccountId);
      if (!accountReadiness) {
        if (dryRun) {
          if (connectedAccountId === activeConnectedAccountId) {
            const readiness = stripeConnectReadinessFromFields(center.customFields);
            accountReadiness = {
              ok: readiness.canAcceptParentPayments,
              accountId: readiness.accountId,
              reason: readiness.blockingReason,
              schoolPaysStripeFeesDirectly: jsonRecord(center.customFields).stripeFeesCollector === "stripe",
            };
          } else {
            accountReadiness = {
              ok: true,
              accountId: connectedAccountId,
              reason: null,
              schoolPaysStripeFeesDirectly: false,
            };
          }
        } else {
          const retrieved = await retrieveStripeConnectedAccount(connectedAccountId, { tenantId });
          if (retrieved.ok && retrieved.account) {
            const readiness = stripeConnectReadinessFromSnapshot(retrieved.account);
            if (connectedAccountId === activeConnectedAccountId) {
              await prisma.center.update({
                where: { id: center.id },
                data: {
                  customFields: jsonInput({
                    ...jsonRecord(center.customFields),
                    ...stripeConnectCustomFieldPatch(readiness),
                    stripeMerchantCapabilityStatus: retrieved.account.merchantCapabilityStatus || null,
                    stripeRecipientTransferStatus: retrieved.account.recipientTransferStatus || null,
                    stripeFeesCollector: retrieved.account.feesCollector || null,
                    stripeLossesCollector: retrieved.account.lossesCollector || null,
                  }),
                },
              });
            }
            accountReadiness = {
              ok: readiness.canAcceptParentPayments,
              accountId: readiness.accountId,
              reason: readiness.blockingReason,
              schoolPaysStripeFeesDirectly: stripeConnectedAccountPaysFeesDirectly(retrieved.account),
            };
          } else {
            accountReadiness = {
              ok: false,
              accountId: connectedAccountId,
              reason: retrieved.error || "School payout status could not be confirmed.",
              schoolPaysStripeFeesDirectly: false,
            };
          }
        }
        connectedAccountCache.set(connectedAccountId, accountReadiness);
      }
      if (!accountReadiness.ok) {
        results.push({ ...baseResult, status: "skipped", reason: accountReadiness.reason || "School payout account is not ready." });
        continue;
      }
      schoolPaysStripeFeesDirectly = accountReadiness.schoolPaysStripeFeesDirectly;
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
    const amounts = getStripeCheckoutAmounts(creditAllocation.stripeChargePrincipalCents, {
      paymentMethodCategory: autopayPaymentMethodCategory,
      waiveBeeSuitePaymentOperationsFee,
      schoolPaysStripeFeesDirectly,
    });

    if (dryRun) {
      availableCreditByAccountId.set(
        invoice.billingAccountId,
        Math.max(0, availableCreditCents - creditAllocation.accountCreditAppliedCents),
      );
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
        amountCents: creditAllocation.stripeChargePrincipalCents,
        status: PaymentStatus.DRAFT,
        provider: "stripe",
        externalIdPlaceholder: "payment_intent_pending",
        customFields: jsonInput({
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          familyId: family.id,
          centerId: center.id,
          invoiceTotalCents: invoice.totalCents,
          invoiceAmountCents: amounts.invoiceAmountCents,
          accountCreditAppliedCents: creditAllocation.accountCreditAppliedCents,
          stripeChargePrincipalCents: creditAllocation.stripeChargePrincipalCents,
          parentSurchargeAmountCents: amounts.parentSurchargeAmountCents,
          parentProcessingRecoveryAmountCents: amounts.parentProcessingRecoveryAmountCents,
          schoolProcessingFeeAmountCents: amounts.schoolProcessingFeeAmountCents,
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
        invoiceTotalCents: String(invoice.totalCents),
        invoiceAmountCents: String(amounts.invoiceAmountCents),
        accountCreditAppliedCents: String(creditAllocation.accountCreditAppliedCents),
        stripeChargePrincipalCents: String(creditAllocation.stripeChargePrincipalCents),
        parentSurchargeAmountCents: String(amounts.parentSurchargeAmountCents),
        parentProcessingRecoveryAmountCents: String(amounts.parentProcessingRecoveryAmountCents),
        schoolProcessingFeeAmountCents: String(amounts.schoolProcessingFeeAmountCents),
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
          invoiceAmountCents: invoice.totalCents,
          accountCreditAppliedCents: creditAllocation.accountCreditAppliedCents,
          stripeChargePrincipalCents: creditAllocation.stripeChargePrincipalCents,
          checkoutTotalCents: amounts.checkoutTotalCents,
          status: intentStatus,
          error: intent.ok ? null : intent.error || null,
          appliedImmediately,
          immediateApplicationReason,
        }),
      },
    });
    await prisma.center.update({ where: { id: center.id }, data: { updatedAt: new Date() } });

    const resultStatus: AutopayRunResultStatus = appliedImmediately
      ? "paid"
      : accepted && intentStatus === "processing"
        ? "processing"
        : "failed";
    const resultReason = appliedImmediately
      ? creditAllocation.accountCreditAppliedCents > 0
        ? "Account credit was applied first; only the remaining balance was submitted for payment."
        : "Payment confirmed and the Bee Suite ledger was updated."
      : accepted && intentStatus === "processing"
        ? creditAllocation.accountCreditAppliedCents > 0
          ? "Account credit is reserved for this invoice; the remaining bank payment is processing."
          : "Bank payment is processing; the ledger will update when the payment processor confirms settlement."
        : immediateApplicationReason
          ? `Payment succeeded with the processor but could not be applied automatically: ${immediateApplicationReason}.`
          : intent.error || `${collectionLabel} could not be submitted.`;

    if (appliedImmediately || (accepted && intentStatus === "processing")) {
      availableCreditByAccountId.set(
        invoice.billingAccountId,
        Math.max(0, availableCreditCents - creditAllocation.accountCreditAppliedCents),
      );
    } else if (resultStatus === "failed") {
      blockedBillingAccountIds.add(invoice.billingAccountId);
    }

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
    hasMore,
    nextCursor,
    results,
  };
}
