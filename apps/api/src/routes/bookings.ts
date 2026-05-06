import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

export const bookingsRouter = Router();

const createBookingSchema = z.object({
  trainingTypeId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  notes: z.string().max(1000).optional()
});

bookingsRouter.get("/", authenticate, async (req, res, next) => {
  try {
    const query = supabaseAdmin
      .from("bookings")
      .select("id, client_id, training_type_id, starts_at, ends_at, status, notes")
      .order("starts_at", { ascending: true });

    if (req.user?.role === "client") {
      query.eq("created_by", req.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ bookings: data });
  } catch (error) {
    next(error);
  }
});

bookingsRouter.post("/", authenticate, requireRole(["client", "admin"]), async (req, res, next) => {
  try {
    const body = createBookingSchema.parse(req.body);

    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", req.user!.id)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client && req.user?.role === "client") {
      return res.status(409).json({ error: "Client profile is required before booking" });
    }

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        client_id: client?.id ?? null,
        training_type_id: body.trainingTypeId,
        starts_at: body.startsAt,
        ends_at: body.endsAt,
        notes: body.notes ?? null,
        status: "pending",
        created_by: req.user!.id
      })
      .select("id, client_id, training_type_id, starts_at, ends_at, status")
      .single();

    if (error) throw error;

    res.status(201).json({ booking: data });
  } catch (error) {
    next(error);
  }
});
