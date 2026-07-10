import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ScrollText } from "lucide-react";
import { ApiError, fetchAuditLogs, type AuditAction, type AuditLogRow, type BookingStatus } from "@/lib/api";
import { Alert, Badge, Button, type BadgeVariant } from "@/components/ui";

const PAGE_SIZE = 100;

const ACTION_FILTERS: { value: AuditAction | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "created", label: "Created" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No-show" },
  { value: "updated", label: "Updated" }
];

const ACTION_COPY: Record<AuditAction, string> = {
  created: "Created",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  completed: "Completed",
  no_show: "No-show",
  updated: "Updated",
  calendar_synced: "Calendar synced"
};

const ACTION_VARIANTS: Record<AuditAction, BadgeVariant> = {
  created: "primary",
  confirmed: "positive-solid",
  completed: "positive",
  cancelled: "destructive",
  no_show: "destructive-light",
  rescheduled: "default",
  calendar_synced: "positive",
  updated: "info"
};

function formatError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function actorName(actor: AuditLogRow["actor"]): string {
  if (!actor) return "System";
  const name = [actor.first_name, actor.last_name].filter(Boolean).join(" ").trim();
  return name || actor.email;
}

const STATUS_COPY: Record<BookingStatus, string> = {
  hold: "hold",
  pending: "pending",
  confirmed: "confirmed",
  cancelled: "cancelled",
  completed: "completed",
  no_show: "no-show",
  rescheduled: "rescheduled"
};

export function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [action, setAction] = useState<AuditAction | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (a: AuditAction | "all") => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await fetchAuditLogs({ action: a === "all" ? undefined : a, limit: PAGE_SIZE, offset: 0 });
      setLogs(rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(action);
  }, [action, load]);

  async function loadMore() {
    setIsLoadingMore(true);
    try {
      const rows = await fetchAuditLogs({
        action: action === "all" ? undefined : action,
        limit: PAGE_SIZE,
        offset: logs.length
      });
      setLogs((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <header className="flex flex-col gap-1">
        <Link
          to="/admin"
          className="focus-ring inline-flex w-fit items-center gap-1.5 text-sm font-bold text-ink/65 hover:text-ink"
        >
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>
        <p className="mt-3 text-sm font-bold uppercase tracking-[0.18em] text-clay">Phase 5 · Admin</p>
        <h1 className="mt-1 text-4xl font-black">Audit log.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-ink/68">
          Every booking lifecycle event, newest first — who did what, and when. Status changes made through
          the admin tools are recorded as "System".
        </p>
      </header>

      <section className="mt-8">
        <div className="flex flex-wrap gap-1.5">
          {ACTION_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setAction(f.value)}
              className={[
                "focus-ring rounded px-3 py-2 text-xs font-bold uppercase tracking-wide transition",
                action === f.value ? "bg-ink text-white" : "bg-white text-ink/60 hover:bg-chalk"
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error ? (
          <Alert variant="error" size="sm" role="alert" className="mt-4">
            {error}
          </Alert>
        ) : null}

        <div className="mt-6 overflow-hidden rounded bg-white shadow-soft">
          {isLoading ? (
            <p className="px-4 py-5 text-sm font-semibold text-ink/60">Loading audit log…</p>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <ScrollText className="text-ink/30" />
              <p className="text-sm font-semibold text-ink/60">No audit entries match this filter.</p>
            </div>
          ) : (
            <ul className="divide-y divide-ink/10">
              {logs.map((log) => (
                <AuditRow key={log.id} log={log} />
              ))}
            </ul>
          )}
        </div>

        {hasMore && !isLoading ? (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={loadMore} loading={isLoadingMore}>
              {isLoadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function AuditRow({ log }: { log: AuditLogRow }) {
  const trainingLabel = log.booking?.training_type?.name ?? "Booking";
  const athlete = log.booking?.client;
  const showTransition = log.previous_status && log.new_status && log.previous_status !== log.new_status;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <Badge variant={ACTION_VARIANTS[log.action]} className="shrink-0">
          {ACTION_COPY[log.action]}
        </Badge>
        <div className="min-w-0">
          <p className="truncate font-bold">
            {trainingLabel}
            {athlete ? (
              <>
                {" · "}
                <Link to={`/admin/clients/${athlete.id}`} className="text-field hover:underline">
                  {athlete.athlete_name}
                </Link>
              </>
            ) : (
              <span className="font-semibold text-ink/65"> · walk-in</span>
            )}
          </p>
          <p className="truncate text-sm text-ink/65">
            {showTransition ? (
              <>
                {STATUS_COPY[log.previous_status!]} → {STATUS_COPY[log.new_status!]} ·{" "}
              </>
            ) : null}
            {actorName(log.actor)}
          </p>
        </div>
      </div>
      <span className="shrink-0 text-sm font-semibold text-ink/50">{formatTimestamp(log.created_at)}</span>
    </li>
  );
}
