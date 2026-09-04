export const AGENCY_REHEARSAL_PROJECT_REF = "dmkzqgmdrqlzvoeiudvf";
export const AGENCY_PRODUCTION_PROJECT_REF = "nqjrlktoewiueiwrubas";
export const AGENCY_REHEARSAL_DATABASE_MARKER =
  `bee-suite:agency-ledger-rehearsal-20260904:${AGENCY_REHEARSAL_PROJECT_REF}`;

function parsedSupabaseTarget(rawUrl: string) {
  const parsed = new URL(rawUrl);
  return {
    parsed,
    username: decodeURIComponent(parsed.username),
    isPoolerHost: /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(parsed.hostname),
  };
}

export function assertExactSupabaseDatabaseTarget(rawUrl: string, expectedProjectRef: string, label: string) {
  const { parsed, username, isPoolerHost } = parsedSupabaseTarget(rawUrl);
  const isExactDirectTarget = parsed.hostname === `db.${expectedProjectRef}.supabase.co` && username === "postgres";
  const isExactPoolerTarget = isPoolerHost && username === `postgres.${expectedProjectRef}`;
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol)
    || (parsed.port || "5432") !== "5432"
    || parsed.pathname !== "/postgres"
    || parsed.searchParams.get("sslmode") !== "require"
    || (!isExactDirectTarget && !isExactPoolerTarget)
  ) {
    throw new Error(`${label} must use the exact expected Supabase project, postgres database, and required TLS.`);
  }
  return `${parsed.hostname}|${username}|${parsed.pathname}`;
}

export function assertAuthorizedRehearsalDatabaseTarget(rawUrl: string) {
  const { parsed, username } = parsedSupabaseTarget(rawUrl);
  if (
    parsed.hostname === `db.${AGENCY_PRODUCTION_PROJECT_REF}.supabase.co`
    || username === `postgres.${AGENCY_PRODUCTION_PROJECT_REF}`
  ) {
    throw new Error("The rehearsal URL resolves to the production project; refusing every write.");
  }
  return assertExactSupabaseDatabaseTarget(rawUrl, AGENCY_REHEARSAL_PROJECT_REF, "Rehearsal target URL");
}
