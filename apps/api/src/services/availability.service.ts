import { supabaseAdmin } from "../lib/supabase.js";
import { getDefaultCoachId } from "./coaches.service.js";

/**
 * Availability engine v1 (DB only — no Google Calendar yet).
 *
 * Pipeline:
 *   1. Expand `availability_windows` over the requested range, honoring each window's tz.
 *   2. Union `special_opening` exceptions, subtract `blocked` exceptions.
 *   3. Subtract existing bookings (status hold/pending/confirmed), padded by BUFFER_MINUTES.
 *   4. Apply min-notice and max-window guards.
 *   5. Slice the surviving intervals into discrete slots of the training type's duration.
 *
 * All inputs and outputs are UTC ISO timestamps.
 *
 * Known limitations (Phase 2.2 scope):
 *   - Buffer/min-notice/max-window are constants here. Phase 4 will move them to a settings table.
 *   - DST transitions are resolved at each boundary; ambiguous local times during a "fall back"
 *     resolve to the later offset. Acceptable for v1.
 */

const BUFFER_MINUTES = 15;
const MIN_NOTICE_HOURS = 12;
const MAX_BOOKING_DAYS = 60;
const DEFAULT_DURATION_MINUTES = 60;

export type Slot = {
  starts_at: string;
  ends_at: string;
};

type Interval = {
  start: number; // epoch ms
  end: number;
};

type AvailabilityWindowRow = {
  id: string;
  day_of_week: number;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  timezone: string;
};

type AvailabilityExceptionRow = {
  starts_at: string;
  ends_at: string;
  exception_type: "blocked" | "special_opening";
};

type BookingOverlapRow = {
  starts_at: string;
  ends_at: string;
};

export type ComputeAvailabilityInput = {
  from: string;
  to: string;
  trainingTypeId?: string;
  coachId?: string;
};

export async function computeAvailableSlots(input: ComputeAvailabilityInput): Promise<Slot[]> {
  const fromMs = Date.parse(input.from);
  const toMs = Date.parse(input.to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return [];
  }

  const coachId = input.coachId ?? (await getDefaultCoachId());
  if (!coachId) return [];

  const durationMinutes = await resolveDurationMinutes(input.trainingTypeId);
  const durationMs = durationMinutes * 60_000;

  const [windows, exceptions, bookings] = await Promise.all([
    loadWindows(coachId),
    loadExceptions(coachId, input.from, input.to),
    loadBookings(coachId, input.from, input.to)
  ]);

  if (windows.length === 0 && exceptions.every((e) => e.exception_type !== "special_opening")) {
    return [];
  }

  // 1. Expand windows into UTC intervals across the request range.
  const rangeStartMs = fromMs - 24 * 60 * 60 * 1000;
  const rangeEndMs = toMs + 24 * 60 * 60 * 1000;
  const baseIntervals: Interval[] = [];

  for (const window of windows) {
    for (const instance of expandWindow(window, rangeStartMs, rangeEndMs)) {
      baseIntervals.push(instance);
    }
  }

  // 2. Union in special openings.
  for (const exception of exceptions) {
    if (exception.exception_type === "special_opening") {
      baseIntervals.push({
        start: Date.parse(exception.starts_at),
        end: Date.parse(exception.ends_at)
      });
    }
  }

  let open = mergeIntervals(baseIntervals);

  // 3. Subtract blocked exceptions.
  const blockedHoles = exceptions
    .filter((e) => e.exception_type === "blocked")
    .map((e) => ({ start: Date.parse(e.starts_at), end: Date.parse(e.ends_at) }));
  open = subtractHoles(open, mergeIntervals(blockedHoles));

  // 4. Subtract existing bookings padded by BUFFER_MINUTES on each side.
  const bookingHoles = bookings.map((b) => ({
    start: Date.parse(b.starts_at) - BUFFER_MINUTES * 60_000,
    end: Date.parse(b.ends_at) + BUFFER_MINUTES * 60_000
  }));
  open = subtractHoles(open, mergeIntervals(bookingHoles));

  // 5. Clamp to [from, to] and apply min-notice / max-window guards.
  const now = Date.now();
  const earliest = now + MIN_NOTICE_HOURS * 60 * 60 * 1000;
  const latest = now + MAX_BOOKING_DAYS * 24 * 60 * 60 * 1000;
  const lowerBound = Math.max(fromMs, earliest);
  const upperBound = Math.min(toMs, latest);

  const clamped: Interval[] = [];
  for (const interval of open) {
    const start = Math.max(interval.start, lowerBound);
    const end = Math.min(interval.end, upperBound);
    if (end - start >= durationMs) {
      clamped.push({ start, end });
    }
  }

  // 6. Slice each surviving interval into back-to-back slots of `durationMs`.
  const slots: Slot[] = [];
  for (const interval of clamped) {
    let cursor = interval.start;
    while (cursor + durationMs <= interval.end) {
      slots.push({
        starts_at: new Date(cursor).toISOString(),
        ends_at: new Date(cursor + durationMs).toISOString()
      });
      cursor += durationMs;
    }
  }

  return slots;
}

// ---------- data access ----------

async function resolveDurationMinutes(trainingTypeId?: string): Promise<number> {
  if (!trainingTypeId) return DEFAULT_DURATION_MINUTES;

  const { data, error } = await supabaseAdmin
    .from("training_types")
    .select("default_duration_minutes")
    .eq("id", trainingTypeId)
    .maybeSingle();

  if (error) throw error;
  return data?.default_duration_minutes ?? DEFAULT_DURATION_MINUTES;
}

async function loadWindows(coachId: string): Promise<AvailabilityWindowRow[]> {
  const { data, error } = await supabaseAdmin
    .from("availability_windows")
    .select("id, day_of_week, start_time, end_time, timezone")
    .eq("coach_id", coachId)
    .eq("active", true);

  if (error) throw error;
  return data ?? [];
}

async function loadExceptions(
  coachId: string,
  from: string,
  to: string
): Promise<AvailabilityExceptionRow[]> {
  // Overlap test: stored interval overlaps requested range when starts_at < to AND ends_at > from.
  const { data, error } = await supabaseAdmin
    .from("availability_exceptions")
    .select("starts_at, ends_at, exception_type")
    .eq("coach_id", coachId)
    .lt("starts_at", to)
    .gt("ends_at", from);

  if (error) throw error;
  return data ?? [];
}

async function loadBookings(
  coachId: string,
  from: string,
  to: string
): Promise<BookingOverlapRow[]> {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("starts_at, ends_at")
    .eq("coach_id", coachId)
    .in("status", ["hold", "pending", "confirmed"])
    .lt("starts_at", to)
    .gt("ends_at", from);

  if (error) throw error;
  return data ?? [];
}

// ---------- window expansion + timezone helpers ----------

/**
 * Generates one [start, end] interval per occurrence of `window` whose local day overlaps
 * the [rangeStartMs, rangeEndMs] UTC range.
 */
function* expandWindow(
  window: AvailabilityWindowRow,
  rangeStartMs: number,
  rangeEndMs: number
): Generator<Interval> {
  const [startH, startM] = parseHHMM(window.start_time);
  const [endH, endM] = parseHHMM(window.end_time);

  // Iterate local calendar dates that fall inside the padded range.
  const startDate = zonedDateParts(new Date(rangeStartMs), window.timezone);
  const endDate = zonedDateParts(new Date(rangeEndMs), window.timezone);

  // Walk forward day-by-day in the window's timezone.
  let { year, month, day } = startDate;
  while (true) {
    const cursorUtcMs = zonedDateTimeToUtcMs(year, month, day, 12, 0, window.timezone);
    if (cursorUtcMs > rangeEndMs + 36 * 60 * 60 * 1000) break;

    const dow = dayOfWeekInZone(new Date(cursorUtcMs), window.timezone);
    if (dow === window.day_of_week) {
      const startMs = zonedDateTimeToUtcMs(year, month, day, startH, startM, window.timezone);
      const endMs = zonedDateTimeToUtcMs(year, month, day, endH, endM, window.timezone);
      if (endMs > rangeStartMs && startMs < rangeEndMs) {
        yield { start: startMs, end: endMs };
      }
    }

    // Safety guard so we exit if we somehow walked past endDate without termination above.
    if (
      year > endDate.year + 1 ||
      (year === endDate.year && month > endDate.month + 1)
    ) {
      break;
    }

    // Advance one calendar day.
    ({ year, month, day } = addDays({ year, month, day }, 1));
  }
}

function parseHHMM(value: string): [number, number] {
  const [h, m] = value.split(":");
  return [Number(h), Number(m)];
}

function addDays(date: { year: number; month: number; day: number }, days: number) {
  const base = new Date(Date.UTC(date.year, date.month - 1, date.day));
  base.setUTCDate(base.getUTCDate() + days);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate()
  };
}

/** Local year/month/day for `date` as observed in `timeZone`. */
function zonedDateParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day)
  };
}

/**
 * Returns the offset of `timeZone` from UTC, in minutes, for the wall clock at `date`.
 * Positive when `timeZone` is east of UTC. America/Chicago in summer returns -300.
 */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - date.getTime()) / 60_000;
}

/** UTC epoch ms for the wall-clock instant year/month/day hour:minute in `timeZone`. */
function zonedDateTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): number {
  // Two-pass refinement: the offset depends on the resulting UTC instant, but we need
  // an instant to query the offset. Start by pretending the wall-clock is UTC, look up
  // the offset there, correct, then re-check at the corrected instant.
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offset1 = tzOffsetMinutes(new Date(guessUtc), timeZone);
  const corrected = guessUtc - offset1 * 60_000;
  const offset2 = tzOffsetMinutes(new Date(corrected), timeZone);
  return guessUtc - offset2 * 60_000;
}

function dayOfWeekInZone(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

// ---------- interval math ----------

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/** Removes `holes` from `intervals`. Both inputs must be merged + sorted by start. */
function subtractHoles(intervals: Interval[], holes: Interval[]): Interval[] {
  if (holes.length === 0) return intervals;
  const result: Interval[] = [];

  for (const interval of intervals) {
    let segments: Interval[] = [{ ...interval }];

    for (const hole of holes) {
      const next: Interval[] = [];
      for (const seg of segments) {
        if (hole.end <= seg.start || hole.start >= seg.end) {
          next.push(seg);
          continue;
        }
        if (hole.start > seg.start) {
          next.push({ start: seg.start, end: hole.start });
        }
        if (hole.end < seg.end) {
          next.push({ start: hole.end, end: seg.end });
        }
      }
      segments = next;
      if (segments.length === 0) break;
    }

    result.push(...segments);
  }

  return result;
}
