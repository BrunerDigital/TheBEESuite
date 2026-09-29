import { Prisma, type PrismaClient } from "@prisma/client";
import { parentCurrentChildScope } from "./parent-document-query";
import { parentMessageFamilyWhere } from "./parent-message-query";
import { replySubject } from "./message-reply-routing";
import { currentParentMessageTeacherWhere, parentMessageCenterId } from "./parent-message-recipients";
import { blockedMessageSenderIds } from "./message-block-policy";
import { lockMessageUsers } from "./message-block-store";

export class ParentMessageScopeChanged extends Error {}

/** Uploads can take minutes. Re-prove the actor, current family and reply at the commit boundary. */
export async function createParentFamilyMessage(db: PrismaClient, input: { userId: string; tenantId: string; familyId: string; expectedCenterId: string | null; data: Prisma.MessageUncheckedCreateInput }) {
  return db.$transaction(async tx => {
    if (input.data.senderId !== input.userId || input.data.familyId !== input.familyId) throw new ParentMessageScopeChanged();
    const centers = await tx.center.findMany({ where: { organization: { tenantId: input.tenantId } }, select: { id: true } });
    const where = parentMessageFamilyWhere({ ...input, tenantCenterIds: centers.map(center => center.id) });
    const family = await tx.family.findFirst({ where, select: { id: true, centerId: true, children: {
      where: parentCurrentChildScope(input.tenantId), select: { classroomId: true, classroom: { select: { centerId: true } } },
    } } });
    if (!family) throw new ParentMessageScopeChanged();
    const currentCenterId = parentMessageCenterId(family);
    if (!currentCenterId || currentCenterId !== input.expectedCenterId) throw new ParentMessageScopeChanged();
    const target = input.data.replyToMessageId ? await tx.message.findFirst({ where: { id: input.data.replyToMessageId, familyId: input.familyId, family: where }, select: { subject: true, senderId: true } }) : null;
    if (input.data.replyToMessageId && (!target || input.data.subject !== replySubject(target.subject))) throw new ParentMessageScopeChanged();
    await lockMessageUsers(tx, [input.userId, input.data.assignedToId, target?.senderId]);
    const actor = await tx.user.findFirst({ where: { id: input.userId, tenantId: input.tenantId, role: "PARENT_GUARDIAN", isActive: true }, select: { id: true, customFields: true } });
    if (!actor) throw new ParentMessageScopeChanged();
    if (target?.senderId) {
      const recipient = await tx.user.findUnique({ where: { id: target.senderId }, select: { customFields: true } });
      if (blockedMessageSenderIds(actor.customFields).includes(target.senderId)
        || blockedMessageSenderIds(recipient?.customFields).includes(input.userId)) throw new ParentMessageScopeChanged();
    }
    if (input.data.assignedToId) {
      if (blockedMessageSenderIds(actor.customFields).includes(input.data.assignedToId)) throw new ParentMessageScopeChanged();
      const teacher = await tx.user.findFirst({ where: { id: input.data.assignedToId, ...currentParentMessageTeacherWhere(input.tenantId, input.familyId, currentCenterId, family.children) }, select: { id: true, customFields: true } });
      if (!teacher || blockedMessageSenderIds(teacher.customFields).includes(input.userId)) throw new ParentMessageScopeChanged();
    }
    return tx.message.create({ data: input.data });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
