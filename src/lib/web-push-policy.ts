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
  const parent = role === "PARENT_GUARDIAN" || role === "AUTHORIZED_PICKUP";
  const teacher = role === "TEACHER";

  switch (type) {
    case "billing":
      return parent ? "/parent-portal#billing" : "/billing-invoices";
    case "documents":
      return parent ? "/parent-portal#documents" : "/documents";
    case "incidents":
      return parent ? "/parent-portal" : "/incident-reports";
    case "photos":
      return parent ? "/parent-portal#photos" : teacher ? "/classroom-dashboard" : "/parent-media-review";
    case "classroom":
      return parent ? "/parent-portal#activities" : "/classroom-dashboard";
    case "enrollment":
      return parent ? "/parent-portal" : "/crm-leads";
    case "fte_reports":
      return "/fte-reports";
    default:
      return "/messages";
  }
}

export function safeWebPushPlatform(value: unknown) {
  const platform = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ["ios", "android", "desktop", "web"].includes(platform) ? platform : "web";
}

export function webPushSubscriptionShouldDeactivate(status: number | null) {
  return status === 400 || status === 404 || status === 410;
}
