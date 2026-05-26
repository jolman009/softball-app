import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole(["admin"]));

adminRouter.get("/overview", async (_req, res, next) => {
  try {
    const [{ count: bookingCount, error: bookingsError }, { count: clientCount, error: clientsError }] =
      await Promise.all([
        supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("clients").select("id", { count: "exact", head: true })
      ]);

    if (bookingsError) throw bookingsError;
    if (clientsError) throw clientsError;

    res.json({
      bookingCount,
      clientCount
    });
  } catch (error) {
    next(error);
  }
});

const bookingsQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime()
});

/**
 * Lists every booking in the [from, to] window, with training type + client joined.
 * The dashboard fetches a wide window (start of month → ~60 days out) and groups in JS.
 */
adminRouter.get("/bookings", async (req, res, next) => {
  try {
    const query = bookingsQuerySchema.parse(req.query);

    // Sweep stale holds so the coach doesn't see zombies in their schedule.
    const { error: sweepError } = await supabaseAdmin.rpc("expire_stale_holds");
    if (sweepError) throw sweepError;

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, starts_at, ends_at, status, price, hold_expires_at, notes, training_type:training_types(id, name), client:clients(id, athlete_name)"
      )
      .gte("starts_at", query.from)
      .lte("starts_at", query.to)
      .order("starts_at", { ascending: true });

    if (error) throw error;

    res.json({ bookings: data ?? [] });
  } catch (error) {
    next(error);
  }
});
