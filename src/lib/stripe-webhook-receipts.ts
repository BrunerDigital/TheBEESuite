export function stripeWebhookDedupeKey(eventId: string) {
  return eventId;
}

export function isStripeWebhookReceiptUniqueConflict(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") return false;
  const meta = "meta" in error && error.meta && typeof error.meta === "object"
    ? error.meta as { target?: unknown }
    : undefined;
  const target = meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target || "")];
  return fields.some((field) => field.includes("eventId") || field.includes("dedupeKey"));
}

export async function reserveStripeWebhookDelivery(input: {
  insert: () => Promise<void>;
  existingReceipt: () => Promise<{ status: string } | null>;
  reclaimRetryable: () => Promise<boolean>;
}) {
  try {
    await input.insert();
    return "received" as const;
  } catch (error) {
    if (!isStripeWebhookReceiptUniqueConflict(error)) throw error;
    const existing = await input.existingReceipt();
    if (!existing) throw error;
    if (existing.status === "retryable" && await input.reclaimRetryable()) return "received" as const;
    return "duplicate" as const;
  }
}
