import { env } from "../config/env.js";
import { signState } from "../lib/crypto.js";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const PRIMARY_CALENDAR_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary";

// Single broad scope: read calendar (for FreeBusy) and read/write events on
// the coach's calendar. Both are needed for Phase 3.2 + 3.3.
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events"
];

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: "Bearer";
  id_token?: string;
};

/**
 * Builds the URL we send the coach to so Google can prompt them for consent.
 *
 * `access_type=offline` + `prompt=consent` guarantees we receive a
 * `refresh_token` even when the user has already authorized the app once
 * before — without that, the second authorize call returns only an access
 * token and we'd silently lose offline access.
 */
export function buildAuthUrl(coachId: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: signState(coachId)
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
    grant_type: "authorization_code"
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

/**
 * Looks up the primary calendar's display name so the admin UI can show
 * something more concrete than "Connected to Google Calendar."
 */
export async function fetchPrimaryCalendarName(accessToken: string): Promise<string | null> {
  const response = await fetch(PRIMARY_CALENDAR_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { summary?: string };
  return data.summary ?? null;
}
