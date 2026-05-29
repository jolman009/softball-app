import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const adminClientsRouter = Router();

adminClientsRouter.use(authenticate, requireRole(["admin"]));

/**
 * Phase 4.2: admin CRUD over clients (athlete profiles) and their booking
 * history. Session notes are booking-scoped and live under /api/admin/bookings
 * (see admin.ts) so they stay next to the bookings they annotate.
 */

const idParamsSchema = z.object({ id: z.string().uuid() });

const SKILL_LEVELS = ["beginner", "intermediate", "advanced"] as const;

// On-schedule statuses count toward a client's "sessions" tally; cancelled and
// no-show are excluded so the list reflects real activity.
const ACTIVE_BOOKING_STATUSES = ["hold", "pending", "confirmed", "completed", "rescheduled"] as const;

// ============================================================
// Client list
// ============================================================

const listQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  skillLevel: z.enum(SKILL_LEVELS).optional()
});

adminClientsRouter.get("/", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);

    let q = supabaseAdmin
      .from("clients")
      .select(
        "id, athlete_name, athlete_age, skill_level, primary_position, guardian_name, waiver_signed_at, created_at, profile:profiles!clients_user_id_fkey(id, email, phone, first_name, last_name)"
      )
      .order("athlete_name", { ascending: true });

    if (query.skillLevel) q = q.eq("skill_level", query.skillLevel);

    if (query.search) {
      // Match athlete or guardian name. Commas/parens would break the `or`
      // filter grammar, so strip them from the term.
      const term = query.search.replace(/[,()]/g, " ").trim();
      if (term) q = q.or(`athlete_name.ilike.%${term}%,guardian_name.ilike.%${term}%`);
    }

    const { data, error } = await q;
    if (error) throw error;

    const clients = data ?? [];

    // Attach a session count per client in one grouped pass rather than N
    // round-trips. Empty list → skip the query entirely.
    const counts = new Map<string, number>();
    if (clients.length > 0) {
      const { data: bookingRows, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .select("client_id")
        .in(
          "client_id",
          clients.map((c) => c.id)
        )
        .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[]);

      if (bookingError) throw bookingError;
      for (const row of bookingRows ?? []) {
        if (row.client_id) counts.set(row.client_id, (counts.get(row.client_id) ?? 0) + 1);
      }
    }

    res.json({
      clients: clients.map((c) => ({ ...c, session_count: counts.get(c.id) ?? 0 }))
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Client profile (details + booking history)
// ============================================================

adminClientsRouter.get("/:id", async (req, res, next) => {
  try {
    const params = idParamsSchema.parse(req.params);

    const { data: client, error } = await supabaseAdmin
      .from("clients")
      .select(
        "id, user_id, athlete_name, athlete_age, skill_level, primary_position, guardian_name, guardian_email, emergency_contact_name, emergency_contact_phone, waiver_signed_at, media_consent_at, notes, created_at, updated_at, profile:profiles!clients_user_id_fkey(id, email, phone, first_name, last_name)"
      )
      .eq("id", params.id)
      .maybeSingle();

    if (error) throw error;
    if (!client) return res.status(404).json({ error: "Client not found" });

    const { data: bookings, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, starts_at, ends_at, status, price, notes, training_type:training_types(id, name), session_note:session_notes(id)"
      )
      .eq("client_id", params.id)
      .order("starts_at", { ascending: false });

    if (bookingError) throw bookingError;

    res.json({ client, bookings: bookings ?? [] });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Update client profile
// ============================================================

const patchBodySchema = z
  .object({
    athlete_name: z.string().trim().min(1).max(120),
    athlete_age: z.number().int().min(4).max(100).nullable(),
    skill_level: z.enum(SKILL_LEVELS).nullable(),
    primary_position: z.string().trim().max(60).nullable(),
    guardian_name: z.string().trim().max(120).nullable(),
    guardian_email: z.string().trim().email().max(160).nullable(),
    emergency_contact_name: z.string().trim().max(120).nullable(),
    emergency_contact_phone: z.string().trim().max(40).nullable(),
    notes: z.string().trim().max(2000).nullable(),
    // Waiver / media-consent are surfaced as booleans in the UI; we translate
    // true → now() and false → null so the timestamp columns stay meaningful.
    waiver_signed: z.boolean(),
    media_consent: z.boolean()
  })
  .partial();

adminClientsRouter.patch("/:id", async (req, res, next) => {
  try {
    const params = idParamsSchema.parse(req.params);
    const body = patchBodySchema.parse(req.body);

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const { waiver_signed, media_consent, ...rest } = body;
    const update: Record<string, unknown> = { ...rest };

    if (waiver_signed !== undefined) {
      update.waiver_signed_at = waiver_signed ? new Date().toISOString() : null;
    }
    if (media_consent !== undefined) {
      update.media_consent_at = media_consent ? new Date().toISOString() : null;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const { data, error } = await supabaseAdmin
      .from("clients")
      .update(update)
      .eq("id", params.id)
      .select(
        "id, user_id, athlete_name, athlete_age, skill_level, primary_position, guardian_name, guardian_email, emergency_contact_name, emergency_contact_phone, waiver_signed_at, media_consent_at, notes, created_at, updated_at, profile:profiles!clients_user_id_fkey(id, email, phone, first_name, last_name)"
      )
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Client not found" });

    res.json({ client: data });
  } catch (err) {
    next(err);
  }
});
