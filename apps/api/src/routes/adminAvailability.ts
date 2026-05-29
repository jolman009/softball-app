import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { getDefaultCoachId } from "../services/coaches.service.js";

export const adminAvailabilityRouter = Router();

adminAvailabilityRouter.use(authenticate, requireRole(["admin"]));

/**
 * Phase 4.1: admin CRUD for availability windows, exceptions, and coach_settings.
 *
 * All endpoints operate on the *default coach* — which is currently "the earliest
 * admin profile" (see `getDefaultCoachId`). When multi-coach support lands, the
 * coach_id will move out of the resolver and into the path. Until then, every
 * admin shares one set of rows, which matches the booking engine's behavior.
 */

const idParamsSchema = z.object({ id: z.string().uuid() });

// ---------- helpers ----------

async function resolveCoachId(): Promise<string | null> {
  return getDefaultCoachId();
}

/** Postgres exclusion / range constraint violations bubble up here. */
function isConstraintViolation(error: unknown): error is { code: string; message?: string } {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: string }).code;
  return code === "23P01" || code === "23514" || code === "23505";
}

// ============================================================
// Availability windows (weekly recurring schedule)
// ============================================================

const windowBodySchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "start_time must be HH:MM"),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "end_time must be HH:MM"),
  timezone: z.string().min(1).max(64).default("America/Chicago"),
  active: z.boolean().default(true)
});

const windowPatchSchema = windowBodySchema.partial();

adminAvailabilityRouter.get("/windows", async (_req, res, next) => {
  try {
    const coachId = await resolveCoachId();
    if (!coachId) return res.json({ windows: [] });

    const { data, error } = await supabaseAdmin
      .from("availability_windows")
      .select("id, day_of_week, start_time, end_time, timezone, active, created_at, updated_at")
      .eq("coach_id", coachId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) throw error;
    res.json({ windows: data ?? [] });
  } catch (err) {
    next(err);
  }
});

adminAvailabilityRouter.post("/windows", async (req, res, next) => {
  try {
    const body = windowBodySchema.parse(req.body);
    if (body.end_time <= body.start_time) {
      return res.status(400).json({ error: "end_time must be after start_time" });
    }

    const coachId = await resolveCoachId();
    if (!coachId) return res.status(409).json({ error: "No coach profile available" });

    const { data, error } = await supabaseAdmin
      .from("availability_windows")
      .insert({
        coach_id: coachId,
        day_of_week: body.day_of_week,
        start_time: body.start_time,
        end_time: body.end_time,
        timezone: body.timezone,
        active: body.active
      })
      .select("id, day_of_week, start_time, end_time, timezone, active, created_at, updated_at")
      .single();

    if (error) {
      if (isConstraintViolation(error)) {
        return res.status(400).json({ error: error.message ?? "Invalid window" });
      }
      throw error;
    }

    res.status(201).json({ window: data });
  } catch (err) {
    next(err);
  }
});

adminAvailabilityRouter.patch("/windows/:id", async (req, res, next) => {
  try {
    const params = idParamsSchema.parse(req.params);
    const body = windowPatchSchema.parse(req.body);

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    if (body.start_time != null && body.end_time != null && body.end_time <= body.start_time) {
      return res.status(400).json({ error: "end_time must be after start_time" });
    }

    const coachId = await resolveCoachId();
    if (!coachId) return res.status(404).json({ error: "Window not found" });

    const { data, error } = await supabaseAdmin
      .from("availability_windows")
      .update(body)
      .eq("id", params.id)
      .eq("coach_id", coachId)
      .select("id, day_of_week, start_time, end_time, timezone, active, created_at, updated_at")
      .maybeSingle();

    if (error) {
      if (isConstraintViolation(error)) {
        return res.status(400).json({ error: error.message ?? "Invalid update" });
      }
      throw error;
    }
    if (!data) return res.status(404).json({ error: "Window not found" });

    res.json({ window: data });
  } catch (err) {
    next(err);
  }
});

adminAvailabilityRouter.delete("/windows/:id", async (req, res, next) => {
  try {
    const params = idParamsSchema.parse(req.params);
    const coachId = await resolveCoachId();
    if (!coachId) return res.status(404).json({ error: "Window not found" });

    const { error, count } = await supabaseAdmin
      .from("availability_windows")
      .delete({ count: "exact" })
      .eq("id", params.id)
      .eq("coach_id", coachId);

    if (error) throw error;
    if (!count) return res.status(404).json({ error: "Window not found" });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Availability exceptions (blocked / special_opening)
// ============================================================

const exceptionBodySchema = z.object({
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  exception_type: z.enum(["blocked", "special_opening"]),
  reason: z.string().max(500).nullable().optional()
});

const exceptionPatchSchema = exceptionBodySchema.partial();

const exceptionQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

adminAvailabilityRouter.get("/exceptions", async (req, res, next) => {
  try {
    const query = exceptionQuerySchema.parse(req.query);
    const coachId = await resolveCoachId();
    if (!coachId) return res.json({ exceptions: [] });

    let q = supabaseAdmin
      .from("availability_exceptions")
      .select("id, starts_at, ends_at, exception_type, reason, created_at, updated_at")
      .eq("coach_id", coachId)
      .order("starts_at", { ascending: true });

    // Overlap test, matching the engine in availability.service.ts.
    if (query.to) q = q.lt("starts_at", query.to);
    if (query.from) q = q.gt("ends_at", query.from);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ exceptions: data ?? [] });
  } catch (err) {
    next(err);
  }
});

adminAvailabilityRouter.post("/exceptions", async (req, res, next) => {
  try {
    const body = exceptionBodySchema.parse(req.body);
    if (Date.parse(body.ends_at) <= Date.parse(body.starts_at)) {
      return res.status(400).json({ error: "ends_at must be after starts_at" });
    }

    const coachId = await resolveCoachId();
    if (!coachId) return res.status(409).json({ error: "No coach profile available" });

    const { data, error } = await supabaseAdmin
      .from("availability_exceptions")
      .insert({
        coach_id: coachId,
        starts_at: body.starts_at,
        ends_at: body.ends_at,
        exception_type: body.exception_type,
        reason: body.reason ?? null
      })
      .select("id, starts_at, ends_at, exception_type, reason, created_at, updated_at")
      .single();

    if (error) {
      if (isConstraintViolation(error)) {
        return res.status(400).json({ error: error.message ?? "Invalid exception" });
      }
      throw error;
    }

    res.status(201).json({ exception: data });
  } catch (err) {
    next(err);
  }
});

adminAvailabilityRouter.patch("/exceptions/:id", async (req, res, next) => {
  try {
    const params = idParamsSchema.parse(req.params);
    const body = exceptionPatchSchema.parse(req.body);

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    if (body.starts_at != null && body.ends_at != null && Date.parse(body.ends_at) <= Date.parse(body.starts_at)) {
      return res.status(400).json({ error: "ends_at must be after starts_at" });
    }

    const coachId = await resolveCoachId();
    if (!coachId) return res.status(404).json({ error: "Exception not found" });

    const { data, error } = await supabaseAdmin
      .from("availability_exceptions")
      .update(body)
      .eq("id", params.id)
      .eq("coach_id", coachId)
      .select("id, starts_at, ends_at, exception_type, reason, created_at, updated_at")
      .maybeSingle();

    if (error) {
      if (isConstraintViolation(error)) {
        return res.status(400).json({ error: error.message ?? "Invalid update" });
      }
      throw error;
    }
    if (!data) return res.status(404).json({ error: "Exception not found" });

    res.json({ exception: data });
  } catch (err) {
    next(err);
  }
});

adminAvailabilityRouter.delete("/exceptions/:id", async (req, res, next) => {
  try {
    const params = idParamsSchema.parse(req.params);
    const coachId = await resolveCoachId();
    if (!coachId) return res.status(404).json({ error: "Exception not found" });

    const { error, count } = await supabaseAdmin
      .from("availability_exceptions")
      .delete({ count: "exact" })
      .eq("id", params.id)
      .eq("coach_id", coachId);

    if (error) throw error;
    if (!count) return res.status(404).json({ error: "Exception not found" });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Coach settings (buffer / min-notice / max-window)
// ============================================================

const settingsPatchSchema = z.object({
  buffer_minutes: z.number().int().min(0).max(240).optional(),
  min_notice_hours: z.number().int().min(0).max(720).optional(),
  max_booking_days: z.number().int().min(1).max(365).optional()
});

const SETTINGS_COLUMNS =
  "buffer_minutes, min_notice_hours, max_booking_days, updated_at";

adminAvailabilityRouter.get("/settings", async (_req, res, next) => {
  try {
    const coachId = await resolveCoachId();
    if (!coachId) return res.status(409).json({ error: "No coach profile available" });

    const settings = await readOrSeedSettings(coachId);
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

adminAvailabilityRouter.patch("/settings", async (req, res, next) => {
  try {
    const body = settingsPatchSchema.parse(req.body);
    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const coachId = await resolveCoachId();
    if (!coachId) return res.status(409).json({ error: "No coach profile available" });

    // Ensure a row exists before patching — first edit on a coach who never had
    // a seed row should still succeed (defaults come from the table's CHECK).
    await readOrSeedSettings(coachId);

    const { data, error } = await supabaseAdmin
      .from("coach_settings")
      .update(body)
      .eq("coach_id", coachId)
      .select(SETTINGS_COLUMNS)
      .single();

    if (error) {
      if (isConstraintViolation(error)) {
        return res.status(400).json({ error: error.message ?? "Invalid setting value" });
      }
      throw error;
    }

    res.json({ settings: data });
  } catch (err) {
    next(err);
  }
});

async function readOrSeedSettings(coachId: string) {
  const { data, error } = await supabaseAdmin
    .from("coach_settings")
    .select(SETTINGS_COLUMNS)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: seeded, error: insertError } = await supabaseAdmin
    .from("coach_settings")
    .insert({ coach_id: coachId })
    .select(SETTINGS_COLUMNS)
    .single();

  if (insertError) throw insertError;
  return seeded;
}
