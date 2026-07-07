import { createBrowserClient } from "@supabase/ssr";

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase browser environment variables are not configured.");
  }

  return { supabaseUrl, supabaseKey };
}

export function createClient() {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  return createBrowserClient(supabaseUrl, supabaseKey);
}
