import { env } from "./env";
import { supabase } from "./supabase";

export const RESOURCE_BUCKET = "training-resources";
export const UPLOAD_BUCKET = "client-uploads";

export type TrainingType = {
  id: string;
  name: string;
  description: string | null;
  default_duration_minutes: number;
  hourly_rate: number;
};

export type AvailabilitySlot = {
  starts_at: string;
  ends_at: string;
};

export type AvailabilityResponse = {
  range: { from: string; to: string; trainingTypeId?: string };
  slots: AvailabilitySlot[];
};

export type BookingStatus =
  | "hold"
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show"
  | "rescheduled";

export type Booking = {
  id: string;
  client_id: string | null;
  coach_id: string;
  training_type_id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  hold_expires_at?: string | null;
};

export type CreateBookingInput = {
  trainingTypeId: string;
  startsAt: string;
  endsAt: string;
  otherTrainingText?: string;
  notes?: string;
};

/** Error thrown by the API client. Carries the HTTP status and the server-supplied message. */
export class ApiError extends Error {
  readonly status: number;
  readonly issues?: unknown;

  constructor(status: number, message: string, issues?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
  }
}

type FetchOptions = RequestInit & { auth?: boolean };

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { auth = false, headers, body, ...rest } = options;
  const requestHeaders = new Headers(headers);

  if (body !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (auth) {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new ApiError(401, "You must be signed in.");
    }

    requestHeaders.set("Authorization", `Bearer ${session.access_token}`);
  }

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...rest,
    headers: requestHeaders,
    body
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : null) ?? `Request failed with status ${response.status}`;
    const issues =
      payload && typeof payload === "object" && "issues" in payload ? payload.issues : undefined;
    throw new ApiError(response.status, message, issues);
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function fetchTrainingTypes(): Promise<TrainingType[]> {
  const data = await apiFetch<{ trainingTypes: TrainingType[] }>("/training-types");
  return data.trainingTypes;
}

export type AvailabilityQuery = {
  from: string;
  to: string;
  trainingTypeId?: string;
};

export async function fetchAvailability(query: AvailabilityQuery): Promise<AvailabilitySlot[]> {
  const params = new URLSearchParams({ from: query.from, to: query.to });
  if (query.trainingTypeId) {
    params.set("trainingTypeId", query.trainingTypeId);
  }

  const data = await apiFetch<AvailabilityResponse>(`/availability?${params.toString()}`);
  return data.slots ?? [];
}

/**
 * Creates a short-lived hold for the requested slot. The hold blocks competing reservations
 * via the gist exclusion constraint and auto-expires after a few minutes if not confirmed.
 */
export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const data = await apiFetch<{ booking: Booking }>("/bookings", {
    method: "POST",
    auth: true,
    body: JSON.stringify({
      trainingTypeId: input.trainingTypeId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      otherTrainingText: input.otherTrainingText,
      notes: input.notes
    })
  });

  return data.booking;
}

/** Promotes a hold to `confirmed`. Idempotent for already-confirmed bookings. */
export async function confirmBooking(bookingId: string): Promise<Booking> {
  const data = await apiFetch<{ booking: Booking }>(`/bookings/${bookingId}/confirm`, {
    method: "POST",
    auth: true
  });

  return data.booking;
}

export type BookingSummary = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  hold_expires_at: string | null;
  notes: string | null;
  training_type: { id: string; name: string } | null;
};

export type MyBookingsResponse = {
  upcoming: BookingSummary[];
  past: BookingSummary[];
};

/** Fetches the signed-in user's bookings, grouped into upcoming and past. */
export async function fetchMyBookings(): Promise<MyBookingsResponse> {
  return apiFetch<MyBookingsResponse>("/me/bookings", { auth: true });
}

/**
 * Clients can't cancel within this many hours of the start — late cancels go
 * through the coach. Keep in sync with CANCELLATION_CUTOFF_HOURS in
 * apps/api/src/routes/me.ts.
 */
export const CANCELLATION_CUTOFF_HOURS = 12;

/** Cancels the signed-in client's own booking (subject to the 12h cutoff, enforced server-side). */
export async function cancelMyBooking(id: string, reason?: string): Promise<void> {
  await apiFetch<void>(`/me/bookings/${id}/cancel`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ reason: reason?.trim() || undefined })
  });
}

/** Records the signed-in client's waiver acceptance (idempotent). */
export async function acceptWaiver(): Promise<{ waiver_signed_at: string }> {
  return apiFetch<{ waiver_signed_at: string }>("/me/waiver", { method: "POST", auth: true });
}

export type AdminBookingRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  /** Postgres numeric — Supabase returns it as a string. Coerce with Number() when summing. */
  price: number | string;
  hold_expires_at: string | null;
  notes: string | null;
  training_type: { id: string; name: string } | null;
  client: { id: string; athlete_name: string } | null;
};

export type AdminBookingsResponse = {
  bookings: AdminBookingRow[];
};

/** Lists every booking with `starts_at` in [from, to]. Admin-only. */
export async function fetchAdminBookings(range: { from: string; to: string }): Promise<AdminBookingRow[]> {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  const data = await apiFetch<AdminBookingsResponse>(`/admin/bookings?${params.toString()}`, { auth: true });
  return data.bookings;
}

export type CalendarStatus =
  | { connected: false }
  | {
      connected: true;
      calendarName: string | null;
      connectedAt: string;
      lastSyncedAt: string | null;
      tokenExpiringSoon: boolean;
    };

/** Returns the signed-in coach's Google Calendar connection status. Admin-only. */
export async function fetchCalendarStatus(): Promise<CalendarStatus> {
  return apiFetch<CalendarStatus>("/calendar/status", { auth: true });
}

/**
 * Starts the Google Calendar OAuth flow. The API returns the Google auth URL
 * (we can't just `<a href>` to the API endpoint because the API needs the
 * bearer token to identify the coach). Caller does the actual navigation.
 */
export async function startCalendarConnect(): Promise<string> {
  const data = await apiFetch<{ authUrl: string }>("/calendar/connect/google", { auth: true });
  return data.authUrl;
}

/** Soft-disconnects (flips `active` to false). Admin-only. */
export async function disconnectCalendar(): Promise<void> {
  await apiFetch<void>("/calendar/disconnect", { method: "POST", auth: true });
}

// ============================================================
// Admin: availability management (Phase 4.1)
// ============================================================

export type AvailabilityWindow = {
  id: string;
  day_of_week: number;
  /** "HH:MM:SS" as Postgres returns it. */
  start_time: string;
  end_time: string;
  timezone: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type AvailabilityWindowInput = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone?: string;
  active?: boolean;
};

export async function fetchAvailabilityWindows(): Promise<AvailabilityWindow[]> {
  const data = await apiFetch<{ windows: AvailabilityWindow[] }>("/admin/availability/windows", {
    auth: true
  });
  return data.windows;
}

export async function createAvailabilityWindow(input: AvailabilityWindowInput): Promise<AvailabilityWindow> {
  const data = await apiFetch<{ window: AvailabilityWindow }>("/admin/availability/windows", {
    method: "POST",
    auth: true,
    body: JSON.stringify(input)
  });
  return data.window;
}

export async function updateAvailabilityWindow(
  id: string,
  patch: Partial<AvailabilityWindowInput>
): Promise<AvailabilityWindow> {
  const data = await apiFetch<{ window: AvailabilityWindow }>(`/admin/availability/windows/${id}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(patch)
  });
  return data.window;
}

export async function deleteAvailabilityWindow(id: string): Promise<void> {
  await apiFetch<void>(`/admin/availability/windows/${id}`, { method: "DELETE", auth: true });
}

export type AvailabilityExceptionType = "blocked" | "special_opening";

export type AvailabilityException = {
  id: string;
  starts_at: string;
  ends_at: string;
  exception_type: AvailabilityExceptionType;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

export type AvailabilityExceptionInput = {
  starts_at: string;
  ends_at: string;
  exception_type: AvailabilityExceptionType;
  reason?: string | null;
};

export async function fetchAvailabilityExceptions(range?: {
  from?: string;
  to?: string;
}): Promise<AvailabilityException[]> {
  const params = new URLSearchParams();
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const data = await apiFetch<{ exceptions: AvailabilityException[] }>(
    `/admin/availability/exceptions${suffix}`,
    { auth: true }
  );
  return data.exceptions;
}

export async function createAvailabilityException(
  input: AvailabilityExceptionInput
): Promise<AvailabilityException> {
  const data = await apiFetch<{ exception: AvailabilityException }>(
    "/admin/availability/exceptions",
    {
      method: "POST",
      auth: true,
      body: JSON.stringify(input)
    }
  );
  return data.exception;
}

export async function deleteAvailabilityException(id: string): Promise<void> {
  await apiFetch<void>(`/admin/availability/exceptions/${id}`, { method: "DELETE", auth: true });
}

export type CoachSettings = {
  buffer_minutes: number;
  min_notice_hours: number;
  max_booking_days: number;
  updated_at: string;
};

export type CoachSettingsInput = Partial<Pick<CoachSettings, "buffer_minutes" | "min_notice_hours" | "max_booking_days">>;

export async function fetchCoachSettings(): Promise<CoachSettings> {
  const data = await apiFetch<{ settings: CoachSettings }>("/admin/availability/settings", {
    auth: true
  });
  return data.settings;
}

export async function updateCoachSettings(patch: CoachSettingsInput): Promise<CoachSettings> {
  const data = await apiFetch<{ settings: CoachSettings }>("/admin/availability/settings", {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(patch)
  });
  return data.settings;
}

// ============================================================
// Admin: clients & session notes (Phase 4.2)
// ============================================================

export type SkillLevel = "beginner" | "intermediate" | "advanced";

export type ClientProfileLink = {
  id: string;
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
} | null;

export type AdminClientListItem = {
  id: string;
  athlete_name: string;
  athlete_age: number | null;
  skill_level: SkillLevel | null;
  primary_position: string | null;
  guardian_name: string | null;
  waiver_signed_at: string | null;
  created_at: string;
  profile: ClientProfileLink;
  session_count: number;
};

export type AdminClientProfile = {
  id: string;
  user_id: string;
  athlete_name: string;
  athlete_age: number | null;
  skill_level: SkillLevel | null;
  primary_position: string | null;
  guardian_name: string | null;
  guardian_email: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  waiver_signed_at: string | null;
  media_consent_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  profile: ClientProfileLink;
};

export type AdminClientBooking = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  price: number | string;
  notes: string | null;
  training_type: { id: string; name: string } | null;
  /** Embedded one-to-one (unique per booking); null means no note yet. */
  session_note: { id: string } | null;
};

export type AdminClientDetail = {
  client: AdminClientProfile;
  bookings: AdminClientBooking[];
};

export type AdminClientPatch = Partial<{
  athlete_name: string;
  athlete_age: number | null;
  skill_level: SkillLevel | null;
  primary_position: string | null;
  guardian_name: string | null;
  guardian_email: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  waiver_signed: boolean;
  media_consent: boolean;
}>;

export async function fetchAdminClients(query?: {
  search?: string;
  skillLevel?: SkillLevel;
}): Promise<AdminClientListItem[]> {
  const params = new URLSearchParams();
  if (query?.search) params.set("search", query.search);
  if (query?.skillLevel) params.set("skillLevel", query.skillLevel);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const data = await apiFetch<{ clients: AdminClientListItem[] }>(`/admin/clients${suffix}`, {
    auth: true
  });
  return data.clients;
}

export async function fetchAdminClient(id: string): Promise<AdminClientDetail> {
  return apiFetch<AdminClientDetail>(`/admin/clients/${id}`, { auth: true });
}

export async function updateAdminClient(id: string, patch: AdminClientPatch): Promise<AdminClientProfile> {
  const data = await apiFetch<{ client: AdminClientProfile }>(`/admin/clients/${id}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(patch)
  });
  return data.client;
}

export type SessionNote = {
  id: string;
  booking_id: string;
  client_id: string;
  coach_id: string;
  private_notes: string | null;
  client_visible_summary: string | null;
  homework: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionNoteInput = {
  private_notes: string | null;
  client_visible_summary: string | null;
  homework: string | null;
};

export async function fetchSessionNote(bookingId: string): Promise<SessionNote | null> {
  const data = await apiFetch<{ note: SessionNote | null }>(`/admin/bookings/${bookingId}/notes`, {
    auth: true
  });
  return data.note;
}

export async function saveSessionNote(bookingId: string, input: SessionNoteInput): Promise<SessionNote> {
  const data = await apiFetch<{ note: SessionNote }>(`/admin/bookings/${bookingId}/notes`, {
    method: "PUT",
    auth: true,
    body: JSON.stringify(input)
  });
  return data.note;
}

/** Deletes the session note for a booking. Idempotent. */
export async function deleteSessionNote(bookingId: string): Promise<void> {
  await apiFetch<void>(`/admin/bookings/${bookingId}/notes`, { method: "DELETE", auth: true });
}

// ============================================================
// Admin: bookings management (Phase 4.3)
// ============================================================

/** Cancels a booking; removes the mirrored calendar event. */
export async function cancelBooking(id: string, reason?: string): Promise<void> {
  await apiFetch<void>(`/admin/bookings/${id}/cancel`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ reason: reason?.trim() || undefined })
  });
}

/** Marks a booking completed. */
export async function completeBooking(id: string): Promise<void> {
  await apiFetch<void>(`/admin/bookings/${id}/complete`, { method: "POST", auth: true });
}

/** Marks a booking as a no-show. */
export async function markNoShow(id: string): Promise<void> {
  await apiFetch<void>(`/admin/bookings/${id}/no-show`, { method: "POST", auth: true });
}

/** Moves a booking to a new time; re-syncs the calendar event. */
export async function rescheduleBooking(
  id: string,
  range: { startsAt: string; endsAt: string }
): Promise<void> {
  await apiFetch<void>(`/admin/bookings/${id}/reschedule`, {
    method: "POST",
    auth: true,
    body: JSON.stringify(range)
  });
}

export type ManualBookingInput = {
  clientId?: string | null;
  trainingTypeId: string;
  startsAt: string;
  endsAt: string;
  notes?: string;
};

/** Creates a confirmed booking directly (coach walk-in / phone booking). */
export async function createManualBooking(input: ManualBookingInput): Promise<void> {
  await apiFetch<void>("/admin/bookings", {
    method: "POST",
    auth: true,
    body: JSON.stringify(input)
  });
}

// ============================================================
// Resource library (Phase 4.4)
// ============================================================

export type ResourceType = "video" | "pdf" | "image" | "link" | "text";
export type ResourceVisibility = "all_clients" | "booked_clients" | "admin_only";
export type ResourceSkillLevel = SkillLevel | "all";

export type ResourceCategory = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  sort_order?: number;
  active?: boolean;
};

export type Resource = {
  id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  skill_level: ResourceSkillLevel;
  session_type: string | null;
  resource_type: ResourceType;
  visibility: ResourceVisibility;
  storage_path: string | null;
  external_url: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
  category: { id: string; name: string; slug: string } | null;
  /** Short-lived signed URL for storage-backed resources; null otherwise. */
  file_url: string | null;
};

export type ResourceCreateInput = {
  title: string;
  description?: string | null;
  category_id?: string | null;
  skill_level?: ResourceSkillLevel;
  session_type?: string | null;
  visibility?: ResourceVisibility;
  resource_type: ResourceType;
  storage_path?: string | null;
  external_url?: string | null;
  body?: string | null;
};

export type ResourcePatch = Partial<{
  title: string;
  description: string | null;
  category_id: string | null;
  skill_level: ResourceSkillLevel;
  session_type: string | null;
  visibility: ResourceVisibility;
  external_url: string | null;
  body: string | null;
}>;

// --- Admin ---

export async function fetchResourceCategories(): Promise<ResourceCategory[]> {
  const data = await apiFetch<{ categories: ResourceCategory[] }>("/admin/resources/categories", {
    auth: true
  });
  return data.categories;
}

export async function fetchAdminResources(): Promise<Resource[]> {
  const data = await apiFetch<{ resources: Resource[] }>("/admin/resources", { auth: true });
  return data.resources;
}

/**
 * Uploads a file to the private resources bucket. The API mints a signed upload
 * URL (so the bytes go browser → Storage directly, not through Express) and we
 * push the file to it. Returns the `storage_path` to attach when creating the row.
 */
export async function uploadResourceFile(file: File): Promise<string> {
  const { path, token } = await apiFetch<{ path: string; token: string; signedUrl: string }>(
    "/admin/resources/upload-url",
    {
      method: "POST",
      auth: true,
      body: JSON.stringify({ filename: file.name, contentType: file.type || undefined })
    }
  );

  const { error } = await supabase.storage
    .from(RESOURCE_BUCKET)
    .uploadToSignedUrl(path, token, file, { contentType: file.type || undefined });

  if (error) {
    throw new ApiError(502, `Upload failed: ${error.message}`);
  }

  return path;
}

export async function createResource(input: ResourceCreateInput): Promise<Resource> {
  const data = await apiFetch<{ resource: Resource }>("/admin/resources", {
    method: "POST",
    auth: true,
    body: JSON.stringify(input)
  });
  return data.resource;
}

export async function updateResource(id: string, patch: ResourcePatch): Promise<Resource> {
  const data = await apiFetch<{ resource: Resource }>(`/admin/resources/${id}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(patch)
  });
  return data.resource;
}

export async function deleteResource(id: string): Promise<void> {
  await apiFetch<void>(`/admin/resources/${id}`, { method: "DELETE", auth: true });
}

// --- Client (and admin) read views ---

export async function fetchResources(): Promise<Resource[]> {
  const data = await apiFetch<{ resources: Resource[] }>("/resources", { auth: true });
  return data.resources;
}

export async function fetchResource(id: string): Promise<Resource> {
  const data = await apiFetch<{ resource: Resource }>(`/resources/${id}`, { auth: true });
  return data.resource;
}

// ============================================================
// Client video uploads (Phase 4.5)
// ============================================================

export type UploadStatus = "pending_review" | "reviewed" | "archived";

/** Accepted video MIME types — must match the API/bucket allowlist. */
export const UPLOAD_ALLOWED_MIME = ["video/mp4", "video/quicktime"] as const;
/** ~200 MB ceiling — matches the API/bucket limit. */
export const UPLOAD_MAX_BYTES = 200 * 1024 * 1024;

export type ClientUpload = {
  id: string;
  client_id: string;
  booking_id: string | null;
  storage_path: string;
  title: string;
  description: string | null;
  mime_type: string;
  bytes: number;
  status: UploadStatus;
  coach_summary: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  booking: { id: string; starts_at: string; training_type: { name: string } | null } | null;
  client: { id: string; athlete_name: string } | null;
  /** Short-lived signed playback URL; null if the object isn't readable. */
  playback_url: string | null;
};

export type CreateUploadInput = {
  title: string;
  description?: string | null;
  bookingId?: string | null;
};

/**
 * Uploads a client video. The API inserts a pending-review row and mints a
 * signed Storage upload URL; the browser then pushes the file straight to
 * Storage (never through Express). Returns the created upload row.
 */
export async function createUpload(file: File, input: CreateUploadInput): Promise<ClientUpload> {
  const { upload, path, token } = await apiFetch<{
    upload: ClientUpload;
    path: string;
    token: string;
    signedUrl: string;
  }>("/me/uploads", {
    method: "POST",
    auth: true,
    body: JSON.stringify({
      title: input.title,
      description: input.description ?? null,
      filename: file.name,
      mimeType: file.type,
      bytes: file.size,
      bookingId: input.bookingId ?? null
    })
  });

  const { error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .uploadToSignedUrl(path, token, file, { contentType: file.type || undefined });

  if (error) {
    throw new ApiError(502, `Upload failed: ${error.message}`);
  }

  return upload;
}

export async function fetchMyUploads(): Promise<ClientUpload[]> {
  const data = await apiFetch<{ uploads: ClientUpload[] }>("/me/uploads", { auth: true });
  return data.uploads;
}

export async function fetchMyUpload(id: string): Promise<ClientUpload> {
  const data = await apiFetch<{ upload: ClientUpload }>(`/me/uploads/${id}`, { auth: true });
  return data.upload;
}

// --- Admin review queue ---

export async function fetchAdminUploads(query?: {
  status?: UploadStatus;
  clientId?: string;
}): Promise<ClientUpload[]> {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  if (query?.clientId) params.set("clientId", query.clientId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const data = await apiFetch<{ uploads: ClientUpload[] }>(`/admin/uploads${suffix}`, { auth: true });
  return data.uploads;
}

export async function fetchAdminUpload(
  id: string
): Promise<{ upload: ClientUpload; transcodeEnabled: boolean }> {
  const data = await apiFetch<{ upload: ClientUpload; transcodeEnabled?: boolean }>(
    `/admin/uploads/${id}`,
    { auth: true }
  );
  return { upload: data.upload, transcodeEnabled: data.transcodeEnabled ?? false };
}

/**
 * PROTOTYPE (Phase 7): transcode an upload to browser-friendly H.264 + faststart
 * in place. Only available when the API has ENABLE_TRANSCODE set (else 503).
 * Synchronous on the server, so this request can take a while for longer clips.
 */
export async function transcodeAdminUpload(id: string): Promise<ClientUpload> {
  const data = await apiFetch<{ upload: ClientUpload }>(`/admin/uploads/${id}/transcode`, {
    method: "POST",
    auth: true
  });
  return data.upload;
}

export type UploadReviewPatch = Partial<{
  status: UploadStatus;
  coach_summary: string | null;
}>;

export async function updateAdminUpload(id: string, patch: UploadReviewPatch): Promise<ClientUpload> {
  const data = await apiFetch<{ upload: ClientUpload }>(`/admin/uploads/${id}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(patch)
  });
  return data.upload;
}

export async function deleteAdminUpload(id: string): Promise<void> {
  await apiFetch<void>(`/admin/uploads/${id}`, { method: "DELETE", auth: true });
}

// ============================================================
// Admin: booking audit log (Phase 5)
// ============================================================

export type AuditAction =
  | "created"
  | "confirmed"
  | "cancelled"
  | "rescheduled"
  | "completed"
  | "no_show"
  | "updated"
  | "calendar_synced";

export type AuditLogRow = {
  id: string;
  booking_id: string;
  action: AuditAction;
  previous_status: BookingStatus | null;
  new_status: BookingStatus | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: { id: string; first_name: string | null; last_name: string | null; email: string } | null;
  booking: {
    id: string;
    starts_at: string;
    training_type: { name: string } | null;
    client: { id: string; athlete_name: string } | null;
  } | null;
};

export async function fetchAuditLogs(query?: {
  action?: AuditAction;
  limit?: number;
  offset?: number;
}): Promise<AuditLogRow[]> {
  const params = new URLSearchParams();
  if (query?.action) params.set("action", query.action);
  if (query?.limit != null) params.set("limit", String(query.limit));
  if (query?.offset != null) params.set("offset", String(query.offset));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const data = await apiFetch<{ logs: AuditLogRow[] }>(`/admin/audit-logs${suffix}`, { auth: true });
  return data.logs;
}
