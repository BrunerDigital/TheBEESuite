import type { Prisma } from "@prisma/client";
import { AGENCY_LEDGER_SOURCE_SYSTEM } from "./parent-billing-visibility";

export const parentPaymentHistoryWhere = {
  NOT: { provider: AGENCY_LEDGER_SOURCE_SYSTEM },
  OR: [
    { status: { in: ["PAID", "REFUNDED"] } },
    {
      provider: "stripe",
      status: "DRAFT",
      OR: [
        { customFields: { path: ["status"], equals: "checkout_created" } },
        { customFields: { path: ["status"], equals: "checkout_pending" } },
        { customFields: { path: ["status"], equals: "paid_processing" } },
        { customFields: { path: ["status"], equals: "autopay_processing" } },
        { customFields: { path: ["status"], equals: "stored_method_processing" } },
        { customFields: { path: ["status"], equals: "director_saved_method_processing" } },
      ],
    },
    {
      provider: "stripe",
      status: "FAILED",
      customFields: { path: ["status"], equals: "payment_returned" },
    },
  ],
} satisfies Prisma.PaymentWhereInput;

export type ParentPaidInvoiceReference = {
  number: string;
  dueDate: Date | string;
  childName: string | null;
};

function recordFields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parentPaidInvoiceReferences(
  paymentId: string,
  invoices: ReadonlyArray<Pick<ParentPaidInvoiceReference, "number" | "dueDate"> & {
    status: string;
    customFields: unknown;
  }>,
  childNames: ReadonlyMap<string, string>,
): ParentPaidInvoiceReference[] {
  return invoices.flatMap((invoice) => {
    const fields = recordFields(invoice.customFields);
    if (invoice.status !== "PAID" || fields.paymentId !== paymentId) return [];
    const childId = typeof fields.childId === "string" ? fields.childId.trim() : "";
    return [{
      number: invoice.number,
      dueDate: invoice.dueDate,
      childName: childNames.get(childId) ?? null,
    }];
  });
}

/** Presentation only. Keep the original payment distinct from money later refunded. */
export function paymentRefundDetails(payment: { status: string; customFields?: unknown }) {
  const fields = recordFields(payment.customFields);
  const amount = fields.stripeAmountRefundedCents;
  const refundedCents = typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0 ? amount : null;
  if (payment.status === "REFUNDED") return { label: "Refunded", refundedCents };
  if (payment.status !== "PAID") return null;
  if (refundedCents === null && fields.status !== "partially_refunded" && fields.status !== "refunded") return null;
  return {
    label: fields.status === "refunded" || fields.stripeFullyRefunded === true ? "Refunded" : "Partially refunded",
    refundedCents,
  };
}
