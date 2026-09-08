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
  const nowDate = new Date(now);

  try {
    const { prisma } = await import("@/lib/prisma");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const incremented = await prisma.rateLimitBucket.updateMany({
        where: {
          key: options.key,
          resetAt: { gt: nowDate },
          count: { lt: options.limit },
        },
        data: { count: { increment: 1 } },
      });
      if (incremented.count === 1) {
        const updated = await prisma.rateLimitBucket.findUniqueOrThrow({
          where: { key: options.key },
          select: { count: true, resetAt: true },
        });
        return {
          ok: true,
          remaining: Math.max(options.limit - updated.count, 0),
          resetAt: updated.resetAt.getTime(),
        };
      }

      const current = await prisma.rateLimitBucket.findUnique({
        where: { key: options.key },
        select: { count: true, resetAt: true },
      });
      if (current && current.resetAt.getTime() > now) {
        return { ok: false, remaining: 0, resetAt: current.resetAt.getTime() };
      }

      if (current) {
        const reset = await prisma.rateLimitBucket.updateMany({
          where: { key: options.key, resetAt: { lte: nowDate } },
          data: { count: 1, resetAt: new Date(resetAt) },
        });
        if (reset.count === 1) {
          return { ok: true, remaining: Math.max(options.limit - 1, 0), resetAt };
        }
        continue;
      }

      try {
        await prisma.rateLimitBucket.create({
          data: { key: options.key, count: 1, resetAt: new Date(resetAt) },
        });
        return { ok: true, remaining: Math.max(options.limit - 1, 0), resetAt };
      } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") throw error;
      }
    }

    return { ok: false, remaining: 0, resetAt };
  } catch {
    return checkRateLimit(options);
  }
}
