import { UserRole } from "@prisma/client";

export type WorkspaceSelectionValue = "all" | `center:${string}`;

export type WorkspaceCenterOption = {
  id: string;
  name: string;
  detail: string;
  companyName?: string;
};

export type WorkspaceState = {
  mode: "pending" | "all" | "center" | "fixed";
  selection: WorkspaceSelectionValue | null;
  activeCenterId: string | null;
  label: string;
  detail: string;
  companyLabel: string;
  required: boolean;
  canSwitch: boolean;
  canSelectAll: boolean;
  invalidSelection: boolean;
  authorizedCenterCount: number;
  options: WorkspaceCenterOption[];
};

const workspaceExecutiveRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.READ_ONLY_AUDITOR,
]);

function locationCount(count: number) {
  return `${count} ${count === 1 ? "school" : "schools"}`;
}

function workspaceCompanyLabel(options: WorkspaceCenterOption[]) {
  const companies = [...new Set(options.map((option) => option.companyName?.trim()).filter(Boolean))] as string[];
  if (companies.length === 1) return companies[0];
  if (companies.length > 1) return `${companies.length} companies`;
  return "Authorized company";
}

export function isWorkspaceExecutiveRole(role: UserRole | string) {
  return workspaceExecutiveRoles.has(role as UserRole);
}

export function centerWorkspaceSelection(centerId: string): WorkspaceSelectionValue {
  return `center:${centerId}`;
}

export function centerIdFromWorkspaceSelection(selection: string | null | undefined) {
  return selection?.startsWith("center:") ? selection.slice("center:".length) : null;
}

export function isWorkspaceSelectionValue(value: unknown): value is WorkspaceSelectionValue {
  return value === "all" || (typeof value === "string" && /^center:[^\s:][^\s]*$/.test(value));
}

export function resolveWorkspaceState({
  role,
  authorizedCenters,
  requestedSelection,
}: {
  role: UserRole | string;
  authorizedCenters: WorkspaceCenterOption[];
  requestedSelection?: string | null;
}): WorkspaceState {
  const options = [...authorizedCenters];
  const companyLabel = workspaceCompanyLabel(options);
  const multiLocationExecutive = isWorkspaceExecutiveRole(role) && options.length > 1;
  const requestedCenterId = centerIdFromWorkspaceSelection(requestedSelection);
  const selectedCenter = requestedCenterId
    ? options.find((center) => center.id === requestedCenterId) ?? null
    : null;
  const invalidSelection = Boolean(
    requestedSelection
    && requestedSelection !== "all"
    && (!isWorkspaceSelectionValue(requestedSelection) || !selectedCenter),
  );

  if (multiLocationExecutive && requestedSelection === "all") {
    return {
      mode: "all",
      selection: "all",
      activeCenterId: null,
      label: "All locations",
      detail: `${locationCount(options.length)} in your authorized workspace`,
      companyLabel,
      required: false,
      canSwitch: true,
      canSelectAll: true,
      invalidSelection: false,
      authorizedCenterCount: options.length,
      options,
    };
  }

  if (multiLocationExecutive && selectedCenter) {
    return {
      mode: "center",
      selection: centerWorkspaceSelection(selectedCenter.id),
      activeCenterId: selectedCenter.id,
      label: selectedCenter.name,
      detail: selectedCenter.detail || "Single-location workspace",
      companyLabel: selectedCenter.companyName?.trim() || companyLabel,
      required: false,
      canSwitch: true,
      canSelectAll: true,
      invalidSelection: false,
      authorizedCenterCount: options.length,
      options,
    };
  }

  if (multiLocationExecutive) {
    return {
      mode: "pending",
      selection: null,
      activeCenterId: null,
      label: "Choose a workspace",
      detail: `${locationCount(options.length)} available`,
      companyLabel,
      required: true,
      canSwitch: true,
      canSelectAll: true,
      invalidSelection,
      authorizedCenterCount: options.length,
      options,
    };
  }

  const fixedCenter = options[0] ?? null;
  return {
    mode: "fixed",
    selection: fixedCenter ? centerWorkspaceSelection(fixedCenter.id) : null,
    activeCenterId: fixedCenter?.id ?? null,
    label: fixedCenter?.name ?? "Workspace unavailable",
    detail: fixedCenter?.detail || (fixedCenter ? "Your assigned workspace" : "No authorized school"),
    companyLabel: fixedCenter?.companyName?.trim() || companyLabel,
    required: false,
    canSwitch: false,
    canSelectAll: false,
    invalidSelection: false,
    authorizedCenterCount: options.length,
    options,
  };
}

export function effectiveCenterIdsForWorkspace(
  workspace: WorkspaceState,
  authorizedCenterIds: string[],
) {
  if (workspace.mode === "all") return [...authorizedCenterIds];
  if (workspace.mode === "fixed") return [...authorizedCenterIds];
  if (workspace.activeCenterId) return [workspace.activeCenterId];
  return [];
}

export function safeWorkspaceNextPath(value: unknown, fallback = "/dashboard") {
  if (
    typeof value !== "string"
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("\\")
  ) return fallback;
  const pathname = value.split(/[?#]/, 1)[0];
  if (
    pathname === "/workspace"
    || pathname.startsWith("/workspace/")
    || pathname.startsWith("/api/")
    || pathname.startsWith("/login")
  ) return fallback;
  return value;
}

export function workspaceSelectionHref(nextPath: unknown = "/dashboard") {
  return `/workspace?next=${encodeURIComponent(safeWorkspaceNextPath(nextPath))}`;
}

export function workspaceDestinationAfterSelection({
  nextPath,
  selection,
  previousSelection,
}: {
  nextPath: unknown;
  selection: WorkspaceSelectionValue;
  previousSelection?: WorkspaceSelectionValue | null;
}) {
  const safeNextPath = safeWorkspaceNextPath(nextPath);
  const url = new URL(safeNextPath, "https://workspace.local");
  const selectedCenterId = centerIdFromWorkspaceSelection(selection);
  const centerSpecificPath = /^\/check-in\/[^/]+/.test(url.pathname);
  const switchingWorkspace = Boolean(previousSelection && previousSelection !== selection);
  const recordSpecificQuery = [
    "familyId",
    "childId",
    "classroomId",
    "invoiceId",
    "paymentId",
    "leadId",
    "messageId",
    "staffId",
    "documentId",
    "center",
  ].some((key) => url.searchParams.has(key));

  if (centerSpecificPath || (switchingWorkspace && recordSpecificQuery)) return "/dashboard";

  for (const key of ["centerId", "schoolId", "locationId"]) {
    if (!url.searchParams.has(key)) continue;
    if (selectedCenterId) url.searchParams.set(key, selectedCenterId);
    else url.searchParams.delete(key);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function workspaceSelectionRedirect(
  workspace: Pick<WorkspaceState, "required"> | null | undefined,
  nextPath: string,
) {
  return workspace?.required ? workspaceSelectionHref(nextPath) : null;
}
