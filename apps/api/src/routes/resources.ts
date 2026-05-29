import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { authenticate } from "../middleware/auth.js";
import {
  RESOURCE_SELECT,
  getBookedSessionTypes,
  isVisibleToClient,
  withSignedUrls,
  type ResourceRow
} from "../services/resources.service.js";

export const resourcesRouter = Router();

resourcesRouter.use(authenticate);

/**
 * Phase 4.4: client-facing resource library. The API runs as service-role
 * (RLS bypassed), so visibility is enforced here in JS — mirroring the
 * `resources_client_read_visible` policy. Admins see everything; clients see
 * `all_clients` plus any `booked_clients` resource they qualify for.
 */

const idParamsSchema = z.object({ id: z.string().uuid() });

/** Admins bypass the per-resource visibility filter. */
function isAdmin(req: { user?: { role?: string } }): boolean {
  return req.user?.role === "admin";
}

resourcesRouter.get("/", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("resources")
      .select(RESOURCE_SELECT)
      .order("created_at", { ascending: false });

    if (error) throw error;
    let rows = (data ?? []) as unknown as ResourceRow[];

    if (!isAdmin(req)) {
      const booked = await getBookedSessionTypes(req.user!.id);
      rows = rows.filter((r) => isVisibleToClient(r, booked));
    }

    const resources = await withSignedUrls(rows);
    res.json({ resources });
  } catch (err) {
    next(err);
  }
});

resourcesRouter.get("/:id", async (req, res, next) => {
  try {
    const params = idParamsSchema.parse(req.params);

    const { data, error } = await supabaseAdmin
      .from("resources")
      .select(RESOURCE_SELECT)
      .eq("id", params.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Resource not found" });

    const row = data as unknown as ResourceRow;

    if (!isAdmin(req)) {
      const booked = await getBookedSessionTypes(req.user!.id);
      if (!isVisibleToClient(row, booked)) {
        // 404 rather than 403 so we don't leak the existence of hidden resources.
        return res.status(404).json({ error: "Resource not found" });
      }
    }

    const [resource] = await withSignedUrls([row]);
    res.json({ resource });
  } catch (err) {
    next(err);
  }
});
