import { PaymentStatus, Prisma } from "@prisma/client";
import {
  isActiveStripeAutopayPayment,
  isActiveStripeCheckoutPayment,
  isActiveStripeFamilyBalancePayment,
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
      (isActiveStripeCheckoutPayment(payment) || isActiveStripeAutopayPayment(payment))
    ) {
      return "active_invoice_payment" as const;
    }
    return null;
  }

  if (isActiveStripeFamilyBalancePayment(payment)) return "active_family_balance" as const;
  if (isActiveStripeAutopayPayment(payment)) return "active_invoice_collection" as const;
  const fields = jsonRecord(payment.customFields);
  if (fields.invoiceId && isActiveStripeCheckoutPayment(payment)) return "active_invoice_collection" as const;
  return null;
}

export async function createStripePaymentClaim({
  billingAccountId,
  scope,
  invoiceId,
  paymentData,
}: {
  billingAccountId: string;
  scope: StripePaymentClaimScope;
  invoiceId?: string | null;
  paymentData: Omit<Prisma.PaymentUncheckedCreateInput, "billingAccountId">;
}) {
  return prisma.$transaction(async (tx) => {
    const lockedAccounts = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "BillingAccount" WHERE "id" = ${billingAccountId} FOR UPDATE`,
    );
    if (lockedAccounts.length !== 1) {
      return { created: false as const, reason: "billing_account_not_found" as const, blockingPaymentId: null };
    }

    const draftPayments = await tx.payment.findMany({
      where: {
        billingAccountId,
        provider: "stripe",
        status: PaymentStatus.DRAFT,
      },
      select: { id: true, status: true, provider: true, customFields: true },
    });
    for (const payment of draftPayments) {
      const reason = stripePaymentClaimConflict({ scope, invoiceId, payment });
      if (reason) {
        return { created: false as const, reason, blockingPaymentId: payment.id };
      }
    }

    const payment = await tx.payment.create({
      data: { ...paymentData, billingAccountId },
    });
    return { created: true as const, payment };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
