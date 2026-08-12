import { PARENT_PORTAL_HREFS, parentPortalFamilySectionHref } from "@/lib/parent-portal-navigation";

export type StoredNotificationLinkInput = {
  body: string;
  type: string;
};

export function notificationBodyUrl(body: string) {
  return body.match(/https?:\/\/[^\s)]+/i)?.[0] ?? null;
}

export function storedNotificationHref(notification: StoredNotificationLinkInput) {
  if (notification.type === "payment_method_form") return notificationBodyUrl(notification.body) ?? PARENT_PORTAL_HREFS.payments;
  if (notification.type === "photos") return PARENT_PORTAL_HREFS.updates;
  return "/notifications";
}

export function storedNotificationHrefForRole(notification: StoredNotificationLinkInput, role?: string | null) {
  if (role === "AUTHORIZED_PICKUP") return PARENT_PORTAL_HREFS.home;
  if (role !== "PARENT_GUARDIAN") {
    return storedNotificationHref(notification);
  }

  if (notification.type === "payment_method_form") return storedNotificationHref(notification);
  if (notification.type === "photos") return PARENT_PORTAL_HREFS.updates;
  if (notification.type.includes("billing") || notification.type.includes("payment")) return PARENT_PORTAL_HREFS.payments;
  if (notification.type.includes("document")) return parentPortalFamilySectionHref("documents");
  if (notification.type.includes("message")) return PARENT_PORTAL_HREFS.messages;
  return PARENT_PORTAL_HREFS.home;
}

export function notificationCenterHrefForRole(role?: string | null) {
  return role === "PARENT_GUARDIAN" || role === "AUTHORIZED_PICKUP" ? PARENT_PORTAL_HREFS.home : "/notifications";
}
