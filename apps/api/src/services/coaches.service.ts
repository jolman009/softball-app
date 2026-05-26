import { supabaseAdmin } from "../lib/supabase.js";

/**
 * Returns the id of the default coach. For now the platform supports a single coach: the
 * earliest-created admin profile. When multi-coach support lands, callers will pass an
 * explicit coach id and this helper goes away.
 */
export async function getDefaultCoachId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}
