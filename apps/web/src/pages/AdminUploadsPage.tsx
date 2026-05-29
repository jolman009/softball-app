import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Film, Video } from "lucide-react";
import { ApiError, fetchAdminUploads, type ClientUpload, type UploadStatus } from "@/lib/api";

const STATUS_FILTERS: { value: UploadStatus | "all"; label: string }[] = [
  { value: "pending_review", label: "Pending" },
  { value: "reviewed", label: "Reviewed" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" }
];

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

export function AdminUploadsPage() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? undefined;

  const [uploads, setUploads] = useState<ClientUpload[]>([]);
  const [status, setStatus] = useState<UploadStatus | "all">("pending_review");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (s: UploadStatus | "all") => {
      setIsLoading(true);
      setError(null);
      try {
        setUploads(
          await fetchAdminUploads({ status: s === "all" ? undefined : s, clientId })
        );
      } catch (err) {
        setError(formatError(err));
      } finally {
        setIsLoading(false);
      }
    },
    [clientId]
  );

  useEffect(() => {
    void reload(status);
  }, [status, reload]);

  const athleteName = clientId ? uploads[0]?.client?.athlete_name : undefined;

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
        <h1 className="mt-1 text-4xl font-black">Video review.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-ink/68">
          {clientId
            ? `Uploads from ${athleteName ?? "this athlete"}.`
            : "Clips your athletes have sent for feedback. Open one to watch it and leave a summary."}
        </p>
      </header>

      <section className="mt-8">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus(f.value)}
              className={[
                "focus-ring rounded px-3 py-2 text-xs font-bold uppercase tracking-wide transition",
                status === f.value ? "bg-ink text-white" : "bg-white text-ink/60 hover:bg-chalk"
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mt-4 rounded border border-clay/20 bg-clay/5 px-4 py-2 text-sm font-semibold text-clay">
            {error}
          </p>
        ) : null}

        <div className="mt-6 overflow-hidden rounded bg-white shadow-soft">
          {isLoading ? (
            <p className="px-4 py-5 text-sm font-semibold text-ink/60">Loading uploads…</p>
          ) : uploads.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <Video className="text-ink/30" />
              <p className="text-sm font-semibold text-ink/60">No uploads match this filter.</p>
            </div>
          ) : (
            <ul className="divide-y divide-ink/10">
              {uploads.map((u) => (
                <li key={u.id}>
                  <Link
                    to={`/admin/uploads/${u.id}`}
                    className="focus-ring flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-chalk/60"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-chalk text-ink/60">
                        <Film size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-bold">{u.title}</p>
                        <p className="truncate text-sm text-ink/55">
                          {u.client?.athlete_name ?? "Unknown athlete"} · {formatDate(u.created_at)}
                          {u.booking?.training_type ? ` · ${u.booking.training_type.name}` : ""}
                        </p>
                      </div>
                    </div>
                    <span
                      className={[
                        "inline-flex shrink-0 items-center rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
                        statusBadgeClass(u.status)
                      ].join(" ")}
                    >
                      {STATUS_COPY[u.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
