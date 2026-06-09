import { CRM_LOCATION_ID_EXAMPLE, isValidCrmLocationId } from "@/lib/active-school-locations";

const liveCenterStatuses = new Set(["active", "trial_setup", "paused"]);
const editableCenterStatuses = new Set([...liveCenterStatuses, "closed"]);
const ownerGroupStatuses = new Set(["active", "paused", "closed"]);
const ownerTypes = new Set(["franchisee", "multi_location_operator", "single_location_owner", "brand_network"]);
const assignableRoles = new Set([
  "BRAND_ADMIN",
  "REGIONAL_MANAGER",
  "CENTER_DIRECTOR",
  "ASSISTANT_DIRECTOR",
  "TEACHER",
  "BILLING_ADMIN",
  "READ_ONLY_AUDITOR",
]);
const tenantAccessRoles = new Set(["BRAND_ADMIN", "REGIONAL_MANAGER", "BILLING_ADMIN", "READ_ONLY_AUDITOR"]);
const accessScopeTypes = new Set(["TENANT", "OWNER_GROUP", "CENTER"]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isExecutiveEmail(value: unknown) {
  const email = clean(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateExecutiveCenterForm(input: {
  name?: unknown;
  crmLocationId?: unknown;
  email?: unknown;
  status?: unknown;
  licensedCapacity?: unknown;
}) {
  const errors: string[] = [];
  const name = clean(input.name);
  const crmLocationId = clean(input.crmLocationId);
  const email = clean(input.email);
  const status = clean(input.status) || "active";
  const capacityText = clean(input.licensedCapacity);

  if (!editableCenterStatuses.has(status)) errors.push("Choose a supported school status.");
  if (!name && !crmLocationId) errors.push("School name or Location ID is required.");
  if (liveCenterStatuses.has(status) && !crmLocationId) {
    errors.push(`Location ID is required for active schools. Use ${CRM_LOCATION_ID_EXAMPLE}.`);
  }
  if (crmLocationId && !isValidCrmLocationId(crmLocationId)) {
    errors.push(`Location ID must use ST | City format, for example ${CRM_LOCATION_ID_EXAMPLE}.`);
  }
  if (email && !isExecutiveEmail(email)) errors.push("Routing email must be a valid email address.");
  if (capacityText) {
    const capacity = Number.parseInt(capacityText, 10);
    if (!Number.isFinite(capacity) || capacity < 0) errors.push("Licensed capacity must be zero or greater.");
  }

  return errors;
}

export function validateExecutiveOwnerGroupForm(input: {
  name?: unknown;
  ownerType?: unknown;
  billingEmail?: unknown;
  status?: unknown;
}) {
  const errors: string[] = [];
  const name = clean(input.name);
  const ownerType = clean(input.ownerType) || "franchisee";
  const billingEmail = clean(input.billingEmail);
  const status = clean(input.status) || "active";

  if (!name) errors.push("Owner group name is required.");
  if (!ownerTypes.has(ownerType)) errors.push("Choose a supported owner group type.");
  if (!ownerGroupStatuses.has(status)) errors.push("Choose a supported owner group status.");
  if (billingEmail && !isExecutiveEmail(billingEmail)) errors.push("Owner group billing email must be valid.");

  return errors;
}

export function validateExecutiveUserForm(input: {
  name?: unknown;
  email?: unknown;
  role?: unknown;
  accessScopeType?: unknown;
  centerId?: unknown;
  ownerGroupId?: unknown;
  password?: unknown;
  sendPasswordReset?: unknown;
}) {
  const errors: string[] = [];
  const name = clean(input.name);
  const email = clean(input.email);
  const role = clean(input.role) || "CENTER_DIRECTOR";
  const scopeType = clean(input.accessScopeType) || "CENTER";
  const centerId = clean(input.centerId);
  const ownerGroupId = clean(input.ownerGroupId);
  const password = clean(input.password);
  const sendPasswordReset = input.sendPasswordReset === true || clean(input.sendPasswordReset) === "yes";
  const isTeacher = role === "TEACHER";

  if (!name) errors.push("User name is required.");
  if (!assignableRoles.has(role)) errors.push("Choose a supported user role.");
  if (!accessScopeTypes.has(scopeType)) errors.push("Choose a supported access scope.");
  if (!isTeacher && !isExecutiveEmail(email)) errors.push("A valid user email is required.");
  if (isTeacher && email && !isExecutiveEmail(email)) errors.push("Teacher contact email must be valid when provided.");
  if (isTeacher && scopeType !== "CENTER") errors.push("Teacher accounts must be scoped to a single location.");
  if (scopeType === "CENTER" && !centerId) errors.push("Center-scoped users require a location.");
  if (scopeType === "OWNER_GROUP" && !ownerGroupId) errors.push("Owner-group-scoped users require an owner group.");
  if (scopeType === "TENANT" && !tenantAccessRoles.has(role)) {
    errors.push("Tenant-wide access is limited to executive, regional, billing, or auditor roles.");
  }
  if (password && password.length < 8) errors.push("Temporary passwords must be at least 8 characters.");
  if (password && sendPasswordReset) errors.push("Choose either a temporary password or a reset email, not both.");

  return errors;
}

export function validateExecutivePasswordAction(input: { email?: unknown; password?: unknown }) {
  const errors: string[] = [];
  const password = clean(input.password);
  if (!isExecutiveEmail(input.email)) errors.push("A valid user email is required.");
  if (password && password.length < 8) errors.push("Temporary passwords must be at least 8 characters.");
  return errors;
}
