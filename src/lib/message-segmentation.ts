export type MessageBroadcastSegment = {
  centerIds: string[];
  classroomIds: string[];
  statuses: string[];
  tags: string[];
};

type FamilySegmentCandidate = {
  centerId?: string | null;
  customFields?: unknown;
  children?: Array<{
    classroomId?: string | null;
    enrollmentStatus?: string | null;
  }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanList(value: unknown, limit = 100) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return Array.from(new Set(raw.map(clean).filter(Boolean))).slice(0, limit);
}

export function normalizeMessageBroadcastSegment(value: unknown): MessageBroadcastSegment {
  const input = record(value);
  return {
    centerIds: cleanList(input.centerIds),
    classroomIds: cleanList(input.classroomIds),
    statuses: cleanList(input.statuses).map((status) => status.toLowerCase()),
    tags: cleanList(input.tags).map((tag) => tag.toLowerCase()),
  };
}

export function extractFamilyTags(customFields: unknown) {
  const fields = record(customFields);
  const tags = [
    ...cleanList(fields.tags),
    ...cleanList(fields.familyTags),
    ...cleanList(fields.labels),
    ...cleanList(fields.segments),
  ];
  return Array.from(new Set(tags.map((tag) => tag.toLowerCase()).filter(Boolean))).sort();
}

export function broadcastSegmentIsEmpty(segment: MessageBroadcastSegment) {
  return !segment.centerIds.length && !segment.classroomIds.length && !segment.statuses.length && !segment.tags.length;
}

export function familyMatchesBroadcastSegment(family: FamilySegmentCandidate, segment: MessageBroadcastSegment) {
  if (segment.centerIds.length && (!family.centerId || !segment.centerIds.includes(family.centerId))) {
    return false;
  }

  const children = family.children ?? [];
  if (segment.classroomIds.length && !children.some((child) => child.classroomId && segment.classroomIds.includes(child.classroomId))) {
    return false;
  }

  if (segment.statuses.length && !children.some((child) => child.enrollmentStatus && segment.statuses.includes(child.enrollmentStatus.toLowerCase()))) {
    return false;
  }

  if (segment.tags.length) {
    const familyTags = extractFamilyTags(family.customFields);
    if (!segment.tags.some((tag) => familyTags.includes(tag))) return false;
  }

  return true;
}

export function broadcastSegmentSummary(segment: MessageBroadcastSegment) {
  const parts = [
    segment.centerIds.length ? `${segment.centerIds.length} center${segment.centerIds.length === 1 ? "" : "s"}` : "",
    segment.classroomIds.length ? `${segment.classroomIds.length} classroom${segment.classroomIds.length === 1 ? "" : "s"}` : "",
    segment.statuses.length ? `statuses: ${segment.statuses.join(", ")}` : "",
    segment.tags.length ? `tags: ${segment.tags.join(", ")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All visible families";
}
