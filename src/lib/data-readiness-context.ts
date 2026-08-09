import { DATA_READINESS_STATUSES, type DataReadinessTask } from "@/lib/data-readiness";

export const DATA_READINESS_CONTEXTS = {
  school: {
    label: "School readiness",
    shortLabel: "School",
    description: "Review unresolved source evidence across this authorized school workspace.",
    categories: [],
  },
  families: {
    label: "Family data readiness",
    shortLabel: "Families",
    description: "Review safety, identity, enrollment, and parent communication evidence without changing family records.",
    categories: [
      "Safety and custody",
      "Access and identity",
      "Enrollment and classroom placement",
      "Parent communication readiness",
    ],
  },
  operations: {
    label: "Classroom & attendance readiness",
    shortLabel: "Operations",
    description: "Review classroom placement, safety, and retained attendance evidence for authorized schools.",
    categories: [
      "Safety and custody",
      "Enrollment and classroom placement",
      "Historical and informational data",
    ],
  },
  billing: {
    label: "Billing data readiness",
    shortLabel: "Billing",
    description: "Review balance and responsibility evidence without changing invoices, payments, or family balances.",
    categories: ["Billing and balances"],
  },
  staff: {
    label: "Staff readiness",
    shortLabel: "Staff",
    description: "Review staff identity, location, and source evidence without changing user access or assignments.",
    categories: ["Access and identity", "Staff readiness"],
  },
  compliance: {
    label: "Compliance data readiness",
    shortLabel: "Compliance",
    description: "Review safety, medical, permission, and retained source evidence without changing operational records.",
    categories: ["Safety and custody", "Historical and informational data"],
  },
} as const;

export type DataReadinessContextKey = keyof typeof DATA_READINESS_CONTEXTS;

export type DataReadinessViewFilters = {
  tab: "overview" | "queue" | "procare";
  status: string;
  risk: string;
  category: string;
  sort: "priority" | "updated" | "location";
  context: DataReadinessContextKey | null;
};

export function normalizeDataReadinessContext(value: unknown): DataReadinessContextKey | null {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  return key && Object.hasOwn(DATA_READINESS_CONTEXTS, key) ? key as DataReadinessContextKey : null;
}

export function dataReadinessContextForPath(pathname: string): DataReadinessContextKey | null {
  if (pathname === "/center-dashboard") return "school";
  if (pathname === "/family-detail") return "families";
  if (pathname === "/classroom-dashboard") return "operations";
  if (pathname === "/billing-invoices") return "billing";
  if (pathname === "/staff") return "staff";
  if (pathname === "/forms") return "compliance";
  return null;
}

export function filterDataReadinessTasksForContext(
  tasks: DataReadinessTask[],
  context: DataReadinessContextKey | null,
) {
  if (!context) return tasks;
  const categories = DATA_READINESS_CONTEXTS[context].categories as readonly string[];
  if (!categories.length) return tasks;
  const allowed = new Set(categories);
  return tasks.filter((task) => allowed.has(task.category));
}

export function dataReadinessContextHref(context: DataReadinessContextKey | null) {
  if (!context) return "/data-readiness?tab=queue&status=actionable";
  return `/data-readiness?tab=queue&status=actionable&context=${encodeURIComponent(context)}`;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function dataReadinessViewFilters(
  searchParams: Record<string, string | string[] | undefined>,
): DataReadinessViewFilters {
  const context = normalizeDataReadinessContext(first(searchParams.context));
  const requestedTab = first(searchParams.tab);
  const requestedStatus = first(searchParams.status);
  const requestedRisk = first(searchParams.risk);
  const requestedSort = first(searchParams.sort);
  const requestedCategory = first(searchParams.category).replace(/\s+/g, " ").trim().slice(0, 120);
  const status = ["actionable", "all", ...DATA_READINESS_STATUSES].includes(requestedStatus)
    ? requestedStatus
    : "actionable";
  return {
    tab: context || requestedTab === "queue"
      ? "queue"
      : requestedTab === "procare"
        ? "procare"
        : "overview",
    status,
    risk: ["critical", "high", "medium", "low"].includes(requestedRisk) ? requestedRisk : "all",
    category: context ? `context:${context}` : requestedCategory || "all",
    sort: requestedSort === "updated" || requestedSort === "location" ? requestedSort : "priority",
    context,
  };
}
