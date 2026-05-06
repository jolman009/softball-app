import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";

export const availabilityRouter = Router();

const availabilityQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  trainingTypeId: z.string().uuid().optional()
});

availabilityRouter.get("/", async (req, res, next) => {
  try {
    const query = availabilityQuerySchema.parse(req.query);

    const { data: windows, error } = await supabaseAdmin
      .from("availability_windows")
      .select("id, day_of_week, start_time, end_time, timezone")
      .eq("active", true)
      .order("day_of_week");

    if (error) throw error;

    res.json({
      range: query,
      availabilityWindows: windows,
      slots: []
    });
  } catch (error) {
    next(error);
  }
});
