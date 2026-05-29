import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CalendarRange, CalendarX, Plus, Settings2, Trash2 } from "lucide-react";
import {
  ApiError,
  createAvailabilityException,
  createAvailabilityWindow,
  deleteAvailabilityException,
  deleteAvailabilityWindow,
  fetchAvailabilityExceptions,
  fetchAvailabilityWindows,
  fetchCoachSettings,
  updateAvailabilityWindow,
  updateCoachSettings,
  type AvailabilityException,
  type AvailabilityExceptionInput,
  type AvailabilityExceptionType,
  type AvailabilityWindow,
  type AvailabilityWindowInput,
  type CoachSettings,
  type CoachSettingsInput
} from "@/lib/api";

const DAYS = [
  { value: 0, short: "Sun", long: "Sunday" },
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" }
];

/** "HH:MM:SS" or "HH:MM" → "HH:MM" for <input type="time"> compatibility. */
function trimSeconds(value: string): string {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function formatTime12(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function AdminAvailabilityPage() {
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
        <h1 className="mt-1 text-4xl font-black">Availability.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-ink/68">
          Set the weekly schedule clients book against, mark one-off blocks or special openings, and tune
          the booking rules the engine applies to every slot.
        </p>
      </header>

      <WindowsSection />
      <ExceptionsSection />
      <SettingsSection />
    </main>
  );
}

// ============================================================
// Weekly schedule
// ============================================================

function WindowsSection() {
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setWindows(await fetchAvailabilityWindows());
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const grouped = useMemo(() => {
    const map = new Map<number, AvailabilityWindow[]>();
    for (const w of windows) {
      const list = map.get(w.day_of_week) ?? [];
      list.push(w);
      map.set(w.day_of_week, list);
    }
    return map;
  }, [windows]);

  async function handleCreate(input: AvailabilityWindowInput) {
    const created = await createAvailabilityWindow(input);
    setWindows((prev) =>
      [...prev, created].sort((a, b) =>
        a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)
      )
    );
    setShowForm(false);
  }

  async function handleToggleActive(window: AvailabilityWindow) {
    try {
      const updated = await updateAvailabilityWindow(window.id, { active: !window.active });
      setWindows((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function handleDelete(window: AvailabilityWindow) {
    if (!confirm(`Delete the ${DAYS[window.day_of_week].long} ${trimSeconds(window.start_time)} window?`)) {
      return;
    }
    try {
      await deleteAvailabilityWindow(window.id);
      setWindows((prev) => prev.filter((w) => w.id !== window.id));
    } catch (err) {
      setError(formatError(err));
    }
  }

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3">
        <CalendarRange className="text-field" />
        <h2 className="text-2xl font-black">Weekly schedule</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
        Each window is a recurring block of bookable time. The engine expands them into discrete slots
        according to the session length of the training type the client picks.
      </p>

      {error ? (
        <p className="mt-4 rounded border border-clay/20 bg-clay/5 px-4 py-2 text-sm font-semibold text-clay">
          {error}
        </p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded bg-white shadow-soft">
        {isLoading ? (
          <p className="px-4 py-5 text-sm font-semibold text-ink/60">Loading windows…</p>
        ) : windows.length === 0 ? (
          <p className="px-4 py-5 text-sm font-semibold text-ink/60">
            No windows yet. Add one below — the booking page will stay empty until then.
          </p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {DAYS.flatMap((day) => grouped.get(day.value) ?? []).map((window) => (
              <li
                key={window.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-12 text-sm font-black uppercase tracking-wide text-ink/70">
                    {DAYS[window.day_of_week].short}
                  </span>
                  <span className="font-bold">
                    {formatTime12(trimSeconds(window.start_time))} – {formatTime12(trimSeconds(window.end_time))}
                  </span>
                  <span className="text-xs text-ink/50">{window.timezone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(window)}
                    className={[
                      "focus-ring rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition",
                      window.active
                        ? "bg-field/15 text-field hover:bg-field/25"
                        : "bg-chalk text-ink/55 hover:bg-ink/10"
                    ].join(" ")}
                  >
                    {window.active ? "Active" : "Paused"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(window)}
                    aria-label="Delete window"
                    className="focus-ring rounded p-1.5 text-ink/45 transition hover:bg-clay/10 hover:text-clay"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4">
        {showForm ? (
          <WindowForm onCancel={() => setShowForm(false)} onSubmit={handleCreate} />
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="focus-ring inline-flex items-center gap-2 rounded bg-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-clay"
          >
            <Plus size={16} />
            Add window
          </button>
        )}
      </div>
    </section>
  );
}

function WindowForm({
  onSubmit,
  onCancel
}: {
  onSubmit: (input: AvailabilityWindowInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [day, setDay] = useState(1);
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("19:00");
  const [tz, setTz] = useState("America/Chicago");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (end <= start) {
      setError("End time must be after start time.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ day_of_week: day, start_time: start, end_time: end, timezone: tz });
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded bg-white p-4 shadow-soft sm:grid-cols-[1fr_1fr_1fr_1.4fr_auto]"
    >
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/55">
        Day
        <select
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm font-bold text-ink"
        >
          {DAYS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.long}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/55">
        Start
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
          className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm font-bold text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/55">
        End
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          required
          className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm font-bold text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/55">
        Timezone
        <input
          type="text"
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          required
          placeholder="America/Chicago"
          className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm font-bold text-ink"
        />
      </label>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="focus-ring inline-flex items-center justify-center gap-2 rounded bg-field px-4 py-2 text-sm font-bold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:bg-field/40"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring inline-flex items-center justify-center rounded border border-ink/12 px-3 py-2 text-sm font-bold text-ink transition hover:bg-chalk"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="rounded border border-clay/20 bg-clay/5 px-3 py-2 text-sm font-semibold text-clay sm:col-span-5">
          {error}
        </p>
      ) : null}
    </form>
  );
}

// ============================================================
// Exceptions (blocked / special_opening)
// ============================================================

function ExceptionsSection() {
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Default range: the next 180 days from now. Past exceptions are
      // hidden because they no longer affect the bookable surface.
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
      setExceptions(await fetchAvailabilityExceptions({ from, to }));
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate(input: AvailabilityExceptionInput) {
    const created = await createAvailabilityException(input);
    setExceptions((prev) =>
      [...prev, created].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    );
    setShowForm(false);
  }

  async function handleDelete(ex: AvailabilityException) {
    if (!confirm(`Delete this ${ex.exception_type === "blocked" ? "block" : "special opening"}?`)) {
      return;
    }
    try {
      await deleteAvailabilityException(ex.id);
      setExceptions((prev) => prev.filter((e) => e.id !== ex.id));
    } catch (err) {
      setError(formatError(err));
    }
  }

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3">
        <CalendarX className="text-clay" />
        <h2 className="text-2xl font-black">Exceptions</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
        Use blocked exceptions for a day off or vacation. Use special openings to add bookable time outside
        the weekly schedule (a Saturday clinic, for instance).
      </p>

      {error ? (
        <p className="mt-4 rounded border border-clay/20 bg-clay/5 px-4 py-2 text-sm font-semibold text-clay">
          {error}
        </p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded bg-white shadow-soft">
        {isLoading ? (
          <p className="px-4 py-5 text-sm font-semibold text-ink/60">Loading exceptions…</p>
        ) : exceptions.length === 0 ? (
          <p className="px-4 py-5 text-sm font-semibold text-ink/60">
            No upcoming exceptions in the next 180 days.
          </p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {exceptions.map((ex) => (
              <li key={ex.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={[
                      "shrink-0 rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
                      ex.exception_type === "blocked" ? "bg-clay text-white" : "bg-field text-white"
                    ].join(" ")}
                  >
                    {ex.exception_type === "blocked" ? "Block" : "Special"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold">
                      {formatDateTime(ex.starts_at)} → {formatDateTime(ex.ends_at)}
                    </p>
                    {ex.reason ? <p className="truncate text-sm text-ink/60">{ex.reason}</p> : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(ex)}
                  aria-label="Delete exception"
                  className="focus-ring rounded p-1.5 text-ink/45 transition hover:bg-clay/10 hover:text-clay"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4">
        {showForm ? (
          <ExceptionForm onCancel={() => setShowForm(false)} onSubmit={handleCreate} />
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="focus-ring inline-flex items-center gap-2 rounded bg-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-clay"
          >
            <Plus size={16} />
            Add exception
          </button>
        )}
      </div>
    </section>
  );
}

/** "YYYY-MM-DDTHH:MM" (local) → ISO UTC string for the API. */
function localInputToIso(value: string): string {
  // Date parses "YYYY-MM-DDTHH:MM" as local time, then toISOString emits UTC.
  return new Date(value).toISOString();
}

function ExceptionForm({
  onSubmit,
  onCancel
}: {
  onSubmit: (input: AvailabilityExceptionInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState<AvailabilityExceptionType>("blocked");
  const [startsLocal, setStartsLocal] = useState("");
  const [endsLocal, setEndsLocal] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!startsLocal || !endsLocal) {
      setError("Start and end are required.");
      return;
    }
    if (endsLocal <= startsLocal) {
      setError("End must be after start.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        starts_at: localInputToIso(startsLocal),
        ends_at: localInputToIso(endsLocal),
        exception_type: type,
        reason: reason.trim() ? reason.trim() : null
      });
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded bg-white p-4 shadow-soft sm:grid-cols-[1fr_1.4fr_1.4fr_2fr_auto]"
    >
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/55">
        Type
        <select
          value={type}
          onChange={(e) => setType(e.target.value as AvailabilityExceptionType)}
          className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm font-bold text-ink"
        >
          <option value="blocked">Block</option>
          <option value="special_opening">Special opening</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/55">
        Starts
        <input
          type="datetime-local"
          value={startsLocal}
          onChange={(e) => setStartsLocal(e.target.value)}
          required
          className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm font-bold text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/55">
        Ends
        <input
          type="datetime-local"
          value={endsLocal}
          onChange={(e) => setEndsLocal(e.target.value)}
          required
          className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm font-bold text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/55">
        Reason (optional)
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Vacation, tournament, etc."
          maxLength={500}
          className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm font-bold text-ink"
        />
      </label>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="focus-ring inline-flex items-center justify-center gap-2 rounded bg-field px-4 py-2 text-sm font-bold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:bg-field/40"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring inline-flex items-center justify-center rounded border border-ink/12 px-3 py-2 text-sm font-bold text-ink transition hover:bg-chalk"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="rounded border border-clay/20 bg-clay/5 px-3 py-2 text-sm font-semibold text-clay sm:col-span-5">
          {error}
        </p>
      ) : null}
    </form>
  );
}

// ============================================================
// Booking rules (coach_settings)
// ============================================================

function SettingsSection() {
  const [settings, setSettings] = useState<CoachSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<CoachSettingsInput>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchCoachSettings()
      .then((s) => {
        if (!mounted) return;
        setSettings(s);
        setDraft({
          buffer_minutes: s.buffer_minutes,
          min_notice_hours: s.min_notice_hours,
          max_booking_days: s.max_booking_days
        });
      })
      .catch((err) => {
        if (!mounted) return;
        setError(formatError(err));
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const dirty = useMemo(() => {
    if (!settings) return false;
    return (
      draft.buffer_minutes !== settings.buffer_minutes ||
      draft.min_notice_hours !== settings.min_notice_hours ||
      draft.max_booking_days !== settings.max_booking_days
    );
  }, [draft, settings]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;

    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const updated = await updateCoachSettings(draft);
      setSettings(updated);
      setDraft({
        buffer_minutes: updated.buffer_minutes,
        min_notice_hours: updated.min_notice_hours,
        max_booking_days: updated.max_booking_days
      });
      setNotice("Booking rules updated.");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3">
        <Settings2 className="text-ink" />
        <h2 className="text-2xl font-black">Booking rules</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
        Applied to every slot the engine generates. Changes take effect on the next availability request —
        clients won't need to refresh anything for new bookings, but in-flight modals may still see the old
        values until they reload slots.
      </p>

      {error ? (
        <p className="mt-4 rounded border border-clay/20 bg-clay/5 px-4 py-2 text-sm font-semibold text-clay">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 rounded border border-field/20 bg-field/5 px-4 py-2 text-sm font-semibold text-field">
          {notice}
        </p>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="mt-6 grid gap-4 rounded bg-white p-5 shadow-soft sm:grid-cols-3"
      >
        <SettingField
          label="Buffer between sessions"
          unit="minutes"
          min={0}
          max={240}
          loading={isLoading}
          value={draft.buffer_minutes}
          onChange={(v) => setDraft((d) => ({ ...d, buffer_minutes: v }))}
          help="Padding added to each side of an existing booking."
        />
        <SettingField
          label="Minimum notice"
          unit="hours"
          min={0}
          max={720}
          loading={isLoading}
          value={draft.min_notice_hours}
          onChange={(v) => setDraft((d) => ({ ...d, min_notice_hours: v }))}
          help="No slot inside this many hours from now."
        />
        <SettingField
          label="Max booking window"
          unit="days"
          min={1}
          max={365}
          loading={isLoading}
          value={draft.max_booking_days}
          onChange={(v) => setDraft((d) => ({ ...d, max_booking_days: v }))}
          help="How far ahead clients can book."
        />

        <div className="flex items-center justify-end gap-2 sm:col-span-3">
          <button
            type="submit"
            disabled={!dirty || submitting}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded bg-field px-4 py-2 text-sm font-bold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:bg-field/40"
          >
            {submitting ? "Saving…" : "Save rules"}
          </button>
        </div>
      </form>
    </section>
  );
}

function SettingField({
  label,
  unit,
  min,
  max,
  loading,
  value,
  onChange,
  help
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  loading: boolean;
  value: number | undefined;
  onChange: (value: number) => void;
  help: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-wide text-ink/55">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={loading ? "" : value ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={loading}
          className="focus-ring w-24 rounded border border-ink/15 bg-white px-3 py-2 text-sm font-bold text-ink disabled:bg-chalk"
        />
        <span className="text-sm font-semibold text-ink/60">{unit}</span>
      </span>
      <span className="text-xs text-ink/50">{help}</span>
    </label>
  );
}
