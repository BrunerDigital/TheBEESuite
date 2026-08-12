import { STAFF_MESSAGING_HREF } from "@/lib/messaging-navigation";
import { PARENT_PORTAL_HREFS, parentPortalFamilySectionHref } from "@/lib/parent-portal-navigation";

export const webPushPreferenceTypes = [
  "messages",
  "billing",
  "documents",
  "incidents",
  "photos",
  "classroom",
  "enrollment",
  "fte_reports",
] as const;

export type WebPushPreferenceType = (typeof webPushPreferenceTypes)[number];

export function webPushPreferenceType(notificationType: string): WebPushPreferenceType | null {
  const type = notificationType.trim().toLowerCase();
  if (!type) return null;

  if (/fte/.test(type)) return "fte_reports";
  if (/billing|tuition|invoice|payment|refund|credit|balance|autopay|agency/.test(type)) return "billing";
  if (/document|signature|certification|compliance|credential/.test(type)) return "documents";
  if (/incident|health|medication|injury/.test(type)) return "incidents";
  if (/photo|media/.test(type)) return "photos";
  if (/classroom|attendance|daily_report|activity/.test(type)) return "classroom";
  if (/enrollment|registration|inquiry|lead|tour|onboarding/.test(type)) return "enrollment";
  if (/message|contact|request|sms|communication|privacy|deletion|account|push|integration|record_change/.test(type)) return "messages";

  return null;
}

export function webPushBody(type: WebPushPreferenceType) {
  switch (type) {
    case "billing":
      return "A billing or tuition update is ready in The BEE Suite.";
    case "documents":
      return "A document or signature update is ready in The BEE Suite.";
    case "incidents":
      return "An incident or health update requires your attention in The BEE Suite.";
    case "photos":
      return "A new classroom photo or media update is ready in The BEE Suite.";
    case "classroom":
      return "A classroom update is ready in The BEE Suite.";
    case "enrollment":
      return "An enrollment update requires your attention in The BEE Suite.";
    case "fte_reports":
      return "An FTE reporting update requires your attention in The BEE Suite.";
    default:
      return "A new message or account update is ready in The BEE Suite.";
  }
}

export function webPushHref(type: WebPushPreferenceType, role: string) {
  if (role === "AUTHORIZED_PICKUP") return PARENT_PORTAL_HREFS.home;
  const parent = role === "PARENT_GUARDIAN";
  const teacher = role === "TEACHER";

  switch (type) {
    case "billing":
      return parent ? PARENT_PORTAL_HREFS.payments : "/billing-invoices";
    case "documents":
      return parent ? parentPortalFamilySectionHref("documents") : "/forms?view=documents";
    case "incidents":
      return parent ? PARENT_PORTAL_HREFS.updates : "/classroom-dashboard?view=incidents";
    case "photos":
      return parent ? PARENT_PORTAL_HREFS.updates : teacher ? "/classroom-dashboard" : "/family-detail?view=media";
    case "classroom":
      return parent ? PARENT_PORTAL_HREFS.updates : "/classroom-dashboard";
    case "enrollment":
      return parent ? PARENT_PORTAL_HREFS.family : "/crm-leads";
    case "fte_reports":
      return parent ? PARENT_PORTAL_HREFS.home : "/fte-reports";
    default:
      return parent ? PARENT_PORTAL_HREFS.messages : STAFF_MESSAGING_HREF;
  }
}

export function safeWebPushPlatform(value: unknown) {
  const platform = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ["ios", "android", "desktop", "web"].includes(platform) ? platform : "web";
}

export function webPushSubscriptionShouldDeactivate(status: number | null, consecutiveFailures = 1) {
  return status === 404 || status === 410 || (status === 400 && consecutiveFailures >= 5);
}
