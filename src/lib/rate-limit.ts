type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
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

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
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

export async function checkPersistentRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAt = now + options.windowMs;

  try {
    const { prisma } = await import("@/lib/prisma");
    const current = await prisma.rateLimitBucket.findUnique({
      where: { key: options.key },
      select: { key: true, count: true, resetAt: true },
    });

    if (!current || current.resetAt.getTime() <= now) {
      await prisma.rateLimitBucket.upsert({
        where: { key: options.key },
        update: { count: 1, resetAt: new Date(resetAt) },
        create: { key: options.key, count: 1, resetAt: new Date(resetAt) },
      });
      return { ok: true, remaining: Math.max(options.limit - 1, 0), resetAt };
    }

    const currentResetAt = current.resetAt.getTime();
    if (current.count >= options.limit) {
      return { ok: false, remaining: 0, resetAt: currentResetAt };
    }

    const updated = await prisma.rateLimitBucket.update({
      where: { key: options.key },
      data: { count: { increment: 1 } },
      select: { count: true, resetAt: true },
    });

    return {
      ok: true,
      remaining: Math.max(options.limit - updated.count, 0),
      resetAt: updated.resetAt.getTime(),
    };
  } catch {
    return checkRateLimit(options);
  }
}
