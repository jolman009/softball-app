import type { AuthenticatedUser } from "../lib/supabase.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
