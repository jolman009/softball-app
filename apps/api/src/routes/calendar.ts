import { Router } from "express";
import { env } from "../config/env.js";
import { encryptString, verifyState } from "../lib/crypto.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  buildAuthUrl,
  exchangeCode,
  fetchPrimaryCalendarName
} from "../services/googleOAuth.service.js";

export const calendarRouter = Router();

/**
 * Step 1 of OAuth: the admin clicks "Connect" in the web app, which calls
 * this endpoint and gets back the URL to navigate to. We don't redirect
 * directly because the web app needs an auth header to identify the coach,
 * and `<a>` navigations can't carry one.
 */
calendarRouter.get(
  "/connect/google",
  authenticate,
  requireRole(["admin"]),
  (req, res) => {
    res.json({ authUrl: buildAuthUrl(req.user!.id) });
  }
);

/**
 * Step 2 of OAuth: Google redirects the browser here with `code` and
 * `state`. State is HMAC-signed against the coach's id so an attacker
 * cannot swap in their own id and have Google's response attach the
 * coach's calendar to the attacker's row.
 *
 * On success we redirect to /admin?calendar=connected; on failure to
 * /admin?calendar=error so the dashboard can render a banner.
 */
calendarRouter.get("/google/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const error = typeof req.query.error === "string" ? req.query.error : null;

  if (error) {
    return res.redirect(`${env.WEB_ORIGIN}/admin?calendar=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${env.WEB_ORIGIN}/admin?calendar=error&reason=missing_params`);
  }

  let coachId: string;
  try {
    coachId = verifyState(state).sub;
  } catch {
    return res.redirect(`${env.WEB_ORIGIN}/admin?calendar=error&reason=invalid_state`);
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      // Without a refresh token we can't keep the connection alive past
      // the access-token expiry. `prompt=consent` should guarantee one,
      // but bail loudly if Google ever doesn't return it.
      return res.redirect(`${env.WEB_ORIGIN}/admin?calendar=error&reason=no_refresh_token`);
    }

    const calendarName = await fetchPrimaryCalendarName(tokens.access_token);
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: upsertError } = await supabaseAdmin
      .from("calendar_connections")
      .upsert(
        {
          coach_id: coachId,
          provider: "google",
          calendar_id: "primary",
          calendar_name: calendarName,
          access_token_encrypted: encryptString(tokens.access_token),
          refresh_token_encrypted: encryptString(tokens.refresh_token),
          token_expires_at: tokenExpiresAt,
          connected_at: new Date().toISOString(),
          active: true
        },
        { onConflict: "coach_id,provider,calendar_id" }
      );

    if (upsertError) {
      console.error("calendar upsert failed", upsertError);
      return res.redirect(`${env.WEB_ORIGIN}/admin?calendar=error&reason=storage`);
    }

    return res.redirect(`${env.WEB_ORIGIN}/admin?calendar=connected`);
  } catch (err) {
    console.error("calendar callback failed", err);
    return res.redirect(`${env.WEB_ORIGIN}/admin?calendar=error&reason=exchange`);
  }
});

/**
 * Cheap status check for the admin dashboard. Returns the row's display
 * fields plus a boolean for "token expiring soon" so the UI can prompt a
 * reconnect before Google starts rejecting the refresh.
 */
calendarRouter.get(
  "/status",
  authenticate,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("calendar_connections")
        .select("calendar_name, connected_at, last_synced_at, token_expires_at, active")
        .eq("coach_id", req.user!.id)
        .eq("provider", "google")
        .eq("calendar_id", "primary")
        .maybeSingle();

      if (error) throw error;

      if (!data || !data.active) {
        return res.json({ connected: false });
      }

      // "Expiring" = refresh token usage may need re-consent if we're close
      // to the token_expires_at. We refresh access tokens before each call
      // in 3.2; this flag is purely informational for the UI.
      const expiringSoon =
        data.token_expires_at != null &&
        new Date(data.token_expires_at).getTime() - Date.now() < 5 * 60 * 1000;

      res.json({
        connected: true,
        calendarName: data.calendar_name,
        connectedAt: data.connected_at,
        lastSyncedAt: data.last_synced_at,
        tokenExpiringSoon: expiringSoon
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Soft disconnect — flips `active` to false so the row stays around for
 * audit but the engine and UI treat the coach as unconnected. Reconnect
 * runs through the same upsert path and flips it back.
 */
calendarRouter.post(
  "/disconnect",
  authenticate,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const { error } = await supabaseAdmin
        .from("calendar_connections")
        .update({ active: false })
        .eq("coach_id", req.user!.id)
        .eq("provider", "google")
        .eq("calendar_id", "primary");

      if (error) throw error;

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);
