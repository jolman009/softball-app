import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { fetchResource, type Resource } from "@/lib/api";
import { Alert, Card } from "@/components/ui";

export function ResourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [resource, setResource] = useState<Resource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    setIsLoading(true);
    fetchResource(id)
      .then((data) => {
        if (isMounted) setResource(data);
      })
      .catch((err: unknown) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Unable to load this resource.");
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
        to="/resources"
        className="focus-ring inline-flex w-fit items-center gap-1.5 text-sm font-bold text-ink/65 hover:text-ink"
      >
        <ArrowLeft size={14} />
        Back to resources
      </Link>

      {isLoading ? (
        <Alert variant="info" size="lg" className="mt-8">Loading…</Alert>
      ) : error ? (
        <Alert variant="error" role="alert" className="mt-8">{error}</Alert>
      ) : !resource ? null : (
        <article className="mt-6">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-field">
            {resource.category?.name ?? "Resource"}
          </p>
          <h1 className="mt-2 text-4xl font-black">{resource.title}</h1>
          {resource.description ? (
            <p className="mt-3 leading-7 text-ink/68">{resource.description}</p>
          ) : null}

          <div className="mt-8">
            <ResourceBody resource={resource} />
          </div>
        </article>
      )}
    </main>
  );
}

function ResourceBody({ resource }: { resource: Resource }) {
  switch (resource.resource_type) {
    case "video":
      return resource.file_url ? (
        <video controls className="w-full rounded bg-black shadow-soft" src={resource.file_url}>
          Your browser does not support the video tag.
        </video>
      ) : (
        <Unavailable />
      );

    case "image":
      return resource.file_url ? (
        <img src={resource.file_url} alt={resource.title} className="w-full rounded shadow-soft" />
      ) : (
        <Unavailable />
      );

    case "pdf":
      return resource.file_url ? (
        <div className="overflow-hidden rounded shadow-soft">
          <iframe title={resource.title} src={resource.file_url} className="h-[75vh] w-full" />
          <a
            href={resource.file_url}
            target="_blank"
            rel="noreferrer"
            className="focus-ring mt-3 inline-flex items-center gap-2 rounded border border-ink/12 px-4 py-2 font-bold text-ink transition hover:bg-chalk"
          >
            Open PDF in a new tab
            <ExternalLink size={16} />
          </a>
        </div>
      ) : (
        <Unavailable />
      );

    case "link":
      return resource.external_url ? (
        <a
          href={resource.external_url}
          target="_blank"
          rel="noreferrer"
          className="focus-ring flex items-center justify-between gap-3 rounded bg-white p-5 shadow-soft transition hover:shadow-md"
        >
          <span className="min-w-0">
            <span className="block text-sm font-bold uppercase tracking-wide text-ink/65">Link</span>
            <span className="mt-1 block truncate font-bold text-field">{resource.external_url}</span>
          </span>
          <ExternalLink className="shrink-0 text-field" size={20} />
        </a>
      ) : (
        <Unavailable />
      );

    case "text":
      return (
        <Card padding="lg" className="whitespace-pre-wrap leading-7 text-ink/80">
          {resource.body}
        </Card>
      );

    default:
      return <Unavailable />;
  }
}

function Unavailable() {
  return (
    <Alert variant="error">This file is temporarily unavailable. Please try again in a moment.</Alert>
  );
}
