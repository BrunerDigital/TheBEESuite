import { createPublicKey, verify } from "node:crypto";

export type SendGridEvent = {
  email?: string;
  event?: string;
  reason?: string;
  response?: string;
  sg_event_id?: string;
  sg_message_id?: string;
  timestamp?: number;
};

export type NormalizedSendGridEvent = {
  eventId: string;
  eventType: "processed" | "deferred" | "delivered" | "bounce" | "dropped" | "spamreport";
  messageIds: string[];
  occurredAt: Date | null;
  status: "accepted" | "delivered" | "failed";
  failureKind: "bounced" | "suppressed" | null;
};

export type SendGridEventRepository = {
  processOnce: (event: NormalizedSendGridEvent) => Promise<"processed" | "duplicate">;
};

export function verifySendGridEventSignature({
  payload,
  signature,
  timestamp,
  verificationKey,
}: {
  payload: string;
  signature: string | null;
  timestamp: string | null;
  verificationKey: string | undefined;
}) {
  if (!signature || !timestamp || !verificationKey) return false;
  try {
    const key = verificationKey.includes("BEGIN PUBLIC KEY")
      ? verificationKey.replace(/\\n/g, "\n")
      : createPublicKey({ key: Buffer.from(verificationKey, "base64"), format: "der", type: "spki" });
    return verify("sha256", Buffer.from(timestamp + payload), key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export function sendGridDeliveryStatus(event: string) {
  switch (event.trim().toLowerCase()) {
    case "delivered": return "delivered";
    case "processed": return "accepted";
    case "deferred": return "accepted";
    case "bounce":
    case "dropped":
    case "spamreport": return "failed";
    default: return null;
  }
}

export function sendGridMessageIdCandidates(value: string) {
  const normalized = value.trim();
  if (!normalized) return [];
  const base = normalized.split(".")[0];
  return base && base !== normalized ? [normalized, base] : [normalized];
}

export function normalizeSendGridEvent(value: unknown): NormalizedSendGridEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as SendGridEvent;
  const eventId = typeof event.sg_event_id === "string" ? event.sg_event_id.trim() : "";
  const eventType = typeof event.event === "string" ? event.event.trim().toLowerCase() : "";
  const messageIds = sendGridMessageIdCandidates(typeof event.sg_message_id === "string" ? event.sg_message_id : "");
  const status = sendGridDeliveryStatus(eventType);
  if (!eventId || !messageIds.length || !status) return null;
  const occurredAt = typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
    ? new Date(event.timestamp * 1000)
    : null;
  if (occurredAt && Number.isNaN(occurredAt.getTime())) return null;
  return {
    eventId,
    eventType: eventType as NormalizedSendGridEvent["eventType"],
    messageIds,
    occurredAt,
    status,
    failureKind: eventType === "bounce" ? "bounced" : eventType === "dropped" || eventType === "spamreport" ? "suppressed" : null,
  };
}

export function sendGridStateTransition(currentStatus: string, event: NormalizedSendGridEvent) {
  if (sendGridBlockedCurrentStatuses(event).includes(currentStatus)) return null;
  return event.status;
}

export function sendGridBlockedCurrentStatuses(event: NormalizedSendGridEvent) {
  if (event.status === "accepted") return ["delivered", "failed"];
  if (event.status === "delivered") return ["failed"];
  return [];
}

export async function processSendGridEventBatch(events: unknown[], repository: SendGridEventRepository) {
  let processed = 0;
  let duplicates = 0;
  let malformed = 0;
  for (const value of events) {
    const event = normalizeSendGridEvent(value);
    if (!event) {
      malformed += 1;
      continue;
    }
    const result = await repository.processOnce(event);
    if (result === "duplicate") duplicates += 1;
    else processed += 1;
  }
  return { received: events.length, processed, duplicates, malformed };
}

export type SendGridDeliveryHealthRow = {
  status: string;
  createdAt: Date;
  updatedAt?: Date;
  lastResult?: unknown;
};

function resultEvent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const event = (value as Record<string, unknown>).event;
  return typeof event === "string" ? event.toLowerCase() : "";
}

export function summarizeSendGridDeliveryHealth(rows: SendGridDeliveryHealthRow[], now = new Date(), staleHours = 24) {
  const staleBefore = now.getTime() - staleHours * 60 * 60 * 1000;
  let acceptedStale = 0;
  let deferred = 0;
  let suppressed = 0;
  let bounced = 0;
  for (const row of rows) {
    const event = resultEvent(row.lastResult);
    if (row.status === "accepted" && (row.updatedAt ?? row.createdAt).getTime() <= staleBefore) acceptedStale += 1;
    if (event === "deferred") deferred += 1;
    if (event === "dropped" || event === "spamreport") suppressed += 1;
    if (event === "bounce") bounced += 1;
  }
  return { acceptedStale, deferred, suppressed, bounced, needsFollowUp: acceptedStale + suppressed + bounced };
}
