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
