import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { supabaseAdmin } from "../lib/supabase.js";
import { UPLOAD_BUCKET } from "./uploads.service.js";

// ffmpeg-static ships a CJS `module.exports = <path string>` but declares an ESM
// `export default`, which NodeNext mis-types on a plain default import. Resolve
// it via createRequire so both the type and the runtime value are correct.
const nodeRequire = createRequire(import.meta.url);
const ffmpegPath = nodeRequire("ffmpeg-static") as string | null;

/**
 * PROTOTYPE (Phase 7 preview) — transcode a client upload to browser-friendly
 * H.264 + faststart, in place.
 *
 * WHY: client clips are often HEVC/H.265 (iPhone "High Efficiency"), which
 * Chrome/Firefox can't decode → a black frame on the review page. H.264 plays
 * everywhere; `+faststart` moves the moov atom to the front for progressive play.
 *
 * SCOPE / LIMITS (deliberate, for a prototype):
 *  - Gated behind `ENABLE_TRANSCODE` and triggered MANUALLY via the admin
 *    endpoint — it is not wired to run automatically on upload.
 *  - Runs ffmpeg synchronously in the API process and buffers the whole file in
 *    memory. Fine for short clips; a 200 MB upload would be slow and memory-heavy
 *    on a small host. Productionizing means moving this off the request path (a
 *    background worker / Storage webhook + queue) and probing to skip clips that
 *    are already H.264. See IMPLEMENTATION_PLAN.md Phase 7.
 */

export type TranscodeResult = {
  storage_path: string;
  bytes: number;
  mime_type: "video/mp4";
};

export async function transcodeUploadToH264(uploadId: string): Promise<TranscodeResult> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary unavailable (ffmpeg-static did not resolve a path).");
  }

  // 1. Resolve the source object path.
  const { data: row, error } = await supabaseAdmin
    .from("client_uploads")
    .select("id, storage_path")
    .eq("id", uploadId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Upload not found");

  // 2. Download the source video.
  const { data: blob, error: dlError } = await supabaseAdmin.storage
    .from(UPLOAD_BUCKET)
    .download(row.storage_path);
  if (dlError || !blob) throw dlError ?? new Error("Failed to download the source video.");

  const workdir = await mkdtemp(join(tmpdir(), "sb-transcode-"));
  const inputPath = join(workdir, "input");
  const outputPath = join(workdir, "output.mp4");
  try {
    await writeFile(inputPath, Buffer.from(await blob.arrayBuffer()));

    // 3. Transcode → H.264 (8-bit yuv420p so 10-bit HEVC downconverts to a
    //    broadly decodable profile) + AAC audio + faststart.
    await runFfmpeg(ffmpegPath, [
      "-y",
      "-i", inputPath,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outputPath
    ]);

    // 4. Re-upload in place (same storage_path, so existing rows/links resolve).
    const output = await readFile(outputPath);
    const { error: upError } = await supabaseAdmin.storage
      .from(UPLOAD_BUCKET)
      .upload(row.storage_path, output, { contentType: "video/mp4", upsert: true });
    if (upError) throw upError;

    // 5. Reflect the new format/size on the row.
    const { error: updateError } = await supabaseAdmin
      .from("client_uploads")
      .update({ mime_type: "video/mp4", bytes: output.byteLength })
      .eq("id", uploadId);
    if (updateError) throw updateError;

    return { storage_path: row.storage_path, bytes: output.byteLength, mime_type: "video/mp4" };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

/** Runs ffmpeg, resolving on exit code 0 and rejecting with the stderr tail otherwise. */
function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      // Keep only the tail — ffmpeg is chatty and the useful error is at the end.
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
    });
  });
}
