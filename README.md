# Softball Training Booking Platform

A custom booking and client portal for a softball training business: part scheduling system, part admin dashboard, part training resource hub.

The core architectural decision is that the application database is the source of truth for bookings, while Google Calendar acts as an external availability mirror. This protects against double-booking while still keeping the coach's calendar in sync.

## Product Vision

Clients will be able to:

- View real available training slots.
- Choose a training type.
- Create an account or sign in.
- Book a session.
- Access training resources and coach notes.

Coach/Admin will be able to:

- Manage availability and blocked dates.
- View and manage bookings.
- Manage clients and session notes.
- Upload resources such as videos, PDFs, images, and links.
- Sync confirmed bookings with Google Calendar.

## Monorepo

```text
apps/
  web/      React + Vite + TypeScript + Tailwind CSS
  api/      Node.js + Express + TypeScript
supabase/
  migrations/
```

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy the per-app environment examples (the root `.env.example` is documentation only — nothing reads from a root `.env`):

```bash
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

3. Fill in Supabase values in each `.env` file. URL and anon key come from Supabase Dashboard → Project Settings → API; the service-role key is server-only and must never appear in `apps/web/.env`.

4. Apply the Supabase migrations:

```bash
supabase db push
```

5. Run both apps:

```bash
npm run dev
```

The web app defaults to `http://localhost:5173`.
The API defaults to `http://localhost:4000/api`.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | Supabase Postgres |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Access Control | Supabase RLS + API role middleware |
| Calendar | Google Calendar API, future integration |
| Payments | Stripe, future phase |
| Mobile | Capacitor, after web MVP |

## What's Implemented

Phase 2 is essentially feature-complete on the booking path — see [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the live checklist.

- npm workspace monorepo with `apps/web` and `apps/api`
- Public landing, booking, login, reset-password, and 404 pages
- Role-gated routing for `client` and `admin` dashboards
- Supabase Auth (email/password, password reset) with profile lookup
- Booking flow wired to real availability — training types, slots, holds, confirm — no mock data
- Availability engine v1: expands `availability_windows`, subtracts overlapping bookings, honors `availability_exceptions`, applies buffer/min-notice/max-window rules
- Two-step `hold → confirm` booking with DB-level race protection (gist exclusion + lazy `expire_stale_holds()` sweep)
- Client dashboard with real upcoming/past sessions and email-verification banner
- Admin dashboard with today's schedule, week/month/revenue metrics, and Phase 4 quick-link placeholders
- Mobile-responsive pass at 375 px on landing, booking, dashboards, login, reset-password, 404

## What's Next (Phase 2.6 finishers + Phase 3)

- Google sign-in via Supabase OAuth
- Google Calendar OAuth + FreeBusy + event sync (Phase 3)
- Admin tools: availability CRUD, clients, session notes, resource library (Phase 4)
- Client video uploads & coach review (Phase 4.5)

## Booking Engine Principles

Availability should be calculated from:

1. Coach availability windows
2. Google Calendar busy events
3. Existing app bookings
4. Admin blocks and special openings
5. Buffer time, minimum notice, and max booking window rules

Booking confirmation should recheck both the database and Google Calendar before creating a confirmed booking and calendar event.

## Project Plan

- [PROJECT_PLAN.md](./PROJECT_PLAN.md) — long-range product vision, schema outline, API plan, full roadmap, UI screens.
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — live actionable checklist with target dates and current status.
