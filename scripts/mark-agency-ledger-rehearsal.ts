import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  AGENCY_REHEARSAL_DATABASE_MARKER,
  AGENCY_REHEARSAL_PROJECT_REF,
  assertAuthorizedRehearsalDatabaseTarget,
} from "./agency-ledger-rehearsal-target";

type DatabaseIdentity = {
  databaseName: string;
  databaseUser: string;
  databaseMarker: string | null;
};

async function readIdentity(prisma: PrismaClient) {
  const [identity] = await prisma.$queryRaw<DatabaseIdentity[]>`
    SELECT current_database() AS "databaseName",
      current_user AS "databaseUser",
      shobj_description(database_row.oid, 'pg_database') AS "databaseMarker"
    FROM pg_database database_row
    WHERE database_row.datname = current_database()
  `;
  return identity;
}

async function main() {
  loadEnvConfig(process.env.BEE_SUITE_ENV_DIR || process.cwd());
  const url = process.env.REHEARSAL_DATABASE_URL;
  if (!url) throw new Error("REHEARSAL_DATABASE_URL is required.");
  assertAuthorizedRehearsalDatabaseTarget(url);
  if (process.env.CONFIRM_REHEARSAL_PROJECT_REF !== AGENCY_REHEARSAL_PROJECT_REF) {
    throw new Error("CONFIRM_REHEARSAL_PROJECT_REF must exactly name the authorized disposable project.");
  }

  const prisma = new PrismaClient({ datasources: { db: { url } }, log: ["error"] });
  try {
    const before = await readIdentity(prisma);
    if (!before || before.databaseName !== "postgres" || before.databaseUser !== "postgres") {
      throw new Error("Unexpected database identity; refusing to initialize the rehearsal marker.");
    }
    if (before.databaseMarker && before.databaseMarker !== AGENCY_REHEARSAL_DATABASE_MARKER) {
      throw new Error("The database already has a conflicting marker; refusing to overwrite it.");
    }
    if (!before.databaseMarker) {
      await prisma.$executeRawUnsafe(
        `COMMENT ON DATABASE postgres IS '${AGENCY_REHEARSAL_DATABASE_MARKER}'`,
      );
    }
    const after = await readIdentity(prisma);
    if (after?.databaseMarker !== AGENCY_REHEARSAL_DATABASE_MARKER) {
      throw new Error("The disposable rehearsal marker could not be verified after initialization.");
    }
    console.log(JSON.stringify({
      mode: "disposable_rehearsal_marker",
      targetProjectRef: AGENCY_REHEARSAL_PROJECT_REF,
      databaseName: after.databaseName,
      databaseUser: after.databaseUser,
      marker: after.databaseMarker,
      changed: before.databaseMarker === null,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
