import { Router } from "express";
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
