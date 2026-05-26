-- Phase 2.3: hold → confirm transition.
--
-- 1. Add `hold_expires_at` to `bookings` so the API can express a short-lived reservation.
-- 2. Expand the existing no-overlap constraint to cover `hold` and `pending` in addition
--    to `confirmed`, so concurrent attempts to claim the same slot are rejected by the
--    database rather than by application code.
-- 3. Add `expire_stale_holds()` — a SECURITY DEFINER helper the API calls before each
--    booking attempt and that pg_cron can run periodically.

begin;

alter table public.bookings
  add column if not exists hold_expires_at timestamptz;

create index if not exists bookings_hold_expires_at_idx
  on public.bookings (hold_expires_at)
  where status = 'hold' and hold_expires_at is not null;

-- Replace the confirmed-only exclusion constraint with one that also blocks overlapping
-- holds and pendings. Dropping by both names so this migration is idempotent regardless
-- of which constraint name the database currently has.
alter table public.bookings
  drop constraint if exists bookings_confirmed_no_coach_overlap;

alter table public.bookings
  drop constraint if exists bookings_active_no_coach_overlap;

alter table public.bookings
  add constraint bookings_active_no_coach_overlap
  exclude using gist (
    coach_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('hold', 'pending', 'confirmed'));

-- Releases holds whose hold_expires_at is in the past. Returns the count of rows touched.
-- Safe to call frequently; intended to be invoked by the API just before creating a new
-- hold (lazy sweep) and by pg_cron on a fixed schedule.
create or replace function public.expire_stale_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancellation_reason = coalesce(cancellation_reason, 'hold expired')
   where status = 'hold'
     and hold_expires_at is not null
     and hold_expires_at < now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Lock down execution: only the API's service_role (and the postgres superuser) may
-- invoke the sweep. Anonymous and authenticated end-users cannot.
revoke execute on function public.expire_stale_holds() from public;
grant execute on function public.expire_stale_holds() to service_role;

commit;
