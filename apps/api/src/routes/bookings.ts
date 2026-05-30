import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { ensureClientForUser } from "../services/clients.service.js";
import { getDefaultCoachId } from "../services/coaches.service.js";
import { createEvent } from "../services/googleCalendar.service.js";
import { sendBookingConfirmation } from "../services/email.service.js";

export const bookingsRouter = Router();

/** How long a fresh hold lives before the lazy sweep can release it. */
const HOLD_MINUTES = 10;

const createBookingSchema = z.object({
  coachId: z.string().uuid().optional(),
  trainingTypeId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  otherTrainingText: z.string().min(1).max(500).optional(),
  notes: z.string().max(1000).optional()
});

const idParamsSchema = z.object({ id: z.string().uuid() });

bookingsRouter.get("/", authenticate, async (req, res, next) => {
  try {
    const query = supabaseAdmin
      .from("bookings")
      .select(
        "id, client_id, training_type_id, starts_at, ends_at, status, hold_expires_at, notes"
      )
      .order("starts_at", { ascending: true });

    if (req.user?.role === "client") {
      query.eq("created_by", req.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ bookings: data });
  } catch (error) {
    next(error);
  }
});

bookingsRouter.post("/", authenticate, requireRole(["client", "admin"]), async (req, res, next) => {
  try {
    const body = createBookingSchema.parse(req.body);

    // Release any zombie holds before we try to reserve this slot. If the sweep ever
    // errors (e.g., function missing) we surface it rather than racing past it.
    const { error: sweepError } = await supabaseAdmin.rpc("expire_stale_holds");
    if (sweepError) throw sweepError;

    const client = await ensureClientForUser(req.user!.id, req.user!.role);
    if (!client && req.user?.role === "client") {
      return res.status(409).json({ error: "Client profile is required before booking" });
    }

    const coachId = body.coachId ?? (await getDefaultCoachId());
    if (!coachId) {
      return res.status(409).json({ error: "Coach profile is required before booking" });
    }

    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        client_id: client?.id ?? null,
        coach_id: coachId,
        training_type_id: body.trainingTypeId,
        starts_at: body.startsAt,
        ends_at: body.endsAt,
        other_training_text: body.otherTrainingText ?? null,
        notes: body.notes ?? null,
        status: "hold",
        hold_expires_at: holdExpiresAt,
        created_by: req.user!.id
      })
      .select(
        "id, client_id, coach_id, training_type_id, starts_at, ends_at, status, hold_expires_at"
      )
      .single();

    if (error) {
      if (isExclusionViolation(error)) {
        return res.status(409).json({ error: "This time is no longer available." });
      }
      throw error;
    }

    res.status(201).json({ booking: data });
  } catch (error) {
    next(error);
  }
});

bookingsRouter.post(
  "/:id/confirm",
  authenticate,
  requireRole(["client", "admin"]),
  async (req, res, next) => {
    try {
      const params = idParamsSchema.parse(req.params);

      const { data: existing, error: lookupError } = await supabaseAdmin
        .from("bookings")
        .select("id, status, hold_expires_at, created_by")
        .eq("id", params.id)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!existing) return res.status(404).json({ error: "Booking not found" });

      // Only the booking creator (or any admin) can confirm a hold.
      if (existing.created_by !== req.user!.id && req.user!.role !== "admin") {
        return res
          .status(403)
          .json({ error: "Cannot confirm a booking you did not create" });
      }

      // Idempotent: confirming an already-confirmed booking is a no-op.
      if (existing.status === "confirmed") {
        return res.json({ booking: existing });
      }

      // Phase 5: a client must have accepted the waiver before locking in a
      // paid session. Admins (manual bookings / walk-ins) are exempt.
      if (req.user!.role === "client") {
        const { data: client, error: waiverError } = await supabaseAdmin
          .from("clients")
          .select("waiver_signed_at")
          .eq("user_id", req.user!.id)
          .maybeSingle();
        if (waiverError) throw waiverError;
        if (!client?.waiver_signed_at) {
          return res.status(409).json({ error: "Please accept the waiver before confirming your booking." });
        }
      }

      if (existing.status !== "hold") {
        return res
          .status(409)
          .json({ error: "Booking is not in a hold state and cannot be confirmed." });
      }

      const expiresAt = existing.hold_expires_at ? Date.parse(existing.hold_expires_at) : null;
      if (expiresAt !== null && expiresAt < Date.now()) {
        return res
          .status(409)
          .json({ error: "Hold expired. Please pick another time." });
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("bookings")
        .update({ status: "confirmed", hold_expires_at: null })
        .eq("id", params.id)
        .eq("status", "hold") // optimistic guard: another writer may have moved on
        .select(
          "id, client_id, coach_id, training_type_id, starts_at, ends_at, status, hold_expires_at, notes, other_training_text, training_type:training_types(name), client:clients(athlete_name)"
        )
        .single<ConfirmedBookingRow>();

      if (updateError) {
        if (isExclusionViolation(updateError)) {
          return res.status(409).json({
            error: "Slot conflict detected at confirmation. Please pick another time."
          });
        }
        throw updateError;
      }

      // Mirror the confirmed booking onto the coach's Google Calendar. Failure
      // is non-fatal — the DB is the source of truth and a calendar outage
      // must not roll back a real reservation. See CLAUDE.md "booking
      // architecture is the load-bearing piece".
      const eventResult = await createEvent({
        coachId: updated.coach_id,
        startsAt: updated.starts_at,
        endsAt: updated.ends_at,
        summary: buildEventSummary(updated),
        description: updated.notes
      });

      if (eventResult) {
        const { error: persistError } = await supabaseAdmin
          .from("bookings")
          .update({ google_calendar_event_id: eventResult.eventId })
          .eq("id", updated.id);
        if (persistError) {
          console.warn(
            `Calendar event ${eventResult.eventId} created but persisting the link on booking ${updated.id} failed.`,
            persistError
          );
        }
      }

      // Email the client their confirmation. Failure-tolerant + awaited so the
      // send attempt completes within the request (serverless-safe); the email
      // service swallows its own errors, so this can never fail the booking.
      await sendBookingConfirmation({
        bookingId: updated.id,
        coachId: updated.coach_id,
        createdBy: existing.created_by,
        clientId: updated.client_id,
        trainingTypeName: updated.training_type?.name ?? null,
        otherTrainingText: updated.other_training_text,
        startsAt: updated.starts_at,
        endsAt: updated.ends_at
      });

      const { training_type: _tt, client: _client, other_training_text: _ott, ...response } = updated;
      res.json({ booking: response });
    } catch (error) {
      next(error);
    }
  }
);

/** Postgres exclusion_violation — our `bookings_active_no_coach_overlap` constraint. */
function isExclusionViolation(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23P01"
  );
}

type ConfirmedBookingRow = {
  id: string;
  client_id: string | null;
  coach_id: string;
  training_type_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  hold_expires_at: string | null;
  notes: string | null;
  other_training_text: string | null;
  training_type: { name: string } | null;
  client: { athlete_name: string } | null;
};

/**
 * Builds the title that appears on the coach's calendar for a confirmed
 * booking. Falls back gracefully when the booking has no linked client (admin
 * walk-in) or no resolvable training type.
 */
function buildEventSummary(booking: ConfirmedBookingRow): string {
  const typeName = booking.training_type?.name ?? "Training";
  const clientName = booking.client?.athlete_name;
  const base = clientName ? `${typeName} with ${clientName}` : `${typeName} session`;
  if (typeName === "Other" && booking.other_training_text) {
    return `${base} (${booking.other_training_text})`;
  }
  return base;
}
