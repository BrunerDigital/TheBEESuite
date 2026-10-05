/** Advance payments require an explicit amount and intent; ordinary balance payments retain their cap. */
export function familyPaymentAmountError(input: { amountCents: number; collectableCents: number; advancePayment: boolean; explicitAmount: boolean }) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 99_999_999) return "Enter a payment amount between $0.01 and $999,999.99.";
  if (input.advancePayment && !input.explicitAmount) return "Enter a custom amount for an advance payment.";
  if (!input.advancePayment && input.amountCents > input.collectableCents) return "The amount exceeds the current family balance. Choose advance payment to hold the excess as household credit.";
  return null;
}
