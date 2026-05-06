import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export type AppRole = "admin" | "client";

export type Profile = {
  id: string;
  role: AppRole;
  first_name: string | null;
  last_name: string | null;
  email: string;
};

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});
