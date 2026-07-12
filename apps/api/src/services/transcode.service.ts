import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { supabaseAdmin } from "../lib/supabase.js";
import { UPLOAD_BUCKET } from "./uploads.service.js";

const nodeRequire = createRequire(import.meta.url);

/**
 * Resolves the ffmpeg binary path lazily. `ffmpeg-static` is an OPTIONAL
 * dependency (its install downloads a binary that could fail), and it also
 * ships a CJS `module.exports = <path>` under an ESM `export default` that
 * NodeNext mis-types on a plain import — so we require it here, on demand, and
 * return null if it isn't installed. This keeps the API booting normally even
 * when ffmpeg is absent; only the (disabled-by-default) transcode path cares.
 */
export function resolveFfmpegPath(): string | null {
  try {
    return nodeRequire("ffmpeg-static") as string | null;
  } catch {
    return null;
  }
}

/** Builds the H.264 output object path from the source path (keeps the user prefix). */
function h264Path(sourcePath: string): string {
  const slash = sourcePath.lastIndexOf("/");
  const dir = slash >= 0 ? sourcePath.slice(0, slash + 1) : "";
  const name = slash >= 0 ? sourcePath.slice(slash + 1) : sourcePath;
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name).replace(/-h264$/, "");
  return `${dir}${stem}-h264.mp4`;
}

/**
 * PROTOTYPE (Phase 7 preview) — transcode a client upload to browser-friendly
 * H.264 + faststart, writing the result to a NEW storage path.
 *
 * WHY: client clips are often HEVC/H.265 (iPhone "High Efficiency"), which
 * Chrome/Firefox can't decode → a black frame on the review page. H.264 plays
 * everywhere; `+faststart` moves the moov atom to the front for progressive play.
 *
 * SCOPE / LIMITS (deliberate, for a prototype):
 *  - Gated behind `ENABLE_TRANSCODE` and triggered MANUALLY via the admin
 *    endpoint — it is not wired to run automatically on upload.
 *  - Streams the source to disk (not into memory) and downscales + single-threads
 *    the encode to stay within a small host's RAM (a 512 MB box OOM-killed the
 *    process when decoding a 10-bit 2336x1080 HEVC frame at full res). Still runs
 *    ffmpeg synchronously in the request; productionizing means moving it off the
 *    request path (a background worker / Storage webhook + queue) and probing to
 *    skip clips already in H.264. See IMPLEMENTATION_PLAN.md Phase 7.
 */

export type TranscodeResult = {
  storage_path: string;
  bytes: number;
  mime_type: "video/mp4";
};

export async function transcodeUploadToH264(uploadId: string): Promise<TranscodeResult> {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary unavailable (optional dependency ffmpeg-static is not installed).");
  }

  // 1. Resolve the source object path.
  const { data: row, error } = await supabaseAdmin
    .from("client_uploads")
    .select("id, storage_path")
    .eq("id", uploadId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Upload not found");

  // 2. Stream the source object to disk (a signed URL + streamed fetch, NOT
  //    supabase .download() which buffers the whole Blob in memory — that OOMs a
  //    small host on large uploads).
  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from(UPLOAD_BUCKET)
    .createSignedUrl(row.storage_path, 300);
  if (signError || !signed?.signedUrl) throw signError ?? new Error("Failed to sign the source video.");

  const workdir = await mkdtemp(join(tmpdir(), "sb-transcode-"));
  const inputPath = join(workdir, "input");
  const outputPath = join(workdir, "output.mp4");
  try {
    const resp = await fetch(signed.signedUrl);
    if (!resp.ok || !resp.body) throw new Error(`Failed to download the source video (${resp.status}).`);
    await pipeline(Readable.fromWeb(resp.body as import("node:stream/web").ReadableStream), createWriteStream(inputPath));

    // 3. Transcode → H.264 (8-bit yuv420p so 10-bit HEVC downconverts to a broadly
    //    decodable profile) + AAC + faststart. Downscale to fit within 1280x1280
    //    and pin to one thread to keep ffmpeg's memory footprint small enough for
    //    a 512 MB host (full-res 10-bit decode + libx264 was OOM-killing it).
    await runFfmpeg(ffmpegPath, [
      "-y",
      "-i", inputPath,
      "-vf", "scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-threads", "1",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outputPath
    ]);

    // 4. Upload to a NEW path (never overwrite in place). Overwriting the same
    //    object lets Supabase's path-keyed CDN keep serving the old (HEVC) bytes
    //    even under a fresh signed-URL token; a new path guarantees a new cache
    //    key. Short cacheControl as belt-and-suspenders.
    const output = await readFile(outputPath);
    const newPath = h264Path(row.storage_path);
    const { error: upError } = await supabaseAdmin.storage
      .from(UPLOAD_BUCKET)
      .upload(newPath, output, { contentType: "video/mp4", cacheControl: "60", upsert: true });
    if (upError) throw upError;

    // 5. Repoint the row at the new object + reflect the new format/size.
    const { error: updateError } = await supabaseAdmin
      .from("client_uploads")
      .update({ storage_path: newPath, mime_type: "video/mp4", bytes: output.byteLength })
      .eq("id", uploadId);
    if (updateError) throw updateError;

    // 6. Best-effort: remove the original object now that the row points at the
    //    new one (skip if the source somehow already used the target path).
    if (row.storage_path !== newPath) {
      const { error: removeError } = await supabaseAdmin.storage
        .from(UPLOAD_BUCKET)
        .remove([row.storage_path]);
      if (removeError) {
        console.warn(`[transcode] failed to remove old object ${row.storage_path}:`, removeError.message);
      }
    }

    return { storage_path: newPath, bytes: output.byteLength, mime_type: "video/mp4" };
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
