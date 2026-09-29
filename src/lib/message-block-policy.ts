import type { Prisma } from "@prisma/client";

export function blockedMessageSenderIds(customFields: unknown): string[] {
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) return [];
  const blocks = (customFields as Record<string, unknown>).messageBlocks;
  if (!blocks || typeof blocks !== "object" || Array.isArray(blocks)) return [];
  return Object.entries(blocks).filter(([id, blocked]) => /^[A-Za-z0-9_-]{1,191}$/.test(id) && blocked === true).map(([id]) => id);
}

export function messagesExcludingBlockedSenders(ids: readonly string[]): Prisma.MessageWhereInput {
  return ids.length ? { OR: [{ senderId: null }, { senderId: { notIn: [...ids] } }] } : {};
}

type Recipient = { userId?: string | null; email?: string | null; phone?: string | null };
type BlockingUser = { id: string; email: string; customFields: unknown; guardians?: Array<{ email: string | null; phone: string | null }>; staffProfile?: { phone: string | null } | null };
const emailKey = (email: string | null | undefined) => email?.trim().toLowerCase() ?? "";
const phoneKey = (phone: string) => { const digits = phone.replace(/\D/g, ""); return digits.length === 10 ? `1${digits}` : digits; };

/** Suppress every copy to a blocked recipient, including a shared billing address. */
export function recipientsAllowingMessageSender<T extends Recipient>(recipients: T[], users: BlockingUser[], senderId: string): T[] {
  const blocked = users.filter(user => blockedMessageSenderIds(user.customFields).includes(senderId));
  const ids = new Set(blocked.map(user => user.id));
  const emails = new Set(blocked.map(user => emailKey(user.email)).filter(Boolean));
  const phones = new Set<string>();
  for (const user of blocked) {
    for (const guardian of user.guardians ?? []) {
      if (guardian.email) emails.add(emailKey(guardian.email));
      if (guardian.phone) phones.add(phoneKey(guardian.phone));
    }
    if (user.staffProfile?.phone) phones.add(phoneKey(user.staffProfile.phone));
  }
  for (const recipient of recipients) {
    if (recipient.userId && ids.has(recipient.userId)) {
      if (recipient.email) emails.add(emailKey(recipient.email));
      if (recipient.phone) phones.add(phoneKey(recipient.phone));
    }
  }
  return recipients.filter(recipient => !(recipient.userId && ids.has(recipient.userId))
    && !(recipient.email && emails.has(emailKey(recipient.email)))
    && !(recipient.phone && phones.has(phoneKey(recipient.phone))));
}

export function messageNotificationSenderId(dedupeKey: string | null | undefined) {
  return dedupeKey?.startsWith("message-sender:") ? dedupeKey.split(":")[1] || null : null;
}
