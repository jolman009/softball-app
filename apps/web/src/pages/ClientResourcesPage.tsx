import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText, Film, ImageIcon, LinkIcon, Library } from "lucide-react";
import { fetchResources, type Resource, type ResourceType } from "@/lib/api";
import { Alert } from "@/components/ui";

function typeIcon(type: ResourceType) {
  switch (type) {
    case "video":
      return Film;
    case "image":
      return ImageIcon;
    case "pdf":
      return FileText;
    case "link":
      return LinkIcon;
    default:
      return FileText;
  }
}

const TYPE_LABEL: Record<ResourceType, string> = {
  video: "Video",
  pdf: "PDF",
  image: "Image",
  link: "Link",
  text: "Note"
};

export function ClientResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetchResources()
      .then((data) => {
        if (isMounted) setResources(data);
      })
      .catch((err: unknown) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Unable to load resources.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Group by category name for a tidy list; uncategorized falls last.
  const groups = useMemo(() => {
    const map = new Map<string, Resource[]>();
    for (const r of resources) {
      const key = r.category?.name ?? "Other";
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
  }, [resources]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <header className="flex flex-col gap-1">
        <Link
          to="/dashboard"
          className="focus-ring inline-flex w-fit items-center gap-1.5 text-sm font-bold text-ink/65 hover:text-ink"
        >
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>
        <p className="mt-3 text-sm font-bold uppercase tracking-[0.18em] text-field">Training library</p>
        <h1 className="mt-1 text-4xl font-black">Resources.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-ink/68">
          Drills, videos, and notes your coach has shared with you. Open any one for the full detail.
        </p>
      </header>

      <section className="mt-10">
        {isLoading ? (
          <Alert variant="info" size="lg">Loading resources…</Alert>
        ) : error ? (
          <Alert variant="error" role="alert">{error}</Alert>
        ) : resources.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded bg-white px-4 py-12 text-center shadow-soft">
            <Library className="text-ink/30" />
            <p className="text-sm font-semibold text-ink/60">
              No resources have been shared with you yet. Check back after your next session.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map(([category, items]) => (
              <div key={category}>
                <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-ink/65">{category}</h2>
                <ul className="mt-3 grid gap-4 sm:grid-cols-2">
                  {items.map((r) => (
                    <ResourceCard key={r.id} resource={r} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ResourceCard({ resource }: { resource: Resource }) {
  const Icon = typeIcon(resource.resource_type);
  return (
    <li>
      <Link
        to={`/resources/${resource.id}`}
        className="focus-ring flex h-full flex-col rounded bg-white p-5 shadow-soft transition hover:shadow-md"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-chalk text-field">
            <Icon size={18} />
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-ink/65">
            {TYPE_LABEL[resource.resource_type]}
          </span>
        </div>
        <h3 className="mt-3 text-lg font-black leading-snug">{resource.title}</h3>
        {resource.description ? (
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-ink/65">{resource.description}</p>
        ) : null}
      </Link>
    </li>
  );
}
