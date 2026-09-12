import type { Prisma } from "@prisma/client";

/** Legacy brand-only ownership is valid; conflicting or absent ownership is not. */
export function automationTenantScopeWhere(tenantId: string): Prisma.AutomationWhereInput {
  if (!tenantId.trim()) return { id: "__no_automation_tenant__" };
  return { OR: [
    { tenantId, brandId: null },
    { tenantId, brand: { is: { tenantId } } },
    { tenantId: null, brand: { is: { tenantId } } },
  ] };
}
