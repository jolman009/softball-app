import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initSentry } from "./lib/sentry.js";

// Initialize error monitoring before anything else so startup errors are caught.
initSentry();

const app = createApp();

app.listen(env.API_PORT, () => {
  console.log(`Softball training API listening on http://localhost:${env.API_PORT}`);
});
