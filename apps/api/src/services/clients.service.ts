import { supabaseAdmin } from "../lib/supabase.js";

/**
 * Returns the user's `clients` row, creating one on demand when the user has
 * `role='client'` but no row exists yet. This self-heals the common case where
 * a user signs up with email confirmations on (so the web-side
 * `ensureClientRecord` never runs), confirms out-of-band, then signs in and
 * immediately tries to book or upload.
 *
 * Admins are allowed to act without a linked `clients` row (e.g. manual
 * bookings for walk-ins), so we return null for them and let the caller decide.
 */
export async function ensureClientForUser(
  userId: string,
  role: string
): Promise<{ id: string } | null> {
  const { data: existing, error: readError } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;
  if (role !== "client") return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;

  const athleteName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || "Athlete";

  const { data: created, error: insertError } = await supabaseAdmin
    .from("clients")
    .insert({ user_id: userId, athlete_name: athleteName })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created;
}
