import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase server environment variables are not configured.");
  }

  return { supabaseUrl, supabaseKey };
}

function createSupabaseServerClient(cookieStore: CookieStore) {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; src/proxy.ts refreshes sessions.
        }
      },
    },
  });
}

export function createClient(cookieStore: CookieStore): ReturnType<typeof createSupabaseServerClient>;
export function createClient(): Promise<ReturnType<typeof createSupabaseServerClient>>;
export function createClient(cookieStore?: CookieStore) {
  if (cookieStore) return createSupabaseServerClient(cookieStore);
  return cookies().then(createSupabaseServerClient);
}
