import { Prisma, type PrismaClient, type UserRole } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "./enrollment-status";
import { canReportVisibleMessage } from "./message-report-policy";
import { blockedMessageSenderIds, recipientsAllowingMessageSender } from "./message-block-policy";

type MessageDb = Pick<PrismaClient, "user" | "message" | "center">;
export class MessageRecipientBlockChanged extends Error {}

/** Attachment uploads precede this transaction; read both preferences again. */
export async function createDirectMessage(db: PrismaClient, input: { userId: string; identityTenantId: string; senderRole: UserRole; recipientTenantId: string; recipientId: string; recipientRole?: UserRole; data: Prisma.MessageUncheckedCreateInput }) {
  return db.$transaction(async tx => {
    const [sender, recipient] = await Promise.all([
      tx.user.findFirst({ where: { id: input.userId, tenantId: input.identityTenantId, isActive: true }, select: { role: true, customFields: true } }),
      tx.user.findFirst({ where: { id: input.recipientId, tenantId: input.recipientTenantId, isActive: true }, select: { role: true, customFields: true } }),
    ]);
    if (!sender || !recipient || sender.role !== input.senderRole || input.recipientRole && recipient.role !== input.recipientRole
      || input.data.senderId !== input.userId || input.data.assignedToId !== input.recipientId
      || blockedMessageSenderIds(sender.customFields).includes(input.recipientId)
      || blockedMessageSenderIds(recipient.customFields).includes(input.userId)) throw new MessageRecipientBlockChanged();
    return tx.message.create({ data: input.data });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function readBlockedMessageSenderIds(db: Pick<PrismaClient, "user">, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { customFields: true } });
  return blockedMessageSenderIds(user?.customFields);
}

/** Share the recipient row lock with blocking so late notifications cannot reappear. */
export async function createMessageNotification(db: PrismaClient, senderId: string, { data }: { data: Prisma.NotificationUncheckedCreateInput }) {
  const recipientId = data.userId;
  if (!recipientId) return null;
  return db.$transaction(async tx => {
    const recipients = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "id" = ${recipientId} FOR UPDATE`;
    if (!recipients.length) return null;
    const recipient = await tx.user.findUnique({ where: { id: recipientId }, select: { isActive: true, customFields: true } });
    if (!recipient?.isActive || blockedMessageSenderIds(recipient.customFields).includes(senderId)) return null;
    return tx.notification.create({ data });
  });
}

export async function messageRecipientsAllowed<T extends { userId?: string | null; email?: string | null; phone?: string | null }>(
  db: Pick<PrismaClient, "user">, tenantId: string, senderId: string, recipients: T[],
) {
  const ids = recipients.map(recipient => recipient.userId).filter((id): id is string => Boolean(id));
  const emails = recipients.map(recipient => recipient.email?.trim()).filter((email): email is string => Boolean(email));
  const phones = recipients.map(recipient => recipient.phone).filter((phone): phone is string => Boolean(phone));
  if (!ids.length && !emails.length && !phones.length) return recipients;
  // Routing already authorized these exact recipients. A platform owner's identity
  // can live outside the school tenant; all other foreign identities stay excluded.
  const users = await db.user.findMany({ where: { AND: [{ OR: [{ tenantId }, { role: "PLATFORM_OWNER" }] }, { OR: [
    ...(ids.length ? [{ id: { in: ids } }] : []),
    ...emails.map(email => ({ email: { equals: email, mode: "insensitive" as const } })),
    ...emails.map(email => ({ guardians: { some: { email: { equals: email, mode: "insensitive" as const } } } })),
    ...(phones.length ? [{ guardians: { some: { phone: { in: phones } } } }, { staffProfile: { phone: { in: phones } } }] : []),
  ] }] }, select: { id: true, email: true, customFields: true, guardians: { select: { email: true, phone: true } }, staffProfile: { select: { phone: true } } } });
  return recipientsAllowingMessageSender(recipients, users, senderId);
}

export async function visibleReceivedMessage(db: MessageDb, viewer: Parameters<typeof canReportVisibleMessage>[0], messageId: string) {
  const message = await db.message.findUnique({ where: { id: messageId }, include: {
    sender: { select: { tenantId: true } }, assignedTo: { select: { tenantId: true } },
    family: { include: { guardians: { select: { userId: true } }, children: { where: currentlyEnrolledChildWhere(), select: { classroomId: true } } } },
  } });
  if (!message) return null;
  const centerId = message.family?.centerId ?? (message.threadKey?.startsWith("internal:") ? message.threadKey.slice(9) : null);
  const center = centerId ? await db.center.findUnique({ where: { id: centerId }, select: { organization: { select: { tenantId: true } } } }) : null;
  const visible = canReportVisibleMessage(viewer, {
    senderId: message.senderId, assignedToId: message.assignedToId, threadKey: message.threadKey,
    tenantId: center?.organization.tenantId ?? message.sender?.tenantId ?? message.assignedTo?.tenantId ?? null,
    centerId, isFamilyMessage: Boolean(message.familyId),
    guardianUserIds: message.family?.guardians.map(guardian => guardian.userId).filter((id): id is string => Boolean(id)) ?? [],
    currentClassroomIds: message.family?.children.map(child => child.classroomId).filter((id): id is string => Boolean(id)) ?? [],
  });
  return visible && message.senderId ? { senderId: message.senderId, centerId } : null;
}

/** Atomic JSON patch preserves unrelated settings and concurrent sender blocks. */
export async function setMessageSenderBlock(tx: Prisma.TransactionClient, input: { userId: string; identityTenantId: string; tenantId: string; senderId: string; centerId: string | null; blocked: boolean }) {
  const fields = Prisma.sql`CASE WHEN jsonb_typeof("customFields") = 'object' THEN "customFields" ELSE '{}'::jsonb END`;
  const blocks = Prisma.sql`CASE WHEN jsonb_typeof("customFields"->'messageBlocks') = 'object' THEN "customFields"->'messageBlocks' ELSE '{}'::jsonb END`;
  const changedBlocks = input.blocked ? Prisma.sql`${blocks} || jsonb_build_object(${input.senderId}::text, true)` : Prisma.sql`${blocks} - ${input.senderId}::text`;
  const count = await tx.$executeRaw`UPDATE "User" SET "customFields" = jsonb_set(${fields}, '{messageBlocks}', ${changedBlocks}, true), "updatedAt" = NOW() WHERE "id" = ${input.userId} AND "tenantId" = ${input.identityTenantId}`;
  if (count !== 1) throw new Error("Your account could not be updated. Sign in again.");
  if (input.blocked) await tx.notification.updateMany({ where: { userId: input.userId, dedupeKey: { startsWith: `message-sender:${input.senderId}:` }, archivedAt: null }, data: { archivedAt: new Date() } });
  await tx.auditLog.create({ data: { tenantId: input.tenantId, centerId: input.centerId, userId: input.userId,
    action: input.blocked ? "message.sender.blocked" : "message.sender.unblocked", resource: "User", resourceId: input.senderId,
    metadata: { privateRecipientPreference: true },
  } });
}

/** Re-check delayed message copies after a recipient blocks the sender. */
export async function permittedMessageRetryRecipients(db: MessageDb, tenantId: string, messageId: string, recipientIds: string[], recipients: Array<{ email?: string; phone?: string }>) {
  const message = await db.message.findUnique({ where: { id: messageId }, select: { senderId: true, assignedToId: true, family: { select: { guardians: { select: { userId: true } } } } } });
  if (!message?.senderId) return [];
  const ids = [...new Set([...recipientIds, message.assignedToId, ...(message.family?.guardians.map(guardian => guardian.userId) ?? [])].filter((id): id is string => Boolean(id)))];
  const users = await db.user.findMany({ where: { AND: [{ OR: [{ tenantId }, { role: "PLATFORM_OWNER" }] }, { OR: [
    ...(ids.length ? [{ id: { in: ids } }] : []),
    ...recipients.filter(recipient => recipient.email).map(recipient => ({ email: { equals: recipient.email!, mode: "insensitive" as const } })),
  ] }] }, select: { id: true, email: true, customFields: true, guardians: { select: { email: true, phone: true } }, staffProfile: { select: { phone: true } } } });
  return recipientsAllowingMessageSender(recipients, users, message.senderId);
}
