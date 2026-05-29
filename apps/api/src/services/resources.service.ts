import { supabaseAdmin } from "../lib/supabase.js";

/**
 * Phase 4.4 resource library. The private Storage bucket and the
 * `resources` / `resource_categories` tables ship in the initial schema
 * (`202605060001_initial_schema.sql`). The API uses the service-role key, so
 * RLS is bypassed — visibility for client-facing reads is enforced here in JS
 * (mirrors the `resources_client_read_visible` policy + `is_booked_client`).
 */

export const RESOURCE_BUCKET = "training-resources";

/** Columns selected for every resource read, with category joined. */
export const RESOURCE_SELECT =
  "id, category_id, title, description, skill_level, session_type, resource_type, visibility, storage_path, external_url, body, created_at, updated_at, category:resource_categories(id, name, slug)";

export type ResourceRow = {
  id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  skill_level: string;
  session_type: string | null;
  resource_type: "video" | "pdf" | "image" | "link" | "text";
  visibility: "all_clients" | "booked_clients" | "admin_only";
  storage_path: string | null;
  external_url: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
  category: { id: string; name: string; slug: string } | null;
};

/** How long signed download URLs stay valid (1 hour). */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Attaches a short-lived signed `file_url` to storage-backed resources
 * (video / pdf / image). Link/text resources are returned untouched. Failures
 * to sign degrade to `file_url: null` rather than throwing, so one bad object
 * never takes the whole list down.
 */
export async function withSignedUrls<T extends ResourceRow>(
  rows: T[]
): Promise<(T & { file_url: string | null })[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.storage_path) return { ...row, file_url: null };
      const { data, error } = await supabaseAdmin.storage
        .from(RESOURCE_BUCKET)
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
      if (error) {
        console.warn(`[resources] failed to sign ${row.storage_path}:`, error.message);
        return { ...row, file_url: null };
      }
      return { ...row, file_url: data?.signedUrl ?? null };
    })
  );
}

/**
 * The set of training-type names this user has actually booked (confirmed or
 * completed), plus whether they have any such booking at all. Used to evaluate
 * `booked_clients` visibility: a resource scoped to a `session_type` is only
 * visible to clients who have a matching booking; a resource with no
 * `session_type` is visible to anyone who has booked anything.
 */
export async function getBookedSessionTypes(
  userId: string
): Promise<{ hasAnyBooking: boolean; sessionTypeNames: Set<string> }> {
  const { data: clientRows, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("user_id", userId);
  if (clientError) throw clientError;

  const clientIds = (clientRows ?? []).map((c) => c.id);
  if (clientIds.length === 0) {
    return { hasAnyBooking: false, sessionTypeNames: new Set() };
  }

  const { data: bookings, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("training_type:training_types(name)")
    .in("client_id", clientIds)
    .in("status", ["confirmed", "completed"]);
  if (bookingError) throw bookingError;

  const sessionTypeNames = new Set<string>();
  for (const b of bookings ?? []) {
    const name = (b as unknown as { training_type: { name: string } | null }).training_type?.name;
    if (name) sessionTypeNames.add(name);
  }
  return { hasAnyBooking: (bookings ?? []).length > 0, sessionTypeNames };
}

/** Whether a single resource is visible to a (non-admin) client. */
export function isVisibleToClient(
  row: ResourceRow,
  booked: { hasAnyBooking: boolean; sessionTypeNames: Set<string> }
): boolean {
  switch (row.visibility) {
    case "all_clients":
      return true;
    case "admin_only":
      return false;
    case "booked_clients":
      if (!row.session_type || row.session_type.trim() === "") return booked.hasAnyBooking;
      return booked.sessionTypeNames.has(row.session_type);
    default:
      return false;
  }
}
