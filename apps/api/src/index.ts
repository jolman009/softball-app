import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initSentry } from "./lib/sentry.js";

// Initialize error monitoring before anything else so startup errors are caught.
initSentry();

const app = createApp();

// Prefer the host-injected PORT (Render/Railway/Fly) so the platform's health
// check can reach the server; fall back to API_PORT for local dev.
const port = env.PORT ?? env.API_PORT;

app.listen(port, () => {
  console.log(`Softball training API listening on port ${port}`);
});
