import { createHash } from "node:crypto";

export function accountDeletionFingerprint(input: { id: string; tenantId: string; userId: string | null; createdAt: Date | string }) {
  const createdAt = new Date(input.createdAt).toISOString();
  return createHash("sha256")
    .update(`${input.tenantId}:${input.id}:${input.userId ?? "none"}:${createdAt}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
}

export function accountDeletionApprovalPhrase(fingerprint: string) {
  return `APPROVE ${fingerprint}`;
}

export function accountDeletionExecutionPhrase(fingerprint: string) {
  return `DELETE LOGIN ${fingerprint}`;
}

export function canExecuteAccountDeletion(input: {
  status: string;
  updatedAt?: Date | string;
  now?: Date | string;
  targetRole: string | null;
  targetUserId: string | null;
  actorUserId: string;
  retentionNoticeAccepted: boolean;
  schoolReviewRequired: boolean;
}) {
  const now = new Date(input.now ?? Date.now()).getTime();
  const updatedAt = input.updatedAt ? new Date(input.updatedAt).getTime() : Number.NaN;
  const staleExecution = input.status === "executing"
    && Number.isFinite(updatedAt)
    && now - updatedAt >= 15 * 60 * 1000;
  return (
    (["approved", "partially_completed"].includes(input.status) || staleExecution)
    && input.targetRole === "PARENT_GUARDIAN"
    && Boolean(input.targetUserId)
    && input.targetUserId !== input.actorUserId
    && input.retentionNoticeAccepted
    && input.schoolReviewRequired
  );
}
