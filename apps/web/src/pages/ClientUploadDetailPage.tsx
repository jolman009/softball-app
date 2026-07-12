import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock3 } from "lucide-react";
import { fetchMyUpload, type ClientUpload, type UploadStatus } from "@/lib/api";
import { Alert, Badge, Card, type BadgeVariant } from "@/components/ui";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(iso));
}

const STATUS_COPY: Record<UploadStatus, string> = {
  pending_review: "Pending review",
  reviewed: "Reviewed",
  archived: "Archived"
};

const STATUS_VARIANTS: Record<UploadStatus, BadgeVariant> = {
  reviewed: "positive-solid",
  pending_review: "primary",
  archived: "default"
};

export function ClientUploadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [upload, setUpload] = useState<ClientUpload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    setIsLoading(true);
    fetchMyUpload(id)
      .then((data) => {
        if (isMounted) setUpload(data);
      })
      .catch((err: unknown) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Unable to load this upload.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [id]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link
        to="/dashboard"
        className="focus-ring inline-flex w-fit items-center gap-1.5 text-sm font-bold text-ink/65 hover:text-ink"
      >
        <ArrowLeft size={14} />
        Back to dashboard
      </Link>

      {isLoading ? (
        <Alert variant="info" size="lg" className="mt-8">Loading…</Alert>
      ) : error ? (
        <Alert variant="error" role="alert" className="mt-8">{error}</Alert>
      ) : !upload ? null : (
        <article className="mt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-4xl font-black">{upload.title}</h1>
              <p className="mt-2 text-sm text-ink/60">
                Uploaded {formatDate(upload.created_at)}
                {upload.booking?.training_type ? ` · ${upload.booking.training_type.name} lesson` : ""}
              </p>
            </div>
            <Badge variant={STATUS_VARIANTS[upload.status]} className="shrink-0 gap-1.5 px-3 py-1.5">
              {upload.status === "reviewed" ? <CheckCircle2 size={14} /> : null}
              {upload.status === "pending_review" ? <Clock3 size={14} /> : null}
              {STATUS_COPY[upload.status]}
            </Badge>
          </div>

          {upload.description ? (
            <p className="mt-4 leading-7 text-ink/68">
              <span className="font-bold text-ink/80">Your note:</span> {upload.description}
            </p>
          ) : null}

          <div className="mt-6">
            {upload.playback_url ? (
              <video controls className="w-full rounded bg-black shadow-soft" src={upload.playback_url}>
                Your browser does not support the video tag.
              </video>
            ) : (
              <Alert variant="error">This video is temporarily unavailable. Please try again in a moment.</Alert>
            )}
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-field">Coach feedback</h2>
            {upload.coach_summary ? (
              <Card padding="lg" className="mt-3 whitespace-pre-wrap leading-7 text-ink/80">
                {upload.coach_summary}
              </Card>
            ) : (
              <Alert variant="info" size="lg" className="mt-3">
                Your coach hasn't left feedback yet. You'll see it here once they've reviewed the clip.
              </Alert>
            )}
          </div>
        </article>
      )}
    </main>
  );
}
