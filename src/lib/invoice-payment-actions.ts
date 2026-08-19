export type InvoicePaymentAccountCategory = "current" | "past";

export type InvoiceFamilyReference = {
  id: string;
  name: string;
  centerId: string | null;
  billingEmail: string | null;
};

export const PAST_FAMILY_PAYMENT_BLOCK_REASON =
  "This invoice belongs to a past-family historical account. Open the current enrolled family account to review payment methods or autopay.";

export function currentFamilyBillingMatch(input: {
  sourceFamily: InvoiceFamilyReference & { accountCategory: InvoicePaymentAccountCategory };
  currentFamilies: InvoiceFamilyReference[];
}) {
  if (input.sourceFamily.accountCategory !== "past") return null;
  const billingEmail = input.sourceFamily.billingEmail?.trim().toLowerCase();
  if (!billingEmail || !input.sourceFamily.centerId) return null;
  const matches = input.currentFamilies.filter((candidate) =>
    candidate.id !== input.sourceFamily.id
    && candidate.centerId === input.sourceFamily.centerId
    && candidate.billingEmail?.trim().toLowerCase() === billingEmail
  );
  if (matches.length !== 1) return null;
  return { id: matches[0].id, name: matches[0].name, centerId: matches[0].centerId };
}

export function invoicePaymentActionBlockReason(input: {
  invoiceStatus: string;
  invoiceTotalCents: number;
}) {
  if (input.invoiceStatus !== "OPEN") return "Invoice is not open.";
  if (input.invoiceTotalCents <= 0) return "Invoice total must be greater than zero.";
  return null;
}

export function invoiceAutopayBlockReason(input: {
  accountCategory: InvoicePaymentAccountCategory;
  invoiceStatus: string;
  invoiceTotalCents: number;
  autopayStatus: "enabled" | "disabled" | "pending";
  hasStripeCustomer: boolean;
  hasSavedPaymentMethod: boolean;
}) {
  if (input.accountCategory === "past") return PAST_FAMILY_PAYMENT_BLOCK_REASON;
  const invoiceBlock = invoicePaymentActionBlockReason(input);
  if (invoiceBlock) return invoiceBlock;
  if (input.autopayStatus !== "enabled") return "The parent has not enabled autopay on this current family account.";
  if (!input.hasStripeCustomer || !input.hasSavedPaymentMethod) return "No saved payment method.";
  return null;
}
