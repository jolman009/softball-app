import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarPlus, Clock3, Hourglass, Library } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Alert, Badge, Button, Card, type BadgeVariant } from "@/components/ui";
import {
  ApiError,
  CANCELLATION_CUTOFF_HOURS,
  cancelMyBooking,
  fetchMyBookings,
  type BookingStatus,
  type BookingSummary
} from "@/lib/api";
import { ClientUploadsSection } from "@/components/ClientUploadsSection";
import { BookingEvent, track } from "@/lib/analytics";

function formatLongDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(iso));
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

const statusCopy: Record<BookingStatus, string> = {
  hold: "On hold",
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
  rescheduled: "Rescheduled"
};

const STATUS_VARIANTS: Record<BookingStatus, BadgeVariant> = {
  confirmed: "positive-solid",
  completed: "positive",
  hold: "primary",
  pending: "primary",
  no_show: "destructive",
  cancelled: "default",
  rescheduled: "default"
};

export function ClientDashboardPage() {
  const { profile, user, isEmailVerified } = useAuth();
  const displayName = profile?.first_name ?? user?.email?.split("@")[0] ?? "there";

  const [upcoming, setUpcoming] = useState<BookingSummary[]>([]);
  const [past, setPast] = useState<BookingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    try {
      const data = await fetchMyBookings();
      setUpcoming(data.upcoming);
      setPast(data.past);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your sessions.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-field">Client Dashboard</p>
          <h1 className="mt-3 text-4xl font-black">Welcome back, {displayName}.</h1>
          <p className="mt-3 max-w-2xl leading-7 text-ink/68">
            Your upcoming sessions and lesson history live here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
          <Link
            to="/resources"
            className="focus-ring inline-flex items-center justify-center gap-2 rounded border border-ink/15 px-5 py-3 font-bold text-ink transition hover:bg-chalk"
          >
            <Library size={18} />
            Resources
          </Link>
          <Link
            to="/booking"
            className="focus-ring inline-flex items-center justify-center gap-2 rounded bg-ink px-5 py-3 font-bold text-white transition hover:bg-clay"
          >
            <CalendarPlus size={18} />
            Book a session
          </Link>
        </div>
      </div>

      {!isEmailVerified ? (
        <Alert variant="error" className="mt-6">
          Check your inbox to verify your email before confirming paid sessions or accessing private resources.
        </Alert>
      ) : null}

      {/* Upcoming sessions */}
      <section className="mt-10">
        <div className="flex items-center gap-3">
          <Clock3 className="text-field" />
          <h2 className="text-2xl font-black">Upcoming sessions</h2>
        </div>

        <div className="mt-5">
          {isLoading ? (
            <Alert variant="info" size="lg">Loading your sessions…</Alert>
          ) : error ? (
            <Alert variant="error" role="alert">{error}</Alert>
          ) : upcoming.length === 0 ? (
            <EmptyUpcoming />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {upcoming.map((booking) => (
                <UpcomingCard key={booking.id} booking={booking} onCancelled={loadBookings} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Past sessions */}
      <section className="mt-12">
        <div className="flex items-center gap-3">
          <Hourglass className="text-clay" />
          <h2 className="text-2xl font-black">Past sessions</h2>
        </div>

        <div className="mt-5">
          {isLoading ? null : past.length === 0 ? (
            <Alert variant="info" size="lg">Past sessions will show here after your first lesson.</Alert>
          ) : (
            <ul className="divide-y divide-ink/10 rounded bg-white shadow-soft">
              {past.map((booking) => (
                <PastRow key={booking.id} booking={booking} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Video uploads (Phase 4.5) */}
      <ClientUploadsSection bookings={[...upcoming, ...past]} />
    </main>
  );
}

function EmptyUpcoming() {
  return (
    <Card padding="lg">
      <h3 className="text-lg font-black">No sessions on the books yet.</h3>
      <p className="mt-2 max-w-xl leading-7 text-ink/68">
        Pick a training focus and a time that works for you. Booking takes a couple of minutes.
      </p>
      <Link
        to="/booking"
        className="focus-ring mt-4 inline-flex items-center gap-2 rounded bg-field px-5 py-3 font-bold text-white transition hover:bg-ink"
      >
        Find a slot
        <ArrowRight size={18} />
      </Link>
    </Card>
  );
}

const CANCELLABLE_STATUSES: BookingStatus[] = ["hold", "pending", "confirmed"];

function UpcomingCard({ booking, onCancelled }: { booking: BookingSummary; onCancelled: () => void }) {
  const trainingLabel = booking.training_type?.name ?? "Training";
  const isHold = booking.status === "hold";

  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const canCancel = CANCELLABLE_STATUSES.includes(booking.status);
  const hoursUntil = (Date.parse(booking.starts_at) - Date.now()) / (1000 * 60 * 60);
  const withinCutoff = hoursUntil < CANCELLATION_CUTOFF_HOURS;

  async function handleCancel() {
    if (!window.confirm(`Cancel your ${trainingLabel} session on ${formatLongDate(booking.starts_at)}?`)) {
      return;
    }
    setIsCancelling(true);
    setCancelError(null);
    try {
      await cancelMyBooking(booking.id);
      track(BookingEvent.Cancelled, { bookingId: booking.id, status: booking.status });
      onCancelled();
    } catch (err) {
      setIsCancelling(false);
      setCancelError(err instanceof ApiError ? err.message : "Couldn't cancel. Please try again.");
    }
  }

  return (
    <li className="rounded bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-ink/65">
            {formatLongDate(booking.starts_at)}
          </p>
          <h3 className="mt-1 truncate text-xl font-black">{trainingLabel}</h3>
          <p className="mt-1 text-sm text-ink/65">
            {formatTime(booking.starts_at)} – {formatTime(booking.ends_at)}
          </p>
        </div>
        <Badge variant={STATUS_VARIANTS[booking.status]} className="shrink-0">
          {statusCopy[booking.status]}
        </Badge>
      </div>

      {isHold && booking.hold_expires_at ? (
        <p className="mt-3 rounded bg-chalk px-3 py-2 text-xs font-semibold text-ink/70">
          Hold expires at {formatTime(booking.hold_expires_at)}. Finish the booking before then to lock it in.
        </p>
      ) : null}

      {booking.notes ? (
        <p className="mt-3 text-sm leading-6 text-ink/68">
          <span className="font-bold text-ink/80">Your note:</span> {booking.notes}
        </p>
      ) : null}

      {cancelError ? (
        <Alert variant="error" size="sm" role="alert" className="mt-3">
          {cancelError}
        </Alert>
      ) : null}

      {canCancel ? (
        <div className="mt-4 flex items-center justify-end">
          {withinCutoff ? (
            <p className="text-xs font-semibold text-ink/65">
              Within {CANCELLATION_CUTOFF_HOURS}h — contact your coach to cancel.
            </p>
          ) : (
            <Button variant="destructive" size="sm" onClick={handleCancel} loading={isCancelling}>
              {isCancelling ? "Cancelling…" : "Cancel session"}
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}

function PastRow({ booking }: { booking: BookingSummary }) {
  const trainingLabel = booking.training_type?.name ?? "Training";

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-4 sm:gap-4 sm:px-5">
      <div className="min-w-0">
        <p className="truncate font-bold">{trainingLabel}</p>
        <p className="truncate text-sm text-ink/60">
          {formatLongDate(booking.starts_at)} · {formatTime(booking.starts_at)}
        </p>
      </div>
      <Badge variant={STATUS_VARIANTS[booking.status]} className="shrink-0">
        {statusCopy[booking.status]}
      </Badge>
    </li>
  );
}
