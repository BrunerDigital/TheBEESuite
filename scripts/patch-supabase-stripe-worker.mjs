import { createHash } from "node:crypto";

// This patch targets the exact deployed v9 bundle, rather than upgrading the engine.
export const BASE_SHA256 = "4926053375677c2d3588de6ed0b9933c433458b98382568e3dd76c43cd0e89a4";
export function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error("Worker patch anchor is missing or ambiguous");
  return source.replace(before, after);
}

export const rateLimitMethod = `  async waitForRateLimit(maxRate) {
    if (!Number.isInteger(maxRate) || maxRate < 1) throw new Error("Invalid sync rate limit");
    const schema = this.syncSchema.replace(/"/g, '""');
    while (true) {
      // A denied permit returns no row; it is normal flow, not a Postgres exception.
      // Row locking in ON CONFLICT serializes permits across worker instances.
      const result = await this.query(\`
        INSERT INTO "\${schema}"."_rate_limits" AS limits (key, count, window_start)
        VALUES ($1, 1, clock_timestamp())
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN limits.window_start + interval '1 second' <= EXCLUDED.window_start
            THEN 1 ELSE limits.count + 1 END,
          window_start = CASE WHEN limits.window_start + interval '1 second' <= EXCLUDED.window_start
            THEN EXCLUDED.window_start ELSE limits.window_start END
        WHERE limits.count < $2
           OR limits.window_start + interval '1 second' <= EXCLUDED.window_start
        RETURNING count
      \`, ["stripe", maxRate]);
      if (result.rows.length > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }`;

export function patchWorker(source) {
  const hash = createHash("sha256").update(source).digest("hex");
  if (hash !== BASE_SHA256) throw new Error("Deployed worker changed; inspect it before patching");
  const start = source.indexOf("  async waitForRateLimit(maxRate) {");
  const end = source.indexOf("\n};", start);
  if (start < 0 || end < 0) throw new Error("Rate limiter anchor not found");
  source = replaceOnce(source, source.slice(start, end), rateLimitMethod);
  source = replaceOnce(source,
    'var workerCount = Number(Deno.env.get("WORKER_COUNT")) || 10;',
    'var workerCount = Math.min(2, Math.max(1, Number(Deno.env.get("WORKER_COUNT")) || 2));');
  // Chunk planning previously omitted workerCount and inherited a default of 100.
  source = replaceOnce(source, '    "edge-worker",\n    SYNC_INTERVAL\n',
    '    "edge-worker",\n    SYNC_INTERVAL,\n    workerCount\n');
  source = replaceOnce(source,
    '      stripeSync.upsertAny.bind(stripeSync),\n      Infinity,\n      rateLimit',
    '      stripeSync.upsertAny.bind(stripeSync),\n      4,\n      rateLimit');
  // Bound CPU work even when many pages are immediately available.
  source = replaceOnce(source, '    const listParams = {\n      limit: 100\n',
    '    const listParams = {\n      limit: 25\n');
  source = replaceOnce(source, '  workers.forEach((w) => w.shutdown());',
    '  await Promise.all(workers.map((w) => w.shutdown()));');
  return source;
}

