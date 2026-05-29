# Implementation Plan — Current State & Checklist

> Companion to [PROJECT_PLAN.md](./PROJECT_PLAN.md). That file is the long-range product vision and architecture. This file is the live, actionable checklist with a working timeline.
>
> **Last updated:** 2026-05-29 (Phase 4.4 landed — resource library: admin upload/create/delete at `/admin/resources` (files go browser → Storage via signed upload URL), client browse/detail at `/resources` with visibility-enforced signed URLs. Verified in-browser end-to-end.)
> **Current phase:** Phase 4.4 — Resource library ✅ shipped; next up Phase 4.5 (client video review).
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
| Client video uploads & review (client → coach) | 🔴 Not started | Phase 4.5 |
| Email confirmations | 🔴 Not started | |
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

### 4.5.1 Schema + storage
- [ ] New migration: `client_uploads` table — `id`, `client_id`, `booking_id` (nullable, links upload to a specific lesson), `storage_path`, `title`, `description` (nullable), `mime_type`, `bytes`, `status` enum (`pending_review`, `reviewed`, `archived`), `coach_summary` (nullable, client-visible), `reviewed_at` (nullable), timestamps.
- [ ] New private Storage bucket `client-uploads`.
- [ ] RLS on `client_uploads`: clients can `insert`/`select` rows owned by their `clients.id`; admins can do everything; nothing public.
- [ ] Storage object policies: clients can read/write only under their own `{user_id}/...` prefix; admins can read anything in the bucket.

### 4.5.2 Backend
- [ ] `POST /api/me/uploads` (auth: client) — validates MIME + size, returns a signed upload URL, inserts a `client_uploads` row in `pending_review`.
- [ ] `GET /api/me/uploads` — list own uploads with signed playback URLs.
- [ ] `GET /api/admin/uploads?status=pending_review` — review queue for the coach.
- [ ] `GET /api/admin/uploads/:id` — single upload with signed playback URL.
- [ ] `PATCH /api/admin/uploads/:id` — set `status`, `coach_summary`, stamp `reviewed_at`.

### 4.5.3 Client UI
- [ ] Upload widget on `ClientDashboardPage`: drag-drop, progress bar, MIME allowlist (`video/mp4`, `video/quicktime`), file-size guard (~200 MB).
- [ ] "My uploads" list with status badges (Pending review / Reviewed / Archived).
- [ ] Upload detail page: inline `<video>` player + coach summary (when reviewed).
- [ ] Optional: dropdown to attach an upload to a recent booking.

### 4.5.4 Admin UI
- [ ] Pending-review count badge on `AdminDashboardPage`.
- [ ] Review queue at `/admin/uploads`: list with athlete name, lesson context (if attached), upload date, status filter.
- [ ] Review page at `/admin/uploads/:id`: video player + summary textarea + status dropdown + save.
- [ ] From an athlete's profile (Phase 4.2), link to that athlete's upload history.

**Exit criteria:** A client uploads a video from the dashboard, it lands in the coach's review queue, the coach saves a summary, the client sees that summary on their own upload page.

---

## Phase 5 — Production Hardening

**Target window:** 2026-09-29 → 2026-10-26 (≈ 4 weeks)
**Goal:** It's safe to put paying clients on the platform.

- [ ] Transactional email via Resend or SendGrid: booking confirmation, reschedule, cancel, password reset.
- [ ] Rate limiting on `/api/auth/*` and `/api/bookings`.
- [ ] Sentry on web + api.
- [ ] PostHog booking-funnel events.
- [ ] Audit-log review screen for admin (`booking_audit_logs`).
- [ ] Accessibility pass: keyboard nav, focus rings, ARIA on the booking modal, color-contrast check on the navy/yellow combo.
- [ ] Backup verification: confirm Supabase point-in-time recovery is enabled on the production project.
- [ ] Cancellation policy enforcement (e.g., no client-side cancel within 12 h).
- [ ] Waiver acceptance flow before first paid booking.

**Exit criteria:** Soft-launch to a small group of real clients.

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

---

## Cross-cutting To-Do (no fixed phase)

- [ ] Answer the open questions in `PROJECT_PLAN.md` §2 (cancellation policy, session durations, etc.) and pin the answers in a `BUSINESS_RULES.md`.
- [ ] Pick the official business name + domain.
- [ ] Decide on staging environment (separate Supabase project + Vercel preview deployment).
- [ ] Set up GitHub Actions: `deploy-supabase.yml` exists; add `lint+typecheck+test` and a Vercel preview workflow.
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
