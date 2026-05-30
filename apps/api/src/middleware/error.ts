import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { captureException } from "../lib/sentry.js";

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      issues: error.flatten()
    });
  }

  // Genuine server faults (not client validation) go to Sentry when configured.
  captureException(error);
  console.error(error);
  return res.status(500).json({ error: "Internal server error" });
}
