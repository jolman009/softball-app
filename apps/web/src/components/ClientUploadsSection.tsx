import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock3, Film, Loader2, UploadCloud } from "lucide-react";
import {
  ApiError,
  createUpload,
  fetchMyUploads,
  UPLOAD_ALLOWED_MIME,
  UPLOAD_MAX_BYTES,
  type BookingSummary,
  type ClientUpload,
  type UploadStatus
} from "@/lib/api";

function formatError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(iso)
  );
}

const STATUS_COPY: Record<UploadStatus, string> = {
  pending_review: "Pending review",
  reviewed: "Reviewed",
  archived: "Archived"
};

function statusBadgeClass(status: UploadStatus) {
  switch (status) {
    case "reviewed":
      return "bg-field text-white";
    case "pending_review":
      return "bg-ink text-white";
    case "archived":
    default:
      return "bg-chalk text-ink/65";
  }
}

const ACCEPT = UPLOAD_ALLOWED_MIME.join(",");

/**
 * Phase 4.5 client upload widget + "My uploads" list. Drops on the client
 * dashboard. `bookings` feeds the optional "attach to a lesson" dropdown.
 */
export function ClientUploadsSection({ bookings }: { bookings: BookingSummary[] }) {
  const [uploads, setUploads] = useState<ClientUpload[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetchMyUploads()
      .then((data) => {
        if (isMounted) setUploads(data);
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
  }, []);

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3">
        <Film className="text-field" />
        <h2 className="text-2xl font-black">Video uploads</h2>
      </div>
      <p className="mt-2 max-w-2xl leading-7 text-ink/68">
        Send your coach a swing or pitching clip for feedback. They'll review it and leave you a summary.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <UploadForm bookings={bookings} onUploaded={(u) => setUploads((prev) => [u, ...prev])} />

        <div>
          {isLoading ? (
            <p className="rounded border border-dashed border-ink/20 bg-chalk px-4 py-5 text-sm font-semibold text-ink/62">
              Loading your uploads…
            </p>
          ) : error ? (
            <p className="rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
              {error}
            </p>
          ) : uploads.length === 0 ? (
            <p className="rounded border border-dashed border-ink/20 bg-chalk px-4 py-5 text-sm font-semibold text-ink/62">
              No uploads yet. Add your first clip on the left.
            </p>
          ) : (
            <ul className="divide-y divide-ink/10 rounded bg-white shadow-soft">
              {uploads.map((u) => (
                <li key={u.id}>
                  <Link
                    to={`/uploads/${u.id}`}
                    className="focus-ring flex items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-chalk/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold">{u.title}</p>
                      <p className="truncate text-sm text-ink/55">
                        {formatDate(u.created_at)}
                        {u.booking?.training_type ? ` · ${u.booking.training_type.name}` : ""}
                      </p>
                    </div>
                    <span
                      className={[
                        "inline-flex shrink-0 items-center gap-1 rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
                        statusBadgeClass(u.status)
                      ].join(" ")}
                    >
                      {u.status === "reviewed" ? <CheckCircle2 size={13} /> : null}
                      {u.status === "pending_review" ? <Clock3 size={13} /> : null}
                      {STATUS_COPY[u.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function bytesToMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0);
}

function UploadForm({
  bookings,
  onUploaded
}: {
  bookings: BookingSummary[];
  onUploaded: (u: ClientUpload) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function pickFile(next: File | null) {
    setFormError(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (!(UPLOAD_ALLOWED_MIME as readonly string[]).includes(next.type)) {
      setFormError("Only MP4 or MOV videos are supported.");
      setFile(null);
      return;
    }
    if (next.size > UPLOAD_MAX_BYTES) {
      setFormError(`That file is ${bytesToMb(next.size)} MB — the limit is ${bytesToMb(UPLOAD_MAX_BYTES)} MB.`);
      setFile(null);
      return;
    }
    setFile(next);
    // Default the title to the filename (sans extension) if the user hasn't typed one.
    if (!title.trim()) {
      const dot = next.name.lastIndexOf(".");
      setTitle(dot > 0 ? next.name.slice(0, dot) : next.name);
    }
  }

  function reset() {
    setFile(null);
    setTitle("");
    setDescription("");
    setBookingId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!file) {
      setFormError("Choose a video to upload.");
      return;
    }
    if (!title.trim()) {
      setFormError("Give your clip a title.");
      return;
    }

    setIsUploading(true);
    try {
      const created = await createUpload(file, {
        title: title.trim(),
        description: description.trim() || null,
        bookingId: bookingId || null
      });
      onUploaded(created);
      reset();
    } catch (err) {
      setFormError(formatError(err));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form className="rounded bg-white p-5 shadow-soft" onSubmit={handleSubmit}>
      <label
        className="focus-within:border-field flex cursor-pointer flex-col items-center gap-2 rounded border border-dashed border-ink/25 bg-chalk/50 px-4 py-6 text-center transition hover:bg-chalk"
      >
        <UploadCloud className="text-field" />
        <span className="text-sm font-bold text-ink/75">
          {file ? file.name : "Choose a video (MP4 or MOV)"}
        </span>
        <span className="text-xs text-ink/50">Up to {bytesToMb(UPLOAD_MAX_BYTES)} MB</span>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <div className="mt-4">
        <label className="block text-xs font-bold uppercase tracking-wide text-ink/55" htmlFor="upload-title">
          Title
        </label>
        <input
          id="upload-title"
          className="focus-ring mt-1 w-full rounded border border-ink/15 bg-white px-3 py-2 text-sm font-semibold text-ink"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Front-toss swings 6/1"
        />
      </div>

      <div className="mt-4">
        <label
          className="block text-xs font-bold uppercase tracking-wide text-ink/55"
          htmlFor="upload-description"
        >
          Note for your coach <span className="font-semibold normal-case text-ink/40">(optional)</span>
        </label>
        <textarea
          id="upload-description"
          className="focus-ring mt-1 min-h-[60px] w-full resize-y rounded border border-ink/15 bg-white px-3 py-2 text-sm font-semibold leading-6 text-ink"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What should they look at?"
        />
      </div>

      {bookings.length > 0 ? (
        <div className="mt-4">
          <label
            className="block text-xs font-bold uppercase tracking-wide text-ink/55"
            htmlFor="upload-booking"
          >
            Attach to a lesson <span className="font-semibold normal-case text-ink/40">(optional)</span>
          </label>
          <select
            id="upload-booking"
            className="focus-ring mt-1 w-full rounded border border-ink/15 bg-white px-3 py-2 text-sm font-semibold text-ink"
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
          >
            <option value="">No lesson</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {formatDate(b.starts_at)} — {b.training_type?.name ?? "Session"}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {isUploading ? (
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-chalk">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-field" />
        </div>
      ) : null}

      {formError ? (
        <p className="mt-4 rounded border border-clay/20 bg-clay/5 px-3 py-2 text-sm font-semibold text-clay">
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isUploading}
        className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded bg-ink px-5 py-3 font-bold text-white transition hover:bg-clay disabled:opacity-60"
      >
        {isUploading ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
        {isUploading ? "Uploading…" : "Upload video"}
      </button>
    </form>
  );
}
