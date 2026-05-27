import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // 32-byte base64 secret used for AES-256-GCM at-rest token encryption and HMAC
  // signatures on OAuth state nonces. Generate with: openssl rand -base64 32
  ENCRYPTION_KEY: z
    .string()
    .min(1)
    .refine((value) => Buffer.from(value, "base64").length === 32, {
      message: "ENCRYPTION_KEY must be 32 bytes of base64 (e.g. `openssl rand -base64 32`)."
    }),
  // Server-side Google OAuth client used for the Calendar integration. The
  // redirect URI must be registered in Google Cloud Console under the same
  // OAuth client used for sign-in.
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().default("http://localhost:4000/api/calendar/google/callback")
});

export const env = envSchema.parse(process.env);
