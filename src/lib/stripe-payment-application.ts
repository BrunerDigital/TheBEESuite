import { PaymentStatus, Prisma } from "@prisma/client";
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
    paymentId: string;
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

async function applyBalancePaymentToOpenInvoices(
  tx: Prisma.TransactionClient,
  input: {
    billingAccountId: string;
    paymentId: string;
    amountCents: number;
    paidAt: Date;
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
  billingAccountId?: string | null;
  appliedInvoiceIds?: string[];
};

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
  const currentPayment = await tx.payment.findUnique({
    where: { id: input.paymentId },
    select: { status: true, billingAccountId: true, amountCents: true, customFields: true },
  });
  const invoice = await tx.invoice.findUnique({
    where: { id: input.invoiceId },
    select: { status: true, billingAccountId: true, totalCents: true, customFields: true },
  });
  if (!currentPayment || !invoice) {
    return { applied: false, reason: currentPayment ? "invoice_not_found" : "payment_not_found" };
  }

  const currentFields = jsonRecord(currentPayment.customFields);
  if (currentPayment.status === PaymentStatus.PAID && clean(currentFields.stripePaymentIntentId) === input.stripePaymentIntentId) {
    return { applied: false, reason: "payment_already_applied", billingAccountId: currentPayment.billingAccountId };
  }

  const guard = checkoutApplicationGuard({
    invoiceStatus: invoice.status,
    invoiceBillingAccountId: invoice.billingAccountId,
    invoiceTotalCents: invoice.totalCents,
    paymentStatus: currentPayment.status,
    paymentBillingAccountId: currentPayment.billingAccountId,
    paymentAmountCents: currentPayment.amountCents,
  });
  if (!guard.ok) {
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

  const invoiceClaim = await tx.invoice.updateMany({
    where: { id: input.invoiceId, status: { not: PaymentStatus.PAID } },
    data: { status: PaymentStatus.PAID },
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

  const paidAt = input.appliedAt ?? new Date();
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
        parentSurchargeAmountCents: centsFrom(metadata.parentSurchargeAmountCents),
        parentProcessingRecoveryAmountCents: centsFrom(metadata.parentProcessingRecoveryAmountCents || metadata.parentSurchargeAmountCents),
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
        parentSurchargeAmountCents: centsFrom(metadata.parentSurchargeAmountCents),
        parentProcessingRecoveryAmountCents: centsFrom(metadata.parentProcessingRecoveryAmountCents || metadata.parentSurchargeAmountCents),
        beeSuitePaymentOperationsFeeAmountCents: centsFrom(metadata.beeSuitePaymentOperationsFeeAmountCents),
        applicationFeeAmountCents: centsFrom(metadata.applicationFeeAmountCents),
      }),
    },
  });
  await applyRegistrationPaymentCompletion(tx, {
    invoiceId: input.invoiceId,
    paymentId: payment.id,
    paidAt,
    invoiceCustomFields: invoice.customFields,
  });
  return { applied: true, reason: null, billingAccountId: payment.billingAccountId };
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
  const currentPayment = await tx.payment.findUnique({
    where: { id: input.paymentId },
    select: {
      status: true,
      billingAccountId: true,
      amountCents: true,
      customFields: true,
    },
  });
  if (!currentPayment) return { applied: false, reason: "payment_not_found" };
  if (currentPayment.status === PaymentStatus.PAID) {
    return { applied: false, reason: "payment_already_applied", billingAccountId: currentPayment.billingAccountId };
  }
  if (currentPayment.status !== PaymentStatus.DRAFT) {
    return { applied: false, reason: "payment_not_chargeable", billingAccountId: currentPayment.billingAccountId };
  }

  const paidAt = input.appliedAt ?? new Date();
  const currentFields = jsonRecord(currentPayment.customFields);
  const payment = await tx.payment.update({
    where: { id: input.paymentId },
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
        beeSuitePaymentOperationsFeeAmountCents: centsFrom(metadata.beeSuitePaymentOperationsFeeAmountCents),
        checkoutTotalCents: centsFrom(metadata.checkoutTotalCents) || input.stripeAmountTotalCents || null,
        applicationFeeAmountCents: centsFrom(metadata.applicationFeeAmountCents),
        requestedPaymentMethodCategory: clean(metadata.requestedPaymentMethodCategory) || null,
        paymentMethodCategory: clean(metadata.paymentMethodCategory) || null,
        bankAccountVerificationMethod: clean(metadata.bankAccountVerificationMethod) || null,
        ...productPaymentMetadata(metadata),
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
        beeSuitePaymentOperationsFeeAmountCents: centsFrom(metadata.beeSuitePaymentOperationsFeeAmountCents),
        applicationFeeAmountCents: centsFrom(metadata.applicationFeeAmountCents),
      }),
    },
  });
  const appliedInvoiceIds = await applyBalancePaymentToOpenInvoices(tx, {
    billingAccountId: payment.billingAccountId,
    paymentId: payment.id,
    amountCents: payment.amountCents,
    paidAt,
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
    billingAccountId: payment.billingAccountId,
    appliedInvoiceIds,
  };
}
