import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { ensureClientForUser } from "../services/clients.service.js";
import { deleteEvent } from "../services/googleCalendar.service.js";
import { sendBookingCancellation } from "../services/email.service.js";
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  UPLOAD_BUCKET,
  UPLOAD_SELECT,
  safeObjectName,
  withPlaybackUrls,
  type UploadRow
} from "../services/uploads.service.js";

export const meRouter = Router();

meRouter.use(authenticate);

/**
 * Returns the signed-in user's bookings, split into upcoming and past.
 *
 * Upcoming = `starts_at > now()` AND status in (hold, pending, confirmed, rescheduled).
 * Past     = everything else. Sorted most-recent first, capped at 10.
 *
 * Calls `expire_stale_holds()` first so the response reflects current reality across
 * all signed-in clients — a hold that the API never got around to sweeping otherwise
 * shows up as live on the dashboard.
 */
meRouter.get("/bookings", async (req, res, next) => {
  try {
    const { error: sweepError } = await supabaseAdmin.rpc("expire_stale_holds");
    if (sweepError) throw sweepError;

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, starts_at, ends_at, status, hold_expires_at, notes, training_type:training_types(id, name)"
      )
      .eq("created_by", req.user!.id)
      .order("starts_at", { ascending: true });

    if (error) throw error;

    const rows = data ?? [];
    const now = Date.now();
    const upcomingStatuses = new Set(["hold", "pending", "confirmed", "rescheduled"]);

    const upcoming = rows.filter(
      (row) => Date.parse(row.starts_at) > now && upcomingStatuses.has(row.status)
    );

    const past = rows
      .filter((row) => !upcoming.includes(row))
      .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
      .slice(0, 10);

    res.json({ upcoming, past });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Waiver acceptance (Phase 5) — gates paid bookings
// ============================================================

/**
 * Stamps the signed-in client's waiver acceptance. Idempotent: preserves the
 * original acceptance date if already signed. The booking confirm step enforces
 * that this has happened before a client can lock in a session.
 */
meRouter.post("/waiver", async (req, res, next) => {
  try {
    const client = await ensureClientForUser(req.user!.id, req.user!.role);
    // Only clients carry a waiver; an admin (no client row) is a harmless no-op
    // so the public booking flow never breaks regardless of who's signed in.
    if (!client) {
      return res.json({ waiver_signed_at: null });
    }

    const { data: existing, error: readError } = await supabaseAdmin
      .from("clients")
      .select("waiver_signed_at")
      .eq("id", client.id)
      .maybeSingle();
    if (readError) throw readError;

    if (existing?.waiver_signed_at) {
      return res.json({ waiver_signed_at: existing.waiver_signed_at });
    }

    const signedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("clients")
      .update({ waiver_signed_at: signedAt })
      .eq("id", client.id);
    if (error) throw error;

    res.json({ waiver_signed_at: signedAt });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Client self-service cancellation (Phase 5)
// ============================================================

/**
 * Clients may cancel their own upcoming session, but not within this many hours
 * of the start time — late cancels go through the coach. Admins have no such
 * limit (see admin.ts). Keep in sync with CANCELLATION_CUTOFF_HOURS in
 * apps/web/src/lib/api.ts.
 */
const CANCELLATION_CUTOFF_HOURS = 12;

const CANCELLABLE_STATUSES = new Set(["hold", "pending", "confirmed"]);

const cancelParamsSchema = z.object({ id: z.string().uuid() });
const cancelBodySchema = z.object({ reason: z.string().trim().max(500).optional() });

type CancelBookingRow = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  created_by: string;
  client_id: string | null;
  coach_id: string;
  google_calendar_event_id: string | null;
  other_training_text: string | null;
  training_type: { name: string } | null;
};

meRouter.post("/bookings/:id/cancel", async (req, res, next) => {
  try {
    const { id } = cancelParamsSchema.parse(req.params);
    const { reason } = cancelBodySchema.parse(req.body ?? {});

    const client = await ensureClientForUser(req.user!.id, req.user!.role);

    const { data: booking, error: lookupError } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, status, starts_at, ends_at, created_by, client_id, coach_id, google_calendar_event_id, other_training_text, training_type:training_types(name)"
      )
      .eq("id", id)
      .maybeSingle<CancelBookingRow>();

    if (lookupError) throw lookupError;
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    // Ownership: the booker, or the linked client's user.
    const owns = booking.created_by === req.user!.id || (client != null && booking.client_id === client.id);
    if (!owns) return res.status(403).json({ error: "You can only cancel your own booking." });

    if (!CANCELLABLE_STATUSES.has(booking.status)) {
      return res.status(409).json({ error: `This booking is ${booking.status} and can't be cancelled.` });
    }

    const hoursUntil = (Date.parse(booking.starts_at) - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < CANCELLATION_CUTOFF_HOURS) {
      return res.status(409).json({
        error: `Cancellations within ${CANCELLATION_CUTOFF_HOURS} hours of the session aren't allowed. Please contact your coach.`
      });
    }

    const { error } = await supabaseAdmin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason ?? null,
        google_calendar_event_id: null
      })
      .eq("id", id);

    if (error) throw error;

    // Best-effort calendar cleanup — DB stays authoritative.
    if (booking.google_calendar_event_id) {
      await deleteEvent({ coachId: booking.coach_id, eventId: booking.google_calendar_event_id });
    }

    // Cancellation receipt — skip holds, which were never a real session.
    if (booking.status !== "hold") {
      await sendBookingCancellation(
        {
          bookingId: booking.id,
          coachId: booking.coach_id,
          createdBy: booking.created_by,
          clientId: booking.client_id,
          trainingTypeName: booking.training_type?.name ?? null,
          otherTrainingText: booking.other_training_text,
          startsAt: booking.starts_at,
          endsAt: booking.ends_at
        },
        reason ?? null
      );
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Client video uploads (Phase 4.5) — client -> coach
// ============================================================

const uploadIdParamsSchema = z.object({ id: z.string().uuid() });

const createUploadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  filename: z.string().trim().min(1).max(200),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  bookingId: z.string().uuid().nullable().optional()
});

/**
 * Creates a pending-review upload: mints a signed Storage upload URL (so the
 * video goes browser -> Storage directly, never through Express) and inserts
 * the `client_uploads` row. The browser then PUTs the file to the signed URL.
 * An interrupted upload just leaves a row whose playback URL won't resolve.
 */
meRouter.post("/uploads", async (req, res, next) => {
  try {
    const body = createUploadSchema.parse(req.body);

    const client = await ensureClientForUser(req.user!.id, req.user!.role);
    if (!client) {
      return res.status(409).json({ error: "A client profile is required to upload." });
    }

    // If a booking is attached, make sure it belongs to this client.
    if (body.bookingId) {
      const { data: booking, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .select("id, client_id")
        .eq("id", body.bookingId)
        .maybeSingle();
      if (bookingError) throw bookingError;
      if (!booking || booking.client_id !== client.id) {
        return res.status(400).json({ error: "That lesson isn't one of yours." });
      }
    }

    // Namespace under the user id so the storage RLS prefix rule holds.
    const path = `${req.user!.id}/${Date.now()}-${safeObjectName(body.filename)}`;

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(UPLOAD_BUCKET)
      .createSignedUploadUrl(path);
    if (signError) throw signError;

    const { data, error } = await supabaseAdmin
      .from("client_uploads")
      .insert({
        client_id: client.id,
        booking_id: body.bookingId ?? null,
        storage_path: path,
        title: body.title,
        description: body.description ?? null,
        mime_type: body.mimeType,
        bytes: body.bytes,
        status: "pending_review",
        created_by: req.user!.id
      })
      .select(UPLOAD_SELECT)
      .single<UploadRow>();

    if (error) throw error;

    res.status(201).json({
      upload: data,
      path: signed.path,
      token: signed.token,
      signedUrl: signed.signedUrl
    });
  } catch (error) {
    next(error);
  }
});

/** Lists the signed-in client's uploads, newest first, with signed playback URLs. */
meRouter.get("/uploads", async (req, res, next) => {
  try {
    const client = await ensureClientForUser(req.user!.id, req.user!.role);
    if (!client) return res.json({ uploads: [] });

    const { data, error } = await supabaseAdmin
      .from("client_uploads")
      .select(UPLOAD_SELECT)
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    const uploads = await withPlaybackUrls((data ?? []) as unknown as UploadRow[]);
    res.json({ uploads });
  } catch (error) {
    next(error);
  }
});

/** Single upload owned by the signed-in client. */
meRouter.get("/uploads/:id", async (req, res, next) => {
  try {
    const params = uploadIdParamsSchema.parse(req.params);
    const client = await ensureClientForUser(req.user!.id, req.user!.role);
    if (!client) return res.status(404).json({ error: "Upload not found" });

    const { data, error } = await supabaseAdmin
      .from("client_uploads")
      .select(UPLOAD_SELECT)
      .eq("id", params.id)
      .eq("client_id", client.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Upload not found" });

    const [upload] = await withPlaybackUrls([data as unknown as UploadRow]);
    res.json({ upload });
  } catch (error) {
    next(error);
  }
});
