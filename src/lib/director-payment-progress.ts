import { provisionalAchCreditCents } from "./ach-payment-lifecycle";
import { parentPaymentStatus } from "./parent-payment-status";

/** Use the complete authorized account draft set, independently of recent history. */
export function directorPaymentProgress(payments: Parameters<typeof parentPaymentStatus>[0]) {
  const pending = parentPaymentStatus(payments).accountPaymentBlocker;
  return pending ? {
    phase: pending.phase,
    count: pending.count,
    provisionalAchCreditCents: provisionalAchCreditCents([...payments]),
  } : null;
}

export type DirectorPaymentProgress = NonNullable<ReturnType<typeof directorPaymentProgress>>;

export function directorPaymentProgressTitle(progress: DirectorPaymentProgress) {
  return progress.phase === "confirmation_unknown" ? "Payment confirmation pending"
    : progress.phase === "ach_processing" ? "ACH payment processing" : "Payment in progress";
}
