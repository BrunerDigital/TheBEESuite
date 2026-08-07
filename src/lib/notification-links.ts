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

export function storedNotificationHrefForRole(notification: StoredNotificationLinkInput, role?: string | null) {
  if (role !== "PARENT_GUARDIAN" && role !== "AUTHORIZED_PICKUP") {
    return storedNotificationHref(notification);
  }

  if (notification.type === "payment_method_form") return storedNotificationHref(notification);
  if (notification.type === "photos") return "/parent-portal#photos";
  if (notification.type.includes("billing") || notification.type.includes("payment")) return "/parent-portal#billing";
  if (notification.type.includes("document")) return "/parent-portal#documents";
  if (notification.type.includes("message")) return "/parent-portal#messages";
  return "/parent-portal";
}

export function notificationCenterHrefForRole(role?: string | null) {
  return role === "PARENT_GUARDIAN" || role === "AUTHORIZED_PICKUP" ? "/parent-portal" : "/notifications";
}
