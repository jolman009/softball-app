import posthog from "posthog-js";
import { env } from "./env";

/**
 * Product analytics via PostHog, focused on the booking funnel. Env-gated on
 * VITE_POSTHOG_KEY: without a key, `initAnalytics()` is a no-op and every
 * `track()` / `identify()` call returns immediately, so the app behaves
 * identically with analytics off.
 *
 * Funnel event names are centralized in `BookingEvent` so the dashboard funnel
 * definition has a single source of truth.
 */

let enabled = false;

export const BookingEvent = {
  /** Booking page mounted — top of the funnel. */
  Started: "booking_started",
  /** A training type was chosen. */
  TypeSelected: "booking_type_selected",
  /** A time slot was selected. */
  SlotSelected: "booking_slot_selected",
  /** The confirm modal was opened ("Continue to confirm"). */
  ConfirmOpened: "booking_confirm_opened",
  /** A hold + confirm round-trip succeeded — bottom of the funnel. */
  Confirmed: "booking_confirmed",
  /** A booking attempt failed (slot taken, auth error, etc.). */
  Failed: "booking_failed",
  /** A client cancelled an upcoming session from their dashboard. */
  Cancelled: "booking_cancelled"
} as const;

export type BookingEventName = (typeof BookingEvent)[keyof typeof BookingEvent];

export function initAnalytics(): void {
  if (!env.posthogKey) return;
  posthog.init(env.posthogKey, {
    api_host: env.posthogHost,
    capture_pageview: true,
    autocapture: false,
    persistence: "localStorage"
  });
  enabled = true;
}

/** Records a funnel event with optional properties. No-op when disabled. */
export function track(event: BookingEventName, properties?: Record<string, unknown>): void {
  if (!enabled) return;
  posthog.capture(event, properties);
}

/** Associates subsequent events with a signed-in user. No-op when disabled. */
export function identify(userId: string, properties?: Record<string, unknown>): void {
  if (!enabled) return;
  posthog.identify(userId, properties);
}

/** Clears the identified user on sign-out. No-op when disabled. */
export function resetAnalytics(): void {
  if (!enabled) return;
  posthog.reset();
}
