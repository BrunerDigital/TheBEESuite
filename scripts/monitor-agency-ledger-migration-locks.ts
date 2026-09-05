import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { AGENCY_REHEARSAL_DATABASE_MARKER, assertAuthorizedRehearsalDatabaseTarget } from "./agency-ledger-rehearsal-target";

const MIGRATION_APPLICATION_PREFIX = "agency-ledger-migration-rehearsal";

type LockRow = {
  applicationName: string;
  state: string | null;
  waitEventType: string | null;
  waitEvent: string | null;
  relationName: string | null;
  mode: string;
  granted: boolean;
  count: bigint;
};

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  loadEnvConfig(process.env.BEE_SUITE_ENV_DIR || process.cwd());
  const url = process.env.REHEARSAL_DATABASE_URL;
  if (!url) throw new Error("REHEARSAL_DATABASE_URL is required.");
  assertAuthorizedRehearsalDatabaseTarget(url);
  const prisma = new PrismaClient({ datasources: { db: { url } }, log: ["error"] });
  const queryFingerprint = (process.env.AGENCY_MIGRATION_QUERY_FINGERPRINT || "").trim();
  const queryApplication = (process.env.AGENCY_MIGRATION_QUERY_APPLICATION || "").trim();
  if (queryApplication && !/^[A-Za-z0-9_:%-]{1,128}$/.test(queryApplication)) {
    throw new Error("AGENCY_MIGRATION_QUERY_APPLICATION must be a bounded exact application name.");
  }
  const applicationLike = (process.env.AGENCY_MIGRATION_APPLICATION_LIKE || `${MIGRATION_APPLICATION_PREFIX}%`).trim();
  if (!/^[A-Za-z0-9_:%-]{3,128}$/.test(applicationLike)) {
    throw new Error("AGENCY_MIGRATION_APPLICATION_LIKE must be a bounded application-name LIKE pattern.");
  }
  const startedAt = Date.now();
  const monitorTimeoutMs = Number(process.env.AGENCY_MIGRATION_MONITOR_TIMEOUT_MS || 16 * 60_000);
  if (!Number.isFinite(monitorTimeoutMs) || monitorTimeoutMs < 10_000 || monitorTimeoutMs > 20 * 60_000) {
    throw new Error("AGENCY_MIGRATION_MONITOR_TIMEOUT_MS must be between 10000 and 1200000 milliseconds.");
  }
  const deadline = startedAt + monitorTimeoutMs;
  let observedSession = false;
  let sessionCompletedBeforeDeadline = false;
  let completedSamples = 0;
  let sampleCount = 0;
  let waitingSampleCount = 0;
  let maxActiveSessions = 0;
  const observedLocks = new Map<string, number>();
  try {
    const [identity] = await prisma.$queryRaw<Array<{ databaseMarker: string | null }>>`
      SELECT shobj_description(database_row.oid, 'pg_database') AS "databaseMarker"
      FROM pg_database database_row
      WHERE database_row.datname = current_database()
    `;
    if (identity?.databaseMarker !== AGENCY_REHEARSAL_DATABASE_MARKER) {
      throw new Error("The database-side disposable rehearsal marker does not match; refusing to monitor this target.");
    }

    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<LockRow[]>`
        SELECT activity.application_name AS "applicationName",
          activity.state,
          activity.wait_event_type AS "waitEventType",
          activity.wait_event AS "waitEvent",
          CASE WHEN lock_row.relation IS NULL THEN NULL ELSE lock_row.relation::regclass::text END AS "relationName",
          lock_row.mode,
          lock_row.granted,
          COUNT(*)::bigint AS count
        FROM pg_stat_activity activity
        JOIN pg_locks lock_row ON lock_row.pid = activity.pid
        WHERE activity.datname = current_database()
          AND activity.pid <> pg_backend_pid()
          AND (
            activity.application_name LIKE ${applicationLike}
            OR (${queryFingerprint} <> ''
              AND (${queryApplication} = '' OR activity.application_name = ${queryApplication})
              AND POSITION(LOWER(${queryFingerprint}) IN LOWER(activity.query)) > 0)
          )
          AND activity.state <> 'idle'
        GROUP BY activity.application_name, activity.state, activity.wait_event_type, activity.wait_event,
          lock_row.relation, lock_row.mode, lock_row.granted
        ORDER BY activity.application_name, lock_row.granted, "relationName", lock_row.mode
      `;
      sampleCount += 1;
      const applications = new Set(rows.map((row) => row.applicationName));
      maxActiveSessions = Math.max(maxActiveSessions, applications.size);
      if (rows.length) {
        observedSession = true;
        completedSamples = 0;
        if (rows.some((row) => !row.granted || row.waitEventType === "Lock")) waitingSampleCount += 1;
        for (const row of rows) {
          const key = [row.applicationName, row.relationName ?? "nonrelation", row.mode, row.granted ? "granted" : "waiting"].join("|");
          observedLocks.set(key, Math.max(observedLocks.get(key) ?? 0, Number(row.count)));
        }
      } else if (observedSession) {
        completedSamples += 1;
        if (completedSamples >= 3) {
          sessionCompletedBeforeDeadline = true;
          break;
        }
      }
      await delay(50);
    }
    if (!observedSession) throw new Error("No rehearsal migration session was observed before the monitor deadline.");
    if (!sessionCompletedBeforeDeadline) throw new Error("The rehearsal migration session was still active when lock monitoring reached its deadline.");
    console.log(JSON.stringify({
      mode: "agency_ledger_migration_lock_monitor",
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      sampleIntervalMs: 50,
      applicationLike,
      queryFingerprint: queryFingerprint || null,
      queryApplication: queryApplication || null,
      sampleCount,
      waitingSampleCount,
      maxActiveSessions,
      sessionCompletedBeforeDeadline,
      observedLocks: [...observedLocks.entries()].map(([key, maximumCount]) => ({ key, maximumCount })),
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
