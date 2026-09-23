export const INSTANT_BANK_CHECKOUT_UNAVAILABLE_MESSAGE =
  "Link is not available under this school's processing-fee setup. Please choose bank account (ACH) or card checkout instead.";

export const PARENT_PAYMENT_UNAVAILABLE_MESSAGE =
  "Online payments are temporarily unavailable. Please contact your school if you need help.";

export const PARENT_PAYMENT_METHOD_UNAVAILABLE_MESSAGE =
  "Payment method settings are temporarily unavailable. Please try again later or contact your school.";

export function paymentServiceError(input: {
  parentFacing: boolean;
  providerError?: string | null;
  fallback: string;
}) {
  if (input.parentFacing) return input.fallback;
  const providerError = input.providerError?.trim();
  return providerError || input.fallback;
}
