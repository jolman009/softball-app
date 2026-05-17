import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin, type AppRole } from "../lib/supabase.js";

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const {
    data: { user },
    error
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: "Invalid bearer token" });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.role) {
    return res.status(403).json({ error: "Profile role is required" });
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: profile.role as AppRole,
    emailConfirmedAt: user.email_confirmed_at
  };

  return next();
}

export function requireRole(roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    return next();
  };
}
