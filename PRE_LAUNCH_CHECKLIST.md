# Pre-Launch Checklist — Soft-Launch to Real Clients

> Phase 5 exit gate. Short, grounded in this app's actual config. Check each
> before inviting the first paying clients. See `IMPLEMENTATION_PLAN.md` for
> phase status and `CLAUDE.md` for environment gotchas.

## 1. Data safety (do first)
- [ ] **Supabase backups confirmed** — Dashboard → Database → Backups. Confirm daily backups run; note the retention window. Enable PITR if the plan offers it.
- [ ] **Test a restore mentally / verify backup timestamps are recent** — a backup you've never looked at is a hope, not a backup.

## 2. Email (Resend)
- [ ] **Verify a sending domain** at resend.com/domains (DNS records added + verified). The `onboarding@resend.dev` test sender only reaches the account owner.
- [ ] **Set `EMAIL_FROM`** in `apps/api/.env` to an address on the verified domain (e.g. `Softball Training <bookings@yourdomain.com>`).
- [ ] **Send a real confirm/cancel** to a non-owner address and confirm delivery + formatting.
- [ ] *(Optional)* Point **Supabase Auth custom SMTP** at Resend (Auth → Email) so confirmation + password-reset emails are on-brand.
- [ ] Confirm `DISPLAY_TIMEZONE` (or the coach's availability-window timezone) renders session times correctly.

## 3. Observability
- [ ] **Sentry**: create web + api projects; set `SENTRY_DSN` (api) and `VITE_SENTRY_DSN` (web). Trigger a test error and confirm it lands.
- [ ] **PostHog**: set `VITE_POSTHOG_KEY` (+ `VITE_POSTHOG_HOST` if EU/self-hosted). Run one booking and confirm the funnel events arrive.

## 4. Production config & secrets
- [ ] **`TRUST_PROXY=1`** on the API when deployed behind a proxy (Vercel/Render) so rate limiting keys on the real client IP.
- [ ] **`WEB_ORIGIN`** (api) and **`VITE_API_BASE_URL`** (web) point at the production URLs, not localhost.
- [ ] **`SUPABASE_SERVICE_ROLE_KEY`** and **`ENCRYPTION_KEY`** are set only server-side; never shipped to the browser bundle.
- [ ] `ENCRYPTION_KEY` is the same value used to encrypt existing `calendar_connections` rows (rotating it breaks stored Google tokens).
- [ ] **Google OAuth**: register the production redirect URI (`https://<api-domain>/api/calendar/google/callback`) and the web sign-in redirect in Google Cloud Console.

## 5. Database
- [ ] All migrations applied to the **production** project (several were applied via the dashboard SQL editor, not `db push` — verify they're live): booking holds, overlap constraints, `coach_settings`, `client_uploads`, profiles role lockdown.
- [ ] At least one `availability_windows` row exists for the default coach, or the booking page shows no slots.
- [ ] *(Nice-to-have)* Register `expire_stale_holds()` with pg_cron as a backstop to the lazy sweep.

## 6. Critical-path smoke test (in production)
- [ ] Client signs up → accepts waiver → books → sees the session on their dashboard → gets a confirmation email.
- [ ] Coach sees the booking on the admin dashboard + on their Google Calendar.
- [ ] Client cancels >12h out (allowed) and <12h out (blocked); cancellation email sent.
- [ ] Two browsers race the same slot → one succeeds, one gets the conflict error.
- [ ] Rate limit returns 429 after the threshold on `/api/bookings`.

## 7. Content & policy
- [ ] Real **liability waiver** text in place (not placeholder copy).
- [ ] **Cancellation policy** copy matches the enforced 12-hour cutoff.
- [ ] Session rates / training types seeded with correct prices and durations.
