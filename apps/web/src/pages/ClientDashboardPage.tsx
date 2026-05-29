import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarPlus, Clock3, Hourglass, Library } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchMyBookings, type BookingStatus, type BookingSummary } from "@/lib/api";
import { ClientUploadsSection } from "@/components/ClientUploadsSection";

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

export function ClientDashboardPage() {
  const { profile, user, isEmailVerified } = useAuth();
  const displayName = profile?.first_name ?? user?.email?.split("@")[0] ?? "there";

  const [upcoming, setUpcoming] = useState<BookingSummary[]>([]);
  const [past, setPast] = useState<BookingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchMyBookings()
      .then((data) => {
        if (!isMounted) return;
        setUpcoming(data.upcoming);
        setPast(data.past);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Unable to load your sessions.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
        <div className="mt-6 rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
          Check your inbox to verify your email before confirming paid sessions or accessing private resources.
        </div>
      ) : null}

      {/* Upcoming sessions */}
      <section className="mt-10">
        <div className="flex items-center gap-3">
          <Clock3 className="text-field" />
          <h2 className="text-2xl font-black">Upcoming sessions</h2>
        </div>

        <div className="mt-5">
          {isLoading ? (
            <p className="rounded border border-dashed border-ink/20 bg-chalk px-4 py-5 text-sm font-semibold text-ink/62">
              Loading your sessions…
            </p>
          ) : error ? (
            <p className="rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
              {error}
            </p>
          ) : upcoming.length === 0 ? (
            <EmptyUpcoming />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {upcoming.map((booking) => (
                <UpcomingCard key={booking.id} booking={booking} />
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
            <p className="rounded border border-dashed border-ink/20 bg-chalk px-4 py-5 text-sm font-semibold text-ink/62">
              Past sessions will show here after your first lesson.
            </p>
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
    <div className="rounded bg-white p-6 shadow-soft">
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
    </div>
  );
}

function UpcomingCard({ booking }: { booking: BookingSummary }) {
  const trainingLabel = booking.training_type?.name ?? "Training";
  const isHold = booking.status === "hold";

  return (
    <li className="rounded bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-ink/45">
            {formatLongDate(booking.starts_at)}
          </p>
          <h3 className="mt-1 truncate text-xl font-black">{trainingLabel}</h3>
          <p className="mt-1 text-sm text-ink/65">
            {formatTime(booking.starts_at)} – {formatTime(booking.ends_at)}
          </p>
        </div>
        <span
          className={[
            "inline-flex shrink-0 items-center rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
            statusBadgeClass(booking.status)
          ].join(" ")}
        >
          {statusCopy[booking.status]}
        </span>
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
