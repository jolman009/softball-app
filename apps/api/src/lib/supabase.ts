import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export type AppRole = "admin" | "client";

export type AuthenticatedUser = {
  id: string;
  email?: string;
  role: AppRole;
  emailConfirmedAt?: string | null;
};

export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

export const supabasePublic = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
