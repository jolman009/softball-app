import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { adminRouter } from "./routes/admin.js";
import { adminAvailabilityRouter } from "./routes/adminAvailability.js";
import { adminClientsRouter } from "./routes/adminClients.js";
import { adminResourcesRouter } from "./routes/adminResources.js";
import { adminUploadsRouter } from "./routes/adminUploads.js";
import { authRouter } from "./routes/auth.js";
import { availabilityRouter } from "./routes/availability.js";
import { bookingsRouter } from "./routes/bookings.js";
import { calendarRouter } from "./routes/calendar.js";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { resourcesRouter } from "./routes/resources.js";
import { trainingTypesRouter } from "./routes/trainingTypes.js";
import { errorHandler, notFound } from "./middleware/error.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/training-types", trainingTypesRouter);
  app.use("/api/availability", availabilityRouter);
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/calendar", calendarRouter);
  app.use("/api/me", meRouter);
  app.use("/api/resources", resourcesRouter);
  // Mount the admin sub-routers *before* the catch-all admin router so their
  // specific paths (e.g. /api/admin/availability/windows) take precedence.
  app.use("/api/admin/availability", adminAvailabilityRouter);
  app.use("/api/admin/clients", adminClientsRouter);
  app.use("/api/admin/resources", adminResourcesRouter);
  app.use("/api/admin/uploads", adminUploadsRouter);
  app.use("/api/admin", adminRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
