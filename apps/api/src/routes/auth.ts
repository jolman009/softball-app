import { Router } from "express";
import { authenticate } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});
