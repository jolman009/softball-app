import rateLimit, { type Options } from "express-rate-limit";

/**
 * Phase 5: rate limiting on the abuse-prone surfaces. Login/signup themselves
 * run against Supabase Auth directly (not this API), so the highest-value guard
 * here is `/api/bookings` (hold creation hits the DB and ties up slots); the
 * auth limiter is defense-in-depth on `/api/auth/*`.
 *
 * Keys on `req.ip`. Behind a proxy (Vercel/Render/etc.) set the `TRUST_PROXY`
 * env var so `req.ip` is the real client IP rather than the proxy's — see
 * `app.ts` and `config/env.ts`. Locally (no proxy) the default keying is fine.
 */

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const shared: Partial<Options> = {
  windowMs: FIFTEEN_MINUTES,
  standardHeaders: "draft-7", // emit RateLimit / RateLimit-Policy headers
  legacyHeaders: false, // drop the deprecated X-RateLimit-* headers
  message: { error: "Too many requests, please try again later." }
};

/** Brute-force guard for `/api/auth/*`. */
export const authLimiter = rateLimit({
  ...shared,
  limit: 20
});

/** Throttle for `/api/bookings` — curbs scripted hold creation. */
export const bookingsLimiter = rateLimit({
  ...shared,
  limit: 30
});
