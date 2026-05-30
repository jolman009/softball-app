import * as Sentry from "@sentry/react";
import { env } from "./env";

/**
 * Front-end error monitoring. Env-gated on VITE_SENTRY_DSN: with no DSN,
 * `initSentry()` is a no-op and Sentry is never loaded into the runtime.
 * Call once at app bootstrap (main.tsx) before rendering.
 */
export function initSentry(): void {
  if (!env.sentryDsn) return;
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.mode,
    // Conservative defaults; raise via config if/when traffic warrants tracing.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0
  });
}
