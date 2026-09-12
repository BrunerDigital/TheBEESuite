import type { DashboardWidgetId } from "./dashboard-widgets";

export type DashboardNotification = string | { text: string; widgetId?: DashboardWidgetId; href?: string };

export function dashboardNotificationHref(
  item: DashboardNotification,
  widgets: Partial<Record<DashboardWidgetId, { href: string }>>,
): string {
  if (typeof item === "string") return "/notifications";
  const href = item.href ?? (item.widgetId ? widgets[item.widgetId]?.href : undefined);
  // A human-readable count/summary is not a record search query.
  // Reject external/protocol-relative targets even if a future data source supplies them.
  return href?.startsWith("/") && !href.startsWith("//") && !/[\\\r\n]/.test(href)
    ? href
    : "/notifications";
}
