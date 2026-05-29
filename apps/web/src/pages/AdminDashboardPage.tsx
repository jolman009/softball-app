import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarClock,
  CalendarRange,
  CalendarX,
  CheckCircle2,
  DollarSign,
  Film,
  Link2,
  UsersRound,
  Video
} from "lucide-react";
import {
  ApiError,
  disconnectCalendar,
  fetchAdminBookings,
  fetchAdminUploads,
  fetchCalendarStatus,
  startCalendarConnect,
  type AdminBookingRow,
  type BookingStatus,
  type CalendarStatus
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

// --- date helpers (all in local TZ; the coach reads in their own time) ---

function startOfToday(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(now = new Date()): Date {
  // Sunday start, US convention.
  const today = startOfToday(now);
  return addDays(today, -today.getDay());
}

function startOfMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function startOfNextMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function formatFullDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(date);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    amount
  );
}

// --- status display ---

const statusCopy: Record<BookingStatus, string> = {
  hold: "On hold",
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
  rescheduled: "Rescheduled"
};

function statusBadgeClass(status: BookingStatus) {
  switch (status) {
    case "confirmed":
      return "bg-field text-white";
    case "completed":
      return "bg-field/15 text-field";
    case "hold":
    case "pending":
      return "bg-ink text-white";
    case "no_show":
      return "bg-clay text-white";
    case "cancelled":
    case "rescheduled":
    default:
      return "bg-chalk text-ink/65";
  }
}

const ON_SCHEDULE: BookingStatus[] = ["hold", "pending", "confirmed", "completed", "rescheduled"];
const REVENUE_STATUSES: BookingStatus[] = ["confirmed", "completed"];

export function AdminDashboardPage() {
  const { profile } = useAuth();
  const displayName = profile?.first_name ?? "Coach";

  // Anchor "now" once per mount so the groupings stay stable while the page is open.
  const now = useMemo(() => new Date(), []);
  const ranges = useMemo(() => {
    const today = startOfToday(now);
    const tomorrow = addDays(today, 1);
    const weekStart = startOfWeek(now);
    const weekEnd = addDays(weekStart, 7);
    const monthStart = startOfMonth(now);
    const monthEnd = startOfNextMonth(now);
    return { today, tomorrow, weekStart, weekEnd, monthStart, monthEnd };
  }, [now]);

  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pendingUploads, setPendingUploads] = useState(0);

  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [isCalendarWorking, setIsCalendarWorking] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarNotice, setCalendarNotice] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let isMounted = true;

    // Fetch from start-of-month through 60 days out — wide enough to compute revenue
    // for the current month and to surface upcoming sessions for the dashboard's lists.
    const from = ranges.monthStart.toISOString();
    const to = addDays(ranges.today, 60).toISOString();

    fetchAdminBookings({ from, to })
      .then((data) => {
        if (!isMounted) return;
        setBookings(data);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Unable to load the schedule.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [ranges]);

  // Pending video-review count for the quick-action badge. Best-effort: a
  // failure just leaves the badge hidden rather than blocking the dashboard.
  useEffect(() => {
    let isMounted = true;
    fetchAdminUploads({ status: "pending_review" })
      .then((rows) => {
        if (isMounted) setPendingUploads(rows.length);
      })
      .catch(() => {
        /* badge stays at 0 */
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const loadCalendarStatus = useCallback(async () => {
    setIsCalendarLoading(true);
    setCalendarError(null);
    try {
      const status = await fetchCalendarStatus();
      setCalendarStatus(status);
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : "Unable to load calendar status.");
    } finally {
      setIsCalendarLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCalendarStatus();
  }, [loadCalendarStatus]);

  // Consume the ?calendar=connected|error param that the OAuth callback redirects with,
  // turn it into an inline banner, then strip it from the URL so refresh doesn't repeat.
  useEffect(() => {
    const status = searchParams.get("calendar");
    if (!status) return;

    if (status === "connected") {
      setCalendarNotice("Google Calendar connected.");
      void loadCalendarStatus();
    } else if (status === "error") {
      const reason = searchParams.get("reason");
      setCalendarError(
        reason
          ? `Couldn't finish Google Calendar setup (${reason}). Try connecting again.`
          : "Couldn't finish Google Calendar setup. Try connecting again."
      );
    }

    const next = new URLSearchParams(searchParams);
    next.delete("calendar");
    next.delete("reason");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, loadCalendarStatus]);

  async function handleCalendarConnect() {
    setCalendarError(null);
    setCalendarNotice(null);
    setIsCalendarWorking(true);
    try {
      const authUrl = await startCalendarConnect();
      // Hand off to Google — the OAuth callback redirects back to /admin
      // with a ?calendar=connected param that this page will pick up.
      window.location.href = authUrl;
    } catch (err) {
      setCalendarError(formatCalendarError(err));
      setIsCalendarWorking(false);
    }
  }

  async function handleCalendarDisconnect() {
    setCalendarError(null);
    setCalendarNotice(null);
    setIsCalendarWorking(true);
    try {
      await disconnectCalendar();
      setCalendarStatus({ connected: false });
      setCalendarNotice("Google Calendar disconnected.");
    } catch (err) {
      setCalendarError(formatCalendarError(err));
    } finally {
      setIsCalendarWorking(false);
    }
  }

  // --- derived: today / this week / this month + revenue ---
  const todaysBookings = useMemo(
    () =>
      bookings.filter((b) => {
        const t = Date.parse(b.starts_at);
        return t >= ranges.today.getTime() && t < ranges.tomorrow.getTime();
      }),
    [bookings, ranges]
  );

  const thisWeekCount = useMemo(
    () =>
      bookings.filter((b) => {
        const t = Date.parse(b.starts_at);
        return (
          t >= ranges.weekStart.getTime() &&
          t < ranges.weekEnd.getTime() &&
          ON_SCHEDULE.includes(b.status)
        );
      }).length,
    [bookings, ranges]
  );

  const thisMonthCount = useMemo(
    () =>
      bookings.filter((b) => {
        const t = Date.parse(b.starts_at);
        return (
          t >= ranges.monthStart.getTime() &&
          t < ranges.monthEnd.getTime() &&
          ON_SCHEDULE.includes(b.status)
        );
      }).length,
    [bookings, ranges]
  );

  const revenueEstimate = useMemo(
    () =>
      bookings
        .filter((b) => {
          const t = Date.parse(b.starts_at);
          return (
            t >= ranges.monthStart.getTime() &&
            t < ranges.monthEnd.getTime() &&
            REVENUE_STATUSES.includes(b.status)
          );
        })
        .reduce((sum, b) => sum + Number(b.price ?? 0), 0),
    [bookings, ranges]
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-clay">{formatFullDate(ranges.today)}</p>
        <h1 className="mt-1 text-4xl font-black">Coach dashboard.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-ink/68">
          Welcome back, {displayName}. Today's schedule, business pulse, and quick links — all in one place.
        </p>
      </header>

      {/* Metrics */}
      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={CalendarClock}
          label="This week"
          value={isLoading ? "…" : String(thisWeekCount)}
          sub="sessions"
          accent="text-field"
        />
        <MetricCard
          icon={CalendarRange}
          label="This month"
          value={isLoading ? "…" : String(thisMonthCount)}
          sub="sessions"
          accent="text-ink"
        />
        <MetricCard
          icon={DollarSign}
          label="Revenue estimate"
          value={isLoading ? "…" : formatCurrency(revenueEstimate)}
          sub="confirmed + completed this month"
          accent="text-clay"
        />
      </section>

      {/* Google Calendar connection */}
      <section className="mt-10">
        <CalendarConnectionCard
          status={calendarStatus}
          isLoading={isCalendarLoading}
          isWorking={isCalendarWorking}
          error={calendarError}
          notice={calendarNotice}
          onConnect={() => void handleCalendarConnect()}
          onDisconnect={() => void handleCalendarDisconnect()}
        />
      </section>

      {/* Today's schedule */}
      <section className="mt-12">
        <div className="flex items-center gap-3">
          <CalendarClock className="text-field" />
          <h2 className="text-2xl font-black">Today</h2>
          {!isLoading ? (
            <span className="rounded bg-chalk px-2 py-0.5 text-xs font-bold text-ink/60">
              {todaysBookings.length} {todaysBookings.length === 1 ? "session" : "sessions"}
            </span>
          ) : null}
        </div>

        <div className="mt-5">
          {isLoading ? (
            <p className="rounded border border-dashed border-ink/20 bg-chalk px-4 py-5 text-sm font-semibold text-ink/62">
              Loading the schedule…
            </p>
          ) : error ? (
            <p className="rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
              {error}
            </p>
          ) : todaysBookings.length === 0 ? (
            <p className="rounded border border-dashed border-ink/20 bg-chalk px-4 py-5 text-sm font-semibold text-ink/62">
              No sessions today. Enjoy the rest day.
            </p>
          ) : (
            <ul className="divide-y divide-ink/10 rounded bg-white shadow-soft">
              {todaysBookings.map((b) => (
                <ScheduleRow key={b.id} booking={b} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Quick actions */}
      <section className="mt-12">
        <h2 className="text-2xl font-black">Quick actions</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <QuickAction
            to="/admin/bookings"
            icon={CalendarClock}
            title="Bookings"
            description="Reschedule, cancel, complete, or add a walk-in."
          />
          <QuickAction
            to="/admin/availability"
            icon={CalendarRange}
            title="Manage availability"
            description="Weekly windows, blocked dates, buffer rules."
          />
          <QuickAction
            to="/admin/clients"
            icon={UsersRound}
            title="Clients"
            description="Athlete profiles, booking history, session notes."
          />
          <QuickAction
            to="/admin/resources"
            icon={Video}
            title="Resources"
            description="Upload drills, videos, PDFs, and links."
          />
          <QuickAction
            to="/admin/uploads"
            icon={Film}
            title="Video review"
            description="Watch athlete clips and leave feedback."
            badge={pendingUploads}
          />
        </div>
      </section>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  accent
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded bg-white p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <Icon className={accent} size={22} />
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-ink/55">{label}</p>
      </div>
      <p className="mt-3 text-4xl font-black">{value}</p>
      <p className="mt-1 text-sm text-ink/60">{sub}</p>
    </div>
  );
}

function ScheduleRow({ booking }: { booking: AdminBookingRow }) {
  const athlete = booking.client?.athlete_name ?? "Unassigned";
  const trainingLabel = booking.training_type?.name ?? "Training";

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-4 sm:gap-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="shrink-0 text-lg font-black sm:min-w-[5rem]">{formatTime(booking.starts_at)}</div>
        <div className="min-w-0">
          <p className="truncate font-bold">{trainingLabel}</p>
          <p className="truncate text-sm text-ink/60">{athlete}</p>
        </div>
      </div>
      <span
        className={[
          "inline-flex shrink-0 items-center rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
          statusBadgeClass(booking.status)
        ].join(" ")}
      >
        {statusCopy[booking.status]}
      </span>
    </li>
  );
}

type CalendarCardProps = {
  status: CalendarStatus | null;
  isLoading: boolean;
  isWorking: boolean;
  error: string | null;
  notice: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
};

function CalendarConnectionCard({
  status,
  isLoading,
  isWorking,
  error,
  notice,
  onConnect,
  onDisconnect
}: CalendarCardProps) {
  const connected = status?.connected === true;
  const expiring = connected && status.tokenExpiringSoon;
  const calendarName = connected ? status.calendarName : null;

  return (
    <div className="rounded bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={[
              "flex h-11 w-11 shrink-0 items-center justify-center rounded",
              connected ? "bg-field/10 text-field" : "bg-chalk text-ink/55"
            ].join(" ")}
          >
            {connected ? <CheckCircle2 size={22} /> : <Link2 size={22} />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-ink/45">
              Google Calendar
            </p>
            <h3 className="mt-1 text-lg font-black">
              {isLoading ? "Checking status…" : connected ? "Connected" : "Not connected"}
            </h3>
            <p className="mt-1 text-sm leading-6 text-ink/65">
              {connected
                ? `Reading busy times${calendarName ? ` from "${calendarName}"` : ""} and (Phase 3.3) writing confirmed bookings as events.`
                : "Connect your Google Calendar so its busy blocks hide matching booking slots from clients."}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {connected ? (
            <>
              <button
                type="button"
                onClick={onConnect}
                disabled={isWorking}
                className="focus-ring inline-flex items-center justify-center gap-2 rounded border border-ink/12 px-4 py-2 text-sm font-bold text-ink transition hover:bg-chalk disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reconnect
              </button>
              <button
                type="button"
                onClick={onDisconnect}
                disabled={isWorking}
                className="focus-ring inline-flex items-center justify-center gap-2 rounded bg-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-clay disabled:cursor-not-allowed disabled:bg-ink/40"
              >
                <CalendarX size={16} />
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              disabled={isLoading || isWorking}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded bg-field px-4 py-2 text-sm font-bold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:bg-field/40"
            >
              <Link2 size={16} />
              {isWorking ? "Working…" : "Connect Google"}
            </button>
          )}
        </div>
      </div>

      {expiring ? (
        <p className="mt-4 rounded border border-clay/20 bg-clay/5 px-4 py-2 text-sm font-semibold text-clay">
          The access token expires shortly. Bookings still work — reconnect if you start seeing sync errors.
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 rounded border border-field/20 bg-field/5 px-4 py-2 text-sm font-semibold text-field">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded border border-clay/20 bg-clay/5 px-4 py-2 text-sm font-semibold text-clay">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function formatCalendarError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong with Google Calendar.";
}

function QuickAction({
  to,
  icon: Icon,
  title,
  description,
  badge
}: {
  to: string;
  icon: typeof CalendarRange;
  title: string;
  description: string;
  /** Optional count pill (e.g. pending video reviews). Hidden when 0/undefined. */
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className="focus-ring group rounded bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <Icon className="text-field transition group-hover:text-clay" size={26} />
        {badge ? (
          <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-clay px-2 py-0.5 text-xs font-black text-white">
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="mt-4 text-lg font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink/65">{description}</p>
    </Link>
  );
}
