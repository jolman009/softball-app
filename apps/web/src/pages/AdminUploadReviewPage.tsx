import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import {
  ApiError,
  deleteAdminUpload,
  fetchAdminUpload,
  updateAdminUpload,
  type ClientUpload,
  type UploadStatus
} from "@/lib/api";

const STATUS_OPTIONS: { value: UploadStatus; label: string }[] = [
  { value: "pending_review", label: "Pending review" },
  { value: "reviewed", label: "Reviewed" },
  { value: "archived", label: "Archived" }
];

function formatError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(iso));
}

export function AdminUploadReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [upload, setUpload] = useState<ClientUpload | null>(null);
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<UploadStatus>("pending_review");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    setIsLoading(true);
    fetchAdminUpload(id)
      .then((data) => {
        if (!isMounted) return;
        setUpload(data);
        setSummary(data.coach_summary ?? "");
        setStatus(data.status);
      })
      .catch((err: unknown) => {
        if (isMounted) setError(formatError(err));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [id]);

  async function handleSave() {
    if (!id) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateAdminUpload(id, {
        status,
        coach_summary: summary.trim() || null
      });
      setUpload(updated);
      setStatus(updated.status);
      setSummary(updated.coach_summary ?? "");
      setSaved(true);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || !upload) return;
    if (!window.confirm(`Delete "${upload.title}"? This removes the video too and can't be undone.`)) return;
    setIsDeleting(true);
    try {
      await deleteAdminUpload(id);
      navigate("/admin/uploads");
    } catch (err) {
      setIsDeleting(false);
      setError(formatError(err));
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link
        to="/admin/uploads"
        className="focus-ring inline-flex w-fit items-center gap-1.5 text-sm font-bold text-ink/65 hover:text-ink"
      >
        <ArrowLeft size={14} />
        Back to review queue
      </Link>

      {isLoading ? (
        <p className="mt-8 rounded border border-dashed border-ink/20 bg-chalk px-4 py-5 text-sm font-semibold text-ink/62">
          Loading…
        </p>
      ) : !upload ? (
        <p className="mt-8 rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
          {error ?? "Upload not found."}
        </p>
      ) : (
        <article className="mt-6">
          <h1 className="text-4xl font-black">{upload.title}</h1>
          <p className="mt-2 text-sm text-ink/60">
            <Link to={`/admin/clients/${upload.client?.id ?? ""}`} className="font-bold text-field hover:underline">
              {upload.client?.athlete_name ?? "Unknown athlete"}
            </Link>{" "}
            · uploaded {formatDate(upload.created_at)}
            {upload.booking?.training_type ? ` · ${upload.booking.training_type.name} lesson` : ""}
          </p>

          {upload.description ? (
            <p className="mt-4 leading-7 text-ink/68">
              <span className="font-bold text-ink/80">Athlete's note:</span> {upload.description}
            </p>
          ) : null}

          <div className="mt-6">
            {upload.playback_url ? (
              <video controls className="w-full rounded bg-black shadow-soft" src={upload.playback_url}>
                Your browser does not support the video tag.
              </video>
            ) : (
              <p className="rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
                This video is temporarily unavailable (it may still be uploading). Try again in a moment.
              </p>
            )}
          </div>

          <div className="mt-8 rounded bg-white p-6 shadow-soft">
            <h2 className="text-2xl font-black">Your feedback</h2>

            <label
              className="mt-4 block text-xs font-bold uppercase tracking-wide text-ink/65"
              htmlFor="review-summary"
            >
              Summary <span className="font-semibold normal-case text-ink/65">(the athlete sees this)</span>
            </label>
            <textarea
              id="review-summary"
              className="focus-ring mt-1 min-h-[140px] w-full resize-y rounded border border-ink/15 bg-white px-3 py-2 text-sm font-semibold leading-6 text-ink"
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                setSaved(false);
              }}
              placeholder="What you noticed, what to work on, drills to try…"
            />

            <label
              className="mt-4 block text-xs font-bold uppercase tracking-wide text-ink/65"
              htmlFor="review-status"
            >
              Status
            </label>
            <select
              id="review-status"
              className="focus-ring mt-1 w-full rounded border border-ink/15 bg-white px-3 py-2 text-sm font-semibold text-ink sm:w-60"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as UploadStatus);
                setSaved(false);
              }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            {error ? (
              <p className="mt-4 rounded border border-clay/20 bg-clay/5 px-4 py-2 text-sm font-semibold text-clay">
                {error}
              </p>
            ) : null}
            {saved ? (
              <p className="mt-4 rounded border border-field/20 bg-field/5 px-4 py-2 text-sm font-semibold text-field">
                Saved. The athlete can see your feedback now.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="focus-ring inline-flex items-center gap-2 rounded bg-ink px-5 py-3 font-bold text-white transition hover:bg-clay disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="animate-spin" size={18} /> : null}
                {isSaving ? "Saving…" : "Save feedback"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="focus-ring ml-auto inline-flex items-center gap-2 rounded border border-clay/20 px-4 py-3 font-bold text-clay transition hover:bg-clay/10 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                Delete
              </button>
            </div>
          </div>
        </article>
      )}
    </main>
  );
}
