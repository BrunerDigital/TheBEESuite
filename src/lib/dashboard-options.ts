export const DASHBOARD_OPTIONS_KEY = "dashboardOptions";

export const defaultAgeGroupOptions = [
  "Infant",
  "Toddler",
  "2 Y/O",
  "Preschool",
  "School-Aged",
];

export type DashboardOptions = {
  ageGroups: string[];
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanOptions(value: unknown, fallback: string[]) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : [];
  const cleaned = values
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
  return Array.from(new Set(cleaned.length ? cleaned : fallback));
}

export function normalizeDashboardOptions(value: unknown): DashboardOptions {
  const fields = jsonObject(value);
  return {
    ageGroups: cleanOptions(fields.ageGroups, defaultAgeGroupOptions),
  };
}

export function dashboardOptionsFromCustomFields(customFields: unknown): DashboardOptions {
  const fields = jsonObject(customFields);
  return normalizeDashboardOptions(fields[DASHBOARD_OPTIONS_KEY]);
}

export function mergeAgeGroupOptions(...groups: Array<unknown>) {
  return Array.from(new Set([
    ...defaultAgeGroupOptions,
    ...groups.flatMap((group) => cleanOptions(group, [])),
  ]));
}
