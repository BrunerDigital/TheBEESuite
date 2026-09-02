import { PaymentStatus, Prisma } from "@prisma/client";
import { allocateAccountCreditToInvoice, availableAccountCreditCents } from "@/lib/account-credit-autopay";
import {
  isActiveStripeAutopayPayment,
  isActiveStripeCheckoutPayment,
  isActiveStripeFamilyBalancePayment,
  isActiveStripeTerminalPayment,
  jsonRecord,
} from "@/lib/billing-guardrails";
import { prisma } from "@/lib/prisma";

export type StripePaymentClaimScope = "family_balance" | "invoice_collection";

type StripePaymentClaimCandidate = {
  id: string;
  status: PaymentStatus;
  provider: string;
  customFields: unknown;
};

export function stripePaymentClaimConflict({
  scope,
  invoiceId,
  payment,
}: {
  scope: StripePaymentClaimScope;
  invoiceId?: string | null;
  payment: StripePaymentClaimCandidate;
}) {
  if (scope === "invoice_collection") {
    if (isActiveStripeFamilyBalancePayment(payment)) return "active_family_balance" as const;
    const fields = jsonRecord(payment.customFields);
    if (
      invoiceId &&
      fields.invoiceId === invoiceId &&
      (isActiveStripeCheckoutPayment(payment) || isActiveStripeAutopayPayment(payment) || isActiveStripeTerminalPayment(payment))
    ) {
      return "active_invoice_payment" as const;
    }
    return null;
  }

  if (isActiveStripeFamilyBalancePayment(payment)) return "active_family_balance" as const;
  if (isActiveStripeAutopayPayment(payment)) return "active_invoice_collection" as const;
  if (isActiveStripeTerminalPayment(payment)) return "active_invoice_collection" as const;
  const fields = jsonRecord(payment.customFields);
  if (fields.invoiceId && isActiveStripeCheckoutPayment(payment)) return "active_invoice_collection" as const;
  return null;
}

export async function createStripePaymentClaim({
  billingAccountId,
  scope,
  invoiceId,
  existingPaymentId,
  expectedInvoiceTotalCents,
  expectedAccountCreditAppliedCents,
  paymentData,
}: {
  billingAccountId: string;
  scope: StripePaymentClaimScope;
  invoiceId?: string | null;
  existingPaymentId?: string | null;
  expectedInvoiceTotalCents?: number | null;
  expectedAccountCreditAppliedCents?: number | null;
  paymentData: Omit<Prisma.PaymentUncheckedCreateInput, "billingAccountId">;
}) {
  return prisma.$transaction(async (tx) => {
    const lockedAccounts = await tx.$queryRaw<Array<{ id: string; balanceCents: number }>>(
      Prisma.sql`SELECT "id", "balanceCents" FROM "BillingAccount" WHERE "id" = ${billingAccountId} FOR UPDATE`,
    );
    if (lockedAccounts.length !== 1) {
      return { created: false as const, reason: "billing_account_not_found" as const, blockingPaymentId: null };
    }

    const draftPayments = await tx.payment.findMany({
      where: {
        billingAccountId,
        provider: { in: ["stripe", "stripe_terminal"] },
        status: PaymentStatus.DRAFT,
      },
      select: { id: true, amountCents: true, status: true, provider: true, customFields: true },
    });
    for (const payment of draftPayments) {
      if (payment.id === existingPaymentId) continue;
      const reason = stripePaymentClaimConflict({ scope, invoiceId, payment });
      if (reason) {
        return { created: false as const, reason, blockingPaymentId: payment.id };
      }
    }

    const requestedAmountCents = Number(paymentData.amountCents) || 0;
    if (scope === "invoice_collection") {
      const lockedInvoices = invoiceId
        ? await tx.$queryRaw<Array<{ billingAccountId: string; status: PaymentStatus; totalCents: number }>>(
            Prisma.sql`SELECT "billingAccountId", "status", "totalCents" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`,
          )
        : [];
      const invoice = lockedInvoices[0] ?? null;
      if (!invoice || invoice.billingAccountId !== billingAccountId || invoice.status !== PaymentStatus.OPEN) {
        return { created: false as const, reason: "invoice_not_open" as const, blockingPaymentId: null };
      }
      const openInvoiceTotal = await tx.invoice.aggregate({
        where: { billingAccountId, status: PaymentStatus.OPEN, totalCents: { gt: 0 } },
        _sum: { totalCents: true },
      });
      const reservedCreditCents = draftPayments.reduce((sum, payment) => {
        if (
          payment.id === existingPaymentId
          || (!isActiveStripeAutopayPayment(payment) && !isActiveStripeTerminalPayment(payment))
        ) return sum;
        return sum + Math.max(0, Number(jsonRecord(payment.customFields).accountCreditAppliedCents) || 0);
      }, 0);
      const freshAllocation = allocateAccountCreditToInvoice({
        invoiceTotalCents: invoice.totalCents,
        availableCreditCents: availableAccountCreditCents({
          balanceCents: lockedAccounts[0].balanceCents,
          openInvoiceTotalCents: openInvoiceTotal._sum.totalCents ?? 0,
          reservedCreditCents,
        }),
      });
      if (
        invoice.totalCents !== expectedInvoiceTotalCents
        || freshAllocation.accountCreditAppliedCents !== (expectedAccountCreditAppliedCents ?? 0)
        || freshAllocation.stripeChargePrincipalCents !== requestedAmountCents
      ) {
        return { created: false as const, reason: "invoice_amount_changed" as const, blockingPaymentId: null };
      }
    } else if (requestedAmountCents <= 0 || requestedAmountCents > lockedAccounts[0].balanceCents) {
      return { created: false as const, reason: "family_balance_changed" as const, blockingPaymentId: null };
    }

    if (existingPaymentId) {
      const existingPayment = draftPayments.find((payment) => payment.id === existingPaymentId);
      if (
        !existingPayment
        || existingPayment.amountCents !== requestedAmountCents
        || existingPayment.provider !== paymentData.provider
      ) {
        return { created: false as const, reason: "payment_claim_changed" as const, blockingPaymentId: existingPaymentId };
      }
      return { created: true as const, payment: await tx.payment.findUniqueOrThrow({ where: { id: existingPaymentId } }) };
    }

    const payment = await tx.payment.create({
      data: { ...paymentData, billingAccountId },
    });
    return { created: true as const, payment };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reconcileIdempotentStripeSubmission<T>(submit: () => Promise<T>) {
  try {
    return { resolved: true as const, value: await submit(), retried: false };
  } catch {
    try {
      // Repeating the exact request with the same payment-derived idempotency
      // key returns the original Stripe object when the first response was lost.
      return { resolved: true as const, value: await submit(), retried: true };
    } catch {
      return { resolved: false as const, value: null, retried: true };
    }
  }
}
