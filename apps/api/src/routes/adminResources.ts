import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { getDefaultCoachId } from "../services/coaches.service.js";
import {
  RESOURCE_BUCKET,
  RESOURCE_SELECT,
  withSignedUrls,
  type ResourceRow
} from "../services/resources.service.js";

export const adminResourcesRouter = Router();

adminResourcesRouter.use(authenticate, requireRole(["admin"]));

/**
 * Phase 4.4: admin CRUD over the resource library. Files (video/pdf/image) live
 * in the private `training-resources` Storage bucket — the browser uploads
 * straight to Storage via a signed upload URL minted here (so large videos never
 * stream through Express), then POSTs the resulting `storage_path` back to create
 * the row. Link/text resources carry their payload inline.
 */

const idParamsSchema = z.object({ id: z.string().uuid() });

const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "all"] as const;
const VISIBILITIES = ["all_clients", "booked_clients", "admin_only"] as const;
const FILE_TYPES = ["video", "pdf", "image"] as const;

// ============================================================
// Categories
// ============================================================

adminResourcesRouter.get("/categories", async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("resource_categories")
      .select("id, name, slug, description, sort_order, active")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;
    res.json({ categories: data ?? [] });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// List resources (admin sees everything)
// ============================================================

adminResourcesRouter.get("/", async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("resources")
      .select(RESOURCE_SELECT)
      .order("created_at", { ascending: false });

    if (error) throw error;
    const resources = await withSignedUrls((data ?? []) as unknown as ResourceRow[]);
    res.json({ resources });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Signed upload URL (browser → Storage direct)
// ============================================================

const uploadUrlSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().max(120).optional()
});

/** Sanitizes a filename to a Storage-safe slug, preserving the extension. */
function safeObjectName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const base = (dot > 0 ? filename.slice(0, dot) : filename)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const stem = base || "file";
  return ext ? `${stem}.${ext}` : stem;
}

adminResourcesRouter.post("/upload-url", async (req, res, next) => {
  try {
    const body = uploadUrlSchema.parse(req.body);

    const coachId = await getDefaultCoachId();
    if (!coachId) return res.status(409).json({ error: "No coach profile available" });

    // Namespace under the coach id; prefix with a timestamp for uniqueness.
    const path = `${coachId}/${Date.now()}-${safeObjectName(body.filename)}`;

    const { data, error } = await supabaseAdmin.storage
      .from(RESOURCE_BUCKET)
      .createSignedUploadUrl(path);

    if (error) throw error;
    res.json({ path: data.path, token: data.token, signedUrl: data.signedUrl });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Create resource
// ============================================================

const createBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    skill_level: z.enum(SKILL_LEVELS).optional(),
    session_type: z.string().trim().max(120).nullable().optional(),
    visibility: z.enum(VISIBILITIES).optional(),
    resource_type: z.enum(["video", "pdf", "image", "link", "text"]),
    storage_path: z.string().trim().max(400).nullable().optional(),
    external_url: z.string().trim().url().max(2000).nullable().optional(),
    body: z.string().trim().max(20000).nullable().optional()
  })
  // Mirror the DB check constraint so we return a friendly 400 instead of a
  // raw 23514 from Postgres.
  .refine(
    (v) =>
      (FILE_TYPES.includes(v.resource_type as (typeof FILE_TYPES)[number]) && !!v.storage_path) ||
      (v.resource_type === "link" && !!v.external_url) ||
      (v.resource_type === "text" && !!v.body),
    {
      message:
        "video/pdf/image require an uploaded file, link requires a URL, text requires body content."
    }
  );

adminResourcesRouter.post("/", async (req, res, next) => {
  try {
    const body = createBodySchema.parse(req.body);

    const { data, error } = await supabaseAdmin
      .from("resources")
      .insert({
        title: body.title,
        description: body.description ?? null,
        category_id: body.category_id ?? null,
        skill_level: body.skill_level ?? "all",
        session_type: body.session_type ?? null,
        visibility: body.visibility ?? "all_clients",
        resource_type: body.resource_type,
        storage_path: body.storage_path ?? null,
        external_url: body.external_url ?? null,
        body: body.body ?? null,
        created_by: req.user!.id
      })
      .select(RESOURCE_SELECT)
      .single<ResourceRow>();

    if (error) throw error;
    const [resource] = await withSignedUrls([data]);
    res.status(201).json({ resource });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Update resource (metadata only — file replacement = delete + re-create)
// ============================================================

const patchBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable(),
    category_id: z.string().uuid().nullable(),
    skill_level: z.enum(SKILL_LEVELS),
    session_type: z.string().trim().max(120).nullable(),
    visibility: z.enum(VISIBILITIES),
    external_url: z.string().trim().url().max(2000).nullable(),
    body: z.string().trim().max(20000).nullable()
  })
  .partial();

adminResourcesRouter.patch("/:id", async (req, res, next) => {
  try {
    const params = idParamsSchema.parse(req.params);
    const body = patchBodySchema.parse(req.body);

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const { data, error } = await supabaseAdmin
      .from("resources")
      .update(body)
      .eq("id", params.id)
      .select(RESOURCE_SELECT)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Resource not found" });

    const [resource] = await withSignedUrls([data as unknown as ResourceRow]);
    res.json({ resource });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Delete resource (+ remove the Storage object if any)
// ============================================================

adminResourcesRouter.delete("/:id", async (req, res, next) => {
  try {
    const params = idParamsSchema.parse(req.params);

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("resources")
      .select("id, storage_path")
      .eq("id", params.id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!existing) return res.status(404).json({ error: "Resource not found" });

    const { error } = await supabaseAdmin.from("resources").delete().eq("id", params.id);
    if (error) throw error;

    // Best-effort cleanup of the underlying object — the row is already gone, so
    // a Storage hiccup just leaves an orphan blob rather than failing the call.
    if (existing.storage_path) {
      const { error: storageError } = await supabaseAdmin.storage
        .from(RESOURCE_BUCKET)
        .remove([existing.storage_path]);
      if (storageError) {
        console.warn(`[resources] failed to remove object ${existing.storage_path}:`, storageError.message);
      }
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
