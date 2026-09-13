import type { ComponentProps } from "react";
import type { PaymentMethodRequestForm } from "../../src/components/payment-method-request-form";

type Props = ComponentProps<typeof PaymentMethodRequestForm>;
// Inert fake credentials and props. Never imported by application code.
export const publicPaymentCases: Record<string, Partial<Props>> = {
  normal: {},
  bank: { focus: "instant-bank" },
  pending: { bankVerificationPending: true, autopayStatus: "pending" },
  "pending-success": { bankVerificationPending: true, autopayStatus: "pending", paymentMethodStatus: "success" },
  "pending-success-bank": { bankVerificationPending: true, autopayStatus: "pending", paymentMethodStatus: "success", focus: "instant-bank" },
  reauthorization: { reauthorization: true },
  preserved: { reauthorization: true, reauthorizationPreservesAutopay: true, autopayStatus: "enabled" },
  "preserved-pending-success": { reauthorization: true, reauthorizationPreservesAutopay: true, bankVerificationPending: true, autopayStatus: "pending", paymentMethodStatus: "success" },
  payment: { paymentStatus: "success" },
  "reauthorization-payment": { paymentStatus: "success", reauthorization: true, reauthorizationPreservesAutopay: true, autopayStatus: "enabled" },
  cancelled: { paymentStatus: "cancelled", paymentMethodStatus: "cancelled" },
  failed: { paymentStatus: "failed" },
  long: { familyName: "Fake Alexandra Gabriella Montgomery-Santiago Family", centerLabel: "Fake School For Early Childhood Learning And Discovery", recipientEmail: "fake-long-address-for-local-layout-checks@example.invalid", savedPaymentMethodLabel: "Fake Community Credit Union account ending 0000" },
  "long-preserved": { reauthorization: true, reauthorizationPreservesAutopay: true, autopayStatus: "enabled", familyName: "Fake Alexandra Gabriella Montgomery-Santiago Family", centerLabel: "Fake School For Early Childhood Learning And Discovery" },
};
