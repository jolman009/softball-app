import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initSentry } from "./lib/sentry.js";
import { resolveFfmpegPath } from "./services/transcode.service.js";

// Initialize error monitoring before anything else so startup errors are caught.
initSentry();

// Surface transcode-prototype readiness at boot so a missing ffmpeg binary
// (ffmpeg-static is an optional dependency) is visible in logs, not just when a
// coach clicks Convert and gets a 500.
if (env.ENABLE_TRANSCODE) {
  console.log(
    `[transcode] ENABLE_TRANSCODE=true; ffmpeg ${resolveFfmpegPath() ? "binary available" : "binary NOT FOUND"}`
  );
}

const app = createApp();

// Prefer the host-injected PORT (Render/Railway/Fly) so the platform's health
// check can reach the server; fall back to API_PORT for local dev.
const port = env.PORT ?? env.API_PORT;

app.listen(port, () => {
  console.log(`On Deck API listening on port ${port}`);
});
