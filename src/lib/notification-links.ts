export type StoredNotificationLinkInput = {
  body: string;
  type: string;
};

export function notificationBodyUrl(body: string) {
  return body.match(/https?:\/\/[^\s)]+/i)?.[0] ?? null;
}

export function storedNotificationHref(notification: StoredNotificationLinkInput) {
  if (notification.type === "payment_method_form") return notificationBodyUrl(notification.body) ?? "/parent-portal#billing";
  if (notification.type === "photos") return "/parent-portal#photos";
  return "/notifications";
}

export function notificationCenterHrefForRole(role?: string | null) {
  return role === "PARENT_GUARDIAN" || role === "AUTHORIZED_PICKUP" ? "/parent-portal" : "/notifications";
}
