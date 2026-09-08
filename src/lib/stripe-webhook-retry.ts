const TRANSIENT_DATABASE_CODES = new Set(["P2034", "40P01", "40001"]);

function errorRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function isStripeWebhookTransientDatabaseError(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const record = errorRecord(current);
    const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
    const meta = errorRecord(record.meta);
    const metaCode = typeof meta.code === "string" ? meta.code.toUpperCase() : "";
    if (TRANSIENT_DATABASE_CODES.has(code) || TRANSIENT_DATABASE_CODES.has(metaCode)) return true;
    const message = typeof record.message === "string" ? record.message : "";
    if (/\b(?:P2034|40P01|40001)\b|deadlock detected|could not serialize access/i.test(message)) return true;
    current = record.cause;
  }
  return false;
}

export async function retryStripeWebhookTransaction<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    sleep?: (delayMs: number) => Promise<void>;
  } = {},
) {
  const maxAttempts = Math.max(1, Math.min(5, options.maxAttempts ?? 3));
  const baseDelayMs = Math.max(0, Math.min(1_000, options.baseDelayMs ?? 25));
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !isStripeWebhookTransientDatabaseError(error)) throw error;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}
