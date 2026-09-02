import { PaymentStatus, Prisma } from "@prisma/client";
import {
  allocateAccountCreditToInvoice,
  availableAccountCreditCents,
} from "@/lib/account-credit-autopay";
import { checkoutApplicationGuard, jsonRecord } from "@/lib/billing-guardrails";
import { markRegistrationPaymentChecklistPaid } from "@/lib/registration-packet";

type PaymentMetadata = Record<string, unknown>;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function centsFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function inputJson(value: PaymentMetadata): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

export function succeededFamilyBalancePaymentClaim(input: {
  paymentStatus: PaymentStatus;
  storedStripePaymentIntentId?: string | null;
  succeededStripePaymentIntentId: string;
  storedCheckoutAmountCents?: number | null;
  succeededAmountTotalCents?: number | null;
}) {
  if (input.paymentStatus === PaymentStatus.PAID) {
    return { ok: false as const, reason: "payment_already_applied", claimStatus: null, recoveredFromFailedAttempt: false };
  }
  if (input.paymentStatus === PaymentStatus.DRAFT) {
    return { ok: true as const, reason: null, claimStatus: PaymentStatus.DRAFT, recoveredFromFailedAttempt: false };
  }

  const storedStripePaymentIntentId = clean(input.storedStripePaymentIntentId);
  const succeededStripePaymentIntentId = clean(input.succeededStripePaymentIntentId);
  const storedCheckoutAmountCents = centsFrom(input.storedCheckoutAmountCents);
  const succeededAmountTotalCents = centsFrom(input.succeededAmountTotalCents);
  if (
    input.paymentStatus === PaymentStatus.FAILED
    && storedStripePaymentIntentId
    && storedStripePaymentIntentId === succeededStripePaymentIntentId
    && storedCheckoutAmountCents > 0
    && storedCheckoutAmountCents === succeededAmountTotalCents
  ) {
    return { ok: true as const, reason: null, claimStatus: PaymentStatus.FAILED, recoveredFromFailedAttempt: true };
  }

  return { ok: false as const, reason: "payment_not_chargeable", claimStatus: null, recoveredFromFailedAttempt: false };
}

function familyPaymentDescription(metadata: PaymentMetadata, fallback: string) {
  return clean(metadata.description) || fallback;
}

function productPaymentMetadata(metadata: PaymentMetadata) {
  return {
    checkoutPurpose: clean(metadata.checkoutPurpose) || null,
    receiptKind: clean(metadata.receiptKind) || null,
    chargeSource: clean(metadata.chargeSource) || null,
    sourceId: clean(metadata.sourceId) || null,
    productId: clean(metadata.productId) || null,
    productName: clean(metadata.productName) || null,
    productType: clean(metadata.productType) || null,
    productCatalog: clean(metadata.productCatalog) || null,
    productColor: clean(metadata.productColor) || null,
    productSize: clean(metadata.productSize) || null,
    productPurchaseOption: clean(metadata.productPurchaseOption) || null,
    quantity: clean(metadata.quantity) || null,
    itemSummary: clean(metadata.itemSummary) || null,
    purchaseId: clean(metadata.purchaseId) || null,
    purchaserUserId: clean(metadata.purchaserUserId) || null,
    currentGuardianId: clean(metadata.currentGuardianId) || null,
  };
}

function collectionPaymentDescription(collectionMode: string | null) {
  if (collectionMode === "autopay") return "Autopay payment";
  if (collectionMode === "stored_method") return "Saved method payment";
  return "Parent payment";
}

async function applyRegistrationPaymentCompletion(
  tx: Prisma.TransactionClient,
  input: {
    invoiceId: string;
    paymentId: string | null;
    paidAt: Date;
    invoiceCustomFields: unknown;
  },
) {
  const fields = jsonRecord(input.invoiceCustomFields);
  const isRegistrationPayment =
    clean(fields.kind) === "registration_fee_deposit" || clean(fields.checkoutPurpose) === "registration_fee_deposit";
  if (!isRegistrationPayment) return;

  const registrationFeeCents = centsFrom(fields.registrationFeeCents);
  const depositCents = centsFrom(fields.depositCents);
  const totalCents = centsFrom(fields.totalCents) || registrationFeeCents + depositCents;
  const paidAt = input.paidAt.toISOString();
  await tx.invoice.update({
    where: { id: input.invoiceId },
    data: {
      customFields: inputJson({
        ...fields,
        status: "paid",
        paidAt,
        paymentId: input.paymentId,
      }),
    },
  });

  const enrollmentId = clean(fields.enrollmentId);
  if (enrollmentId) {
    const enrollment = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { checklist: true },
    });
    const checklist = markRegistrationPaymentChecklistPaid(enrollment?.checklist, {
      amountCents: totalCents,
      paidAt: input.paidAt,
    });
    await tx.enrollment.updateMany({
      where: { id: enrollmentId },
      data: {
        depositDueCents: depositCents,
        depositPaidCents: depositCents,
        ...(checklist ? { checklist: checklist as unknown as Prisma.InputJsonObject } : {}),
      },
    });
  }

  const submissionId = clean(fields.registrationSubmissionId);
  if (submissionId) {
    const submission = await tx.formSubmission.findUnique({
      where: { id: submissionId },
      select: { data: true },
    });
    if (submission) {
      const data = jsonRecord(submission.data);
      const previousPayment = jsonRecord(data.registrationPayment);
      await tx.formSubmission.update({
        where: { id: submissionId },
        data: {
          data: inputJson({
            ...data,
            registrationPayment: {
              ...previousPayment,
              required: true,
              status: "paid",
              invoiceId: input.invoiceId,
              paymentId: input.paymentId,
              paidAt,
              registrationFeeCents,
              depositCents,
              totalCents,
            },
          }),
        },
      });
    }
  }
}

export async function applyFamilyBalancePaymentToOpenInvoices(
  tx: Prisma.TransactionClient,
  input: {
    billingAccountId: string;
    paymentId: string;
    amountCents: number;
    paidAt: Date;
    accountBalanceAfterCents?: number | null;
    stripeEventId?: string | null;
    stripePaymentIntentId?: string | null;
    stripeCheckoutSessionId?: string | null;
    preferredInvoiceId?: string | null;
  },
) {
  let remainingCents = input.amountCents;
  if (remainingCents <= 0) return [];

  const invoices = await tx.invoice.findMany({
    where: {
      billingAccountId: input.billingAccountId,
      status: PaymentStatus.OPEN,
      totalCents: { gt: 0 },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      totalCents: true,
      customFields: true,
    },
  });

  const preferredInvoiceId = clean(input.preferredInvoiceId);
  const orderedInvoices = preferredInvoiceId
    ? [
        ...invoices.filter((invoice) => invoice.id === preferredInvoiceId),
        ...invoices.filter((invoice) => invoice.id !== preferredInvoiceId),
      ]
    : invoices;
  const openInvoiceTotalCents = orderedInvoices.reduce((total, invoice) => total + invoice.totalCents, 0);
  const invoiceSettlementBudgetCents = Math.max(
    remainingCents,
    openInvoiceTotalCents - Math.max(0, input.accountBalanceAfterCents ?? openInvoiceTotalCents),
  );
  remainingCents = Math.min(openInvoiceTotalCents, invoiceSettlementBudgetCents);
  const paidAt = input.paidAt.toISOString();
  const appliedInvoiceIds: string[] = [];

  for (const invoice of orderedInvoices) {
    if (remainingCents < invoice.totalCents) break;
    const invoiceFields = jsonRecord(invoice.customFields);
    const claim = await tx.invoice.updateMany({
      where: { id: invoice.id, status: PaymentStatus.OPEN },
      data: {
        status: PaymentStatus.PAID,
        customFields: inputJson({
          ...invoiceFields,
          status: "paid",
          paidAt,
          paymentId: input.paymentId,
          paidByBalancePayment: true,
          stripeEventId: input.stripeEventId || null,
          stripePaymentIntentId: input.stripePaymentIntentId || null,
          stripeCheckoutSessionId: input.stripeCheckoutSessionId || null,
        }),
      },
    });
    if (claim.count !== 1) continue;
    remainingCents -= invoice.totalCents;
    appliedInvoiceIds.push(invoice.id);
  }

  return appliedInvoiceIds;
}

export type StripePaymentApplicationResult = {
  applied: boolean;
  reason: string | null;
  applicationScope?: "invoice" | "family_balance";
  billingAccountId?: string | null;
  appliedInvoiceIds?: string[];
};

export async function applyAccountCreditToInvoice(
  tx: Prisma.TransactionClient,
  input: {
    invoiceId: string;
    appliedAt?: Date;
  },
): Promise<StripePaymentApplicationResult & {
  accountCreditAppliedCents?: number;
  stripeChargePrincipalCents?: number;
}> {
  const initialInvoice = await tx.invoice.findUnique({
    where: { id: input.invoiceId },
    select: { billingAccountId: true },
  });
  if (!initialInvoice) return { applied: false, reason: "invoice_not_found" };

  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "BillingAccount" WHERE "id" = ${initialInvoice.billingAccountId} FOR UPDATE`,
  );

  const [invoice, account, openInvoiceTotal, draftPayments] = await Promise.all([
    tx.invoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true,
        status: true,
        billingAccountId: true,
        totalCents: true,
        customFields: true,
      },
    }),
    tx.billingAccount.findUnique({
      where: { id: initialInvoice.billingAccountId },
      select: { balanceCents: true },
    }),
    tx.invoice.aggregate({
      where: {
        billingAccountId: initialInvoice.billingAccountId,
        status: PaymentStatus.OPEN,
        totalCents: { gt: 0 },
      },
      _sum: { totalCents: true },
    }),
    tx.payment.findMany({
      where: {
        billingAccountId: initialInvoice.billingAccountId,
        provider: "stripe",
        status: PaymentStatus.DRAFT,
      },
      select: { customFields: true },
    }),
  ]);
  if (!invoice || !account) {
    return { applied: false, reason: invoice ? "billing_account_not_found" : "invoice_not_found" };
  }
  if (invoice.status !== PaymentStatus.OPEN) {
    return { applied: false, reason: "invoice_already_paid", billingAccountId: invoice.billingAccountId };
  }

  const reservedCreditCents = draftPayments.reduce((total, payment) => {
    const fields = jsonRecord(payment.customFields);
    const status = clean(fields.status);
    if (!status.endsWith("_pending") && !status.endsWith("_processing")) return total;
    return total + centsFrom(fields.accountCreditAppliedCents);
  }, 0);
  const availableCreditCents = availableAccountCreditCents({
    balanceCents: account.balanceCents,
    openInvoiceTotalCents: openInvoiceTotal._sum.totalCents ?? 0,
    reservedCreditCents,
  });
  const allocation = allocateAccountCreditToInvoice({
    invoiceTotalCents: invoice.totalCents,
    availableCreditCents,
  });
  if (!allocation.fullyCoveredByCredit) {
    return {
      applied: false,
      reason: "insufficient_account_credit",
      billingAccountId: invoice.billingAccountId,
      accountCreditAppliedCents: allocation.accountCreditAppliedCents,
      stripeChargePrincipalCents: allocation.stripeChargePrincipalCents,
    };
  }

  const applicationExternalId = `account-credit:invoice:${invoice.id}`;
  const existingApplication = await tx.ledgerEntry.findFirst({
    where: {
      sourceSystem: "bee_suite",
      externalId: applicationExternalId,
    },
    select: {
      billingAccountId: true,
      invoiceId: true,
      paymentId: true,
      type: true,
      metadata: true,
    },
  });
  const existingApplicationFields = jsonRecord(existingApplication?.metadata);
  const existingApplicationMatches = Boolean(
    existingApplication
    && existingApplication.billingAccountId === invoice.billingAccountId
    && existingApplication.invoiceId === invoice.id
    && existingApplication.paymentId === null
    && existingApplication.type === "account_credit_application"
    && centsFrom(existingApplicationFields.accountCreditAppliedCents) === allocation.accountCreditAppliedCents
    && centsFrom(existingApplicationFields.invoiceTotalCents) === invoice.totalCents
    && centsFrom(existingApplicationFields.stripeChargePrincipalCents) === 0
    && existingApplicationFields.fullyCoveredByCredit === true
  );
  if (existingApplication && !existingApplicationMatches) {
    return {
      applied: false,
      reason: "account_credit_application_conflict",
      billingAccountId: invoice.billingAccountId,
    };
  }

  const paidAt = input.appliedAt ?? new Date();
  const invoiceFields = jsonRecord(invoice.customFields);
  const claim = await tx.invoice.updateMany({
    where: { id: invoice.id, status: PaymentStatus.OPEN },
    data: {
      status: PaymentStatus.PAID,
      customFields: inputJson({
        ...invoiceFields,
        status: "paid",
        paidAt: paidAt.toISOString(),
        paidByAccountCredit: true,
        accountCreditAppliedCents: allocation.accountCreditAppliedCents,
        stripeChargePrincipalCents: 0,
      }),
    },
  });
  if (claim.count !== 1) {
    return { applied: false, reason: "invoice_already_paid", billingAccountId: invoice.billingAccountId };
  }

  if (!existingApplication) {
    await tx.ledgerEntry.create({
      data: {
        billingAccountId: invoice.billingAccountId,
        invoiceId: invoice.id,
        paymentId: null,
        type: "account_credit_application",
        description: "Account credit applied",
        amountCents: 0,
        balanceAfterCents: account.balanceCents,
        sourceSystem: "bee_suite",
        externalId: applicationExternalId,
        metadata: inputJson({
          accountCreditAppliedCents: allocation.accountCreditAppliedCents,
          invoiceTotalCents: invoice.totalCents,
          stripeChargePrincipalCents: 0,
          fullyCoveredByCredit: true,
        }),
      },
    });
  }
  await applyRegistrationPaymentCompletion(tx, {
    invoiceId: invoice.id,
    paymentId: null,
    paidAt,
    invoiceCustomFields: invoice.customFields,
  });
  return {
    applied: true,
    reason: null,
    billingAccountId: invoice.billingAccountId,
    accountCreditAppliedCents: allocation.accountCreditAppliedCents,
    stripeChargePrincipalCents: 0,
  };
}

export async function applySucceededStripeInvoicePayment(
  tx: Prisma.TransactionClient,
  input: {
    invoiceId: string;
    paymentId: string;
    externalId: string;
    stripePaymentIntentId: string;
    stripePaymentIntentStatus?: string | null;
    stripeAmountTotalCents?: number | null;
    stripeEventId?: string | null;
    stripeEventCreatedAt?: string | null;
    metadata?: PaymentMetadata;
    appliedAt?: Date;
  },
): Promise<StripePaymentApplicationResult> {
  const metadata = input.metadata ?? {};
  let currentPayment = await tx.payment.findUnique({
    where: { id: input.paymentId },
    select: { status: true, billingAccountId: true, amountCents: true, customFields: true },
  });
  let invoice = await tx.invoice.findUnique({
    where: { id: input.invoiceId },
    select: { status: true, billingAccountId: true, totalCents: true, customFields: true },
  });
  if (!currentPayment || !invoice) {
    return { applied: false, reason: currentPayment ? "invoice_not_found" : "payment_not_found" };
  }

  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "BillingAccount" WHERE "id" = ${currentPayment.billingAccountId} FOR UPDATE`,
  );
  [currentPayment, invoice] = await Promise.all([
    tx.payment.findUnique({
      where: { id: input.paymentId },
      select: { status: true, billingAccountId: true, amountCents: true, customFields: true },
    }),
    tx.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { status: true, billingAccountId: true, totalCents: true, customFields: true },
    }),
  ]);
  if (!currentPayment || !invoice) {
    return { applied: false, reason: currentPayment ? "invoice_not_found" : "payment_not_found" };
  }

  const currentFields = jsonRecord(currentPayment.customFields);
  if (currentPayment.status === PaymentStatus.PAID && clean(currentFields.stripePaymentIntentId) === input.stripePaymentIntentId) {
    return {
      applied: false,
      reason: "payment_already_applied",
      applicationScope: currentFields.creditedAfterInvoiceClosure === true ? "family_balance" : "invoice",
      billingAccountId: currentPayment.billingAccountId,
    };
  }

  const accountCreditAppliedCents = centsFrom(metadata.accountCreditAppliedCents);
  const guard = checkoutApplicationGuard({
    invoiceStatus: invoice.status,
    invoiceBillingAccountId: invoice.billingAccountId,
    invoiceTotalCents: invoice.totalCents,
    paymentStatus: currentPayment.status,
    paymentBillingAccountId: currentPayment.billingAccountId,
    paymentAmountCents: currentPayment.amountCents,
    accountCreditAppliedCents,
  });
  if (!guard.ok) {
    // Stripe has confirmed that money moved. If another payment closed the
    // invoice first, preserve the provider truth as an account-level credit
    // instead of marking the successful payment void.
    if (guard.reason === "invoice_not_open") {
      const recovery = await applySucceededStripeFamilyBalancePayment(tx, {
        paymentId: input.paymentId,
        externalId: input.externalId,
        stripePaymentIntentId: input.stripePaymentIntentId,
        stripePaymentStatus: input.stripePaymentIntentStatus,
        stripePaymentIntentStatus: input.stripePaymentIntentStatus,
        stripeAmountTotalCents: input.stripeAmountTotalCents,
        stripeEventId: input.stripeEventId,
        stripeEventCreatedAt: input.stripeEventCreatedAt,
        metadata: {
          ...metadata,
          paymentScope: "family_balance",
          creditedAfterInvoiceClosure: true,
          originalInvoiceId: input.invoiceId,
        },
        descriptionFallback: `${collectionPaymentDescription(clean(metadata.collectionMode) || null)} received after invoice closure`,
        appliedAt: input.appliedAt,
      });
      return {
        ...recovery,
        applicationScope: recovery.applied ? "family_balance" : recovery.applicationScope,
      };
    }
    await tx.payment.update({
      where: { id: input.paymentId },
      data: {
        status: currentPayment.status === PaymentStatus.PAID ? PaymentStatus.PAID : PaymentStatus.VOID,
        externalIdPlaceholder: input.externalId,
        customFields: inputJson({
          ...currentFields,
          stripePaymentIntentId: input.stripePaymentIntentId,
          stripeEventId: input.stripeEventId || null,
          stripeEventCreatedAt: input.stripeEventCreatedAt || null,
          stripePaymentIntentStatus: input.stripePaymentIntentStatus || null,
          stripeAmountTotalCents: input.stripeAmountTotalCents ?? null,
          ignoredReason: guard.reason,
          requiresManualReview: guard.reason === "invoice_already_paid" && currentPayment.status !== PaymentStatus.PAID,
          status: "payment_intent_ignored",
        }),
      },
    });
    return { applied: false, reason: guard.reason, billingAccountId: currentPayment.billingAccountId };
  }

  const paidAt = input.appliedAt ?? new Date();
  const invoiceFields = jsonRecord(invoice.customFields);
  const invoiceClaim = await tx.invoice.updateMany({
    where: { id: input.invoiceId, status: { not: PaymentStatus.PAID } },
    data: {
      status: PaymentStatus.PAID,
      customFields: inputJson({
        ...invoiceFields,
        status: "paid",
        paidAt: paidAt.toISOString(),
        paymentId: input.paymentId,
        paidWithAccountCredit: accountCreditAppliedCents > 0,
        accountCreditAppliedCents,
        stripeChargePrincipalCents: currentPayment.amountCents,
      }),
    },
  });
  if (invoiceClaim.count !== 1) {
    await tx.payment.update({
      where: { id: input.paymentId },
      data: {
        status: PaymentStatus.VOID,
        externalIdPlaceholder: input.externalId,
        customFields: inputJson({
          ...currentFields,
          stripePaymentIntentId: input.stripePaymentIntentId,
          stripeEventId: input.stripeEventId || null,
          stripePaymentIntentStatus: input.stripePaymentIntentStatus || null,
          stripeAmountTotalCents: input.stripeAmountTotalCents ?? null,
          ignoredReason: "invoice_already_paid",
          requiresManualReview: true,
          status: "payment_intent_ignored",
        }),
      },
    });
    return { applied: false, reason: "invoice_already_paid", billingAccountId: currentPayment.billingAccountId };
  }

  const collectionMode = clean(metadata.collectionMode) || null;
  const payment = await tx.payment.update({
    where: { id: input.paymentId },
    data: {
      status: PaymentStatus.PAID,
      paidAt,
      externalIdPlaceholder: input.externalId,
      customFields: inputJson({
        ...currentFields,
        stripePaymentIntentId: input.stripePaymentIntentId,
        stripeEventId: input.stripeEventId || null,
        stripeEventCreatedAt: input.stripeEventCreatedAt || null,
        stripePaymentIntentStatus: input.stripePaymentIntentStatus || null,
        stripeAmountTotalCents: input.stripeAmountTotalCents ?? null,
        stripeAppliedSynchronouslyAt: paidAt.toISOString(),
        invoiceAmountCents: centsFrom(metadata.invoiceAmountCents) || null,
        invoiceTotalCents: centsFrom(metadata.invoiceTotalCents) || invoice.totalCents,
        accountCreditAppliedCents,
        stripeChargePrincipalCents: currentPayment.amountCents,
        parentSurchargeAmountCents: centsFrom(metadata.parentSurchargeAmountCents),
        parentProcessingRecoveryAmountCents: centsFrom(metadata.parentProcessingRecoveryAmountCents || metadata.parentSurchargeAmountCents),
        schoolProcessingFeeAmountCents: centsFrom(metadata.schoolProcessingFeeAmountCents),
        beeSuitePaymentOperationsFeeAmountCents: centsFrom(metadata.beeSuitePaymentOperationsFeeAmountCents),
        checkoutTotalCents: centsFrom(metadata.checkoutTotalCents) || input.stripeAmountTotalCents || null,
        applicationFeeAmountCents: centsFrom(metadata.applicationFeeAmountCents),
        collectionMode,
        status: "paid",
      }),
    },
  });
  const updatedAccount = await tx.billingAccount.update({
    where: { id: payment.billingAccountId },
    data: { balanceCents: { decrement: payment.amountCents } },
  });
  await tx.ledgerEntry.create({
    data: {
      billingAccountId: payment.billingAccountId,
      invoiceId: input.invoiceId,
      paymentId: payment.id,
      type: "payment",
      description: collectionPaymentDescription(collectionMode),
      amountCents: -payment.amountCents,
      balanceAfterCents: updatedAccount.balanceCents,
      sourceSystem: "stripe",
      externalId: input.stripePaymentIntentId,
      metadata: inputJson({
        stripeEventId: input.stripeEventId || null,
        stripePaymentIntentId: input.stripePaymentIntentId,
        stripeAmountTotalCents: input.stripeAmountTotalCents ?? null,
        stripeAppliedSynchronously: true,
        collectionMode,
        invoiceTotalCents: invoice.totalCents,
        accountCreditAppliedCents,
        stripeChargePrincipalCents: payment.amountCents,
        parentSurchargeAmountCents: centsFrom(metadata.parentSurchargeAmountCents),
        parentProcessingRecoveryAmountCents: centsFrom(metadata.parentProcessingRecoveryAmountCents || metadata.parentSurchargeAmountCents),
        schoolProcessingFeeAmountCents: centsFrom(metadata.schoolProcessingFeeAmountCents),
        beeSuitePaymentOperationsFeeAmountCents: centsFrom(metadata.beeSuitePaymentOperationsFeeAmountCents),
        applicationFeeAmountCents: centsFrom(metadata.applicationFeeAmountCents),
      }),
    },
  });
  if (accountCreditAppliedCents > 0) {
    await tx.ledgerEntry.create({
      data: {
        billingAccountId: payment.billingAccountId,
        invoiceId: input.invoiceId,
        paymentId: payment.id,
        type: "account_credit_application",
        description: "Account credit applied",
        amountCents: 0,
        balanceAfterCents: updatedAccount.balanceCents,
        sourceSystem: "bee_suite",
        externalId: `account-credit:invoice:${input.invoiceId}`,
        metadata: inputJson({
          accountCreditAppliedCents,
          invoiceTotalCents: invoice.totalCents,
          stripeChargePrincipalCents: payment.amountCents,
          stripePaymentIntentId: input.stripePaymentIntentId,
        }),
      },
    });
  }
  await applyRegistrationPaymentCompletion(tx, {
    invoiceId: input.invoiceId,
    paymentId: payment.id,
    paidAt,
    invoiceCustomFields: invoice.customFields,
  });
  return { applied: true, reason: null, applicationScope: "invoice", billingAccountId: payment.billingAccountId };
}

export async function applySucceededStripeFamilyBalancePayment(
  tx: Prisma.TransactionClient,
  input: {
    paymentId: string;
    externalId: string;
    stripePaymentIntentId: string;
    stripePaymentStatus?: string | null;
    stripePaymentIntentStatus?: string | null;
    stripeAmountTotalCents?: number | null;
    stripeEventId?: string | null;
    stripeEventCreatedAt?: string | null;
    metadata?: PaymentMetadata;
    descriptionFallback?: string;
    appliedAt?: Date;
  },
): Promise<StripePaymentApplicationResult> {
  const metadata = input.metadata ?? {};
  let currentPayment = await tx.payment.findUnique({
    where: { id: input.paymentId },
    select: {
      status: true,
      billingAccountId: true,
      amountCents: true,
      customFields: true,
    },
  });
  if (!currentPayment) return { applied: false, reason: "payment_not_found" };
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "BillingAccount" WHERE "id" = ${currentPayment.billingAccountId} FOR UPDATE`,
  );
  currentPayment = await tx.payment.findUnique({
    where: { id: input.paymentId },
    select: {
      status: true,
      billingAccountId: true,
      amountCents: true,
      customFields: true,
    },
  });
  if (!currentPayment) return { applied: false, reason: "payment_not_found" };
  const currentFields = jsonRecord(currentPayment.customFields);
  const claim = succeededFamilyBalancePaymentClaim({
    paymentStatus: currentPayment.status,
    storedStripePaymentIntentId: clean(currentFields.stripePaymentIntentId) || null,
    succeededStripePaymentIntentId: input.stripePaymentIntentId,
    storedCheckoutAmountCents: centsFrom(currentFields.checkoutTotalCents) || currentPayment.amountCents,
    succeededAmountTotalCents: input.stripeAmountTotalCents,
  });
  if (!claim.ok) {
    return { applied: false, reason: claim.reason, billingAccountId: currentPayment.billingAccountId };
  }

  const paidAt = input.appliedAt ?? new Date();
  const claimedPayment = await tx.payment.updateMany({
    where: { id: input.paymentId, status: claim.claimStatus },
    data: {
      status: PaymentStatus.PAID,
      paidAt,
      externalIdPlaceholder: input.externalId,
      customFields: inputJson({
        ...currentFields,
        paymentScope: "family_balance",
        stripePaymentIntentId: input.stripePaymentIntentId,
        stripeEventId: input.stripeEventId || null,
        stripeEventCreatedAt: input.stripeEventCreatedAt || null,
        stripePaymentStatus: input.stripePaymentStatus || input.stripePaymentIntentStatus || null,
        stripePaymentIntentStatus: input.stripePaymentIntentStatus || input.stripePaymentStatus || null,
        stripeAmountTotalCents: input.stripeAmountTotalCents ?? null,
        stripeAppliedSynchronouslyAt: paidAt.toISOString(),
        invoiceAmountCents: centsFrom(metadata.invoiceAmountCents) || null,
        parentSurchargeAmountCents: centsFrom(metadata.parentSurchargeAmountCents),
        parentProcessingRecoveryAmountCents: centsFrom(metadata.parentProcessingRecoveryAmountCents || metadata.parentSurchargeAmountCents),
        schoolProcessingFeeAmountCents: centsFrom(metadata.schoolProcessingFeeAmountCents),
        beeSuitePaymentOperationsFeeAmountCents: centsFrom(metadata.beeSuitePaymentOperationsFeeAmountCents),
        checkoutTotalCents: centsFrom(metadata.checkoutTotalCents) || input.stripeAmountTotalCents || null,
        applicationFeeAmountCents: centsFrom(metadata.applicationFeeAmountCents),
        requestedPaymentMethodCategory: clean(metadata.requestedPaymentMethodCategory) || null,
        paymentMethodCategory: clean(metadata.paymentMethodCategory) || null,
        bankAccountVerificationMethod: clean(metadata.bankAccountVerificationMethod) || null,
        ...productPaymentMetadata(metadata),
        recoveredFromFailedAttempt: claim.recoveredFromFailedAttempt,
        recoveredStripePaymentIntentId: claim.recoveredFromFailedAttempt ? input.stripePaymentIntentId : null,
        status: "paid",
      }),
    },
  });
  if (claimedPayment.count !== 1) {
    const latestPayment = await tx.payment.findUnique({
      where: { id: input.paymentId },
      select: { status: true, customFields: true },
    });
    const latestFields = jsonRecord(latestPayment?.customFields);
    if (
      latestPayment?.status === PaymentStatus.PAID
      && clean(latestFields.stripePaymentIntentId) === input.stripePaymentIntentId
    ) {
      return {
        applied: false,
        reason: "payment_already_applied",
        applicationScope: "family_balance",
        billingAccountId: currentPayment.billingAccountId,
      };
    }
    if (
      claim.claimStatus === PaymentStatus.DRAFT
      && latestPayment?.status === PaymentStatus.FAILED
      && clean(latestFields.stripePaymentIntentId) === input.stripePaymentIntentId
    ) {
      return applySucceededStripeFamilyBalancePayment(tx, input);
    }
    return { applied: false, reason: "payment_state_changed", billingAccountId: currentPayment.billingAccountId };
  }
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
  const updatedAccount = await tx.billingAccount.update({
    where: { id: payment.billingAccountId },
    data: { balanceCents: { decrement: payment.amountCents } },
  });
  await tx.ledgerEntry.create({
    data: {
      billingAccountId: payment.billingAccountId,
      paymentId: payment.id,
      type: "payment",
      description: familyPaymentDescription(metadata, input.descriptionFallback || "Parent payment"),
      amountCents: -payment.amountCents,
      balanceAfterCents: updatedAccount.balanceCents,
      sourceSystem: "stripe",
      externalId: input.stripePaymentIntentId,
      metadata: inputJson({
        stripeEventId: input.stripeEventId || null,
        stripePaymentIntentId: input.stripePaymentIntentId,
        stripeAmountTotalCents: input.stripeAmountTotalCents ?? null,
        stripeAppliedSynchronously: true,
        paymentScope: "family_balance",
        collectionMode: clean(metadata.collectionMode) || null,
        requestedPaymentMethodCategory: clean(metadata.requestedPaymentMethodCategory) || null,
        paymentMethodCategory: clean(metadata.paymentMethodCategory) || null,
        bankAccountVerificationMethod: clean(metadata.bankAccountVerificationMethod) || null,
        ...productPaymentMetadata(metadata),
        parentSurchargeAmountCents: centsFrom(metadata.parentSurchargeAmountCents),
        parentProcessingRecoveryAmountCents: centsFrom(metadata.parentProcessingRecoveryAmountCents || metadata.parentSurchargeAmountCents),
        schoolProcessingFeeAmountCents: centsFrom(metadata.schoolProcessingFeeAmountCents),
        beeSuitePaymentOperationsFeeAmountCents: centsFrom(metadata.beeSuitePaymentOperationsFeeAmountCents),
        applicationFeeAmountCents: centsFrom(metadata.applicationFeeAmountCents),
      }),
    },
  });
  const appliedInvoiceIds = await applyFamilyBalancePaymentToOpenInvoices(tx, {
    billingAccountId: payment.billingAccountId,
    paymentId: payment.id,
    amountCents: payment.amountCents,
    paidAt,
    accountBalanceAfterCents: updatedAccount.balanceCents,
    stripeEventId: input.stripeEventId || null,
    stripePaymentIntentId: input.stripePaymentIntentId,
    stripeCheckoutSessionId: null,
    preferredInvoiceId: clean(metadata.invoiceId) || null,
  });
  if (appliedInvoiceIds.length) {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        customFields: inputJson({
          ...jsonRecord(payment.customFields),
          appliedInvoiceIds,
          appliedInvoiceCount: appliedInvoiceIds.length,
          invoiceApplicationStatus: "applied_to_open_invoices",
          status: "paid",
        }),
      },
    });
  }

  return {
    applied: true,
    reason: null,
    applicationScope: "family_balance",
    billingAccountId: payment.billingAccountId,
    appliedInvoiceIds,
  };
}
