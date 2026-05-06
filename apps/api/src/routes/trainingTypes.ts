import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

export const trainingTypesRouter = Router();

trainingTypesRouter.get("/", async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("training_types")
      .select("id, name, description, default_duration_minutes, hourly_rate")
      .eq("active", true)
      .order("name");

    if (error) throw error;
    res.json({ trainingTypes: data });
  } catch (error) {
    next(error);
  }
});
