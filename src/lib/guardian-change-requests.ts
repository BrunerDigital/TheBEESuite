export type GuardianChangeRequestStatus = "pending" | "approved" | "rejected";
export type GuardianChangeEntity = "emergency_contact" | "authorized_pickup";
export type GuardianChangeOperation = "add" | "update" | "remove";

export type GuardianChangeData = {
  entity: GuardianChangeEntity;
  operation: GuardianChangeOperation;
  targetId?: string;
  fullName?: string;
  phone?: string;
  relation?: string;
};

const statusPrefixPattern = /^\[(approved|rejected)\]\s*/i;
const changeDataPattern = /\nChange data: (\{[^\n]+\})/;

export function normalizeGuardianChangeData(value: unknown): GuardianChangeData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const entity = input.entity === "emergency_contact" || input.entity === "authorized_pickup" ? input.entity : null;
  const operation = input.operation === "add" || input.operation === "update" || input.operation === "remove" ? input.operation : null;
  if (!entity || !operation) return null;
  const clean = (field: unknown) => typeof field === "string" ? field.trim() : "";
  const data: GuardianChangeData = { entity, operation };
  const targetId = clean(input.targetId);
  const fullName = clean(input.fullName);
  const phone = clean(input.phone);
  const relation = clean(input.relation);
  if (targetId) data.targetId = targetId;
  if (fullName) data.fullName = fullName;
  if (phone) data.phone = phone;
  if (relation) data.relation = relation;
  return data;
}

export function normalizeGuardianChangeRequestStatus(value: unknown): GuardianChangeRequestStatus {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  return status === "approved" || status === "rejected" ? status : "pending";
}

export function parseGuardianChangeRequestNote(body: unknown) {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return null;
  const statusMatch = text.match(statusPrefixPattern);
  const status = normalizeGuardianChangeRequestStatus(statusMatch?.[1]);
  const withoutStatus = text.replace(statusPrefixPattern, "");
  const separator = withoutStatus.indexOf(" request:");
  if (separator <= 0) return null;
  const requestType = withoutStatus.slice(0, separator).trim();
  const details = withoutStatus.slice(separator + " request:".length).split(/\n(?:Change data|Review note):/)[0]?.trim() ?? "";
  if (!requestType || !details) return null;
  const changeDataMatch = withoutStatus.match(changeDataPattern);
  let changeData: GuardianChangeData | null = null;
  if (changeDataMatch?.[1]) {
    try {
      changeData = normalizeGuardianChangeData(JSON.parse(changeDataMatch[1]));
    } catch {
      changeData = null;
    }
  }
  return {
    requestType,
    details,
    status,
    changeData,
  };
}

export function formatGuardianChangeRequestBody(input: {
  requestType: string;
  details: string;
  status?: GuardianChangeRequestStatus;
  changeData?: GuardianChangeData | null;
}) {
  const status = normalizeGuardianChangeRequestStatus(input.status);
  const prefix = status === "pending" ? "" : `[${status}] `;
  const changeData = normalizeGuardianChangeData(input.changeData);
  return [
    `${prefix}${input.requestType.trim()} request: ${input.details.trim()}`,
    changeData ? `Change data: ${JSON.stringify(changeData)}` : "",
  ].filter(Boolean).join("\n");
}
