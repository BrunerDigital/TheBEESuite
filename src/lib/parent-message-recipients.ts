import { UserRole, type Prisma, type PrismaClient } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "./enrollment-status";

type CurrentClass = { classroomId: string | null; classroom?: { centerId?: string | null } | null };
export function parentMessageCenterId(family: { centerId: string | null; children: CurrentClass[] }) {
  if (family.centerId) return family.centerId;
  const centers = [...new Set(family.children.flatMap(child => child.classroom?.centerId ? [child.classroom.centerId] : []))];
  return centers.length === 1 ? centers[0] : null;
}

/** A historic sender ID or school grant alone is not a current teacher/classroom assignment. */
export function currentParentMessageTeacherWhere(tenantId: string, familyId: string, centerId: string | null, children: CurrentClass[]): Prisma.UserWhereInput {
  const pairs = children.flatMap(child => centerId && child.classroomId && child.classroom?.centerId === centerId
    ? [{ classroomId: child.classroomId, centerId: child.classroom.centerId,
      center: { organization: { tenantId } }, classroom: { id: child.classroomId, centerId: child.classroom.centerId,
        children: { some: { familyId, ...currentlyEnrolledChildWhere() } } } }] : []);
  return { tenantId, isActive: true, role: UserRole.TEACHER, staffProfile: { OR: pairs } };
}

export async function currentParentMessageLeadership(db: PrismaClient, tenantId: string, centerId: string, excludeUserId: string, at = new Date()) {
  const roles = [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR];
  const grantWhere: Prisma.UserAccessGrantWhereInput = { tenantId, centerId, scopeType: "CENTER", isActive: true, role: { in: roles },
    center: { organization: { tenantId } }, AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: at } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: at } }] },
    ] };
  const users = await db.user.findMany({ where: { tenantId, isActive: true, id: { not: excludeUserId }, OR: [
    { accessGrants: { some: grantWhere } },
    { role: { in: roles }, staffProfile: { centerId, center: { organization: { tenantId } } } },
  ] }, select: { id: true, email: true, role: true, staffProfile: { select: { phone: true } }, accessGrants: { where: grantWhere, select: { role: true }, take: 1 } } });
  return users.map(user => ({ id: user.id, email: user.email, role: user.accessGrants[0]?.role ?? user.role, phone: user.staffProfile?.phone ?? null }));
}
