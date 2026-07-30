import { cleanSupabaseUrl } from "@/lib/supabase-auth";

type EnvMap = Record<string, string | undefined>;

export const databaseUrlEnvNames = ["POSTGRES_PRISMA_URL", "DATABASE_URL", "POSTGRES_URL"] as const;

export function isTransactionPoolerUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const isPostgres = url.protocol === "postgres:" || url.protocol === "postgresql:";
    return isPostgres && (url.port === "6543" || url.searchParams.get("pgbouncer") === "true");
  } catch {
    return false;
  }
}

export function envPresent(env: EnvMap, name: string) {
  return Boolean(env[name]?.trim());
}

export function anyEnvPresent(env: EnvMap, names: string[]) {
  return names.some((name) => envPresent(env, name));
}

export function getDatabaseUrl(env: EnvMap) {
  const candidates = databaseUrlEnvNames
    .map((name) => env[name]?.trim())
    .filter((value): value is string => Boolean(value));

  return candidates.find(isTransactionPoolerUrl) ?? candidates[0] ?? "";
}

export function getRuntimeDatabaseUrl(env: EnvMap) {
  const rawUrl = getDatabaseUrl(env);
  if (!rawUrl) return undefined;

  try {
    const url = new URL(rawUrl);
    const isPostgres = url.protocol === "postgres:" || url.protocol === "postgresql:";
    if (!isPostgres) return rawUrl;

    if (isTransactionPoolerUrl(rawUrl) && !url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", env.PRISMA_CONNECTION_LIMIT ?? "5");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", env.PRISMA_POOL_TIMEOUT ?? "20");
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function hasDatabaseConfig(env: EnvMap) {
  return Boolean(getDatabaseUrl(env));
}

export function hasSupabaseAuthConfig(env: EnvMap) {
  const url = cleanSupabaseUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  return Boolean(
    url &&
      anyEnvPresent(env, ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) &&
      envPresent(env, "SUPABASE_SERVICE_ROLE_KEY"),
  );
}

export function hasStripeBillingConfig(env: EnvMap) {
  return envPresent(env, "STRIPE_SECRET_KEY") && envPresent(env, "STRIPE_WEBHOOK_SECRET");
}
