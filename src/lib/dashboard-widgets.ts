import { UserRole } from "@prisma/client";

export const dashboardWidgetPreferencesKey = "dashboardWidgets";

export type DashboardWidgetId =
  | "aiBrief"
  | "executiveRollup"
  | "enrollmentPipeline"
  | "toursAndTasks"
  | "attendanceSnapshot"
  | "classroomCapacity"
  | "billingRevenue"
  | "staffingRatios"
  | "complianceQueue"
  | "familyCommunication"
  | "parentAccount";

export type DashboardWidgetDefinition = {
  id: DashboardWidgetId;
  title: string;
  description: string;
  category: string;
  roles: readonly UserRole[];
};

export type DashboardWidgetView = DashboardWidgetDefinition & {
  visible: boolean;
};

export type DashboardWidgetConfiguration = {
  role: UserRole;
  roleLabel: string;
  widgets: DashboardWidgetView[];
  visibleWidgetIds: DashboardWidgetId[];
  hiddenWidgetIds: DashboardWidgetId[];
  order: DashboardWidgetId[];
};

const executiveRoles = [
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.READ_ONLY_AUDITOR,
] as const;

const executiveAdminRoles = [
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
] as const;

const directorRoles = [
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
] as const;

const billingRoles = [UserRole.BILLING_ADMIN] as const;
const teacherRoles = [UserRole.TEACHER] as const;
const parentRoles = [UserRole.PARENT_GUARDIAN, UserRole.AUTHORIZED_PICKUP] as const;

const staffAdminRoles = [...executiveAdminRoles, ...directorRoles] as const;
const enrollmentRoles = [...staffAdminRoles] as const;
const operationsRoles = [...staffAdminRoles, ...teacherRoles] as const;
const billingVisibleRoles = [...staffAdminRoles, ...billingRoles, UserRole.PARENT_GUARDIAN] as const;
const communicationRoles = [...staffAdminRoles, ...billingRoles, ...teacherRoles, UserRole.PARENT_GUARDIAN] as const;

export const dashboardRoleLabels: Record<UserRole, string> = {
  [UserRole.PLATFORM_OWNER]: "Platform owner",
  [UserRole.BRAND_ADMIN]: "Brand admin",
  [UserRole.REGIONAL_MANAGER]: "Regional manager",
  [UserRole.CENTER_DIRECTOR]: "Center director",
  [UserRole.ASSISTANT_DIRECTOR]: "Assistant director",
  [UserRole.TEACHER]: "Teacher",
  [UserRole.BILLING_ADMIN]: "Billing admin",
  [UserRole.PARENT_GUARDIAN]: "Parent/guardian",
  [UserRole.AUTHORIZED_PICKUP]: "Authorized pickup",
  [UserRole.READ_ONLY_AUDITOR]: "Read-only auditor",
};

export const dashboardWidgetCatalog: readonly DashboardWidgetDefinition[] = [
  {
    id: "aiBrief",
    title: "AI daily brief",
    description: "Human-reviewed operating summary and suggested focus areas.",
    category: "Overview",
    roles: [...staffAdminRoles, ...billingRoles, ...teacherRoles],
  },
  {
    id: "executiveRollup",
    title: "Executive rollup",
    description: "Multi-location center comparison and executive lens cards.",
    category: "Executive",
    roles: executiveRoles,
  },
  {
    id: "enrollmentPipeline",
    title: "Enrollment pipeline",
    description: "Leads, stages, scoring, and conversion trend widgets.",
    category: "Enrollment",
    roles: enrollmentRoles,
  },
  {
    id: "toursAndTasks",
    title: "Tours and tasks",
    description: "Tours scheduled today and open follow-up work.",
    category: "Enrollment",
    roles: enrollmentRoles,
  },
  {
    id: "attendanceSnapshot",
    title: "Attendance snapshot",
    description: "Active children, occupancy, and attendance operating pulse.",
    category: "Operations",
    roles: [...operationsRoles, ...parentRoles],
  },
  {
    id: "classroomCapacity",
    title: "Classroom capacity",
    description: "Open seats, classroom capacity, and age-group availability.",
    category: "Operations",
    roles: staffAdminRoles,
  },
  {
    id: "billingRevenue",
    title: "Billing and revenue",
    description: "Outstanding balances, invoice totals, and revenue trend widgets.",
    category: "Billing",
    roles: billingVisibleRoles,
  },
  {
    id: "staffingRatios",
    title: "Staffing and ratios",
    description: "Teacher counts and classroom ratio coverage.",
    category: "Staffing",
    roles: operationsRoles,
  },
  {
    id: "complianceQueue",
    title: "Compliance queue",
    description: "Incident review, expiring documents, and compliance reminders.",
    category: "Compliance",
    roles: [...staffAdminRoles, ...teacherRoles],
  },
  {
    id: "familyCommunication",
    title: "Family communication",
    description: "Unread or priority parent messages and response work.",
    category: "Communication",
    roles: communicationRoles,
  },
  {
    id: "parentAccount",
    title: "Family account",
    description: "Parent-facing account, balance, document, and child updates.",
    category: "Parent",
    roles: parentRoles,
  },
] as const;

const catalogById = new Map(dashboardWidgetCatalog.map((widget) => [widget.id, widget]));

const defaultWidgetIdsByRole: Record<UserRole, readonly DashboardWidgetId[]> = {
  [UserRole.PLATFORM_OWNER]: [
    "aiBrief",
    "executiveRollup",
    "enrollmentPipeline",
    "toursAndTasks",
    "attendanceSnapshot",
    "classroomCapacity",
    "billingRevenue",
    "staffingRatios",
    "complianceQueue",
    "familyCommunication",
  ],
  [UserRole.BRAND_ADMIN]: [
    "aiBrief",
    "executiveRollup",
    "enrollmentPipeline",
    "toursAndTasks",
    "attendanceSnapshot",
    "classroomCapacity",
    "billingRevenue",
    "staffingRatios",
    "complianceQueue",
    "familyCommunication",
  ],
  [UserRole.REGIONAL_MANAGER]: [
    "aiBrief",
    "executiveRollup",
    "enrollmentPipeline",
    "toursAndTasks",
    "attendanceSnapshot",
    "classroomCapacity",
    "billingRevenue",
    "staffingRatios",
    "complianceQueue",
    "familyCommunication",
  ],
  [UserRole.READ_ONLY_AUDITOR]: [
    "executiveRollup",
    "attendanceSnapshot",
    "classroomCapacity",
    "billingRevenue",
    "staffingRatios",
    "complianceQueue",
  ],
  [UserRole.CENTER_DIRECTOR]: [
    "aiBrief",
    "enrollmentPipeline",
    "toursAndTasks",
    "attendanceSnapshot",
    "classroomCapacity",
    "billingRevenue",
    "staffingRatios",
    "complianceQueue",
    "familyCommunication",
  ],
  [UserRole.ASSISTANT_DIRECTOR]: [
    "aiBrief",
    "enrollmentPipeline",
    "toursAndTasks",
    "attendanceSnapshot",
    "classroomCapacity",
    "billingRevenue",
    "staffingRatios",
    "complianceQueue",
    "familyCommunication",
  ],
  [UserRole.BILLING_ADMIN]: [
    "aiBrief",
    "billingRevenue",
    "familyCommunication",
  ],
  [UserRole.TEACHER]: [
    "aiBrief",
    "attendanceSnapshot",
    "staffingRatios",
    "complianceQueue",
    "familyCommunication",
  ],
  [UserRole.PARENT_GUARDIAN]: [
    "parentAccount",
    "attendanceSnapshot",
    "billingRevenue",
    "familyCommunication",
  ],
  [UserRole.AUTHORIZED_PICKUP]: [
    "parentAccount",
    "attendanceSnapshot",
  ],
};

function recordFromJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uniqueWidgetIds(values: unknown[], allowedIds: Set<DashboardWidgetId>) {
  const seen = new Set<DashboardWidgetId>();
  const ids: DashboardWidgetId[] = [];
  values.forEach((value) => {
    if (typeof value !== "string" || !allowedIds.has(value as DashboardWidgetId)) return;
    const id = value as DashboardWidgetId;
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function parseSubmittedWidgetRows(value: unknown, allowedIds: Set<DashboardWidgetId>) {
  return arrayValue(value).flatMap((item) => {
    const row = recordFromJson(item);
    const id = typeof row.id === "string" && allowedIds.has(row.id as DashboardWidgetId)
      ? row.id as DashboardWidgetId
      : null;
    if (!id) return [];
    return [{ id, visible: row.visible !== false }];
  });
}

export function dashboardWidgetCatalogForRole(role: UserRole) {
  return dashboardWidgetCatalog.filter((widget) => widget.roles.includes(role));
}

export function getDashboardWidgetPreferenceValue(customFields: unknown) {
  return recordFromJson(customFields)[dashboardWidgetPreferencesKey];
}

export function normalizeDashboardWidgetPreferences({
  role,
  value,
}: {
  role: UserRole;
  value?: unknown;
}): DashboardWidgetConfiguration {
  const availableWidgets = dashboardWidgetCatalogForRole(role);
  const allowedIds = new Set(availableWidgets.map((widget) => widget.id));
  const source = recordFromJson(value);
  const submittedRows = parseSubmittedWidgetRows(source.widgets, allowedIds);
  const fallbackVisibleIds = uniqueWidgetIds([...defaultWidgetIdsByRole[role]], allowedIds);
  const submittedOrder = submittedRows.length
    ? submittedRows.map((row) => row.id)
    : uniqueWidgetIds(arrayValue(source.order), allowedIds);
  const order = uniqueWidgetIds([
    ...submittedOrder,
    ...availableWidgets.map((widget) => widget.id),
  ], allowedIds);

  const submittedVisibleIds = submittedRows.length
    ? submittedRows.filter((row) => row.visible).map((row) => row.id)
    : uniqueWidgetIds(arrayValue(source.visibleWidgetIds), allowedIds);
  const submittedHiddenIds = uniqueWidgetIds([
    ...arrayValue(source.hiddenWidgetIds),
    ...arrayValue(source.hidden),
  ], allowedIds);
  const visibleIds = submittedRows.length || Array.isArray(source.visibleWidgetIds)
    ? submittedVisibleIds
    : fallbackVisibleIds.filter((id) => !submittedHiddenIds.includes(id));
  const visibleWidgetIds = visibleIds.length ? uniqueWidgetIds(visibleIds, allowedIds) : fallbackVisibleIds.slice(0, 1);
  const visibleIdSet = new Set(visibleWidgetIds);
  const widgets = order.flatMap((id) => {
    const definition = catalogById.get(id);
    if (!definition) return [];
    return [{ ...definition, visible: visibleIdSet.has(id) }];
  });

  return {
    role,
    roleLabel: dashboardRoleLabels[role],
    widgets,
    visibleWidgetIds,
    hiddenWidgetIds: widgets.filter((widget) => !widget.visible).map((widget) => widget.id),
    order,
  };
}

export function dashboardWidgetPreferencesForStorage(
  configuration: DashboardWidgetConfiguration,
  metadata: { updatedAt: string; updatedByUserId: string; updatedByEmail: string },
) {
  return {
    version: 1,
    role: configuration.role,
    order: configuration.order,
    visibleWidgetIds: configuration.visibleWidgetIds,
    hiddenWidgetIds: configuration.hiddenWidgetIds,
    updatedAt: metadata.updatedAt,
    updatedByUserId: metadata.updatedByUserId,
    updatedByEmail: metadata.updatedByEmail,
  };
}
