export type InvoicePaymentAccountCategory = "current" | "past";

export const PAST_FAMILY_PAYMENT_BLOCK_REASON =
  "This invoice belongs to a past-family historical account. Open the current enrolled family account to review payment methods or autopay.";

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
