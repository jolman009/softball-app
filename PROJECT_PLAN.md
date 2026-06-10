# Softball Training Booking Platform Project Plan

The central architectural decision is this: build the booking engine around the database as the source of truth, while Google Calendar acts as the external availability mirror. That is how the platform avoids the quiet disaster of double-booking.

## 1. Product Summary

Build a custom softball training booking platform: part Calendly, part client portal, part training resource hub.

Clients can view real available time slots, choose a training type, create an account, book a session, and later access training materials. Coach/Admin can manage availability, sessions, clients, notes, resources, and Google Calendar sync from one dashboard.

The core promise:

> A polished booking system that protects the calendar, reduces admin work, and makes the training business feel professional from the first click.

## 2. Clarifying Questions Before Development

These should be answered before writing code.

### Business Rules

- Will sessions always be 1 hour, or should the platform support 30, 60, 90, and 120-minute sessions?
- Should clients pay online during booking, or book first and pay in person?
- Should clients be able to cancel/reschedule themselves?
- What is the cancellation policy? Example: no cancellation within 12 or 24 hours.
- Is training at one fixed location, multiple locations, or client-selected locations?
- Should the platform support group sessions, or only one-on-one training?
- Should parents/guardians create accounts for minor athletes?

### Scheduling Rules

- What are the normal weekly availability windows?
- How much buffer time is needed between sessions? Example: 15 minutes.
- What is the minimum booking notice? Example: must book at least 12 hours ahead.
- How far in advance can clients book? Example: 30, 60, or 90 days.
- Should Google Calendar events marked "busy" always block training availability?

### Client Experience

- Do clients need to complete a waiver before booking?
- Should clients receive email/text reminders?
- Should clients be able to upload swing videos for analysis?
- Should resources be open to all clients, or unlocked based on training type/bookings?

### Brand / Platform

- What is the official business name?
- Is there already a domain?
- Should this launch first as a web app, then be packaged for iOS/Android?
- Should the app use Tailwind CSS or Material Design 3 as the primary design system?

## 3. Recommended Tech Stack

For this use case, use a single web-first codebase packaged for mobile.

### Best Stack

| Layer | Recommendation | Why |
| --- | --- | --- |
| Frontend | React + Vite + TypeScript | Fast, familiar, clean for dashboards and booking flows |
| Styling | Tailwind CSS | Flexible, sporty branding, easy responsive design |
| Mobile Packaging | Capacitor | Turns the React app into iOS/Android apps efficiently |
| Backend | Node.js + Express + TypeScript | Good fit for booking logic, Google Calendar, payments, admin APIs |
| Database | Supabase Postgres | Strong relational model for bookings, clients, resources |
| Auth | Supabase Auth | Supports email/password and OAuth providers |
| Storage | Supabase Storage | Resource videos, PDFs, images, drills, handouts |
| Deployment: Web | Vercel | Excellent for React/Vite frontend |
| Deployment: API | Render, Fly.io, or Railway | Persistent backend service for calendar/payment logic |
| Payments | Stripe | Needed if collecting payment, deposits, or subscriptions |
| Email | Resend or SendGrid | Booking confirmations, reminders, password flows |
| SMS | Twilio | Optional for session reminders |
| Monitoring | Sentry | Production error tracking |
| Analytics | PostHog | Booking funnel, conversion tracking, client behavior |

### Why Not Native First?

A fully native iOS/Android app would be more expensive and slower to maintain. This platform is mostly forms, dashboards, calendars, media, and account flows. React/Vite + Capacitor gives web, iPhone, and Android from one primary codebase.

## 4. App Architecture Overview

### High-Level Architecture

```text
Client Web/Mobile App
React + Vite + Tailwind + Capacitor
        |
        v
Backend API
Node.js + Express + TypeScript
        |
        |---- Supabase Auth
        |---- Supabase Postgres
        |---- Supabase Storage
        |---- Google Calendar API
        |---- Stripe API
        |---- Email/SMS Provider
```

### Source of Truth

The app database should be the source of truth for bookings.

Google Calendar should be used to:

- Check busy times.
- Create calendar events.
- Block unavailable times.
- Reflect booking changes.

Do not rely only on Google Calendar as the booking database. That creates fragile logic. The booking record must live in the application database.

## 5. Scheduling Logic

The booking engine should calculate availability using four layers:

```text
Availability Window
- Google Calendar Busy Events
- Existing App Bookings
- Admin Blocks / Exceptions
- Buffer Time / Booking Rules
= Public Bookable Slots
```

Example availability:

- Monday: 5:00 PM-9:00 PM
- Wednesday: 5:00 PM-9:00 PM
- Saturday: 9:00 AM-1:00 PM

The app checks:

- Google Calendar says: busy 6:00-7:00 PM
- App booking exists: 7:30-8:30 PM
- Buffer setting: 15 minutes
- Minimum notice: 12 hours

Then only clean, valid openings appear to the client.

### Double-Booking Protection

Use all three:

- Google Calendar Free/Busy check before showing slots.
- Database transaction when confirming booking.
- Postgres conflict rule preventing overlapping confirmed bookings.

For production, the booking creation flow should be:

```text
Client selects slot
-> app creates temporary hold
-> client signs in or creates account
-> backend rechecks Google Calendar
-> backend rechecks database
-> backend confirms booking
-> backend creates Google Calendar event
-> confirmation email is sent
```

Temporary holds should expire after 5-10 minutes.

## 6. Database / Schema Outline

### `profiles`

Stores app users.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | matches Supabase auth user |
| `role` | enum | admin, client |
| `first_name` | text |  |
| `last_name` | text |  |
| `email` | text | unique |
| `phone` | text | optional |
| `avatar_url` | text | optional |
| `created_at` | timestamp |  |

### `clients`

Stores athlete/client details.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `user_id` | uuid | linked to profile |
| `athlete_name` | text | useful if parent owns account |
| `athlete_age` | integer | optional |
| `skill_level` | enum | beginner, intermediate, advanced |
| `primary_position` | text | optional |
| `guardian_name` | text | optional |
| `guardian_email` | text | optional |
| `waiver_signed_at` | timestamp | optional |
| `notes` | text | admin-visible |

### `training_types`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `name` | text | Batting, Pitching, etc. |
| `description` | text |  |
| `default_duration_minutes` | integer | default 60 |
| `hourly_rate` | numeric | default 30 |
| `active` | boolean |  |

Default records:

- Batting
- Pitching
- Defense/Infield
- Defense/Outfield
- Other

### `availability_windows`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid |  |
| `coach_id` | uuid | admin profile |
| `day_of_week` | integer | 0-6 |
| `start_time` | time | local time |
| `end_time` | time | local time |
| `timezone` | text | example: America/Chicago |
| `active` | boolean |  |

### `availability_exceptions`

For blocked days, holidays, tournaments, special openings.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid |  |
| `coach_id` | uuid |  |
| `start_at` | timestamp |  |
| `end_at` | timestamp |  |
| `reason` | text | optional |
| `type` | enum | blocked, special_opening |

### `bookings`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid |  |
| `client_id` | uuid |  |
| `coach_id` | uuid |  |
| `training_type_id` | uuid |  |
| `other_training_text` | text | required only for Other |
| `start_at` | timestamp |  |
| `end_at` | timestamp |  |
| `status` | enum | hold, confirmed, cancelled, completed, no_show, rescheduled |
| `price` | numeric | default 30/hour |
| `google_calendar_event_id` | text | stored after event creation |
| `cancellation_reason` | text | optional |
| `created_at` | timestamp |  |

### `session_notes`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid |  |
| `booking_id` | uuid |  |
| `client_id` | uuid |  |
| `coach_id` | uuid |  |
| `private_notes` | text | admin only |
| `client_visible_summary` | text | optional |
| `homework` | text | optional |
| `created_at` | timestamp |  |

### `resources`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid |  |
| `title` | text |  |
| `description` | text |  |
| `category` | text | Batting, Pitching, Defense, Game IQ |
| `skill_level` | enum | beginner, intermediate, advanced, all |
| `session_type` | text | optional |
| `file_url` | text | Supabase Storage URL |
| `resource_type` | enum | video, pdf, image, link, text |
| `visibility` | enum | all_clients, booked_clients, admin_only |
| `created_at` | timestamp |  |

### `calendar_connections`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid |  |
| `coach_id` | uuid |  |
| `provider` | text | Google |
| `calendar_id` | text | primary or selected calendar |
| `access_token_encrypted` | text | optional if not handled by provider |
| `refresh_token_encrypted` | text | important |
| `connected_at` | timestamp |  |

### Optional Payment Tables

Use if online payment is added:

- `payments`
- `invoices`
- `refunds`
- `stripe_customers`
- `stripe_payment_intents`

## 7. Client User Flow

### New Visitor Booking Flow

```text
Landing Page
-> View Training Options
-> Click "Book a Session"
-> Choose Training Type
-> Select Date/Time
-> Enter basic client info
-> Create Account / Sign In
-> Optional payment or deposit
-> Confirm Booking
-> Confirmation Screen
-> Email/SMS confirmation
-> Client Dashboard
```

### Returning Client Flow

```text
Sign In
-> Dashboard
-> View Upcoming Sessions
-> Book Another Session
-> Access Training Resources
-> View Past Sessions
-> Review Coach Notes/Homework
```

### Client Dashboard Should Show

- Upcoming sessions
- Past sessions
- Training resources
- Coach notes/homework
- Profile information
- Cancellation/reschedule options
- Video analysis area, future phase

## 8. Admin User Flow

### Admin Daily Workflow

```text
Sign In
-> Admin Dashboard
-> View Today's Sessions
-> Review Client Profiles
-> Add Session Notes
-> Manage Availability
-> Upload Resources
-> Manually Book or Reschedule Client
```

### Admin Booking Management

Admin should be able to:

- Create booking manually
- Reschedule booking
- Cancel booking
- Mark complete
- Mark no-show
- Add private notes
- Add client-visible summary
- Attach resources to client/session

### Admin Availability Management

- Weekly availability
- Special openings
- Blocked dates
- Buffer time
- Minimum booking notice
- Maximum booking window
- Session duration settings
- Google Calendar connection status

## 9. MVP Features vs. Future Enhancements

### MVP - Build First

| Area | Feature |
| --- | --- |
| Public Site | Landing page, training overview, pricing, book CTA |
| Booking | View available slots, choose session type, confirm booking |
| Auth | Email/password, Google sign-in |
| Client Portal | Upcoming sessions, past sessions, resources |
| Admin | Manage bookings, clients, availability, resources |
| Calendar | Google Calendar free/busy sync and event creation |
| Resources | Upload and organize videos, PDFs, links |
| Notifications | Email confirmations |
| Security | Role-based access control |
| Responsive UI | Desktop and mobile web |
| Mobile | Capacitor shell for iOS/Android after web MVP stabilizes |

### Phase 2

| Area | Feature |
| --- | --- |
| Auth | Facebook sign-in, Apple sign-in |
| Payments | Stripe checkout, deposits, cancellation fees |
| Reminders | SMS reminders |
| Rescheduling | Client self-service reschedule/cancel |
| Waivers | Digital liability waiver |
| Video | Client video uploads for swing/pitching analysis |
| Coach Notes | Client-visible training homework |
| Analytics | Booking funnel and client retention tracking |

### Future Enhancements

- Membership plans
- Training packages: 4-pack, 8-pack, monthly plan
- Group clinics
- Waitlist
- Referral system
- Parent/athlete linked accounts
- AI-generated training plans
- AI swing analysis notes
- Progress tracking
- Badges/gamification
- Push notifications
- In-app chat

## 10. UI / UX Screen List

### Public Screens

- Landing Page
- Training Services Page
- Pricing Section
- Coach Bio Page
- Booking Page
- Sign In
- Create Account
- Password Reset
- Email Verification
- Booking Confirmation

### Client Screens

- Client Dashboard
- Upcoming Sessions
- Past Sessions
- Session Detail
- Training Resources
- Resource Detail
- Profile Settings
- Upload Video - future
- Payment History - future

### Admin Screens

- Admin Dashboard
- Calendar View
- Booking Management
- Client List
- Client Profile
- Session Notes
- Training Type Management
- Resource Library Manager
- Availability Settings
- Manual Booking
- Cancellation/Reschedule Manager
- Google Calendar Connection Settings
- Business Settings

## 11. Sample Wireframes / Screen Descriptions

### Landing Page

```text
------------------------------------------------
[Logo] [Training] [Resources] [Book Now]

Hero:
"Train Smarter. Swing Stronger."
Private softball instruction for batting, pitching,
defense, and game-ready confidence.

[Book a Session] [View Training Options]

Cards:
- Batting
- Pitching
- Infield Defense
- Outfield Defense

Coach Section:
Experience, coaching philosophy, location, rate.

Footer:
Contact, social links, waiver, policies.
------------------------------------------------
```

### Booking Screen

```text
------------------------------------------------
Book a Training Session

Step 1: Choose Training Type
[Batting] [Pitching] [Infield] [Outfield] [Other]

Step 2: Select Date
[Calendar date picker]

Step 3: Select Time
[5:00 PM] [6:15 PM] [7:30 PM]

Session Summary:
Training Type: Batting
Duration: 1 hour
Price: $30
Location: [Training location]

[Continue]
------------------------------------------------
```

### Account Prompt Before Booking

```text
------------------------------------------------
Almost Done

Create an account or sign in to confirm your session.

Why?
- View upcoming sessions
- Access training resources
- Receive coach notes
- Reschedule when allowed

[Continue with Google]
[Continue with Apple]
[Continue with Facebook]
[Create Account with Email]
[Sign In]
------------------------------------------------
```

### Client Dashboard

```text
------------------------------------------------
Welcome back, Alex

Upcoming Session:
Batting Training
Saturday, 10:00 AM
[View Details] [Reschedule]

Training Resources:
[Batting Drills]
[Game Situations]
[Defense Footwork]
[Video Analysis]

Past Sessions:
Jan 12 - Pitching
Jan 5 - Batting
------------------------------------------------
```

### Admin Dashboard

```text
------------------------------------------------
Coach Dashboard

Today:
5:00 PM - Batting - Alex R.
6:15 PM - Pitching - Mia G.
7:30 PM - Infield - Sofia L.

Quick Actions:
[Add Manual Booking]
[Block Time]
[Upload Resource]
[View Calendar]

Metrics:
This Week: 8 sessions
This Month: 27 sessions
Revenue Estimate: $810
------------------------------------------------
```

## 12. Third-Party Integrations Required

### Required

| Integration | Purpose |
| --- | --- |
| Google Calendar API | Availability, busy times, booking event creation |
| Supabase Auth | Account creation, login, OAuth |
| Supabase Postgres | App database |
| Supabase Storage | Resource library files |
| Email Provider | Confirmations, password reset, reminders |
| Sentry | Error tracking |

### Recommended

| Integration | Purpose |
| --- | --- |
| Stripe | Online payments/deposits |
| Twilio | SMS reminders |
| PostHog | Product analytics |
| Cloudinary | Video/image optimization |
| Apple Developer Account | iOS App Store |
| Google Play Developer Account | Android deployment |

## 13. Authentication Plan

### Supported Methods

- Email/password
- Google sign-in
- Facebook sign-in
- Apple sign-in

### Recommended Auth Provider

Use Supabase Auth for the MVP because it gives:

- Email/password authentication
- OAuth provider support
- JWT-based session handling
- Password reset
- Email verification
- User metadata
- Row Level Security integration

### Web Authentication

```text
Client clicks sign-in method
-> Supabase handles auth flow
-> app receives session
-> JWT stored securely by Supabase client
-> user profile loaded from profiles table
-> app redirects based on role
```

### Mobile Authentication

For iOS/Android with Capacitor:

- Use OAuth with PKCE.
- Use system browser, not embedded webview.
- Use universal links / deep links for callback.
- Store session using secure mobile storage.
- Refresh tokens safely.

### Account Linking

A client may sign up with email first, then later use Google or Apple.

Rules:

- Same verified email can be linked to the same profile.
- Do not automatically merge unverified accounts.
- Apple private relay emails need special handling.
- Admin should be able to help resolve duplicate accounts.

### Password Reset

```text
User requests reset
-> email sent with secure reset link
-> user creates new password
-> all active sessions may optionally be revoked
```

### Email Verification

Require email verification before:

- Booking confirmation
- Accessing paid/client-only resources
- Changing account email

### Session Security

- Use short-lived access tokens.
- Use refresh tokens securely.
- Use HTTPS everywhere.
- Use role-based authorization on backend.
- Use Supabase Row Level Security.
- Never expose Google refresh tokens to the frontend.

## 14. Security Considerations

### Access Control

Use role-based permissions:

- Admin can manage all bookings, clients, resources.
- Client can only view their own bookings and allowed resources.
- Unauthenticated visitor can only view public pages and available slots.

### Data Protection

Protect:

- Client personal information
- Minor athlete information
- Session notes
- Payment data
- Google Calendar tokens
- Uploaded videos

### Important Production Rules

- Never trust frontend role values.
- Validate every booking request on the backend.
- Recheck availability at confirmation.
- Encrypt sensitive tokens.
- Use rate limiting on auth and booking endpoints.
- Use signed URLs for private resource files.
- Log booking changes in an audit table.
- Use environment variables for secrets.

### Minor Athlete Consideration

Because this is youth sports, add:

- Parent/guardian contact fields
- Waiver support
- Media/video consent option
- Emergency contact option
- Private coach-only notes

## 15. Deployment Strategy

### Web

- Frontend: Vercel
- Backend API: Render, Fly.io, or Railway
- Database: Supabase
- Storage: Supabase Storage
- Domain: custom business domain

Suggested environment setup:

- `development`
- `staging`
- `production`

### iOS

Use Capacitor:

```text
React/Vite app
-> Capacitor iOS project
-> Xcode
-> Apple Developer Account
-> TestFlight
-> App Store Review
```

You will need:

- Apple Developer account
- App icon set
- Splash screen
- Privacy policy
- Terms of service
- Support URL
- Sign in with Apple configured
- App privacy disclosures

### Android

Use Capacitor:

```text
React/Vite app
-> Capacitor Android project
-> Android Studio
-> Google Play Console
-> Internal testing
-> Production release
```

You will need:

- Google Play Developer account
- Keystore signing
- Privacy policy
- Data safety form
- App icon set
- Screenshots
- Content rating

### Best Launch Order

1. Web MVP
2. Mobile-responsive polish
3. Capacitor iOS/Android packaging
4. TestFlight and Play internal testing
5. App Store / Play Store launch

Do not start with app stores first. The web app should prove the booking engine before mobile packaging.

## 16. Recommended Visual Style

Use a modern softball coaching identity:

- Clean white or dark navy backgrounds
- Strong accent color: softball yellow, turf green, or athletic red
- Large rounded cards
- Bold sports-style headings
- Simple icons
- Clear booking CTA
- Mobile-first forms
- Minimal clutter
- Professional, not gimmicky

### Suggested Palette

| Role | Color |
| --- | --- |
| Primary | Deep Navy `#111827` |
| Accent | Softball Gold `#FACC15` |
| Secondary | Turf Green `#16A34A` |
| Light Background | `#F9FAFB` |
| Text | `#1F2937` |
| Danger/Cancel | `#DC2626` |

### Typography

- Headings: Inter, Montserrat, or Oswald
- Body: Inter or system sans-serif

Tailwind CSS is the better fit because it can shape a custom sports brand without fighting a prebuilt component language.

## 17. Phased Development Roadmap

> **Status legend:** ✅ done · 🟡 partial · 🔴 not started
>
> This roadmap is the long-range view. For the live, box-by-box checklist with commit references and dates, see [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) (the source of truth). Status below reflects that file as of 2026-06-05.

### Phase 1 - Product Foundation 🟡

- [ ] Finalize business rules *(still open — answers to be pinned in a `BUSINESS_RULES.md`)*
- [x] Define cancellation/reschedule policy *(12 h client-side cancel cutoff enforced)*
- [ ] Choose domain and business name *(still open)*
- [x] Define training types *(seeded: Batting, Pitching, Defense/Infield, Defense/Outfield, Other)*
- [x] Define availability rules *(`coach_settings`: buffer / min-notice / max-window)*
- [x] Create database schema *(`supabase/migrations/202605060001_initial_schema.sql` + RLS + overlap constraint)*
- [x] Create design system *(Tailwind tokens: ink / field / clay / chalk; AA contrast verified)*

### Phase 2 - Web MVP ✅ *(shipped 2026-05-25)*

- [x] Build landing page
- [x] Build booking flow *(wired to real API; `mockSlots` removed)*
- [x] Build auth *(email/password + Google sign-in, password reset)*
- [x] Build client dashboard *(real upcoming/past from `/api/me/bookings`)*
- [x] Build admin dashboard shell *(today's schedule + week/month/revenue)*
- [x] Build training type management
- [x] Build availability settings

### Phase 3 - Calendar Engine ✅

- [x] Connect Google Calendar OAuth *(refresh token AES-256-GCM encrypted; HMAC-signed state nonce)*
- [x] Read free/busy availability *(FreeBusy subtracted in the availability engine, ~30 s cache)*
- [x] Generate available slots
- [x] Create calendar events after booking *(on `confirm`)*
- [x] Store Google Calendar event IDs
- [x] Handle cancellations/reschedules *(update-on-reschedule, delete-on-cancel; failure-tolerant)*
- [x] Prevent double-booking with database constraints *(gist exclusion over hold/pending/confirmed)*

### Phase 4 - Resource Library ✅

- [x] Resource upload *(browser → Supabase Storage via signed upload URL)*
- [x] Resource categories *(`resource_categories`, skill level, training type)*
- [x] Client access rules *(`visibility` enum enforced server-side: all / booked / admin-only)*
- [x] Video/PDF/link support
- [x] Resource detail pages
- [x] Admin resource manager
- [x] **Client video review** *(Phase 4.5 — inverse direction: client uploads → coach review queue + summary)*

### Phase 5 - Production Hardening 🟡 *(only backup verification remains)*

- [x] Email confirmations *(Resend; confirm/reschedule/cancel — needs a verified domain before launch)*
- [x] Password reset *(via Supabase Auth)*
- [x] Email verification
- [x] Role-based access *(`profiles` RLS role-lockdown)*
- [x] Rate limiting *(auth + `/api/bookings`)*
- [x] Error monitoring *(Sentry on web + api)*
- [x] Analytics *(PostHog booking funnel)*
- [ ] Backup strategy *(open — confirm Supabase PITR enabled on prod)*
- [x] Mobile responsiveness audit
- [x] Accessibility audit *(focus trap, skip link, ARIA, AA contrast)*

> **Note:** Deployment & go-live is tracked as Phase 5.5 in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — code artifacts (`vercel.json`, `render.yaml`, CI) are committed; the remaining work is dashboard setup (Vercel/Render projects, prod env vars, prod OAuth) + a live smoke test. See also §15 (Deployment Strategy).

### Phase 6 - Mobile App Packaging 🔴

- [ ] Add Capacitor
- [ ] Configure iOS project
- [ ] Configure Android project
- [ ] Add app icons and splash screens
- [ ] Configure OAuth redirects
- [ ] Test mobile auth
- [ ] Test booking flow on devices
- [ ] Submit to TestFlight and Play internal testing

### Phase 7 - Payments and Growth 🔴

- [ ] Stripe payments
- [ ] Packages and memberships
- [ ] SMS reminders
- [ ] Video upload *(foundation shipped in Phase 4.5; payment/AI layers pending)*
- [ ] Progress tracking
- [ ] AI-assisted coaching notes
- [ ] Group clinics
- [ ] Referral system

## 18. Implementation Notes for Calendar Sync

The calendar system needs careful handling.

### Availability Calculation

Backend endpoint:

```http
GET /api/availability?trainingType=batting&date=2026-05-10
```

Backend should:

- Load coach availability windows.
- Load app bookings.
- Load Google Calendar busy blocks.
- Apply buffer time.
- Apply minimum notice.
- Apply maximum booking window.
- Return available slots.

### Booking Confirmation

Backend endpoint:

```http
POST /api/bookings
```

Backend should:

- Validate user.
- Validate training type.
- Validate selected time.
- Check database conflicts.
- Check Google Calendar conflicts.
- Create booking record.
- Create Google Calendar event.
- Update booking with calendar event ID.
- Send confirmation email.

### Rescheduling

Backend should:

- Check cancellation/reschedule policy.
- Revalidate new time.
- Update booking.
- Update Google Calendar event.
- Notify client.
- Log change.

## 19. Suggested Codebase Structure

```text
softball-scheduler/
  apps/
    web/
      src/
        components/
        pages/
        routes/
        features/
          auth/
          booking/
          admin/
          clients/
          resources/
          calendar/
        lib/
        styles/
    mobile/
      capacitor config can point to web build
  server/
    src/
      routes/
      controllers/
      services/
        googleCalendar.service.ts
        booking.service.ts
        availability.service.ts
        auth.service.ts
        email.service.ts
      middleware/
      db/
      utils/
  supabase/
    migrations/
    seed/
```

For simplicity, the project could also start with:

```text
client/
server/
supabase/
```

That may be easier for a first production build.

## 20. API Endpoint Outline

### Public

| Method | Endpoint |
| --- | --- |
| GET | `/api/training-types` |
| GET | `/api/availability` |

### Authenticated Client

| Method | Endpoint |
| --- | --- |
| POST | `/api/bookings` |
| GET | `/api/me/bookings` |
| GET | `/api/me/resources` |
| PATCH | `/api/me/profile` |
| POST | `/api/bookings/:id/cancel` |
| POST | `/api/bookings/:id/reschedule` |

### Admin

| Method | Endpoint |
| --- | --- |
| GET | `/api/admin/bookings` |
| POST | `/api/admin/bookings/manual` |
| PATCH | `/api/admin/bookings/:id` |
| GET | `/api/admin/clients` |
| GET | `/api/admin/clients/:id` |
| POST | `/api/admin/session-notes` |
| GET | `/api/admin/resources` |
| POST | `/api/admin/resources` |
| PATCH | `/api/admin/resources/:id` |
| DELETE | `/api/admin/resources/:id` |
| GET | `/api/admin/availability` |
| POST | `/api/admin/availability` |
| PATCH | `/api/admin/settings` |

### Calendar

| Method | Endpoint |
| --- | --- |
| GET | `/api/calendar/connect/google` |
| GET | `/api/calendar/google/callback` |
| GET | `/api/calendar/status` |
| POST | `/api/calendar/disconnect` |

## 21. Codebase Generation Prompts

Use these after the plan is approved.

### Prompt 1 - Create Project Foundation

```text
Create a production-ready monorepo for a softball personal training scheduling platform.

Use:
- React + Vite + TypeScript for the frontend
- Tailwind CSS for styling
- Node.js + Express + TypeScript for the backend
- Supabase for database, auth, and storage
- PostgreSQL schema migrations
- Role-based access for admin and client users

Create the initial folder structure, environment variable examples, frontend routing, backend API structure, Supabase client setup, and placeholder pages for landing, booking, client dashboard, and admin dashboard.

Do not implement Google Calendar yet. Focus on clean architecture and maintainable structure.
```

### Prompt 2 - Build Booking UI

```text
Build the client booking flow for the softball training app.

The flow should include:
1. Choose training type: Batting, Pitching, Defense/Infield, Defense/Outfield, Other
2. If Other is selected, show a required free-text input
3. Select date
4. Select available time slot
5. Show session summary with default pricing of $30 per hour
6. Prompt user to sign in or create an account before confirming
7. Confirm booking and redirect to client dashboard

Use responsive Tailwind CSS with a modern, sporty, professional design.
```

### Prompt 3 - Build Database Schema

```text
Create Supabase/Postgres migrations for the softball scheduling app.

Include tables for:
- profiles
- clients
- training_types
- availability_windows
- availability_exceptions
- bookings
- session_notes
- resources
- resource_categories
- calendar_connections
- booking_audit_logs

Add appropriate foreign keys, indexes, timestamps, role policies, and constraints to prevent overlapping confirmed bookings for the same coach.
```

### Prompt 4 - Build Google Calendar Integration

```text
Implement Google Calendar integration for the coach/admin.

Requirements:
- Admin can connect a Google Calendar account
- Store calendar connection securely
- Use Google FreeBusy API to detect occupied times
- Generate available slots based on app availability settings
- Create Google Calendar events after confirmed bookings
- Update calendar events when sessions are rescheduled
- Delete or mark cancelled calendar events when bookings are cancelled
- Prevent double-booking by checking both Postgres bookings and Google Calendar busy blocks before confirming
```

### Prompt 5 - Build Admin Dashboard

```text
Build the admin dashboard for the softball training platform.

Include:
- calendar/schedule view
- booking management
- manual booking
- rescheduling
- cancellation handling
- client list
- client profile
- session history
- private coach notes
- client-visible session summaries
- training type management
- availability settings
- resource upload and organization

Use clean responsive Tailwind CSS and protect all admin routes by role.
```

### Prompt 6 - Build Resource Library

```text
Build a client training resource library.

Requirements:
- Admin can upload videos, PDFs, images, and links
- Resources can be categorized by skill type, athlete level, and training type
- Clients can view resources available to them after signing in
- Support categories: Batting, Pitching, Infield Defense, Outfield Defense, Game Situations, Strength/Conditioning, Mindset
- Use Supabase Storage for file uploads
- Use signed URLs for private files
```

### Prompt 7 - Prepare Mobile Deployment

```text
Prepare the React/Vite softball scheduling app for iOS and Android deployment using Capacitor.

Requirements:
- Configure Capacitor
- Add iOS and Android projects
- Ensure OAuth redirects work with mobile deep links
- Add app icon and splash screen placeholders
- Confirm responsive mobile layouts
- Document build steps for TestFlight and Google Play internal testing
```

## 22. Recommended Build Order

Start with this order:

1. Business rules and policies
2. Database schema
3. Auth and user roles
4. Booking flow UI
5. Availability engine
6. Google Calendar integration
7. Admin dashboard
8. Resource library
9. Email notifications
10. Production hardening
11. Mobile packaging
12. Payments and advanced features

The heart of the app is not the calendar UI. The heart is the booking engine. Get that right, and the rest of the platform has a strong spine.
