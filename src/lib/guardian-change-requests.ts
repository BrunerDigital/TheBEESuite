export type GuardianChangeRequestStatus = "pending" | "approved" | "rejected";

const statusPrefixPattern = /^\[(approved|rejected)\]\s*/i;

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
  const details = withoutStatus.slice(separator + " request:".length).split(/\nReview note:/)[0]?.trim() ?? "";
  if (!requestType || !details) return null;
  return {
    requestType,
    details,
    status,
  };
}

export function formatGuardianChangeRequestBody(input: {
  requestType: string;
  details: string;
  status?: GuardianChangeRequestStatus;
}) {
  const status = normalizeGuardianChangeRequestStatus(input.status);
  const prefix = status === "pending" ? "" : `[${status}] `;
  return `${prefix}${input.requestType.trim()} request: ${input.details.trim()}`;
}
