import type { Prisma } from "@prisma/client";

/** Queue inside the deletion transaction: rollback must never confirm completion. */
export function accountDeletionCompletionDelivery(input: { requestId: string; tenantId: string; centerId: string | null; email: string; completedAt: Date }): Prisma.IntegrationDeliveryUncheckedCreateInput {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.endsWith("@accounts.invalid")) throw new Error("A valid account email is required for deletion confirmation.");
  return {
    tenantId: input.tenantId, centerId: input.centerId,
    provider: "sendgrid", purpose: "notification_email", direction: "outbound",
    dedupeKey: `account-deletion-completed:${input.requestId}`, recipient: "1 account deletion confirmation",
    status: "pending", attempts: 0, maxAttempts: 5, nextAttemptAt: input.completedAt,
    payload: {
      tenantId: input.tenantId, centerId: input.centerId, to: [input.email],
      subject: "Your BEE Suite account deletion is complete",
      text: `Your Parent Portal login and personal account profile were deleted on ${input.completedAt.toISOString().slice(0, 10)}. You can no longer sign in with this account. Your school may retain childcare, safety, licensing, billing, payment and audit records as required. Contact support@thebeesuite.io or your school with questions about retained records.`,
      fromName: "The BEE Suite", accountDeletionRequestId: input.requestId,
    },
  };
}
