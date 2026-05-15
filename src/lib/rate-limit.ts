type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

const globalRateLimitStore = globalThis as typeof globalThis & {
  beeSuiteRateLimits?: Map<string, RateLimitEntry>;
};

const store = globalRateLimitStore.beeSuiteRateLimits ?? new Map<string, RateLimitEntry>();
globalRateLimitStore.beeSuiteRateLimits = store;

export function requestIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { ok: true, remaining: Math.max(limit - 1, 0), resetAt };
  }

  if (current.count >= limit) {
    return { ok: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  store.set(key, current);
  return { ok: true, remaining: Math.max(limit - current.count, 0), resetAt: current.resetAt };
}

export function retryAfterSeconds(resetAt: number) {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}
