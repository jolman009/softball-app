import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

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
