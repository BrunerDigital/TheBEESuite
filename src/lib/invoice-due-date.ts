import { formatZonedDateTime } from "./zoned-date-time";

/** Invoice due dates use the UTC calendar day, matching invoice date inputs.
 * Do not use this for payment, ledger, report or other actual event timestamps.
 * Both historical midnight and noon-UTC storage retain the same calendar day.
 */
export function formatInvoiceDueDate(
  value: Date | string | null | undefined,
  { fallback = "Not set", includeYear = true }: { fallback?: string; includeYear?: boolean } = {},
) {
  return formatZonedDateTime(value, "UTC", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
  }, fallback);
}
