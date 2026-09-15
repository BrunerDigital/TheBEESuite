import { UserRole } from "@prisma/client";

/** Empty until an operator approves a tested role rollout. Invalid values fail closed. */
export function roleRequiresMfa(role: UserRole, configured = process.env.BEE_MFA_REQUIRED_ROLES ?? "") {
  const roles = configured.split(",").map((value) => value.trim()).filter(Boolean);
  if (roles.some((value) => !Object.values(UserRole).includes(value as UserRole))) return true;
  return roles.includes(role);
}

export function sessionMeetsMfaPolicy(role: UserRole, verified: unknown, configured?: string) {
  return !roleRequiresMfa(role, configured) || verified === true;
}
