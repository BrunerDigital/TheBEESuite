/** A wallet selection does not prove its eventual funding source. */
export function linkCheckoutIsUnsafe(request: {
  paymentMethodCategory?: string;
  connectedAccountId?: string | null;
  amountCents?: number;
  invoiceAmountCents?: number;
  parentSurchargeAmountCents?: number;
  metadata?: Record<string, string>;
}) {
  if (request.paymentMethodCategory === "link_bank") return true;
  if (request.paymentMethodCategory !== "link") return false;
  return !request.connectedAccountId?.startsWith("acct_")
    || request.metadata?.stripeFeesCollector !== "stripe"
    || request.metadata?.schoolProcessingFeeAmountCents !== "0"
    || request.metadata?.parentProcessingRecoveryAmountCents !== "0"
    || request.metadata?.paymentMethodCategory !== "link"
    || Boolean(request.metadata?.bankAccountVerificationMethod)
    || (request.parentSurchargeAmountCents ?? 0) !== 0
    || !Number.isSafeInteger(request.invoiceAmountCents)
    || Number(request.invoiceAmountCents) <= 0
    || request.amountCents !== request.invoiceAmountCents;
}
