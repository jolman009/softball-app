import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { ensureClientForUser } from "../services/clients.service.js";
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
