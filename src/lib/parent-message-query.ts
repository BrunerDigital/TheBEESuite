import type { Prisma, PrismaClient } from "@prisma/client";
import { parentCurrentChildScope } from "./parent-document-query";
import { parentPortalFamilyScopeWhere } from "./portal-guardrails";
import { parentPortalTenantFamilyWhere } from "./parent-portal-family-scope";
import { PARENT_MESSAGE_PAGE_SIZE, type ParentMessageView } from "./parent-message-history";
import { signMessageAttachmentsFromMetadata } from "./message-attachments";

export function parentMessageFamilyWhere(input: { familyId: string; userId: string; tenantId: string; tenantCenterIds: string[] }): Prisma.FamilyWhereInput {
  return { AND: [
    parentPortalFamilyScopeWhere({ userId: input.userId, requestedFamilyId: input.familyId }),
    parentPortalTenantFamilyWhere(input.tenantCenterIds),
    { children: { some: parentCurrentChildScope(input.tenantId) } },
  ] };
}
export const parentMessageSelect = {
  id: true, senderId: true, subject: true, body: true, createdAt: true, metadata: true,
  sender: { select: { name: true, role: true } },
} satisfies Prisma.MessageSelect;
export const parentMessageOrder = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.MessageOrderByWithRelationInput[];
export type ParentMessageRecord = Prisma.MessageGetPayload<{ select: typeof parentMessageSelect }>;
export function parentMessagePageRows<T extends { id: string }>(rows: T[]) {
  const items = rows.slice(0, PARENT_MESSAGE_PAGE_SIZE);
  return { items, nextCursor: rows.length > PARENT_MESSAGE_PAGE_SIZE ? items.at(-1)?.id ?? null : null };
}
export async function parentMessageViews(rows: ParentMessageRecord[], userId: string, displayName = (name: string) => name): Promise<ParentMessageView[]> {
  return Promise.all(rows.map(async message => ({
    id: message.id, subject: message.subject, body: message.body, createdAt: message.createdAt,
    sender: message.sender ? { name: displayName(message.sender.name) } : null,
    isFromFamily: message.sender?.role === "PARENT_GUARDIAN" || message.sender?.role === "AUTHORIZED_PICKUP",
    canReport: Boolean(message.senderId && message.senderId !== userId),
    attachments: await signMessageAttachmentsFromMetadata(message.metadata),
  })));
}
export async function readParentMessageRows(
  message: Pick<PrismaClient["message"], "findFirst" | "findMany">,
  where: Prisma.MessageWhereInput, cursor: string | null,
) {
  const anchor = cursor ? await message.findFirst({ where: { AND: [where, { id: cursor }] }, select: { id: true, createdAt: true } }) : null;
  if (cursor && !anchor) return null;
  const rows = await message.findMany({
    where: { AND: [where, ...(anchor ? [{ OR: [
      { createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ] }] : [])] }, orderBy: parentMessageOrder, take: PARENT_MESSAGE_PAGE_SIZE + 1, select: parentMessageSelect,
  });
  return parentMessagePageRows(rows);
}
