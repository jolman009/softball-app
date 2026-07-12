# Implementation Plan — Current State & Checklist

> Companion to [PROJECT_PLAN.md](./PROJECT_PLAN.md). That file is the long-range product vision and architecture. This file is the live, actionable checklist with a working timeline.
>
> **Last updated:** 2026-07-11 (Verified Phase 5.5 live state via the Vercel connector + a browser probe: Vercel builds are green and auto-deploying `main`, but the site is blank until `VITE_*` env vars are set — that env step is the active blocker. Also hardened `apps/web/.env` by stripping six unused/secret `VITE_` entries so they can't leak into the web bundle. Earlier, 2026-06-05: deploy code artifacts landed — `apps/web/vercel.json` SPA rewrite, root `render.yaml` API blueprint, `.github/workflows/ci.yml` lint+typecheck, and a `PORT`-binding fix so the API works behind Render's proxy. Remaining 5.5 work is dashboard-only: set Vercel env vars, create the Render service, prod OAuth, and the live smoke test.)
> **Current phase:** Phase 5.5 — Deployment & Go-Live 🟡. Code is deploy-ready; what's left needs hands on dashboards (your Vercel/Render/Google/Supabase accounts) + a live smoke test. Phase 5 itself has one box left: backup verification (Supabase dashboard PITR check). **Next:** run the dashboard runbook to stand up the Vercel web + Render API, then §5.5.5 go-live smoke test.
>
> **Live-verified state (2026-07-11):** Vercel builds are GREEN and auto-deploy from `main` (prod domain `softball-app-one.vercel.app`), but the site is blank because the `VITE_*` env vars aren't set yet — browser console shows `Missing required Vite environment variable: supabaseUrl`. **The single active blocker for the web app is setting Vercel env vars (§5.5.1).** The Render API doesn't exist yet (§5.5.2) and `VITE_API_BASE_URL` depends on its URL, so do Render first per `DEPLOYMENT.md`. The prod Supabase project (`bjznmwwdkxbjfxjwuouj`) is in an org the in-session connector can't reach, so all DB steps stay dashboard-only.
> **Solo-developer timeline assumption:** ~8–12 focused hours per week. Adjust dates if cadence changes.

---

## Snapshot — Where Things Stand

| Area | Status | Notes |
| --- | --- | --- |
| Monorepo scaffold | ✅ Done | `apps/web`, `apps/api`, `supabase/` |
| Database schema + RLS + overlap constraint | ✅ Done | `supabase/migrations/202605060001_initial_schema.sql` |
| Supabase auth (email/password, reset) | ✅ Done | `apps/web/src/lib/auth.tsx` |
| Role-gated routing | ✅ Done | `apps/web/src/components/ProtectedRoute.tsx` |
| Landing page | ✅ Done | `apps/web/src/pages/LandingPage.tsx` |
| Booking flow UI | ✅ Done | Wired to real API; mockSlots removed (Phase 2.1) |
| `/api/availability` | ✅ Done | Engine v1 (DB-only) live (Phase 2.2) |
| `/api/bookings` POST | ✅ Done | Hold→confirm with DB-level race protection (Phase 2.3) |
| Client dashboard | ✅ Done | Real upcoming/past from `/api/me/bookings` (Phase 2.4) |
| Admin dashboard | ✅ Done | Today's schedule + week/month/revenue metrics + Phase 4 quick links (Phase 2.5) |
| Google sign-in | ✅ Done | Wired into LoginPage + BookingPage modal; OAuth resume on booking flow (Phase 2.6) |
| Google Calendar integration | ✅ Done | OAuth (3.1) + FreeBusy (3.2) + event create-on-confirm, update-on-reschedule, delete-on-cancel (3.3, wired in 4.3) |
| Resource library (coach → client) | ✅ Done | Admin CRUD + client browse/detail; signed URLs; visibility enforced (Phase 4.4) |
| Client video uploads & review (client → coach) | ✅ Done | Client upload + coach review queue w/ summaries (Phase 4.5) |
| Email confirmations | ✅ Done | Resend; booking confirm/reschedule/cancel (Phase 5). Needs a verified domain before launch. |
| Mobile / Capacitor | 🔴 Not started | |
| Payments | 🔴 Not started | Post-MVP |

Legend: ✅ done · 🟡 partial · 🔴 not started

---

## Phase 3 — Calendar Engine (current)

**Target window:** 2026-07-07 → 2026-08-10 (≈ 5 weeks)
**Goal:** Coach's Google Calendar is the second source of truth for "busy"; confirmed bookings create calendar events; reschedules/cancellations propagate.

### 3.1 OAuth plumbing + connection UI — *target 2026-07-14*

- [x] OAuth flow: `GET /api/calendar/connect/google` (returns `{ authUrl }`) → `GET /api/calendar/google/callback`. Refresh token stored in `calendar_connections.refresh_token_encrypted` (AES-256-GCM via `ENCRYPTION_KEY`).
- [x] `GET /api/calendar/status` (connected / disconnected / `tokenExpiringSoon`).
- [x] `POST /api/calendar/disconnect` flips `active` to false (soft disconnect, audit-friendly).
- [x] Admin dashboard widget: connection status + Connect/Reconnect/Disconnect.
- [x] HMAC-signed state nonce (10-min TTL) so an attacker can't swap coach IDs in the callback.

**Done when:** Coach clicks "Connect Google" on the admin dashboard, completes OAuth, returns to a "Connected" card. ✅ *(Smoke-tested end-to-end 2026-05-27 against `jolman009@gmail.com`. `calendar_connections` row stored with `active = true` and encrypted refresh token.)*

### 3.2 FreeBusy in availability engine — *target 2026-07-28*

- [x] Service `googleCalendar.service.ts` with `refreshAccessToken(connection)` + `getFreeBusy(coachId, from, to)`.
- [x] Availability engine subtracts FreeBusy results in addition to DB bookings.
- [x] Cache FreeBusy briefly (~30 s) to avoid rate-limiting on slot scans.

**Done when:** A "busy" block placed directly on the coach's Google Calendar disappears from `/api/availability` within one refresh. ✅ *(Verified 2026-05-27 against `jolman009@gmail.com`. No buffer applied to FreeBusy holes — the calendar is treated as literal "do not book." Failures degrade silently to DB-only.)*

### 3.3 Event sync on confirm/cancel/reschedule — *target 2026-08-10*

- [x] `googleCalendar.service.ts`: `createEvent(booking)`, `updateEvent(booking)`, `deleteEvent(booking)`. *(All three exported; share a `withAccessToken` helper that degrades to `null`/`false` on any error so a Google outage never rolls back a booking. Each successful call touches `calendar_connections.last_synced_at`.)*
- [x] On `POST /bookings/:id/confirm`, create the event and persist `bookings.google_calendar_event_id`. *(Event title is `"{TrainingType} with {AthleteName}"` (falls back to `"{TrainingType} session"` for admin walk-ins; appends `other_training_text` for the `Other` type). Description carries the booking's notes. Calendar failure is logged + swallowed; the booking is still confirmed.)*
- [x] On cancel / reschedule (Phase 4.3 wires the actions), update or delete the event. *(Wired 2026-05-29 in `admin.ts`: reschedule → `updateEvent` (or `createEvent` if the booking never had one); cancel → `deleteEvent` + clears the link. Best-effort/failure-tolerant as ever.)*

**Phase 3 exit criteria:** A "busy" block placed directly on the coach's Google Calendar disappears from the public slot list within one refresh, and a confirmed booking shows up on the coach's calendar.

---

## Phase 4 — Resource Library & Admin Tools

**Target window:** 2026-08-11 → 2026-09-14 (≈ 5 weeks)
**Goal:** The admin can run the business from the app — manage availability, clients, resources — and clients can read what's been shared with them.

### 4.1 Admin: availability management — *shipped 2026-05-28*
- [x] CRUD UI for `availability_windows` (weekly schedule). *(Group-by-day list with pause toggle + delete; add-form validates `end > start` client-side and the API double-checks server-side.)*
- [x] CRUD UI for `availability_exceptions` (blocked / special openings). *(Lists the next 180 days; `datetime-local` inputs converted to UTC ISO before submit; create + delete only — edits intentionally skipped until a real workflow asks for them.)*
- [x] Settings panel for buffer / min-notice / max-window (new `coach_settings` table). *(Migration `202605280001_coach_settings.sql` seeds defaults for existing admins; `availability.service.ts` reads from the row with a defaults fallback so a bad settings row can't take public availability offline.)*
- [x] **Bug: no overlap guard on `availability_windows`.** Found 2026-05-28 driving `/admin/availability` end-to-end: the add-window form and `adminAvailability.ts` validated `end > start` but *not* overlap, so a coach could stack `Mon 5–9 PM` + `Mon 6–8 PM` and the engine would expand both into duplicate/redundant slots. *Fixed 2026-05-28:* migration `202605290001_availability_windows_no_overlap.sql` adds a gist exclusion constraint `availability_windows_no_active_overlap` on `(coach_id, day_of_week, timezone)` over a `tsrange` built from the `time` columns, scoped to `where (active)` (half-open `[)`, so 19:00-end doesn't collide with 19:00-start). `adminAvailability.ts` POST + PATCH now run a `findOverlappingWindow` pre-check returning HTTP 409 with a readable message, and map the constraint's `23P01` to the same message as a race-safe backstop. PATCH overlap-checks *effective* values (partial patch / re-activating into a now-conflicting slot). Verified in-browser: overlapping insert rejected, non-overlapping same-day insert (Mon 9 AM–12 PM alongside Mon 5–9 PM) still allowed. **The constraint migration must be applied via the Supabase dashboard SQL editor — local `supabase db push` is blocked by the outbound-5432 issue. The server-side check is already live and does not depend on the migration; the DB constraint is the belt-and-suspenders layer for concurrent writes.**

> **Note (2026-05-28):** All admin endpoints operate against the *default coach* (earliest admin) so the single-coach model stays consistent with the booking engine. Multi-coach support will move `coach_id` from the resolver into the path. Migration must be applied via the Supabase dashboard SQL editor — local `supabase db push` is blocked by the outbound-5432 issue noted at top.

### 4.2 Admin: clients & session notes — *shipped 2026-05-28*
- [x] Client list with search + filter. *(`/admin/clients` — debounced search over athlete/guardian name via `.or(ilike)`, skill-level filter chips, session count per client. Backend `adminClients.ts` GET `/`.)*
- [x] Client profile: athlete details, waiver flag, history of bookings. *(`/admin/clients/:id` — inline edit (PATCH) of athlete fields; waiver/media-consent surfaced as booleans that map to `*_at` timestamps server-side; booking history newest-first with status pills. Backend GET `/:id` + PATCH `/:id`.)*
- [x] Session notes editor (`session_notes` table) with private vs client-visible split + homework field. *(Expandable per-booking editor on the profile page; upsert keyed on the `unique(booking_id)` constraint via PUT `/api/admin/bookings/:bookingId/notes` — `coach_id`/`client_id` derived from the booking, never trusted from the client; "Note" badge on booked rows that already have one. DELETE `/api/admin/bookings/:bookingId/notes` (idempotent) removes a note from the UI with a confirm; badge stays in sync via callback.)*

> **Note (2026-05-28):** All verified in-browser end-to-end (list/search, profile edit + waiver toggle, notes create + persist). No new migration — uses existing `clients` / `session_notes` tables. `/admin/resources` remains a placeholder until Phase 4.4.

### 4.3 Admin: bookings management — *shipped 2026-05-29*
- [x] Reschedule / cancel / mark-complete / no-show actions. *(`/admin/bookings` — range/status-filtered list with per-row actions. Backend POST `/api/admin/bookings/:id/{cancel,complete,no-show,reschedule}` in `admin.ts`; the `log_booking_status_change` trigger writes audit rows automatically. Cancel deletes the calendar event + clears `google_calendar_event_id`; reschedule overlap-checks via the gist constraint → 409 then `updateEvent`. Light transition guard blocks acting on already-cancelled bookings.)*
- [x] Manual booking creation form. *(POST `/api/admin/bookings` inserts straight to `confirmed` with optional client (walk-in) + auto `createEvent`; end derived from the training type's default duration. UI form on the same page.)*

> **Note (2026-05-29):** All actions verified in-browser end-to-end (create → reschedule → complete; second booking → cancel with reason prompt; status filters). Admins may book outside availability windows and without a client; the overlap constraint is the only hard guard. No new migration.

### 4.4 Resource library — *shipped 2026-05-29*
- [x] Admin upload screen → Supabase Storage (use the private bucket from the migration). *(`/admin/resources` — add-form with type-aware payload (file / URL / note text). Files go browser → Storage directly via a signed upload URL minted by `POST /api/admin/resources/upload-url` (objects namespaced `{coachId}/{ts}-{slug}` so large videos never stream through Express); the returned `storage_path` is attached on `POST /api/admin/resources`. Each row has inline edit (`PATCH` of title/description/category/skill/session-type/visibility, plus link URL or note body — the file/type can't be swapped in place) and delete (removes the row + best-effort removes the Storage object).)*
- [x] Categorization by `resource_categories`, skill level, training type. *(Category dropdown from the seeded `resource_categories`; skill-level enum; `session_type` dropdown sourced from `training_types.name` (matches the `is_booked_client` join). All optional.)*
- [x] Client view: signed URLs for private files, respect `visibility` enum. *(`GET /api/resources` + `/:id`. The API runs as service-role (RLS bypassed), so visibility is enforced in JS in `resources.service.ts` — mirrors `resources_client_read_visible`: `all_clients` → any signed-in client; `booked_clients` → must have a confirmed/completed booking, scoped to `session_type` when set; `admin_only` → hidden (404, not 403, so existence doesn't leak). Admins bypass the filter. Storage-backed rows get a 1-hour signed `file_url`; sign failures degrade to `file_url: null` rather than 500-ing.)*
- [x] Resource detail page (video player / PDF embed / link card). *(`/resources` grouped-by-category list → `/resources/:id` renders `<video>` / `<img>` / PDF `<iframe>` + open-in-tab / external link card / pre-wrapped text note. "Resources" CTA added to the client dashboard header.)*

**Exit criteria:** Coach can run a full session day-of (see, take notes, mark done, share a video) without touching the database. ✅

> **Note (2026-05-29):** Verified in-browser end-to-end as `jolman009@yahoo.com` (admin): created a text note → appeared in the admin library and the grouped client list → detail page rendered the note; uploaded a PNG via the signed-upload path → Storage object stored under the coach prefix with a working signed "Open" URL; created a link → inline-edited its title/skill/visibility and confirmed the change persisted; deleted all test rows (+ objects) to leave the dev DB clean. Zero console errors throughout. No new migration — uses the `resources` / `resource_categories` tables and the private `training-resources` bucket from the initial schema.

---

## Phase 4.5 — Client Video Review

**Target window:** 2026-09-15 → 2026-09-28 (≈ 2 weeks)
**Goal:** Athletes can upload swing/pitching videos and the coach can watch them and leave a summary. This is the *inverse* of Phase 4's resource library (coach → client); here the direction is client → coach.

*Why this phase exists between 4 and 5: it leans on Phase 4.4's signed-URL plumbing and Phase 4.2's admin client-profile screens. It was originally bucketed under Phase 7 — pulled forward at the user's request on 2026-05-25.*

> **Status (2026-05-29):** Shipped & verified in-browser end-to-end. Migration `202605290002_client_uploads.sql` was applied via the Supabase dashboard SQL editor (`supabase db push` is blocked by the outbound-5432 issue and the in-session Supabase MCP can't reach this project's org). Verified flow: client uploaded an MP4 from the dashboard → it appeared in the coach's `/admin/uploads` queue (and bumped the dashboard pending badge to 1) → coach saved a summary + set status `reviewed` → client saw the summary on `/uploads/:id`. Zero console errors. **Note:** the lesson-attach dropdown surfaces bookings by `created_by`, but the API's ownership guard checks `booking.client_id`; a walk-in/manual booking with a null `client_id` is correctly rejected — a real client's own bookings carry their `client_id` and attach fine.

### 4.5.1 Schema + storage
- [x] New migration: `client_uploads` table — `id`, `client_id`, `booking_id` (nullable, links upload to a specific lesson), `storage_path`, `title`, `description` (nullable), `mime_type`, `bytes`, `status` enum (`pending_review`, `reviewed`, `archived`), `coach_summary` (nullable, client-visible), `reviewed_at` (nullable), `created_by`, timestamps. *(Migration `202605290002_client_uploads.sql`; adds an `updated_at` trigger + indexes on `(client_id, created_at)`, `(status, created_at)`, `booking_id`.)*
- [x] New private Storage bucket `client-uploads`. *(Created with `file_size_limit` 200 MB + `allowed_mime_types` `video/mp4`, `video/quicktime` so Storage enforces the same limits the API does.)*
- [x] RLS on `client_uploads`: clients can `insert`/`select` rows owned by their `clients.id`; admins can do everything; nothing public.
- [x] Storage object policies: clients can read/write only under their own `{user_id}/...` prefix (`(storage.foldername(name))[1] = auth.uid()`); admins can read anything in the bucket.

### 4.5.2 Backend
- [x] `POST /api/me/uploads` (auth: client) — validates MIME + size, mints a signed upload URL, inserts a `client_uploads` row in `pending_review`. *(Validates the booking, if attached, belongs to the caller. Namespaces the object under `{user_id}/`. `me.ts`.)*
- [x] `GET /api/me/uploads` (+ `GET /api/me/uploads/:id`) — own uploads with signed playback URLs (2 h TTL, degrade to null on failure).
- [x] `GET /api/admin/uploads?status=&clientId=` — review queue, status + per-client filter (`adminUploads.ts`).
- [x] `GET /api/admin/uploads/:id` — single upload with signed playback URL.
- [x] `PATCH /api/admin/uploads/:id` — set `status` + `coach_summary`; stamps `reviewed_at` on → `reviewed`, clears it on → `pending_review`. (+ `DELETE` removes row + Storage object.)
- *(Refactor: extracted `ensureClientForUser` from `bookings.ts` into `clients.service.ts`; signed-URL plumbing in `uploads.service.ts` mirrors `resources.service.ts`.)*

### 4.5.3 Client UI
- [x] Upload widget on `ClientDashboardPage` (`ClientUploadsSection`): file picker, indeterminate upload bar, MIME allowlist (`video/mp4`, `video/quicktime`), ~200 MB client-side guard.
- [x] "My uploads" list with status badges (Pending review / Reviewed / Archived).
- [x] Upload detail page `/uploads/:id`: inline `<video>` player + coach summary (empty-state until reviewed).
- [x] Dropdown to attach an upload to a recent booking (from the dashboard's own bookings).

### 4.5.4 Admin UI
- [x] Pending-review count badge on `AdminDashboardPage` (new "Video review" quick-action card).
- [x] Review queue at `/admin/uploads`: list with athlete name, lesson context, upload date, status filter (+ `?clientId=` scoping).
- [x] Review page at `/admin/uploads/:id`: video player + summary textarea + status dropdown + save (+ delete).
- [x] From an athlete's profile (Phase 4.2), "Uploads" link → `/admin/uploads?clientId=…`.

**Exit criteria:** A client uploads a video from the dashboard, it lands in the coach's review queue, the coach saves a summary, the client sees that summary on their own upload page. ✅ *(Verified in-browser 2026-05-29.)*

---

## Phase 5 — Production Hardening

**Target window:** 2026-09-29 → 2026-10-26 (≈ 4 weeks)
**Goal:** It's safe to put paying clients on the platform.

- [x] Transactional email via Resend: booking confirmation, reschedule, cancel. *(2026-05-30 — `services/email.service.ts` wraps Resend; env-gated on `RESEND_API_KEY` (no-op + log when unset, never throws into a request so an email outage can't roll back a booking). Confirmation sent on `POST /bookings/:id/confirm` + admin manual create; reschedule + cancellation on the admin actions and the client self-cancel (skipped for holds). Recipient resolves to the linked client's account email, falling back to the booking creator; session time rendered in the coach's availability-window timezone (`DISPLAY_TIMEZONE` fallback). `EMAIL_FROM` defaults to the `onboarding@resend.dev` test sender. Verified 2026-05-30: live Resend delivery succeeded through the real service path (DB recipient lookup → template → send) to the account-owner address. **Password reset is intentionally NOT here** — those emails are issued by Supabase Auth; route them through Resend by pointing Supabase's custom SMTP at Resend in the dashboard (Auth → Email), a config step, not app code. **Before soft-launch the test sender must be replaced with a verified domain** — `onboarding@resend.dev` only delivers to the Resend account owner.)*
- [x] Rate limiting on `/api/auth/*` and `/api/bookings`. *(2026-05-29 — `express-rate-limit` v8; `middleware/rateLimit.ts`: auth limiter 20/15 min, bookings limiter 30/15 min, keyed on `req.ip`, JSON 429 `{ error }` + `draft-7` `RateLimit` headers. New `TRUST_PROXY` env (default 0; set to 1 in prod behind a proxy) drives Express `trust proxy` so keying uses the real client IP. Verified: auth 429s on the 21st request; `/api/bookings` carries `RateLimit-Policy: 30;w=900`. Note: login/signup run against Supabase Auth directly, not this API, so the high-value guard is `/api/bookings` hold creation.)*
- [x] Sentry on web + api. *(2026-05-30 — env-gated on a DSN, no-op when absent. API: `lib/sentry.ts` `initSentry()` called first in `index.ts`; `errorHandler` reports genuine 500s (not Zod 400s) via `captureException`. Web: `lib/sentry.ts` `initSentry()` in `main.tsx` using `@sentry/react`, conservative sample rates. Keys are dropped into `.env` when ready — no code change. Documented in both `.env.example` files.)*
- [x] PostHog booking-funnel events. *(2026-05-30 — env-gated on `VITE_POSTHOG_KEY`, no-op when absent. `lib/analytics.ts` centralizes the funnel event names + `track`/`identify`/`reset` wrappers; `posthog.init` in `main.tsx`. Events: `booking_started` (page mount), `booking_type_selected`, `booking_slot_selected`, `booking_confirm_opened`, `booking_confirmed` (email + google paths), `booking_failed` (with stage), `booking_cancelled` (client dashboard). `identify`/`reset` tied to Supabase auth state in `lib/auth.tsx` so the funnel links to a user. Autocapture off; localStorage persistence.)*
- [x] Audit-log review screen for admin (`booking_audit_logs`). *(2026-05-29 — `GET /api/admin/audit-logs?action=&limit=&offset=` joins actor profile + booking context; new `/admin/audit` page: action filter chips, newest-first list with action badge, `prev → new` status transition, athlete link (or "walk-in"), actor name, "Load more" paging. Dashboard "Audit log" quick action added. Note: status changes made through the admin API run as service-role (no `auth.uid()`), so those rows have a null actor and render as "System"; only `created` rows carry an actor (`created_by`). Verified in-browser against real history + the Created filter.)*
- [x] Accessibility pass: keyboard nav, focus rings, ARIA on the booking modal, color-contrast check. *(2026-05-29 — `useFocusTrap` hook drives the booking confirm modal: focus moves in on open, Tab/Shift+Tab cycle within it, Escape + backdrop-click close, focus restored to the trigger on close (verified in-browser). Skip-to-content link (first tab stop → `#main-content`) + focus-ring on nav/brand links in `AppLayout`. Contrast: the brand's white-on-color combos all pass AA (ink ~17:1, field ~6:1, clay ~4.9:1); the failing pieces were muted body text — bumped `text-ink/45` & `text-ink/55` → `text-ink/65` (≥5:1 on chalk + white) and the `(optional)` hint spans `text-ink/40` → `/65` across 16 files. There is no literal "navy/yellow" in the palette — that was stale plan language; the real tokens are ink/field/clay/chalk. Decorative icons left at `/40`.)*
- [ ] Backup verification: confirm Supabase point-in-time recovery is enabled on the production project.
- [x] Cancellation policy enforcement (e.g., no client-side cancel within 12 h). *(2026-05-29 — added client self-cancel `POST /api/me/bookings/:id/cancel`: ownership check (booker or linked client), cancellable-status guard, **12 h cutoff** (`CANCELLATION_CUTOFF_HOURS`, mirrored client-side), + best-effort calendar event delete. Dashboard upcoming cards show a "Cancel session" button >12 h out, or "Within 12h — contact your coach" inside the window. Admins keep their no-limit cancel in `admin.ts`. Verified in-browser both ways.)*
- [x] Waiver acceptance flow before first paid booking. *(2026-05-29 — `POST /api/me/waiver` stamps `clients.waiver_signed_at` (idempotent; no-op for admins so the public flow never breaks). Required "I accept the liability waiver" checkbox in the booking confirm modal gates both the email and Google confirm buttons; the client calls `acceptWaiver()` before booking on both paths. `POST /api/bookings/:id/confirm` enforces it server-side for client role (409 if unsigned; admins exempt). Verified in-browser: checkbox disabled→enabled gating.)*

**Exit criteria:** Soft-launch to a small group of real clients.

---

## Phase 5.5 — Deployment & Go-Live

**Target window:** 2026-10-20 → 2026-10-26 (caps the Phase 5 window — soft-launch can't happen until the app is actually deployed).
**Goal:** The app runs on real infrastructure at a public URL — web on Vercel, the Express API on a persistent host — with production env wiring and prod-correct OAuth, so Phase 5's "soft-launch to real clients" is physically possible.

> **Why this is its own phase:** Phase 5 hardens the *code*; nothing in it stands up an environment. Vercel was only ever named in `PROJECT_PLAN.md` §15 and in two unphased cross-cutting to-dos. This phase folds those in and owns the actual deploy. `PRE_LAUNCH_CHECKLIST.md` is the operational companion — this phase makes its items executable against live URLs.

### 5.5.1 Web on Vercel — *target 2026-10-21*
- [x] Create a Vercel project from the repo. Root directory `apps/web`, framework preset **Vite**, build `npm run build`, output `dist`. *(Dashboard step.)* **✅ RESOLVED 2026-07-09. History: the `softball-app` Vercel project had been misconfigured with Root Directory `apps/api` / Framework `express`, so every push built the backend (`@softball/api` → `tsc`) and all 15 deployments errored on `src/app.ts(31,11) TS2349: helmet has no call signatures` — NOT a code bug (API builds clean locally + CI green; it only surfaced because Vercel did a fresh isolated install of the wrong workspace). Fixed via dashboard: Root Directory → `apps/web`, Framework → `Vite`. First `READY` production deploy is commit `df59861` (`dpl_CgJW…`). The repo's `apps/web/vercel.json` was already correct — it just wasn't being read.**
- [x] Add `apps/web/vercel.json` with an SPA rewrite (all routes → `/index.html`) so React Router deep links don't 404 on refresh. *(2026-06-05 — `apps/web/vercel.json`: `framework: vite`, `buildCommand: npm run build`, `outputDirectory: dist`, catch-all rewrite to `/index.html`. Vercel serves real static assets first, then falls through to the rewrite for client routes.)*
- [x] Set web env vars in Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` (→ the prod API origin), `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`. *(Dashboard step.)* **✅ DONE — verified live 2026-07-11:** the Supabase/PostHog vars were set, redeployed, and `https://softball-app-one.vercel.app` now renders the landing page with **zero console errors** (previously threw `Missing required Vite environment variable: supabaseUrl`). Builds auto-deploy from `main`. **Note:** `VITE_API_BASE_URL` still needs the Render API URL (§5.5.2, `…/api` suffix) before booking/data calls work end-to-end — until then the deployed web app talks to `localhost:4000` and API-backed pages will fail.
- [ ] Attach the custom business domain + verify HTTPS. *(Dashboard step.)*

### 5.5.2 API on a persistent host (Render — chosen 2026-06-05) — *target 2026-10-23*
- The API is a long-lived Express server (in-memory FreeBusy cache + rate-limit state); Vercel's serverless model doesn't fit. Deployed to **Render** (chosen over Fly/Railway).
- [x] Blueprint committed: root `render.yaml` — `runtime: node`, `plan: starter` (warm), `buildCommand: npm ci && npm run build -w @softball/api`, `startCommand: node apps/api/dist/index.js`, `healthCheckPath: /api/health`, `autoDeploy` on `main`. Verified locally: the build emits `apps/api/dist/index.js`. *(Creating the Render service from the blueprint is a dashboard step — runbook below.)*
- [x] **Render-proxy fix:** the API now binds the host-injected `PORT` (falls back to `API_PORT` locally) — `config/env.ts` + `index.ts`. Without this, Render's health check can't reach the server and the deploy never goes live.
- [x] Set all API env vars (the `sync: false` keys in `render.yaml`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI`, `RESEND_API_KEY`, `EMAIL_FROM`, `SENTRY_DSN`. *(Dashboard step.)* **✅ DONE — Render API LIVE 2026-07-12 at `https://softball-api.onrender.com`.** The service booted (so the strict boot-time Zod env validation passed → all required vars are set correctly) and `GET /api/health` returns `{"ok":true,...}`. CORS verified: a request with `Origin: https://softball-app-one.vercel.app` gets `access-control-allow-origin` echoed back, so `WEB_ORIGIN` is correct. **Build fix that unblocked this:** `render.yaml` build command is `npm ci --include=dev && npm run build -w @softball/api` (commit `cb2a5fd`) — `NODE_ENV=production` was making `npm ci` skip the devDependencies `tsc` needs.
- [x] `TRUST_PROXY=1` + `WEB_ORIGIN` are wired in `render.yaml` (`TRUST_PROXY` hardcoded to `1`; `WEB_ORIGIN` is a `sync: false` prompt to set to the Vercel prod domain).

### 5.5.3 Production env, OAuth & secrets — *target 2026-10-24*
- [x] **Pin the env decision:** reuse the existing Supabase project as prod, or split staging/prod (separate Supabase project + a staging Vercel/API). Record it here. *(2026-07-12 — DECISION: reuse the existing project `bjznmwwdkxbjfxjwuouj` as prod. No staging split for the solo soft-launch.)*
- [ ] Google Cloud Console: add the prod callback `https://<api-domain>/api/calendar/google/callback` to the OAuth client; set `GOOGLE_OAUTH_REDIRECT_URI` to match.
- [x] Supabase Auth → URL Configuration: add the Vercel prod origin to allowed redirect URLs (Google sign-in + password-reset links resolve there). *(2026-07-12 — Site URL set to `https://softball-app-one.vercel.app`; Redirect URLs allowlist now includes `https://softball-app-one.vercel.app/**` and `http://localhost:5173/**`. Root cause of the earlier bug: the app passes a correct `redirectTo` (`window.location.origin + /dashboard`) but Supabase only honors it if it's on the allowlist — otherwise it fell back to the default Site URL `http://localhost:3000`, which is where Google sign-in was dead-ending. Verified: Google SSO from the live Vercel site now returns to the app.)*
- [x] Verify `SUPABASE_SERVICE_ROLE_KEY` and `ENCRYPTION_KEY` live **only** on the API host, never in the web bundle. `ENCRYPTION_KEY` must equal the value that encrypted existing `calendar_connections` rows (rotating it orphans stored Google tokens). *(2026-07-11 — audited `apps/web/src`: only 8 safe `VITE_` vars are read via `lib/env.ts`; no web code references the service-role/encryption/OAuth-secret/Resend keys, so none are bundled. Found six unused `VITE_`-prefixed entries in `apps/web/.env` — including `VITE_SUPABASE_SERVICE_ROLE_KEY`, `VITE_ENCRYPTION_KEY`, `VITE_GOOGLE_OAUTH_CLIENT_SECRET`, `VITE_RESEND_API_KEY` — and stripped them so a bulk copy of that file into Vercel can't leak secrets to the browser. The real secrets remain in `apps/api/.env` for the Render host only. **Still to do on the dashboards:** set the service-role/encryption keys ONLY on Render, never in Vercel.)*
- [ ] Swap Resend to a verified domain + real `EMAIL_FROM` (carried over from Phase 5).

### 5.5.4 CI/CD — *target 2026-10-25* (folds in the cross-cutting Vercel to-dos)
- [x] GitHub Actions: `lint + typecheck` on PRs (no test suite yet — don't add `npm test`). *(2026-06-05 — `.github/workflows/ci.yml`: `npm ci` + `npm run typecheck` across both workspaces on PRs and pushes to `main`. `lint` and `typecheck` are both tsc, so typecheck is the full static gate.)*
- [ ] Vercel preview deployment per PR for the web app; production deploy on merge to `main`. *(Automatic once the Vercel project is connected to the GitHub repo — no code needed.)*
- [ ] Confirm the existing `deploy-supabase.yml` targets the prod project (or is intentionally manual, given the outbound-5432 block on this dev machine). *(Dashboard/secrets check.)*

### 5.5.5 Go-live smoke test — *target 2026-10-26*
- [ ] Run `PRE_LAUNCH_CHECKLIST.md` §6 against the **deployed** URLs: signup → book → confirmation email → calendar event; cancel >12 h (allowed) and <12 h (blocked); two-browser slot race; `/api/bookings` 429 after the rate limit.
- [ ] Trigger a deliberate prod error and confirm it lands in Sentry; confirm the PostHog funnel shows prod events.

**Exit criteria:** The app is reachable at the production domain, a real client can book end-to-end through it, and the coach sees the booking on the dashboard + their Google Calendar.

---

## Phase 6 — Mobile (Capacitor)

**Target window:** 2026-10-27 → 2026-11-30 (≈ 5 weeks)
**Goal:** TestFlight + Play internal testing builds.

- [ ] Add Capacitor to `apps/web`.
- [ ] iOS + Android projects committed.
- [ ] App icon + splash assets.
- [ ] OAuth redirects work via deep links (verify Google sign-in on device).
- [ ] Secure session storage on device.
- [ ] Manual test pass on iOS and Android: book a session, view dashboard, open a resource video.
- [ ] TestFlight build uploaded.
- [ ] Play Console internal track build uploaded.

**Exit criteria:** Coach can install both apps from the relevant test track and book through them.

---

## Phase 7 — Payments & Growth (post-MVP)

**Target window:** 2026-12-01 onward
**Goal:** Money in, retention up.

- [ ] Stripe integration: deposit at booking, full payment at booking, or pay-in-person toggle.
- [ ] Packages: 4-pack, 8-pack, monthly.
- [ ] SMS reminders via Twilio.
- [ ] Client self-service reschedule within policy.
- [ ] Referral codes.
- [ ] Membership tier table + access rules for resources.
- [ ] AI-assisted swing-analysis notes layered on top of Phase 4.5 uploads.
- [ ] **Video transcoding pipeline** — normalize client uploads to browser-friendly **H.264 + faststart**. Client clips are frequently **HEVC/H.265** (iPhone "High Efficiency"), which Chrome/Firefox can't decode → black frame on the review page (diagnosed 2026-07-12 via `ffprobe` on a real upload: `hevc`, Main 10, 10-bit). *Mitigations already shipped 2026-07-12:* client-side HEVC sniff + "record in H.264 / Most Compatible" guidance in the upload widget (`ClientUploadsSection.tsx`), and an "Open in new tab" fallback on the review/detail players (helps non-faststart H.264, not HEVC). *Prototype landed 2026-07-12:* `apps/api/src/services/transcode.service.ts` (ffmpeg via `ffmpeg-static`) + admin trigger `POST /api/admin/uploads/:id/transcode`, **env-gated behind `ENABLE_TRANSCODE`** and run manually. **Productionizing** = run it automatically after upload off the request path (a Render background worker or a Supabase Storage webhook + queue), handle the 200 MB / long-running cases, and probe-then-skip clips already in H.264.

---

## Cross-cutting To-Do (no fixed phase)

- [ ] Answer the open questions in `PROJECT_PLAN.md` §2 (cancellation policy, session durations, etc.) and pin the answers in a `BUSINESS_RULES.md`.
- [ ] Pick the official business name + domain.
- [→] Decide on staging environment (separate Supabase project + Vercel preview deployment). *(Moved into Phase 5.5.3 / 5.5.4.)*
- [→] Set up GitHub Actions: `deploy-supabase.yml` exists; add `lint+typecheck` and a Vercel preview workflow. *(Moved into Phase 5.5.4.)*
- [x] Tighten the `profiles_update_self_or_admin` RLS policy so clients cannot promote themselves to admin via a self-update. *(Migration `202605260001_profiles_role_lockdown.sql`, 2026-05-25.)*
- [ ] Register `expire_stale_holds()` with pg_cron (e.g., every 5 min) as belt-and-suspenders alongside the API's lazy sweep.

---

## How to keep this file useful

- Tick boxes as work lands. A box without a commit reference is just a wish.
- If a phase slips two weeks, push the next phase's window in this file rather than rewriting history.
- When a phase hits its exit criteria, move its checklist into a `# Completed` section at the bottom instead of deleting — that becomes the project's working changelog.

# Completed

*(Move finished phase sections here, in reverse-chronological order, once their exit criteria are met.)*

## Phase 2 — Finish the Web MVP — *shipped 2026-05-25*

**Target window:** 2026-05-26 → 2026-07-06 (≈ 6 weeks) — finished ahead of window.
**Goal:** A real booking goes end-to-end: client picks a slot, confirms, lands in their dashboard, and the coach sees it on the admin dashboard. No mock data on the booking path.

**Exit criteria — all met:**
- Client can sign up, book, see their booking on the dashboard. ✅
- Admin can sign in and see today's bookings. ✅
- No mock data on the critical path. ✅
- Race condition between two clients is prevented at the DB layer. ✅ (`gist` exclusion constraint extended to cover `hold`/`pending`/`confirmed`, lazy `expire_stale_holds()` sweep.)

### 2.1 Wire the booking flow to real data — *target 2026-06-08*

- [x] Add a typed API client in `apps/web/src/lib/api.ts` (uses the user's bearer token).
- [x] Replace `trainingTypes` constant in `BookingPage.tsx:18` with data from `GET /api/training-types`.
- [x] Replace `mockSlots` in `BookingPage.tsx:29` with data from `GET /api/availability?from=&to=&trainingTypeId=`.
- [x] On modal "Continue", call `POST /api/bookings` with the selected slot + training type after sign-in/sign-up succeeds.
- [x] Show real error states from the API (overlap, validation, auth).
- [x] Send the user to `/dashboard` only after the booking row is created.

**Done when:** `mockSlots` no longer exists in the repo and a booking row appears in `bookings` after the modal flow.

> **Note (2026-05-25):** Plumbing landed. End-to-end testing now requires real data in `availability_windows` — seed at least one row for the default coach (the earliest-created admin profile) and slots will start appearing on the booking page.

### 2.2 Availability engine v1 (DB-only) — *target 2026-06-15*

This is the smallest engine that lets v2.1 work. Google Calendar comes in Phase 3.

- [x] In `apps/api/src/services/availability.service.ts`, expand `availability_windows` over the requested date range in the window's timezone.
- [x] Subtract overlapping `bookings` (status in `hold`, `pending`, `confirmed`).
- [x] Subtract `availability_exceptions` of type `blocked`; union in `special_opening`.
- [x] Apply: session duration (from `training_types.default_duration_minutes`), buffer (default 15 min), minimum notice (default 12 h), max booking window (default 60 days).
- [x] Return discrete bookable slots `{ starts_at, ends_at }`.
- [x] Update `availability.ts:13` to return `slots`.

**Done when:** `GET /api/availability` returns a real slot list and the booking page renders it.

> **Note (2026-05-25):** Engine landed and verified against five scenarios (window expansion, buffer-around-booking, full-block, special opening, 30-min duration). To see slots in the UI you still need at least one row in `availability_windows` for the default coach.

### 2.3 Hold → confirm transition — *target 2026-06-22*

The gist exclusion constraint only covered `status = 'confirmed'` originally (`202605060001_initial_schema.sql:170`). Phase 2.3 extended it so holds and pendings also collide at the DB layer.

- [x] On `POST /api/bookings`, insert with `status = 'hold'` and a `hold_expires_at` (5–10 min from now). Added column in a new migration.
- [x] Add `POST /api/bookings/:id/confirm`: revalidate slot against current bookings, flip `status` to `confirmed`. Let the gist constraint reject conflicts.
- [x] Background sweep (cron or on-read) that flips expired holds to `cancelled`.
- [x] Extend the gist constraint to also cover `hold` and `pending` (new migration).

**Done when:** Two clients racing the same slot get one success + one constraint error.

> **Note (2026-05-25):** Migration `202605250001_booking_holds.sql` ships the schema change. The API uses **lazy sweep** (calls `expire_stale_holds()` before each booking attempt) so the feature works without pg_cron. A pg_cron registration is still a nice-to-have so very long-idle holds don't linger — tracked in cross-cutting to-do.

### 2.4 Client dashboard with real data — *target 2026-06-29*

- [x] `GET /api/me/bookings` returns the signed-in client's bookings, grouped upcoming / past.
- [x] Render upcoming sessions list in `ClientDashboardPage.tsx` with date, time, training type, status.
- [x] Render past sessions list (last 10).
- [x] Add a "Book another session" CTA back to `/booking`.
- [x] Show the email-verification banner only when actually unverified (already wired).

**Done when:** Booking a session puts a card on the dashboard, and the empty state shows the right message for new clients.

> **Note (2026-05-25):** `/api/me/bookings` runs `expire_stale_holds()` before the query so a stale hold doesn't render as live on the dashboard. Status pills cover all seven `BookingStatus` values; holds show their expiry time inline so the user knows they need to finish booking promptly.

### 2.5 Admin dashboard with real data — *target 2026-07-06*

- [x] `GET /api/admin/bookings?from=&to=` returns all bookings in range with client name + training type joined.
- [x] Render today / this week / this month groupings on `AdminDashboardPage.tsx`.
- [x] Quick actions stub: link buttons to placeholder routes for `/admin/availability`, `/admin/clients`, `/admin/resources` (full screens come in Phase 4).
- [x] Show booking counts and revenue estimate (sum of `bookings.price` where status in `confirmed`, `completed`).

**Done when:** Coach signs in and sees today's real schedule.

> **Note (2026-05-25):** Dashboard fetches `start-of-month → +60 days` so revenue includes already-completed sessions this month. Counts use a broader "on-schedule" set (hold/pending/confirmed/completed/rescheduled); revenue is strictly `confirmed + completed`. Phase 4 routes have placeholder pages so the quick-action links don't 404.

### 2.6 MVP polish — *target 2026-07-06*

- [x] Google sign-in (Supabase OAuth provider). Update `LoginPage.tsx` and `BookingPage.tsx` auth modal. *(`signInWithGoogle` on the auth context; Google button + divider on both surfaces; BookingPage persists the pending slot to sessionStorage before the OAuth redirect and auto-completes the booking on `/booking?resume=1` return — ref-guarded against StrictMode double-fire. User confirmed working end-to-end 2026-05-25.)*
- [x] 404 + reset-password page audit on copy/styling. *(404 now mirrors the LoginPage two-column layout with three usable destinations; reset-password redirects to role home, shows inline mismatch warning, and gates submit while passwords disagree.)*
- [x] Mobile-responsive pass on landing, booking, dashboards (375 px width). *(AppLayout header sign-in now visible on mobile; booking auth modal scrolls on short screens; admin & client dashboard rows truncate cleanly.)*
- [x] Add `.env.example` entries for any new variables and refresh `README.md`. *(No new vars since the initial commit; per-app examples now document required-vs-default; root `.env.example` repurposed as docs-only; README drops the misleading root-env copy step and lists everything Phase 2 actually ships.)*
