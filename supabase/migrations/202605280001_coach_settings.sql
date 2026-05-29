-- Phase 4.1: per-coach booking rules.
--
-- The availability engine currently hard-codes BUFFER_MINUTES / MIN_NOTICE_HOURS /
-- MAX_BOOKING_DAYS at the top of `availability.service.ts`. This migration adds a
-- single-row-per-coach `coach_settings` table so the coach can edit those values
-- from the admin UI without a redeploy.
--
-- Notes:
--   - Defaults match the constants in `availability.service.ts` so the engine's
--     behavior does not change for any coach who hasn't customized yet.
--   - Public read (clients need to see the rules implicitly via slot results, but
--     reading the raw row is also harmless and lets the booking page eventually
--     surface "minimum 12 hours notice" copy without an extra endpoint).
--   - Only admins (and service_role) may write.

begin;

create table if not exists public.coach_settings (
  coach_id uuid primary key references public.profiles(id) on delete cascade,
  buffer_minutes integer not null default 15 check (buffer_minutes between 0 and 240),
  min_notice_hours integer not null default 12 check (min_notice_hours between 0 and 720),
  max_booking_days integer not null default 60 check (max_booking_days between 1 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reuse the shared `touch_updated_at` trigger function that the initial schema
-- defines for every other table. If that function doesn't exist (e.g. on a fresh
-- DB where this migration runs first for some reason) this will fail loudly
-- rather than silently let the timestamp rot — that's the intended behavior.
drop trigger if exists touch_coach_settings_updated_at on public.coach_settings;
create trigger touch_coach_settings_updated_at
before update on public.coach_settings
for each row execute function public.touch_updated_at();

-- Mirror the validation trigger pattern used for availability_windows: only an
-- admin profile may be assigned as `coach_id`.
drop trigger if exists validate_coach_settings_coach on public.coach_settings;
create trigger validate_coach_settings_coach
before insert or update of coach_id on public.coach_settings
for each row execute function public.validate_coach_profile();

alter table public.coach_settings enable row level security;

drop policy if exists "coach_settings_public_read" on public.coach_settings;
create policy "coach_settings_public_read"
on public.coach_settings for select
using (true);

drop policy if exists "coach_settings_admin_all" on public.coach_settings;
create policy "coach_settings_admin_all"
on public.coach_settings for all
using (public.is_admin())
with check (public.is_admin());

-- Seed defaults for every existing admin so the first time a coach loads the
-- settings page they see the same values the engine has been using.
insert into public.coach_settings (coach_id)
select id from public.profiles where role = 'admin'
on conflict (coach_id) do nothing;

commit;
