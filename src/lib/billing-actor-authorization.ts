import { UserRole, type Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { teamAccessGrantWhere, teamStaffProfileWhere } from "@/lib/team-permissions-scope";

type BillingActor = Pick<CurrentUser, "id" | "email" | "role" | "identityTenantId" | "tenantId" | "sessionVersion" | "deviceSessionId" | "centerIds" | "workspace">;
type BillingTarget = { tenantId: string; centerId: string; familyId: string; billingAccountId: string };
type Database = Pick<Prisma.TransactionClient, "user" | "deviceSession" | "center" | "billingAccount" | "guardian">;
const billingRoles = new Set<UserRole>([UserRole.PLATFORM_OWNER, UserRole.BRAND_ADMIN, UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN, UserRole.PARENT_GUARDIAN]);
const schoolAssignedRoles = new Set<UserRole>([UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN]);

/** Recheck identity and exact target inside the payment claim transaction. */
export async function authorizeBillingActorForTarget(tx: Database, actor: BillingActor, target: BillingTarget, at = new Date()): Promise<boolean> {
  if (!billingRoles.has(actor.role) || !actor.id || !actor.email || !actor.identityTenantId
    || !Number.isSafeInteger(actor.sessionVersion) || actor.sessionVersion < 0 || !Number.isFinite(at.getTime())
    || !target.tenantId || !target.centerId || !target.familyId || !target.billingAccountId
    || actor.tenantId !== target.tenantId) return false;
  const parent = actor.role === UserRole.PARENT_GUARDIAN;
  if (!parent && !actor.centerIds.includes(target.centerId)) return false;
  if (actor.identityTenantId !== target.tenantId && (actor.role !== UserRole.PLATFORM_OWNER
    || actor.workspace?.mode !== "center" || actor.workspace.activeCenterId !== target.centerId)) return false;

  const scope = { tenantId: target.tenantId, tenantWide: false, visibleCenterIds: [target.centerId], at };
  const actorWhere: Prisma.UserWhereInput = {
    id: actor.id, email: actor.email, tenantId: actor.identityTenantId, role: actor.role, isActive: true,
    sessionVersion: actor.sessionVersion, ...(!parent ? { mustResetPassword: false } : {}),
    ...(schoolAssignedRoles.has(actor.role) ? { OR: [
      { staffProfile: teamStaffProfileWhere(scope) },
      { accessGrants: { some: { AND: [teamAccessGrantWhere(scope), { scopeType: "CENTER", centerId: target.centerId, role: actor.role }] } } },
    ] } : {}),
  };
  if (!await tx.user.findFirst({ where: actorWhere, select: { id: true } })) return false;
  if (actor.deviceSessionId && !await tx.deviceSession.findFirst({ where: {
    id: actor.deviceSessionId, userId: actor.id, tenantId: actor.identityTenantId, revokedAt: null,
  }, select: { id: true } })) return false;
  if (!await tx.center.findFirst({ where: { id: target.centerId, organization: { tenantId: target.tenantId } }, select: { id: true } })) return false;
  if (!await tx.billingAccount.findFirst({ where: { id: target.billingAccountId, familyId: target.familyId,
    family: { id: target.familyId, centerId: target.centerId } }, select: { id: true } })) return false;
  return !parent || Boolean(await tx.guardian.findFirst({ where: { userId: actor.id, familyId: target.familyId,
    family: { id: target.familyId, centerId: target.centerId } }, select: { id: true } }));
}
