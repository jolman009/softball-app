# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repo root unless noted. npm workspaces handle per-app dispatch.

| Task | Command |
| --- | --- |
| Install everything | `npm install` |
| Run web + api together | `npm run dev` |
| Run only the web app | `npm run dev:web` (Vite, `http://localhost:5173`) |
| Run only the API | `npm run dev:api` (tsx watch, `http://localhost:4000`) |
| Typecheck both apps | `npm run typecheck` |
| Lint (also typecheck — there is no eslint) | `npm run lint` |
| Build both apps | `npm run build` |
| Apply DB migrations | `supabase db push` (from repo root; requires Supabase CLI logged in) |

`lint` and `typecheck` both shell out to `tsc` — no ESLint is configured. There is no test suite yet; do not invent `npm test`.

Per-app `.env` files live at `apps/web/.env` and `apps/api/.env`. The root `.env.example` is documentation only — nothing reads from a root `.env`.

## Architecture

### Monorepo layout

```
apps/
  web/   React 18 + Vite + TypeScript + Tailwind. Talks to Supabase directly (anon key) for auth and to the API for everything else.
  api/   Express + TypeScript. Uses the Supabase service-role key — bypasses RLS, so it MUST stay server-side.
supabase/
  migrations/   Hand-written SQL. Apply via `supabase db push`.
  config.toml
```

### The booking architecture is the load-bearing piece

The application database is the source of truth for bookings. Google Calendar is a *secondary* availability source (FreeBusy) and a *write target* (event mirror), never the source of truth. Two safeguards make this work:

1. **Race protection at the DB layer.** `bookings` has a gist exclusion constraint covering `status in ('hold','pending','confirmed')`, so two clients racing the same slot will produce one success and one constraint error — the API does not need to do its own locking. See `supabase/migrations/202605060001_initial_schema.sql` + `202605250001_booking_holds.sql`.
2. **Hold → confirm.** `POST /api/bookings` inserts with `status = 'hold'` and `hold_expires_at`. `POST /api/bookings/:id/confirm` flips to `confirmed`. A SQL function `expire_stale_holds()` runs lazily before each booking attempt and before `/api/me/bookings` reads (no pg_cron required).

### Availability engine

`apps/api/src/services/availability.service.ts` is the heart of the system. The pipeline:

1. Expand `availability_windows` over the requested range, honoring each window's timezone.
2. Union `special_opening` exceptions; subtract `blocked` exceptions.
3. Subtract existing bookings (status `hold|pending|confirmed`) padded by `BUFFER_MINUTES` on each side. Subtract Google Calendar FreeBusy intervals (no buffer — the calendar is treated as literal "do not book").
4. Apply `MIN_NOTICE_HOURS` and `MAX_BOOKING_DAYS` guards.
5. Slice surviving intervals into discrete slots of the training type's duration.

Buffer / min-notice / max-window are constants in this file today; Phase 4 will move them to a `coach_settings` table.

### Auth boundary

- The web app authenticates with Supabase Auth (email/password + Google OAuth via Supabase). It gets back an access token and sends it as `Authorization: Bearer …` to the API.
- The API's `authenticate` middleware (`apps/api/src/middleware/auth.ts`) validates the token with `supabaseAdmin.auth.getUser(token)` and joins to `profiles.role` for role gating. `requireRole(['admin'])` wraps admin endpoints.
- Profile role gating relies on a hardened RLS policy (`profiles_update_self_or_admin`) — clients cannot promote themselves to admin via self-update. See `supabase/migrations/202605260001_profiles_role_lockdown.sql`.

### Google Calendar integration (Phase 3)

Two services under `apps/api/src/services/`:

- `googleOAuth.service.ts` — `buildAuthUrl(coachId)` with HMAC-signed state nonce (10-min TTL); `exchangeCode(code)`; `fetchPrimaryCalendarName(token)`. The OAuth client is reused from the Supabase Google sign-in.
- `googleCalendar.service.ts` — `getFreeBusy(coachId, from, to)` with a 30s in-memory cache and `refreshAccessToken(connection)`. Both are failure-tolerant: any error path returns `[]` / `null` and logs a warning, so a Google outage degrades availability to DB-only rather than 500-ing.

Refresh tokens are AES-256-GCM encrypted at rest via `apps/api/src/lib/crypto.ts`, which also signs OAuth state nonces. The same `ENCRYPTION_KEY` env var drives both — rotating it requires re-encrypting `calendar_connections.refresh_token_encrypted` rows manually.

Phase 3.1 (OAuth + admin connection card) ✅ and 3.2 (FreeBusy in availability) ✅ are shipped. Phase 3.3 (write confirmed bookings as calendar events) is the next piece.

## Planning docs

Two top-level planning files, complementary not redundant:

- `PROJECT_PLAN.md` — long-range vision: schema outline, full endpoint catalog, ten-phase roadmap, UI screen list. Canonical "what is this product."
- `IMPLEMENTATION_PLAN.md` — live checklist with current phase header, per-substep checkboxes, target dates, and a `# Completed` log at the bottom. Canonical "what's done and what's next." Update this file when substeps land.

When asked "what's done" or "what's next," read `IMPLEMENTATION_PLAN.md` first — its header line names the current phase.

## Known environment gotchas

- **Outbound port 5432 is blocked from this developer machine.** `supabase db push` will not work locally; migrations need to run from a different machine or via the Supabase dashboard SQL editor.
- **The Supabase MCP server cannot reach this project.** When DB inspection is needed, use the Supabase SQL editor in the dashboard or have the user run the CLI.
- **Email confirmations are on by default in Supabase Auth.** `auth.users.confirmed_at` is a generated column; do not try to write to it directly.

## Conventions worth noting

- API routes mount under `/api/*` via `createApp()` in `apps/api/src/app.ts`. New routes go in `apps/api/src/routes/`.
- Cross-cutting business logic lives in `apps/api/src/services/`; routes stay thin.
- The web app's typed API client is `apps/web/src/lib/api.ts` — extend it rather than calling `fetch` from components.
- All booking timestamps in the API are UTC ISO strings; the availability engine converts to coach-local time only when expanding `availability_windows`.
