import * as Sentry from "@sentry/node";
import { env } from "../config/env.js";

/**
 * Error monitoring for the API. Entirely env-gated: when SENTRY_DSN is unset
 * (local dev, CI), `initSentry()` does nothing and `captureException()` is a
 * silent no-op, so there's no behavioral difference without a DSN.
 *
 * Call `initSentry()` once at process start (index.ts) before the app is built.
 */
let enabled = false;

export function initSentry(): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE
  });
  enabled = true;
  console.log("Sentry error monitoring enabled.");
}

/** Reports an exception to Sentry when enabled; no-op otherwise. */
export function captureException(error: unknown): void {
  if (!enabled) return;
  Sentry.captureException(error);
}
