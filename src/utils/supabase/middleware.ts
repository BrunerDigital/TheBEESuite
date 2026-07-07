import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase middleware environment variables are not configured.");
  }

  return { supabaseUrl, supabaseKey };
}

export function createClient(request: NextRequest) {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
      },
    },
  });

  return {
    supabase,
    getResponse: () => supabaseResponse,
  };
}

export async function updateSession(request: NextRequest) {
  const { supabase, getResponse } = createClient(request);

  await supabase.auth.getClaims();

  return getResponse();
}
