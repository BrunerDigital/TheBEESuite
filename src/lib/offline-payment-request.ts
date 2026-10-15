import { createHash } from "node:crypto";

export function offlinePaymentPaidAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function offlinePaymentRequestId(value: unknown) {
  return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

export function offlinePaymentExternalId(billingAccountId: string, requestId: string) {
  return `offline-request:${createHash("sha256").update(JSON.stringify([billingAccountId, requestId])).digest("hex")}`;
}

export function offlinePaymentRequestIdentity(input: {
  billingAccountId: string;
  requestId: string;
  method: "cash" | "check";
  amountCents: number;
  paidAt: Date;
  reference: string;
  description: string;
  notes: string;
}) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([input.method, input.amountCents, input.paidAt.toISOString(), input.reference, input.description, input.notes]))
    .digest("hex");
  return { externalId: offlinePaymentExternalId(input.billingAccountId, input.requestId), fingerprint };
}
