import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseAdminClient(): SupabaseClient {
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (
      !serviceRoleKey ||
      serviceRoleKey.trim().length === 0 ||
      serviceRoleKey === "placeholder-key" ||
      serviceRoleKey.includes("your-supabase-private-service-role-key")
    ) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is required in production environment");
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (
      !supabaseUrl ||
      supabaseUrl.trim().length === 0 ||
      supabaseUrl.includes("placeholder-project")
    ) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL is required in production environment");
    }

    return createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  // Development and test fallback
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "placeholder-key";

  return createSupabaseClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

