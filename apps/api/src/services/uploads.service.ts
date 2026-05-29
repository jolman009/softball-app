import { supabaseAdmin } from "../lib/supabase.js";

/**
 * Phase 4.5 client video review. Mirrors the Phase 4.4 resource-library
 * plumbing (signed upload + signed playback URLs) but for the client -> coach
 * direction, against the private `client-uploads` bucket.
 */

export const UPLOAD_BUCKET = "client-uploads";

/** Accepted video MIME types — enforced here AND on the bucket. */
export const ALLOWED_MIME_TYPES = ["video/mp4", "video/quicktime"] as const;

/** ~200 MB ceiling — matches the bucket's `file_size_limit`. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/** Columns selected for every upload read, with booking + client context joined. */
export const UPLOAD_SELECT =
  "id, client_id, booking_id, storage_path, title, description, mime_type, bytes, status, coach_summary, reviewed_at, created_at, updated_at, " +
  "booking:bookings(id, starts_at, training_type:training_types(name)), " +
  "client:clients(id, athlete_name)";

export type UploadRow = {
  id: string;
  client_id: string;
  booking_id: string | null;
  storage_path: string;
  title: string;
  description: string | null;
  mime_type: string;
  bytes: number;
  status: "pending_review" | "reviewed" | "archived";
  coach_summary: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  booking: { id: string; starts_at: string; training_type: { name: string } | null } | null;
  client: { id: string; athlete_name: string } | null;
};

/** How long signed playback URLs stay valid (2 hours — videos take a while to watch). */
const PLAYBACK_TTL_SECONDS = 2 * 60 * 60;

/** Turns a title/filename into a Storage-safe slug, preserving the extension. */
export function safeObjectName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const base = (dot > 0 ? filename.slice(0, dot) : filename)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const stem = base || "video";
  return ext ? `${stem}.${ext}` : stem;
}

/**
 * Attaches a short-lived signed `playback_url` to each upload. A sign failure
 * (e.g. the object never finished uploading) degrades to `playback_url: null`
 * rather than throwing, so one bad row never takes the whole list down.
 */
export async function withPlaybackUrls<T extends { storage_path: string }>(
  rows: T[]
): Promise<(T & { playback_url: string | null })[]> {
  return Promise.all(
    rows.map(async (row) => {
      const { data, error } = await supabaseAdmin.storage
        .from(UPLOAD_BUCKET)
        .createSignedUrl(row.storage_path, PLAYBACK_TTL_SECONDS);
      if (error) {
        console.warn(`[uploads] failed to sign ${row.storage_path}:`, error.message);
        return { ...row, playback_url: null };
      }
      return { ...row, playback_url: data?.signedUrl ?? null };
    })
  );
}
