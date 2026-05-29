begin;

-- Phase 4.1 follow-up: weekly availability windows had no overlap guard, so a
-- coach could stack e.g. Mon 17:00-21:00 and Mon 18:00-20:00 and the engine
-- would expand both into duplicate/redundant slots. The bookings table has a
-- gist exclusion constraint; availability_windows did not. This adds one.
--
-- btree_gist is already enabled by the initial schema migration.
--
-- Scope notes:
--   * Only active windows are checked -- a paused window must not block a new
--     active one (mirrors "bookings ... where (status = 'confirmed')").
--   * Keyed on (coach_id, day_of_week, timezone): overlap is only meaningful
--     between windows expressed in the same wall-clock timezone on the same
--     weekday. Two same-day windows in different timezones describe different
--     absolute times, so they are intentionally not treated as overlapping.
--   * "time" has no built-in range type, so we project each window onto an
--     arbitrary fixed date to build an immutable tsrange. '[)' is half-open so
--     a window ending at 19:00 does not collide with one starting at 19:00,
--     consistent with the slot engine's interval math.
do $$
  begin
    alter table public.availability_windows
      add constraint availability_windows_no_active_overlap
      exclude using gist (
        coach_id with =,
        day_of_week with =,
        timezone with =,
        tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time, '[)') with &&
      )
      where (active);
  exception
    when duplicate_object then null;
  end $$;

commit;
