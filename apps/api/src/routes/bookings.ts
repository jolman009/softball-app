import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { getDefaultCoachId } from "../services/coaches.service.js";

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

    const client = await ensureClientForBooker(req.user!.id, req.user!.role);
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
          "id, client_id, coach_id, training_type_id, starts_at, ends_at, status, hold_expires_at"
        )
        .single();

      if (updateError) {
        if (isExclusionViolation(updateError)) {
          return res.status(409).json({
            error: "Slot conflict detected at confirmation. Please pick another time."
          });
        }
        throw updateError;
      }

      res.json({ booking: updated });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Returns the booker's `clients` row, creating one on demand when the booker has
 * `role='client'` but no row exists yet. This self-heals the common case where a
 * user signs up with email confirmations on (so the web-side `ensureClientRecord`
 * never runs), confirms out-of-band, then signs in and immediately tries to book.
 *
 * Admins are allowed to book without a linked `clients` row (e.g. manual bookings
 * for walk-ins), so we return null for them and let the caller decide.
 */
async function ensureClientForBooker(
  userId: string,
  role: string
): Promise<{ id: string } | null> {
  const { data: existing, error: readError } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;
  if (role !== "client") return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;

  const athleteName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || "Athlete";

  const { data: created, error: insertError } = await supabaseAdmin
    .from("clients")
    .insert({ user_id: userId, athlete_name: athleteName })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created;
}

/** Postgres exclusion_violation — our `bookings_active_no_coach_overlap` constraint. */
function isExclusionViolation(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23P01"
  );
}
