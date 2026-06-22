import { cleanSupabaseUrl } from "@/lib/supabase-auth";

type EnvMap = Record<string, string | undefined>;

export const databaseUrlEnvNames = ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"] as const;

export function envPresent(env: EnvMap, name: string) {
  return Boolean(env[name]?.trim());
}

export function anyEnvPresent(env: EnvMap, names: string[]) {
  return names.some((name) => envPresent(env, name));
}

export function getDatabaseUrl(env: EnvMap) {
  return databaseUrlEnvNames.map((name) => env[name]?.trim()).find(Boolean) ?? "";
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
