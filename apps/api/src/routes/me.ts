import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

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
