import { UserRole } from "@prisma/client";

const refundApproverRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
]);

export type RefundDecision = "approve" | "deny";

export function isExecutiveRefundApproverRole(role: UserRole | string) {
  return refundApproverRoles.has(role as UserRole);
}

export function refundSubmissionMode(role: UserRole | string) {
  return isExecutiveRefundApproverRole(role) ? "issue" as const : "request_approval" as const;
}

export function validateRefundDecisionInput(action: unknown, reason: unknown):
  | { ok: true; action: RefundDecision; reason: string }
  | { ok: false; error: string } {
  const normalizedAction = typeof action === "string" ? action.trim().toLowerCase() : "";
  if (normalizedAction !== "approve" && normalizedAction !== "deny") {
    return { ok: false, error: "Choose approve or deny." };
  }

  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (normalizedReason.length < 3) {
    return { ok: false, error: "Enter a reason for the approval or denial." };
  }

  return { ok: true, action: normalizedAction, reason: normalizedReason };
}
