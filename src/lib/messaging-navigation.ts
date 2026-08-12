export const STAFF_MESSAGING_HREF = "/family-detail?view=messages";

type MessagingSearchValue = string | string[] | null | undefined;

export function staffMessagingHref(
  values: Record<string, MessagingSearchValue> = {},
  hash?: string | null,
) {
  const params = new URLSearchParams({ view: "messages" });

  for (const [key, value] of Object.entries(values)) {
    if (value == null || value === "" || key === "view") continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) params.append(key, item);
    }
  }

  const normalizedHash = hash ? `#${hash.replace(/^#/, "")}` : "";
  return `/family-detail?${params.toString()}${normalizedHash}`;
}
