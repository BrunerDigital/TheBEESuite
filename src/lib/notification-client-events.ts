export const NOTIFICATIONS_CHANGED_EVENT = "bee-suite:notifications-changed";

export function dispatchNotificationsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
