import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { getDefaultCoachId } from "../services/coaches.service.js";
import { createEvent, deleteEvent, updateEvent } from "../services/googleCalendar.service.js";

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole(["admin"]));

adminRouter.get("/overview", async (_req, res, next) => {
  try {
    const [{ count: bookingCount, error: bookingsError }, { count: clientCount, error: clientsError }] =
      await Promise.all([
        supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("clients").select("id", { count: "exact", head: true })
      ]);

    if (bookingsError) throw bookingsError;
    if (clientsError) throw clientsError;

    res.json({
      bookingCount,
      clientCount
    });
  } catch (error) {
    next(error);
  }
});

const bookingsQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime()
});

/**
 * Lists every booking in the [from, to] window, with training type + client joined.
 * The dashboard fetches a wide window (start of month → ~60 days out) and groups in JS.
 */
adminRouter.get("/bookings", async (req, res, next) => {
  try {
    const query = bookingsQuerySchema.parse(req.query);

    // Sweep stale holds so the coach doesn't see zombies in their schedule.
    const { error: sweepError } = await supabaseAdmin.rpc("expire_stale_holds");
    if (sweepError) throw sweepError;

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, starts_at, ends_at, status, price, hold_expires_at, notes, training_type:training_types(id, name), client:clients(id, athlete_name)"
      )
      .gte("starts_at", query.from)
      .lte("starts_at", query.to)
      .order("starts_at", { ascending: true });

    if (error) throw error;

    res.json({ bookings: data ?? [] });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Session notes (Phase 4.2) — one row per booking
// ============================================================

const bookingIdParamsSchema = z.object({ bookingId: z.string().uuid() });

const SESSION_NOTE_COLUMNS =
  "id, booking_id, client_id, coach_id, private_notes, client_visible_summary, homework, created_at, updated_at";

/** Returns the session note for a booking, or null if none has been written yet. */
adminRouter.get("/bookings/:bookingId/notes", async (req, res, next) => {
  try {
    const { bookingId } = bookingIdParamsSchema.parse(req.params);

    const { data, error } = await supabaseAdmin
      .from("session_notes")
      .select(SESSION_NOTE_COLUMNS)
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (error) throw error;
    res.json({ note: data ?? null });
  } catch (error) {
    next(error);
  }
});

const notesBodySchema = z
  .object({
    private_notes: z.string().max(5000).nullable(),
    client_visible_summary: z.string().max(5000).nullable(),
    homework: z.string().max(5000).nullable()
  })
  .partial();

/**
 * Upserts the session note for a booking. `session_notes` is unique per
 * booking, so this creates the row on first save and updates it thereafter.
 * `coach_id`/`client_id` are derived from the booking — never trusted from the
 * client — and `created_by` is the acting admin.
 */
adminRouter.put("/bookings/:bookingId/notes", async (req, res, next) => {
  try {
    const { bookingId } = bookingIdParamsSchema.parse(req.params);
    const body = notesBodySchema.parse(req.body);

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id, client_id, coach_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (!booking.client_id) {
      return res.status(409).json({ error: "Booking has no client to attach notes to" });
    }

    const { data, error } = await supabaseAdmin
      .from("session_notes")
      .upsert(
        {
          booking_id: bookingId,
          client_id: booking.client_id,
          coach_id: booking.coach_id,
          private_notes: body.private_notes ?? null,
          client_visible_summary: body.client_visible_summary ?? null,
          homework: body.homework ?? null,
          created_by: req.user!.id
        },
        { onConflict: "booking_id" }
      )
      .select(SESSION_NOTE_COLUMNS)
      .single();

    if (error) throw error;
    res.json({ note: data });
  } catch (error) {
    next(error);
  }
});

/** Deletes the session note for a booking. Idempotent — 204 even if none existed. */
adminRouter.delete("/bookings/:bookingId/notes", async (req, res, next) => {
  try {
    const { bookingId } = bookingIdParamsSchema.parse(req.params);

    const { error } = await supabaseAdmin
      .from("session_notes")
      .delete()
      .eq("booking_id", bookingId);

    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Booking management (Phase 4.3) — cancel / complete / no-show /
// reschedule + manual creation. The booking_audit_logs trigger records
// every status change and reschedule automatically, so these handlers
// just mutate the row and sync Google Calendar.
// ============================================================

const bookingActionParamsSchema = z.object({ id: z.string().uuid() });

// Joined shape we read back for calendar summaries + the response payload.
const BOOKING_DETAIL_SELECT =
  "id, client_id, coach_id, training_type_id, starts_at, ends_at, status, price, notes, other_training_text, google_calendar_event_id, training_type:training_types(name), client:clients(athlete_name)";

type BookingDetailRow = {
  id: string;
  client_id: string | null;
  coach_id: string;
  training_type_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  price: number | string;
  notes: string | null;
  other_training_text: string | null;
  google_calendar_event_id: string | null;
  training_type: { name: string } | null;
  client: { athlete_name: string } | null;
};

/** Postgres exclusion_violation from the bookings overlap constraint. */
function isExclusionViolation(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23P01"
  );
}

/** Calendar event title for a booking — mirrors bookings.ts:buildEventSummary. */
function buildEventSummary(b: BookingDetailRow): string {
  const typeName = b.training_type?.name ?? "Training";
  const clientName = b.client?.athlete_name;
  const base = clientName ? `${typeName} with ${clientName}` : `${typeName} session`;
  if (typeName === "Other" && b.other_training_text) return `${base} (${b.other_training_text})`;
  return base;
}

/** Strips the join fields so the response matches the flat booking shape. */
function toBookingResponse(b: BookingDetailRow) {
  const { training_type: _tt, client: _client, other_training_text: _ott, ...rest } = b;
  return rest;
}

// Statuses that no longer represent a live reservation — acting on them is a no-op error.
const TERMINAL_STATUSES = new Set(["cancelled"]);

const cancelBodySchema = z.object({ reason: z.string().trim().max(500).optional() });

adminRouter.post("/bookings/:id/cancel", async (req, res, next) => {
  try {
    const { id } = bookingActionParamsSchema.parse(req.params);
    const { reason } = cancelBodySchema.parse(req.body ?? {});

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("bookings")
      .select("id, status, coach_id, google_calendar_event_id")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!existing) return res.status(404).json({ error: "Booking not found" });
    if (existing.status === "cancelled") {
      return res.status(409).json({ error: "Booking is already cancelled." });
    }

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason ?? null,
        google_calendar_event_id: null
      })
      .eq("id", id)
      .select(BOOKING_DETAIL_SELECT)
      .single<BookingDetailRow>();

    if (error) throw error;

    // Best-effort: remove the mirrored calendar event. DB stays authoritative.
    if (existing.google_calendar_event_id) {
      await deleteEvent({ coachId: existing.coach_id, eventId: existing.google_calendar_event_id });
    }

    res.json({ booking: toBookingResponse(data) });
  } catch (error) {
    next(error);
  }
});

/** Shared handler for the simple status flips (complete / no-show). */
function statusFlipHandler(target: "completed" | "no_show") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = bookingActionParamsSchema.parse(req.params);

      const { data: existing, error: lookupError } = await supabaseAdmin
        .from("bookings")
        .select("id, status")
        .eq("id", id)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!existing) return res.status(404).json({ error: "Booking not found" });
      if (TERMINAL_STATUSES.has(existing.status)) {
        return res.status(409).json({ error: `Cannot mark a ${existing.status} booking as ${target}.` });
      }

      const { data, error } = await supabaseAdmin
        .from("bookings")
        .update({ status: target })
        .eq("id", id)
        .select(BOOKING_DETAIL_SELECT)
        .single<BookingDetailRow>();

      if (error) throw error;
      res.json({ booking: toBookingResponse(data) });
    } catch (error) {
      next(error);
    }
  };
}

adminRouter.post("/bookings/:id/complete", statusFlipHandler("completed"));
adminRouter.post("/bookings/:id/no-show", statusFlipHandler("no_show"));

const rescheduleBodySchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime()
});

adminRouter.post("/bookings/:id/reschedule", async (req, res, next) => {
  try {
    const { id } = bookingActionParamsSchema.parse(req.params);
    const body = rescheduleBodySchema.parse(req.body);
    if (Date.parse(body.endsAt) <= Date.parse(body.startsAt)) {
      return res.status(400).json({ error: "endsAt must be after startsAt" });
    }

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("bookings")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!existing) return res.status(404).json({ error: "Booking not found" });
    if (TERMINAL_STATUSES.has(existing.status)) {
      return res.status(409).json({ error: `Cannot reschedule a ${existing.status} booking.` });
    }

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({ starts_at: body.startsAt, ends_at: body.endsAt })
      .eq("id", id)
      .select(BOOKING_DETAIL_SELECT)
      .single<BookingDetailRow>();

    if (error) {
      if (isExclusionViolation(error)) {
        return res.status(409).json({ error: "That time conflicts with another booking." });
      }
      throw error;
    }

    // Keep the calendar in step. If the booking never had an event (e.g. it was
    // still a hold), create one now; otherwise patch the existing event.
    if (data.google_calendar_event_id) {
      await updateEvent({
        coachId: data.coach_id,
        eventId: data.google_calendar_event_id,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        summary: buildEventSummary(data),
        description: data.notes
      });
    } else if (data.status === "confirmed") {
      const created = await createEvent({
        coachId: data.coach_id,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        summary: buildEventSummary(data),
        description: data.notes
      });
      if (created) {
        await supabaseAdmin
          .from("bookings")
          .update({ google_calendar_event_id: created.eventId })
          .eq("id", data.id);
      }
    }

    res.json({ booking: toBookingResponse(data) });
  } catch (error) {
    next(error);
  }
});

const manualBookingSchema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  trainingTypeId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  notes: z.string().max(1000).optional()
});

/**
 * Manual booking creation for the coach (walk-ins, phone bookings). Inserts
 * straight to `confirmed` — no hold dance — and mirrors it to the calendar.
 * Admins may book without a linked client and outside availability windows;
 * the overlap constraint is the only hard guard.
 */
adminRouter.post("/bookings", async (req, res, next) => {
  try {
    const body = manualBookingSchema.parse(req.body);
    if (Date.parse(body.endsAt) <= Date.parse(body.startsAt)) {
      return res.status(400).json({ error: "endsAt must be after startsAt" });
    }

    const coachId = await getDefaultCoachId();
    if (!coachId) return res.status(409).json({ error: "No coach profile available" });

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        client_id: body.clientId ?? null,
        coach_id: coachId,
        training_type_id: body.trainingTypeId,
        starts_at: body.startsAt,
        ends_at: body.endsAt,
        notes: body.notes ?? null,
        status: "confirmed",
        created_by: req.user!.id
      })
      .select(BOOKING_DETAIL_SELECT)
      .single<BookingDetailRow>();

    if (error) {
      if (isExclusionViolation(error)) {
        return res.status(409).json({ error: "That time conflicts with another booking." });
      }
      throw error;
    }

    const created = await createEvent({
      coachId: data.coach_id,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      summary: buildEventSummary(data),
      description: data.notes
    });
    if (created) {
      await supabaseAdmin
        .from("bookings")
        .update({ google_calendar_event_id: created.eventId })
        .eq("id", data.id);
    }

    res.status(201).json({ booking: toBookingResponse(data) });
  } catch (error) {
    next(error);
  }
});
