import { randomUUID } from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";

type SupabaseAuthKeyPreference = "anon" | "service";

export function cleanSupabaseUrl(value?: string | null) {
  return value?.trim().replace(/\/+$/, "") || "";
}

export function getSupabaseAuthConfig(preference: SupabaseAuthKeyPreference = "anon") {
  const url = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = preference === "service" ? serviceKey || anonKey : anonKey || serviceKey;

  if (!url || !key) {
    throw new Error("Supabase auth environment variables are not configured.");
  }

  return { url, key };
}

export function hasSupabaseAdminAuthConfig() {
  const url = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(url && serviceKey);
}

function getSupabaseAdminClient() {
  const { url, key } = getSupabaseAuthConfig("service");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findSupabaseAuthUserByEmail(email: string) {
  const supabase = getSupabaseAdminClient();
  const normalized = email.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === normalized);
    if (user) return { supabase, user };
    if (data.users.length < 1000) break;
  }

  return { supabase, user: null as User | null };
}

export function getAppBaseUrl(requestUrl?: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  if (requestUrl) return new URL(requestUrl).origin;
  return "http://localhost:3000";
}

export function getPasswordResetRedirectUrl(requestUrl?: string) {
  const configured = process.env.AUTH_PASSWORD_RESET_REDIRECT_URL;
  if (configured) return configured;
  return `${getAppBaseUrl(requestUrl)}/reset-password`;
}

export async function requestSupabasePasswordReset(email: string, redirectTo: string) {
  const { url, key } = getSupabaseAuthConfig("anon");
  return fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
    signal: AbortSignal.timeout(10_000),
  });
}

export async function ensureSupabaseAuthUser({
  email,
  name,
}: {
  email: string;
  name?: string;
}) {
  const { url, key } = getSupabaseAuthConfig("service");
  const password = randomUUID() + randomUUID();
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        source: "bee_suite_trial_onboarding",
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.ok) {
    return { ok: true, created: true };
  }

  const text = await response.text();
  const normalized = text.toLowerCase();
  const alreadyExists =
    response.status === 400 || response.status === 409 || response.status === 422
      ? normalized.includes("already") ||
        normalized.includes("exist") ||
        normalized.includes("registered") ||
        normalized.includes("unique")
      : false;

  if (alreadyExists) {
    return { ok: true, created: false, alreadyExisted: true };
  }

  return {
    ok: false,
    created: false,
    error: text || `Supabase admin user create returned ${response.status}.`,
  };
}

export async function upsertSupabaseAuthUserWithPassword({
  email,
  name,
  password,
  role,
  source = "bee_suite_executive_admin",
}: {
  email: string;
  name?: string;
  password: string;
  role?: string;
  source?: string;
}) {
  const normalizedEmail = email.toLowerCase();
  const { supabase, user } = await findSupabaseAuthUserByEmail(normalizedEmail);
  const metadata = {
    name,
    source,
  };
  const appMetadata = role ? { bee_suite_role: role } : undefined;

  if (user) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        ...metadata,
      },
      app_metadata: {
        ...(user.app_metadata ?? {}),
        ...(appMetadata ?? {}),
      },
    });
    if (error) throw error;
    return { ok: true, created: false, updated: true };
  }

  const { error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: metadata,
    app_metadata: appMetadata,
  });
  if (error) throw error;
  return { ok: true, created: true, updated: false };
}

export async function updateSupabaseAuthUserPasswordByEmail({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const normalizedEmail = email.toLowerCase();
  const { supabase, user } = await findSupabaseAuthUserByEmail(normalizedEmail);
  if (!user) {
    return {
      ok: false,
      error: "Supabase Auth user was not found for this account.",
    };
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: {
      ...(user.user_metadata ?? {}),
      forced_password_reset_completed_at: new Date().toISOString(),
    },
  });
  if (error) throw error;
  return { ok: true, updated: true };
}

export async function verifySupabasePassword(email: string, password: string) {
  const { url, key } = getSupabaseAuthConfig("service");
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return false;
  const result = (await response.json()) as { user?: { email?: string } };
  return result.user?.email?.toLowerCase() === email;
}

export async function updateSupabasePassword(accessToken: string, password: string) {
  const { url, key } = getSupabaseAuthConfig("anon");
  return fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
    signal: AbortSignal.timeout(10_000),
  });
}
