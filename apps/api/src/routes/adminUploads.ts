import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { UPLOAD_BUCKET, UPLOAD_SELECT, withPlaybackUrls, type UploadRow } from "../services/uploads.service.js";
import { transcodeUploadToH264 } from "../services/transcode.service.js";

export const adminUploadsRouter = Router();

adminUploadsRouter.use(authenticate, requireRole(["admin"]));

/**
 * Phase 4.5: the coach's video review queue. Lists client uploads (optionally
 * filtered by status / client), serves single uploads with signed playback
 * URLs, and lets the coach set a status + client-visible summary.
 */

const idParamsSchema = z.object({ id: z.string().uuid() });

const UPLOAD_STATUSES = ["pending_review", "reviewed", "archived"] as const;

const listQuerySchema = z.object({
  status: z.enum(UPLOAD_STATUSES).optional(),
  clientId: z.string().uuid().optional()
});

adminUploadsRouter.get("/", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);

    let q = supabaseAdmin
      .from("client_uploads")
      .select(UPLOAD_SELECT)
      .order("created_at", { ascending: false });

    if (query.status) q = q.eq("status", query.status);
    if (query.clientId) q = q.eq("client_id", query.clientId);

    const { data, error } = await q;
    if (error) throw error;

    const uploads = await withPlaybackUrls((data ?? []) as unknown as UploadRow[]);
    res.json({ uploads });
  } catch (error) {
    next(error);
  }
});

adminUploadsRouter.get("/:id", async (req, res, next) => {
  try {
    const params = idParamsSchema.parse(req.params);

    const { data, error } = await supabaseAdmin
      .from("client_uploads")
      .select(UPLOAD_SELECT)
      .eq("id", params.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Upload not found" });

    const [upload] = await withPlaybackUrls([data as unknown as UploadRow]);
    res.json({ upload });
  } catch (error) {
    next(error);
  }
});

const patchBodySchema = z
  .object({
    status: z.enum(UPLOAD_STATUSES),
    coach_summary: z.string().trim().max(5000).nullable()
  })
  .partial();

adminUploadsRouter.patch("/:id", async (req, res, next) => {
  try {
    const params = idParamsSchema.parse(req.params);
    const body = patchBodySchema.parse(req.body);

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const update: Record<string, unknown> = { ...body };
    // Stamp the review time the first time it lands in `reviewed`; clear it if
    // the coach moves it back to pending so the badge stays honest.
    if (body.status === "reviewed") {
      update.reviewed_at = new Date().toISOString();
    } else if (body.status === "pending_review") {
      update.reviewed_at = null;
    }

    const { data, error } = await supabaseAdmin
      .from("client_uploads")
      .update(update)
      .eq("id", params.id)
      .select(UPLOAD_SELECT)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Upload not found" });

    const [upload] = await withPlaybackUrls([data as unknown as UploadRow]);
    res.json({ upload });
  } catch (error) {
    next(error);
  }
});

/**
 * PROTOTYPE (Phase 7 preview) — transcode an upload to browser-friendly H.264 +
 * faststart in place, for clips that won't play inline (typically HEVC). Gated
 * behind `ENABLE_TRANSCODE`; runs ffmpeg synchronously so the request blocks
 * until it finishes. See `transcode.service.ts`.
 */
adminUploadsRouter.post("/:id/transcode", async (req, res, next) => {
  try {
    const params = idParamsSchema.parse(req.params);

    if (!env.ENABLE_TRANSCODE) {
      return res.status(503).json({
        error: "Transcoding is disabled. Set ENABLE_TRANSCODE=true on the API host to enable this prototype."
      });
    }

    await transcodeUploadToH264(params.id);

    // Return the refreshed upload with a fresh signed playback URL.
    const { data, error } = await supabaseAdmin
      .from("client_uploads")
      .select(UPLOAD_SELECT)
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Upload not found" });

    const [upload] = await withPlaybackUrls([data as unknown as UploadRow]);
    res.json({ upload });
  } catch (error) {
    next(error);
  }
});

/** Removes an upload row + its Storage object. Best-effort on the object. */
adminUploadsRouter.delete("/:id", async (req, res, next) => {
  try {
    const params = idParamsSchema.parse(req.params);

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("client_uploads")
      .select("id, storage_path")
      .eq("id", params.id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!existing) return res.status(404).json({ error: "Upload not found" });

    const { error } = await supabaseAdmin.from("client_uploads").delete().eq("id", params.id);
    if (error) throw error;

    if (existing.storage_path) {
      const { error: storageError } = await supabaseAdmin.storage
        .from(UPLOAD_BUCKET)
        .remove([existing.storage_path]);
      if (storageError) {
        console.warn(`[uploads] failed to remove object ${existing.storage_path}:`, storageError.message);
      }
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
