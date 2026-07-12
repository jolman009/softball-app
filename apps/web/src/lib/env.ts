const requiredEnv = {
  appName: import.meta.env.VITE_APP_NAME ?? "On Deck",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api"
};

for (const [key, value] of Object.entries(requiredEnv)) {
  if (!value) {
    throw new Error(`Missing required Vite environment variable: ${key}`);
  }
}

// Optional observability config. When a key is absent the corresponding
// integration (Sentry error monitoring / PostHog analytics) stays disabled and
// all of its hooks become no-ops — see lib/sentry.ts and lib/analytics.ts.
const optionalEnv = {
  sentryDsn: import.meta.env.VITE_SENTRY_DSN ?? "",
  posthogKey: import.meta.env.VITE_POSTHOG_KEY ?? "",
  posthogHost: import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com",
  mode: import.meta.env.MODE
};

export const env = { ...requiredEnv, ...optionalEnv };
