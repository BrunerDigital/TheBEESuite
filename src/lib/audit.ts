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
}
