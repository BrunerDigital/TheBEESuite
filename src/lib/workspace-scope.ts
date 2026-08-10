export type WorkspaceScopeContext = {
  kind: "portfolio" | "school" | "classroom" | "family" | "workspace";
  label: string;
  detail: string;
  href: string;
};

type WorkspaceScopeInput = {
  role: string;
  accessScope?: string | null;
  centerCount: number;
  primaryCenterName?: string | null;
  classroomName?: string | null;
};

function roleLabel(role: string) {
  return role
    .toLocaleLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toLocaleUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function locationCount(count: number) {
  return `${count} ${count === 1 ? "school" : "schools"}`;
}

export function workspaceScopeContext(input: WorkspaceScopeInput): WorkspaceScopeContext {
  const role = input.role;
  const readableRole = roleLabel(role);
  const centerCount = Math.max(0, input.centerCount);
  const primaryCenterName = input.primaryCenterName?.trim() || null;
  const classroomName = input.classroomName?.trim() || null;

  if (role === "PARENT_GUARDIAN" || role === "AUTHORIZED_PICKUP") {
    return {
      kind: "family",
      label: "Family portal",
      detail: role === "AUTHORIZED_PICKUP" ? "Authorized pickup access" : "Linked family access",
      href: "/parent-portal",
    };
  }

  if (role === "TEACHER") {
    return {
      kind: "classroom",
      label: classroomName ?? primaryCenterName ?? "Assigned classroom",
      detail: classroomName && primaryCenterName ? `${primaryCenterName} · Teacher` : "Teacher workspace",
      href: "/teacher-portal",
    };
  }

  if (input.accessScope === "platform" || input.accessScope === "tenant") {
    return {
      kind: "portfolio",
      label: input.accessScope === "platform" ? "All schools" : "School portfolio",
      detail: `${locationCount(centerCount)} · ${readableRole}`,
      href: "/multi-location-dashboard",
    };
  }

  if (centerCount > 1) {
    return {
      kind: "school",
      label: `${centerCount} authorized schools`,
      detail: readableRole,
      href: "/dashboard",
    };
  }

  if (centerCount === 1 || primaryCenterName) {
    return {
      kind: "school",
      label: primaryCenterName ?? "Authorized school",
      detail: `${readableRole} · 1 school`,
      href: "/dashboard",
    };
  }

  return {
    kind: "workspace",
    label: "Workspace scope pending",
    detail: readableRole,
    href: "/dashboard",
  };
}
