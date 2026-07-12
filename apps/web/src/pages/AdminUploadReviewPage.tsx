import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import {
  ApiError,
  deleteAdminUpload,
  fetchAdminUpload,
  transcodeAdminUpload,
  updateAdminUpload,
  type ClientUpload,
  type UploadStatus
} from "@/lib/api";
import { Alert, Button, Card, Select, Textarea } from "@/components/ui";

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
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [transcodeEnabled, setTranscodeEnabled] = useState(false);
  const [transcodeMsg, setTranscodeMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    setIsLoading(true);
    fetchAdminUpload(id)
      .then(({ upload: data, transcodeEnabled: canTranscode }) => {
        if (!isMounted) return;
        setUpload(data);
        setSummary(data.coach_summary ?? "");
        setStatus(data.status);
        setTranscodeEnabled(canTranscode);
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

  async function handleTranscode() {
    if (!id) return;
    setIsTranscoding(true);
    setTranscodeMsg(null);
    setError(null);
    try {
      const updated = await transcodeAdminUpload(id);
      // The re-encoded file returns a fresh signed URL, so swapping in the
      // updated upload reloads the player with the now-playable H.264 video.
      setUpload(updated);
      setTranscodeMsg("Converted to H.264 — the video should play inline now.");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsTranscoding(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link
        to="/admin/uploads"
        className="focus-ring inline-flex w-fit items-center gap-1.5 text-sm font-bold text-ink/65 hover:text-ink"
      >
        <ArrowLeft size={14} />
        Back to review queue
      </Link>

      {isLoading ? (
        <Alert variant="info" size="lg" className="mt-8">Loading…</Alert>
      ) : !upload ? (
        <Alert variant="error" role="alert" className="mt-8">{error ?? "Upload not found."}</Alert>
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
              <>
                <video
                  controls
                  playsInline
                  preload="metadata"
                  className="h-[65vh] w-full rounded bg-black object-contain shadow-soft"
                  src={upload.playback_url}
                >
                  Your browser does not support the video tag.
                </video>
                {/* Fallback: some phone/screen-recorder MP4s aren't web-optimized (moov
                    atom at the end), so the inline player can show a black frame. The
                    browser's native tab player downloads-then-plays them reliably. */}
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <a
                    href={upload.playback_url}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-ring inline-flex items-center gap-1.5 text-sm font-bold text-field hover:underline"
                  >
                    Open video in a new tab
                    <ExternalLink size={14} />
                  </a>
                  {transcodeEnabled ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleTranscode}
                      loading={isTranscoding}
                      iconLeft={<RefreshCw size={14} />}
                    >
                      {isTranscoding ? "Converting…" : "Convert to H.264"}
                    </Button>
                  ) : null}
                </div>
                {isTranscoding ? (
                  <Alert variant="info" size="sm" className="mt-2">
                    Converting to H.264 — this can take up to a minute for longer clips. Keep this tab open.
                  </Alert>
                ) : transcodeMsg ? (
                  <Alert variant="success" size="sm" role="alert" className="mt-2">
                    {transcodeMsg}
                  </Alert>
                ) : null}
              </>
            ) : (
              <Alert variant="error">
                This video is temporarily unavailable (it may still be uploading). Try again in a moment.
              </Alert>
            )}
          </div>

          <Card padding="lg" className="mt-8">
            <h2 className="text-2xl font-black">Your feedback</h2>

            <label
              className="mt-4 block text-xs font-bold uppercase tracking-wide text-ink/65"
              htmlFor="review-summary"
            >
              Summary <span className="font-semibold normal-case text-ink/65">(the athlete sees this)</span>
            </label>
            <Textarea
              id="review-summary"
              className="mt-1 min-h-[140px] resize-y leading-6"
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
            <div className="mt-1 sm:w-60">
              <Select
                id="review-status"
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
              </Select>
            </div>

            {error ? (
              <Alert variant="error" size="sm" role="alert" className="mt-4">{error}</Alert>
            ) : null}
            {saved ? (
              <Alert variant="success" size="sm" role="alert" className="mt-4">
                Saved. The athlete can see your feedback now.
              </Alert>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button type="button" size="lg" onClick={handleSave} loading={isSaving}>
                {isSaving ? "Saving…" : "Save feedback"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="lg"
                className="ml-auto"
                onClick={handleDelete}
                loading={isDeleting}
                iconLeft={<Trash2 size={16} />}
              >
                Delete
              </Button>
            </div>
          </Card>
        </article>
      )}
    </main>
  );
}
