import { Resend } from "resend";
import { env } from "../config/env.js";
import { supabaseAdmin } from "../lib/supabase.js";

/**
 * Transactional email for the booking lifecycle (confirmation, reschedule,
 * cancellation), sent via Resend.
 *
 * Design rules, mirroring the Google Calendar service:
 *  - Every public function is failure-tolerant. A send that fails (or a missing
 *    RESEND_API_KEY) is logged and swallowed — the DB is the source of truth and
 *    an email outage must never roll back a real booking. Callers `void` these.
 *  - When RESEND_API_KEY is unset the whole module is a no-op, so local dev and
 *    CI never try to reach Resend.
 *
 * NB: password-reset emails are NOT sent here — they're issued by Supabase Auth.
 * To route those through Resend, point Supabase's custom SMTP at Resend in the
 * dashboard (Auth → Email). That's a config step, not application code.
 */

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

type Recipient = { email: string; name: string | null };

/** Everything the booking emails need, gathered by the calling route. */
export type BookingEmailContext = {
  bookingId: string;
  coachId: string;
  /** Auth user id of whoever created the booking (fallback recipient). */
  createdBy: string;
  /** Linked client row id, if any — preferred recipient. */
  clientId: string | null;
  trainingTypeName: string | null;
  otherTrainingText?: string | null;
  startsAt: string;
  endsAt: string;
};

export async function sendBookingConfirmation(ctx: BookingEmailContext): Promise<void> {
  await safeSend(ctx, async (recipient, when, sessionLabel) => ({
    subject: `Booking confirmed — ${sessionLabel}`,
    heading: "Your session is confirmed",
    intro: `Hi${recipient.name ? ` ${recipient.name}` : ""}, your softball training session is locked in. Here are the details:`,
    when,
    sessionLabel,
    footer: "See you on the field. Need to make a change? Reschedules and cancellations are available from your dashboard up to 12 hours before the session."
  }));
}

export async function sendBookingReschedule(ctx: BookingEmailContext): Promise<void> {
  await safeSend(ctx, async (recipient, when, sessionLabel) => ({
    subject: `Session rescheduled — ${sessionLabel}`,
    heading: "Your session has been rescheduled",
    intro: `Hi${recipient.name ? ` ${recipient.name}` : ""}, your softball training session has a new time. Here's the updated booking:`,
    when,
    sessionLabel,
    footer: "If this new time doesn't work, reach out to your coach or manage the booking from your dashboard."
  }));
}

export async function sendBookingCancellation(
  ctx: BookingEmailContext,
  reason?: string | null
): Promise<void> {
  await safeSend(ctx, async (recipient, when, sessionLabel) => ({
    subject: `Session cancelled — ${sessionLabel}`,
    heading: "Your session has been cancelled",
    intro: `Hi${recipient.name ? ` ${recipient.name}` : ""}, the following softball training session has been cancelled:`,
    when,
    sessionLabel,
    extra: reason ? `Reason: ${reason}` : null,
    footer: "Ready to rebook? Head to your dashboard to grab a new time whenever you're ready."
  }));
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type TemplateParts = {
  subject: string;
  heading: string;
  intro: string;
  when: string;
  sessionLabel: string;
  extra?: string | null;
  footer: string;
};

/**
 * Resolves the recipient + coach timezone, renders the template, and sends —
 * all wrapped so nothing here can throw into the caller's request handler.
 */
async function safeSend(
  ctx: BookingEmailContext,
  build: (recipient: Recipient, when: string, sessionLabel: string) => Promise<TemplateParts>
): Promise<void> {
  try {
    const recipient = await resolveRecipient(ctx.clientId, ctx.createdBy);
    if (!recipient?.email) {
      console.info(`[email] no resolvable recipient for booking ${ctx.bookingId}; skipping.`);
      return;
    }

    const timezone = await coachTimezone(ctx.coachId);
    const when = formatRange(ctx.startsAt, ctx.endsAt, timezone);
    const sessionLabel = buildSessionLabel(ctx);

    const parts = await build(recipient, when, sessionLabel);
    await deliver(recipient.email, parts);
  } catch (err) {
    console.warn(`[email] failed to send for booking ${ctx.bookingId}; booking is unaffected.`, err);
  }
}

async function deliver(to: string, parts: TemplateParts): Promise<void> {
  if (!resend) {
    console.info(`[email] RESEND_API_KEY not set — would send "${parts.subject}" to ${to}.`);
    return;
  }

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: parts.subject,
    html: renderHtml(parts),
    text: renderText(parts)
  });

  if (error) {
    console.warn(`[email] Resend rejected "${parts.subject}" to ${to}:`, error);
  }
}

/**
 * Prefer the linked client's account email; fall back to the booking creator.
 * Self-service client bookings resolve to the same person either way; admin
 * (walk-in) bookings reach the linked client when they have an account.
 */
async function resolveRecipient(
  clientId: string | null,
  createdBy: string
): Promise<Recipient | null> {
  if (clientId) {
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("user_id, athlete_name, guardian_name")
      .eq("id", clientId)
      .maybeSingle();

    if (client?.user_id) {
      const profile = await profileContact(client.user_id);
      if (profile?.email) {
        return {
          email: profile.email,
          name: client.guardian_name ?? profile.name ?? client.athlete_name ?? null
        };
      }
    }
  }

  const profile = await profileContact(createdBy);
  return profile?.email ? { email: profile.email, name: profile.name } : null;
}

async function profileContact(userId: string): Promise<{ email: string | null; name: string | null } | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("email, first_name, last_name")
    .eq("id", userId)
    .maybeSingle();

  if (!data) return null;
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || null;
  return { email: data.email ?? null, name };
}

/** Any active availability window's timezone for the coach, else the env default. */
async function coachTimezone(coachId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("availability_windows")
    .select("timezone")
    .eq("coach_id", coachId)
    .limit(1)
    .maybeSingle();
  return data?.timezone ?? env.DISPLAY_TIMEZONE;
}

function buildSessionLabel(ctx: BookingEmailContext): string {
  const name = ctx.trainingTypeName ?? "Training";
  if (name === "Other" && ctx.otherTrainingText) return `${name} (${ctx.otherTrainingText})`;
  return name;
}

/** e.g. "Saturday, May 31, 2026 · 9:00 AM – 10:00 AM CDT" */
function formatRange(startsAt: string, endsAt: string, timeZone: string): string {
  try {
    const dateFmt = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone
    });
    const timeFmt = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short"
    });
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    return `${dateFmt.format(start)} · ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
  } catch {
    // Bad timezone string — fall back to a plain UTC render rather than throw.
    return `${new Date(startsAt).toUTCString()} – ${new Date(endsAt).toUTCString()}`;
  }
}

function renderText(p: TemplateParts): string {
  return [
    p.heading,
    "",
    p.intro,
    "",
    `Session: ${p.sessionLabel}`,
    `When: ${p.when}`,
    p.extra ? `\n${p.extra}` : "",
    "",
    p.footer
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function renderHtml(p: TemplateParts): string {
  const extraBlock = p.extra
    ? `<p style="margin:0 0 16px;color:#4b5563;font-size:14px;">${escapeHtml(p.extra)}</p>`
    : "";
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f4;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr>
        <td style="background:#16191f;padding:20px 24px;">
          <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#2f6f4e;border:2px solid #f6f2e8;margin-right:9px;vertical-align:-1px;"></span><span style="color:#ffffff;font-weight:800;font-size:16px;">On Deck</span>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;">${escapeHtml(p.heading)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(p.intro)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;border-radius:6px;margin:0 0 16px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Session</p>
              <p style="margin:0 0 12px;font-size:15px;font-weight:700;">${escapeHtml(p.sessionLabel)}</p>
              <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">When</p>
              <p style="margin:0;font-size:15px;font-weight:700;">${escapeHtml(p.when)}</p>
            </td></tr>
          </table>
          ${extraBlock}
          <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">${escapeHtml(p.footer)}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
