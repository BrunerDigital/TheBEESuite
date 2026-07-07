import { UserRole } from "@prisma/client";

export type MessageNotificationUser = {
  id: string;
  email: string;
  role: UserRole;
  phone: string | null;
};

export function shouldNotifyLeadershipOfFamilyMessage({
  senderIsParent,
  senderRole,
}: {
  senderIsParent: boolean;
  senderRole: string;
}) {
  return senderIsParent || senderRole === UserRole.TEACHER;
}

export function uniqueMessageNotificationUsers(
  users: MessageNotificationUser[],
  excludeUserId?: string | null,
) {
  const byId = new Map<string, MessageNotificationUser>();
  for (const user of users) {
    if (!user.id || user.id === excludeUserId) continue;
    if (byId.has(user.id)) continue;
    byId.set(user.id, user);
  }
  return Array.from(byId.values());
}

export function messageNotificationPreferenceRoles({
  staffRecipients,
  notifyParents,
}: {
  staffRecipients: MessageNotificationUser[];
  notifyParents: boolean;
}) {
  return Array.from(new Set([
    ...staffRecipients.map((recipient) => recipient.role).filter(Boolean),
    ...(notifyParents ? [UserRole.PARENT_GUARDIAN] : []),
  ]));
}
