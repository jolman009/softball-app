import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Film, NotebookPen, ShieldCheck, ShieldAlert, Trash2 } from "lucide-react";
import {
  ApiError,
  deleteSessionNote,
  fetchAdminClient,
  fetchSessionNote,
  saveSessionNote,
  updateAdminClient,
  type AdminClientBooking,
  type AdminClientProfile,
  type BookingStatus,
  type SessionNote,
  type SkillLevel
} from "@/lib/api";
import { Alert, Badge, Button, Input, Select, Textarea, type BadgeVariant } from "@/components/ui";

const SKILLS: (SkillLevel | "")[] = ["", "beginner", "intermediate", "advanced"];

function formatError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
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

const STATUS_VARIANTS: Record<BookingStatus, BadgeVariant> = {
  hold: "warning",
  pending: "warning",
  confirmed: "positive",
  completed: "primary",
  rescheduled: "default",
  cancelled: "destructive-light",
  no_show: "destructive-light"
};

export function AdminClientDetailPage() {
  const { id = "" } = useParams();
  const [client, setClient] = useState<AdminClientProfile | null>(null);
  const [bookings, setBookings] = useState<AdminClientBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const detail = await fetchAdminClient(id);
      setClient(detail.client);
      setBookings(detail.bookings);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link
        to="/admin/clients"
        className="focus-ring inline-flex w-fit items-center gap-1.5 text-sm font-bold text-ink/65 hover:text-ink"
      >
        <ArrowLeft size={14} />
        Back to clients
      </Link>

      {error ? (
        <Alert variant="error" size="sm" role="alert" className="mt-6">
          {error}
        </Alert>
      ) : null}

      {isLoading ? (
        <p className="mt-8 text-sm font-semibold text-ink/60">Loading client…</p>
      ) : client ? (
        <>
          <ProfileCard client={client} onSaved={setClient} />
          <BookingHistory bookings={bookings} />
        </>
      ) : (
        <p className="mt-8 text-sm font-semibold text-ink/60">Client not found.</p>
      )}
    </main>
  );
}

// ============================================================
// Profile card (view + inline edit)
// ============================================================

function ProfileCard({
  client,
  onSaved
}: {
  client: AdminClientProfile;
  onSaved: (next: AdminClientProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(client);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(client), [client]);

  function field<K extends keyof AdminClientProfile>(key: K, value: AdminClientProfile[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAdminClient(client.id, {
        athlete_name: draft.athlete_name,
        athlete_age: draft.athlete_age,
        skill_level: draft.skill_level,
        primary_position: draft.primary_position || null,
        guardian_name: draft.guardian_name || null,
        guardian_email: draft.guardian_email || null,
        emergency_contact_name: draft.emergency_contact_name || null,
        emergency_contact_phone: draft.emergency_contact_phone || null,
        notes: draft.notes || null,
        waiver_signed: draft.waiver_signed_at != null,
        media_consent: draft.media_consent_at != null
      });
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 rounded bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">{client.athlete_name}</h1>
          <p className="mt-1 text-sm text-ink/60">
            {client.profile?.email ?? "no email on file"}
            {client.profile?.phone ? ` · ${client.profile.phone}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/admin/uploads?clientId=${client.id}`}
            className="focus-ring inline-flex items-center gap-1.5 rounded border border-ink/15 px-3 py-1.5 text-sm font-bold text-ink transition hover:bg-chalk"
          >
            <Film size={15} />
            Uploads
          </Link>
          {!editing ? (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      {/* Waiver + consent flags */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Flag on={client.waiver_signed_at != null} onLabel="Waiver signed" offLabel="No waiver" />
        <Flag
          on={client.media_consent_at != null}
          onLabel="Media consent"
          offLabel="No media consent"
        />
      </div>

      {error ? (
        <Alert variant="error" size="sm" role="alert" className="mt-4">
          {error}
        </Alert>
      ) : null}

      {!editing ? (
        <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Detail label="Age" value={client.athlete_age?.toString() ?? "—"} />
          <Detail label="Skill level" value={client.skill_level ?? "—"} />
          <Detail label="Primary position" value={client.primary_position ?? "—"} />
          <Detail label="Guardian" value={client.guardian_name ?? "—"} />
          <Detail label="Guardian email" value={client.guardian_email ?? "—"} />
          <Detail
            label="Emergency contact"
            value={
              client.emergency_contact_name
                ? `${client.emergency_contact_name}${client.emergency_contact_phone ? ` · ${client.emergency_contact_phone}` : ""}`
                : "—"
            }
          />
          <Detail label="Notes" value={client.notes ?? "—"} full />
        </dl>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <EditField label="Athlete name" value={draft.athlete_name} onChange={(v) => field("athlete_name", v)} />
          <EditField
            label="Age"
            type="number"
            value={draft.athlete_age?.toString() ?? ""}
            onChange={(v) => field("athlete_age", v ? Number(v) : null)}
          />
          <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/65">
            Skill level
            <Select
              value={draft.skill_level ?? ""}
              onChange={(e) => field("skill_level", (e.target.value || null) as SkillLevel | null)}
            >
              {SKILLS.map((s) => (
                <option key={s} value={s}>
                  {s === "" ? "—" : s}
                </option>
              ))}
            </Select>
          </label>
          <EditField
            label="Primary position"
            value={draft.primary_position ?? ""}
            onChange={(v) => field("primary_position", v)}
          />
          <EditField
            label="Guardian name"
            value={draft.guardian_name ?? ""}
            onChange={(v) => field("guardian_name", v)}
          />
          <EditField
            label="Guardian email"
            type="email"
            value={draft.guardian_email ?? ""}
            onChange={(v) => field("guardian_email", v)}
          />
          <EditField
            label="Emergency contact name"
            value={draft.emergency_contact_name ?? ""}
            onChange={(v) => field("emergency_contact_name", v)}
          />
          <EditField
            label="Emergency contact phone"
            value={draft.emergency_contact_phone ?? ""}
            onChange={(v) => field("emergency_contact_phone", v)}
          />
          <div className="sm:col-span-2">
            <EditField label="Notes" value={draft.notes ?? ""} onChange={(v) => field("notes", v)} textarea />
          </div>

          <div className="flex flex-wrap gap-4 sm:col-span-2">
            <Toggle
              label="Waiver signed"
              checked={draft.waiver_signed_at != null}
              onChange={(on) => field("waiver_signed_at", on ? new Date().toISOString() : null)}
            />
            <Toggle
              label="Media consent"
              checked={draft.media_consent_at != null}
              onChange={(on) => field("media_consent_at", on ? new Date().toISOString() : null)}
            />
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <Button variant="positive" onClick={() => void handleSave()} loading={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(client);
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Flag({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <Badge variant={on ? "positive" : "destructive-light"} className="gap-1.5">
      {on ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
      {on ? onLabel : offLabel}
    </Badge>
  );
}

function Detail({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-bold uppercase tracking-wide text-ink/65">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap font-semibold text-ink/85">{value}</dd>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = "text",
  textarea = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  textarea?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink/65">
      {label}
      {textarea ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
      ) : (
        <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm font-bold text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="focus-ring h-4 w-4 rounded border-ink/30 text-field"
      />
      {label}
    </label>
  );
}

// ============================================================
// Booking history + per-booking session notes
// ============================================================

function BookingHistory({ bookings }: { bookings: AdminClientBooking[] }) {
  return (
    <section className="mt-10">
      <div className="flex items-center gap-3">
        <NotebookPen className="text-field" />
        <h2 className="text-2xl font-black">Booking history</h2>
      </div>

      <div className="mt-5 overflow-hidden rounded bg-white shadow-soft">
        {bookings.length === 0 ? (
          <p className="px-4 py-5 text-sm font-semibold text-ink/60">No bookings yet.</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {bookings.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function BookingRow({ booking }: { booking: AdminClientBooking }) {
  const [open, setOpen] = useState(false);
  const [hasNote, setHasNote] = useState(booking.session_note != null);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="focus-ring flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-chalk/60"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Badge variant={STATUS_VARIANTS[booking.status]} className="shrink-0">
            {booking.status}
          </Badge>
          <div className="min-w-0">
            <p className="truncate font-bold">{booking.training_type?.name ?? "Session"}</p>
            <p className="truncate text-sm text-ink/65">{formatDateTime(booking.starts_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasNote ? (
            <Badge variant="positive" size="sm">
              Note
            </Badge>
          ) : null}
          <ChevronDown
            size={18}
            className={["text-ink/40 transition", open ? "rotate-180" : ""].join(" ")}
          />
        </div>
      </button>
      {open ? <SessionNotesEditor bookingId={booking.id} onNoteChange={setHasNote} /> : null}
    </li>
  );
}

function SessionNotesEditor({
  bookingId,
  onNoteChange
}: {
  bookingId: string;
  onNoteChange: (hasNote: boolean) => void;
}) {
  const [note, setNote] = useState<SessionNote | null>(null);
  const [privateNotes, setPrivateNotes] = useState("");
  const [summary, setSummary] = useState("");
  const [homework, setHomework] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    fetchSessionNote(bookingId)
      .then((n) => {
        if (!mounted) return;
        setNote(n);
        setPrivateNotes(n?.private_notes ?? "");
        setSummary(n?.client_visible_summary ?? "");
        setHomework(n?.homework ?? "");
      })
      .catch((err) => mounted && setError(formatError(err)))
      .finally(() => mounted && setIsLoading(false));
    return () => {
      mounted = false;
    };
  }, [bookingId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const saved = await saveSessionNote(bookingId, {
        private_notes: privateNotes.trim() || null,
        client_visible_summary: summary.trim() || null,
        homework: homework.trim() || null
      });
      setNote(saved);
      setSavedAt(saved.updated_at);
      onNoteChange(true);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete the notes for this session?")) return;
    setDeleting(true);
    setError(null);
    setSavedAt(null);
    try {
      await deleteSessionNote(bookingId);
      setNote(null);
      setPrivateNotes("");
      setSummary("");
      setHomework("");
      onNoteChange(false);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setDeleting(false);
    }
  }

  if (isLoading) {
    return <p className="bg-chalk/40 px-4 py-4 text-sm font-semibold text-ink/65">Loading notes…</p>;
  }

  return (
    <div className="grid gap-4 bg-chalk/40 px-4 py-5">
      <NoteField
        label="Private notes"
        hint="Coach-only — never shown to the client."
        value={privateNotes}
        onChange={setPrivateNotes}
      />
      <NoteField
        label="Client-visible summary"
        hint="Shared with the client on their dashboard."
        value={summary}
        onChange={setSummary}
      />
      <NoteField
        label="Homework"
        hint="Drills or focus areas for next time."
        value={homework}
        onChange={setHomework}
      />

      {error ? (
        <Alert variant="error" size="sm" role="alert">
          {error}
        </Alert>
      ) : null}

      <div className="flex items-center gap-3">
        <Button variant="positive" onClick={() => void handleSave()} loading={saving} disabled={deleting}>
          {saving ? "Saving…" : note ? "Update notes" : "Save notes"}
        </Button>
        {note ? (
          <Button
            variant="destructive"
            onClick={() => void handleDelete()}
            loading={deleting}
            disabled={saving}
            iconLeft={<Trash2 size={15} />}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        ) : null}
        {savedAt ? <span className="text-xs font-semibold text-field">Saved.</span> : null}
      </div>
    </div>
  );
}

function NoteField({
  label,
  hint,
  value,
  onChange
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-wide text-ink/65">{label}</span>
      <span className="text-xs text-ink/65">{hint}</span>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="mt-1" />
    </label>
  );
}
