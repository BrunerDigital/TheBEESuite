import { Prisma, type PrismaClient, type UserRole } from "@prisma/client";
import { automationConfigurationData, automationObject, automationRecordSignature, type AutomationDraft } from "./automation-workflow-state";
import { automationTenantScopeWhere } from "./automation-tenant-scope";

export class AutomationConfigurationError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const conflictMessage = "This workflow changed or is no longer available. Reload the saved workflow before trying again.";
const isJsonObject = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value);

export async function saveAutomationConfiguration(options: {
  database: Pick<PrismaClient, "$transaction">;
  actor: { id: string; tenantId: string; email: string };
  canManage: (actor: { role: UserRole }) => boolean;
  id: string;
  draft: AutomationDraft;
  expectedRecordSignature: unknown;
  audit: (tx: Prisma.TransactionClient, recordId: string, mode: "updated" | "created") => Promise<void>;
}) {
  const { database, actor, id, draft, audit } = options;
  if (!actor.tenantId.trim()) throw new AutomationConfigurationError("Workflow account scope is unavailable.", 403);
  const scope = automationTenantScopeWhere(actor.tenantId);
  try {
    return await database.$transaction(async tx => {
      const currentActor = await tx.user.findFirst({ where: { id: actor.id, tenantId: actor.tenantId, email: actor.email, isActive: true }, select: { role: true } });
      if (!currentActor || !options.canManage(currentActor)) throw new AutomationConfigurationError("Workflow configuration is no longer allowed for this account.", 403);
      const existing = id ? await tx.automation.findFirst({ where: { AND: [scope, { id }] } }) : null;
      if (id && !existing) throw new AutomationConfigurationError("Workflow not found for this account.", 404);
      if (existing && (typeof options.expectedRecordSignature !== "string" || automationRecordSignature(existing) !== options.expectedRecordSignature)) throw new AutomationConfigurationError(conflictMessage, 409);
      const existingReview = automationObject(existing?.condition).requiresReview;
      if (existing && ((existing.condition !== null && !isJsonObject(existing.condition)) || !isJsonObject(existing.action)
        || (existingReview !== undefined && existingReview !== null && typeof existingReview !== "boolean"))) {
        throw new AutomationConfigurationError("This saved workflow uses a configuration format that this editor cannot safely change. Contact support; the saved record has not been modified.", 409);
      }
      const next = automationConfigurationData(draft, existing ?? undefined);
      const data = { ...next, condition: next.condition as Prisma.InputJsonObject, action: next.action as Prisma.InputJsonObject };
      let record;
      if (existing) {
        const updated = await tx.automation.updateMany({ where: {
          AND: [scope], id: existing.id, tenantId: existing.tenantId, brandId: existing.brandId,
          name: existing.name, trigger: existing.trigger, delay: existing.delay, status: existing.status,
          condition: { equals: existing.condition === null ? Prisma.AnyNull : existing.condition },
          action: { equals: existing.action === null ? Prisma.JsonNull : existing.action },
        }, data });
        if (updated.count !== 1) throw new AutomationConfigurationError(conflictMessage, 409);
        record = await tx.automation.findFirst({ where: { AND: [scope, { id: existing.id }] } });
        if (!record) throw new AutomationConfigurationError(conflictMessage, 409);
      } else {
        record = await tx.automation.create({ data: { ...data, tenantId: actor.tenantId, brandId: null } });
      }
      await audit(tx, record.id, existing ? "updated" : "created");
      return record;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new AutomationConfigurationError(conflictMessage, 409);
    throw error;
  }
}
