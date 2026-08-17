import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

type AuditInput = {
  centerId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonObject;
};

export async function writeAuditLog(user: CurrentUser, input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      centerId: input.centerId || null,
      userId: user.id,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId || null,
      metadata: input.metadata || {},
    },
  });
  if (input.centerId && input.action.startsWith("billing.")) {
    await prisma.center.update({ where: { id: input.centerId }, data: { updatedAt: new Date() } });
  }
}

export async function writeSystemAuditLog(input: AuditInput & { tenantId: string }) {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      centerId: input.centerId || null,
      userId: null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId || null,
      metadata: input.metadata || {},
    },
  });
  if (input.centerId && input.action.startsWith("billing.")) {
    await prisma.center.update({ where: { id: input.centerId }, data: { updatedAt: new Date() } });
  }
}
