import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CalendarPlus, CalendarClock, Check, Clock, Plus, X } from "lucide-react";
import {
  ApiError,
  cancelBooking,
  completeBooking,
  createManualBooking,
  fetchAdminBookings,
  fetchAdminClients,
  fetchTrainingTypes,
  markNoShow,
  rescheduleBooking,
  type AdminBookingRow,
  type AdminClientListItem,
  type BookingStatus,
  type TrainingType
} from "@/lib/api";

function formatError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

/** ISO (UTC) → value for <input type="datetime-local"> in local time. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:MM" (local) → ISO UTC. */
function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

const STATUS_FILTERS: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" }
];

const STATUS_STYLES: Record<BookingStatus, string> = {
  hold: "bg-amber-100 text-amber-800",
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-field/15 text-field",
  completed: "bg-ink text-white",
  rescheduled: "bg-chalk text-ink/70",
  cancelled: "bg-clay/15 text-clay",
  no_show: "bg-clay/15 text-clay"
};

const ACTIONABLE: BookingStatus[] = ["hold", "pending", "confirmed"];

export function AdminBookingsPage() {
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<BookingStatus | "all">("all");
  const [showNew, setShowNew] = useState(false);

  // Anchor the range once: 30 days back through 60 days out.
  const range = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 86_400_000);
    const to = new Date(now.getTime() + 60 * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminBookings(range);
      data.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      setBookings(data);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(
    () => (filter === "all" ? bookings : bookings.filter((b) => b.status === filter)),
    [bookings, filter]
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <header className="flex flex-col gap-1">
        <Link
          to="/admin"
          className="focus-ring inline-flex w-fit items-center gap-1.5 text-sm font-bold text-ink/55 hover:text-ink"
        >
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>
        <p className="mt-3 text-sm font-bold uppercase tracking-[0.18em] text-clay">Phase 4 · Admin</p>
        <h1 className="mt-1 text-4xl font-black">Bookings.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-ink/68">
          The last 30 days through the next 60. Reschedule, cancel, or mark sessions complete — changes sync
          to Google Calendar. Add a walk-in or phone booking with “New booking.”
        </p>
      </header>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={[
                "focus-ring rounded px-3 py-2 text-xs font-bold uppercase tracking-wide transition",
                filter === f.value ? "bg-ink text-white" : "bg-white text-ink/60 hover:bg-chalk"
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowNew((s) => !s)}
          className="focus-ring inline-flex items-center gap-2 rounded bg-field px-4 py-2 text-sm font-bold text-white transition hover:bg-ink"
        >
          {showNew ? <X size={16} /> : <CalendarPlus size={16} />}
          {showNew ? "Close" : "New booking"}
        </button>
      </div>

      {showNew ? (
        <NewBookingForm
          onCreated={() => {
            setShowNew(false);
            void reload();
          }}
        />
      ) : null}

      {error ? (
        <p className="mt-4 rounded border border-clay/20 bg-clay/5 px-4 py-2 text-sm font-semibold text-clay">
          {error}
        </p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded bg-white shadow-soft">
        {isLoading ? (
          <p className="px-4 py-5 text-sm font-semibold text-ink/60">Loading bookings…</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-5 text-sm font-semibold text-ink/60">No bookings in this view.</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {visible.map((b) => (
              <BookingRow key={b.id} booking={b} onChanged={reload} onError={setError} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function BookingRow({
  booking,
  onChanged,
  onError
}: {
  booking: AdminBookingRow;
  onChanged: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const actionable = ACTIONABLE.includes(booking.status);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    onError("");
    try {
      await fn();
      await onChanged();
    } catch (err) {
      onError(formatError(err));
      setBusy(false);
    }
  }

  function handleCancel() {
    if (!confirm("Cancel this booking? This removes its Google Calendar event.")) return;
    const reason = window.prompt("Optional cancellation reason:") ?? undefined;
    void run(() => cancelBooking(booking.id, reason));
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={[
              "shrink-0 rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
              STATUS_STYLES[booking.status]
            ].join(" ")}
          >
            {booking.status.replace("_", " ")}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold">
              {booking.training_type?.name ?? "Training"}
              <span className="font-semibold text-ink/55">
                {" · "}
                {booking.client?.athlete_name ?? "Unassigned"}
              </span>
            </p>
            <p className="truncate text-sm text-ink/55">{formatDateTime(booking.starts_at)}</p>
          </div>
        </div>

        {actionable ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <ActionButton onClick={() => void run(() => completeBooking(booking.id))} disabled={busy}>
              <Check size={14} />
              Complete
            </ActionButton>
            <ActionButton onClick={() => void run(() => markNoShow(booking.id))} disabled={busy}>
              <Clock size={14} />
              No-show
            </ActionButton>
            <ActionButton onClick={() => setRescheduling((r) => !r)} disabled={busy}>
              <CalendarClock size={14} />
              Reschedule
            </ActionButton>
            <ActionButton onClick={handleCancel} disabled={busy} danger>
              <X size={14} />
              Cancel
            </ActionButton>
          </div>
        ) : null}
      </div>

      {rescheduling ? (
        <RescheduleForm
          booking={booking}
          onCancel={() => setRescheduling(false)}
          onDone={async () => {
            setRescheduling(false);
            await onChanged();
          }}
          onError={onError}
        />
      ) : null}
    </li>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  danger
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "focus-ring inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-50",
        danger
          ? "border-clay/30 text-clay hover:bg-clay/10"
          : "border-ink/15 text-ink/70 hover:bg-chalk"
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function RescheduleForm({
  booking,
  onCancel,
  onDone,
  onError
}: {
  booking: AdminBookingRow;
  onCancel: () => void;
  onDone: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  // Preserve the original duration; the coach moves the start.
  const durationMs = Date.parse(booking.ends_at) - Date.parse(booking.starts_at);
  const [start, setStart] = useState(isoToLocalInput(booking.starts_at));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    onError("");
    try {
      const startsAt = localInputToIso(start);
      const endsAt = new Date(Date.parse(startsAt) + durationMs).toISOString();
      await rescheduleBooking(booking.id, { startsAt, endsAt });
      await onDone();
    } catch (err) {
      onError(formatError(err));
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded bg-chalk/50 px-3 py-3">
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/55">
        New start
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm font-bold text-ink"
        />
      </label>
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="focus-ring rounded bg-field px-4 py-2 text-sm font-bold text-white transition hover:bg-ink disabled:bg-field/40"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="focus-ring rounded border border-ink/12 px-3 py-2 text-sm font-bold text-ink transition hover:bg-white"
      >
        Cancel
      </button>
    </div>
  );
}

function NewBookingForm({ onCreated }: { onCreated: () => void }) {
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [clients, setClients] = useState<AdminClientListItem[]>([]);
  const [trainingTypeId, setTrainingTypeId] = useState("");
  const [clientId, setClientId] = useState("");
  const [start, setStart] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchTrainingTypes(), fetchAdminClients()])
      .then(([types, cs]) => {
        setTrainingTypes(types);
        setClients(cs);
        if (types[0]) setTrainingTypeId(types[0].id);
      })
      .catch((err) => setError(formatError(err)));
  }, []);

  const selectedType = trainingTypes.find((t) => t.id === trainingTypeId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!trainingTypeId) return setError("Pick a training type.");
    if (!start) return setError("Pick a start time.");

    const startsAt = localInputToIso(start);
    const duration = selectedType?.default_duration_minutes ?? 60;
    const endsAt = new Date(Date.parse(startsAt) + duration * 60_000).toISOString();

    setSaving(true);
    try {
      await createManualBooking({
        trainingTypeId,
        clientId: clientId || null,
        startsAt,
        endsAt,
        notes: notes.trim() || undefined
      });
      onCreated();
    } catch (err) {
      setError(formatError(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-3 rounded bg-white p-4 shadow-soft sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/55">
        Training type
        <select
          value={trainingTypeId}
          onChange={(e) => setTrainingTypeId(e.target.value)}
          className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm font-bold text-ink"
        >
          {trainingTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.default_duration_minutes} min)
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/55">
        Client (optional)
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm font-bold text-ink"
        >
          <option value="">— Walk-in / unassigned —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.athlete_name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/55">
        Start
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
          className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm font-bold text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/55">
        Notes (optional)
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm font-semibold text-ink"
        />
      </label>

      {error ? (
        <p className="rounded border border-clay/20 bg-clay/5 px-3 py-2 text-sm font-semibold text-clay sm:col-span-2">
          {error}
        </p>
      ) : null}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={saving}
          className="focus-ring inline-flex items-center gap-2 rounded bg-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-clay disabled:bg-ink/40"
        >
          <Plus size={16} />
          {saving ? "Creating…" : "Create booking"}
        </button>
        <span className="ml-3 text-xs text-ink/50">
          {selectedType ? `Ends ${selectedType.default_duration_minutes} min after start. Status: confirmed.` : ""}
        </span>
      </div>
    </form>
  );
}
