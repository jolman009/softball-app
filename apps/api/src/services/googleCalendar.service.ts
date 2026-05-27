import { env } from "../config/env.js";
import { decryptString, encryptString } from "../lib/crypto.js";
import { supabaseAdmin } from "../lib/supabase.js";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const FREEBUSY_ENDPOINT = "https://www.googleapis.com/calendar/v3/freeBusy";

// Refresh a hair before Google's stated expiry so a concurrent request doesn't
// race the expiration boundary.
const REFRESH_SKEW_MS = 60_000;

// Short cache so a single availability scan (which may iterate many slots in
// quick succession) doesn't hammer Google's FreeBusy endpoint. 30s matches the
// Phase 3.2 plan note in IMPLEMENTATION_PLAN.md.
const FREEBUSY_CACHE_TTL_MS = 30_000;

type CalendarConnectionRow = {
  coach_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string;
  token_expires_at: string | null;
  active: boolean;
};

type FreeBusyInterval = {
  start: number;
  end: number;
};

type FreeBusyResponse = {
  calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
};

const freeBusyCache = new Map<string, { expires: number; intervals: FreeBusyInterval[] }>();

/**
 * Returns the coach's busy intervals between `fromIso` and `toIso` according
 * to their connected Google Calendar. Returns `[]` if the coach hasn't
 * connected, the connection is inactive, or any step of the call fails — the
 * availability engine should degrade gracefully to DB-only rather than refuse
 * to serve slots if Google is having a bad day.
 */
export async function getFreeBusy(
  coachId: string,
  fromIso: string,
  toIso: string
): Promise<FreeBusyInterval[]> {
  const cacheKey = `${coachId}|${fromIso}|${toIso}`;
  const cached = freeBusyCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.intervals;
  }

  try {
    const connection = await loadActiveConnection(coachId);
    if (!connection) return cacheAndReturn(cacheKey, []);

    const accessToken = await ensureFreshAccessToken(connection);
    if (!accessToken) return cacheAndReturn(cacheKey, []);

    const response = await fetch(FREEBUSY_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        timeMin: fromIso,
        timeMax: toIso,
        items: [{ id: "primary" }]
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.warn(`FreeBusy call failed (${response.status}): ${detail}`);
      return cacheAndReturn(cacheKey, []);
    }

    const data = (await response.json()) as FreeBusyResponse;
    const busy = data.calendars?.primary?.busy ?? [];
    const intervals = busy
      .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
      .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start);

    return cacheAndReturn(cacheKey, intervals);
  } catch (err) {
    console.warn("FreeBusy lookup failed; falling back to DB-only availability.", err);
    return cacheAndReturn(cacheKey, []);
  }
}

function cacheAndReturn(key: string, intervals: FreeBusyInterval[]): FreeBusyInterval[] {
  freeBusyCache.set(key, { expires: Date.now() + FREEBUSY_CACHE_TTL_MS, intervals });
  return intervals;
}

async function loadActiveConnection(coachId: string): Promise<CalendarConnectionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("calendar_connections")
    .select("coach_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, active")
    .eq("coach_id", coachId)
    .eq("provider", "google")
    .eq("calendar_id", "primary")
    .maybeSingle();

  if (error) throw error;
  if (!data || !data.active) return null;
  return data as CalendarConnectionRow;
}

/**
 * Returns a usable access token for the connection, refreshing via Google's
 * refresh-token grant if the stored one is missing, expired, or close to it.
 * Persists the refreshed token + new expiry so subsequent calls reuse it.
 */
async function ensureFreshAccessToken(
  connection: CalendarConnectionRow
): Promise<string | null> {
  const expiresAt = connection.token_expires_at
    ? Date.parse(connection.token_expires_at)
    : 0;

  if (
    connection.access_token_encrypted &&
    Number.isFinite(expiresAt) &&
    expiresAt - Date.now() > REFRESH_SKEW_MS
  ) {
    try {
      return decryptString(connection.access_token_encrypted);
    } catch (err) {
      console.warn("Stored access token failed to decrypt; refreshing.", err);
    }
  }

  return refreshAccessToken(connection);
}

export async function refreshAccessToken(
  connection: CalendarConnectionRow
): Promise<string | null> {
  let refreshToken: string;
  try {
    refreshToken = decryptString(connection.refresh_token_encrypted);
  } catch (err) {
    console.warn("Refresh token failed to decrypt; coach must reconnect.", err);
    return null;
  }

  const body = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    const detail = await response.text();
    console.warn(`Refresh-token grant failed (${response.status}): ${detail}`);
    return null;
  }

  const tokens = (await response.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from("calendar_connections")
    .update({
      access_token_encrypted: encryptString(tokens.access_token),
      token_expires_at: tokenExpiresAt
    })
    .eq("coach_id", connection.coach_id)
    .eq("provider", "google")
    .eq("calendar_id", "primary");

  if (error) {
    console.warn("Failed to persist refreshed access token.", error);
  }

  return tokens.access_token;
}
