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

## Recommended Stack

| Layer | Technology |
| --- | --- |
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | Supabase Postgres |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Calendar | Google Calendar API |
| Payments | Stripe, future phase |
| Mobile | Capacitor, after web MVP |

## MVP Scope

- Public landing page and training overview
- Booking flow with real availability
- Email/password and Google sign-in
- Client dashboard
- Admin dashboard
- Availability management
- Google Calendar free/busy sync and event creation
- Resource library
- Email booking confirmations
- Role-based access control

## Booking Engine Principles

Availability should be calculated from:

1. Coach availability windows
2. Google Calendar busy events
3. Existing app bookings
4. Admin blocks and special openings
5. Buffer time, minimum notice, and max booking window rules

Booking confirmation should recheck both the database and Google Calendar before creating a confirmed booking and calendar event.

## Project Plan

See [PROJECT_PLAN.md](./PROJECT_PLAN.md) for the full architecture, schema outline, API plan, roadmap, UI screens, and implementation prompts.

## Recommended Build Order

1. Finalize business rules and policies
2. Create the database schema
3. Build auth and user roles
4. Build the booking flow UI
5. Implement the availability engine
6. Add Google Calendar integration
7. Build the admin dashboard
8. Add the resource library
9. Add email notifications
10. Harden for production
11. Package mobile apps with Capacitor
12. Add payments and advanced growth features

## Current Status

Planning and project setup.
