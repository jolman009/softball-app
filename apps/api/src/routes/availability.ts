import { Router } from "express";
import { z } from "zod";
import { computeAvailableSlots } from "../services/availability.service.js";

export const availabilityRouter = Router();

const availabilityQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  trainingTypeId: z.string().uuid().optional()
});

availabilityRouter.get("/", async (req, res, next) => {
  try {
    const query = availabilityQuerySchema.parse(req.query);
    const slots = await computeAvailableSlots(query);
    res.json({ range: query, slots });
  } catch (error) {
    next(error);
  }
});
