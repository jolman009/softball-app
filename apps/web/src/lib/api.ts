import { env } from "./env";
import { supabase } from "./supabase";

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
