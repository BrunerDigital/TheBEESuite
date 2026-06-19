export const INCOMPLETE_INCIDENT_DESCRIPTION = "Details not completed by teacher.";
export const INCOMPLETE_INCIDENT_ACTION_TAKEN = "Action taken not completed by teacher.";

export type NormalizedTeacherIncidentPayload = {
  childId: string;
  type: string;
  description: string;
  actionTaken: string;
  occurredAt: unknown;
  parentNotified: boolean;
  photoAttachmentPlaceholder: boolean;
  followUpTask: string;
};

type NormalizeTeacherIncidentResult =
  | { ok: true; incident: NormalizedTeacherIncidentPayload }
  | { ok: false; status: number; error: string };

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeTeacherIncidentPayload(body: unknown): NormalizeTeacherIncidentResult {
  const input = asRecord(body);
  const childId = clean(input.childId);
  if (!childId) {
    return { ok: false, status: 400, error: "Child is required." };
  }

  return {
    ok: true,
    incident: {
      childId,
      type: clean(input.type) || "Incident",
      description: clean(input.description) || INCOMPLETE_INCIDENT_DESCRIPTION,
      actionTaken: clean(input.actionTaken) || INCOMPLETE_INCIDENT_ACTION_TAKEN,
      occurredAt: input.occurredAt,
      parentNotified: input.parentNotified === true,
      photoAttachmentPlaceholder: input.photoAttachmentPlaceholder === true,
      followUpTask: clean(input.followUpTask),
    },
  };
}
