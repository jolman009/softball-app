import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  // Persistent hosts (Render/Railway/Fly) inject PORT and expect the server to
  // bind to it. When present it takes precedence over API_PORT — see index.ts.
  PORT: z.coerce.number().int().positive().optional(),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  // Number of proxy hops to trust for client-IP resolution (Express `trust
  // proxy`). 0 = trust no proxy (correct for local dev). Set to 1 in production
  // when deployed behind a single reverse proxy (Vercel/Render/etc.) so rate
  // limiting keys on the real client IP, not the proxy's.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
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
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().default("http://localhost:4000/api/calendar/google/callback"),
  // Transactional email (Resend). When RESEND_API_KEY is unset, the email
  // service degrades to a no-op (logs and returns) so local dev and outages
  // never block a booking. EMAIL_FROM must be a verified sender/domain in
  // production; `onboarding@resend.dev` works out of the box but only delivers
  // to the Resend account owner's address.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Softball Training <onboarding@resend.dev>"),
  // IANA timezone used to render session times in outbound emails. The coach's
  // availability-window timezone takes precedence when one exists; this is the
  // fallback.
  DISPLAY_TIMEZONE: z.string().default("America/Chicago"),
  // Error monitoring (Sentry). When SENTRY_DSN is unset, Sentry is never
  // initialized and all hooks are no-ops.
  SENTRY_DSN: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  // PROTOTYPE flag (Phase 7 preview): enables the in-process HEVC->H.264
  // transcode endpoint. Off unless explicitly "true"/"1". NOTE: z.coerce.boolean
  // would treat the string "false" as true, so parse the truthy values by hand.
  ENABLE_TRANSCODE: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1")
});

export const env = envSchema.parse(process.env);
