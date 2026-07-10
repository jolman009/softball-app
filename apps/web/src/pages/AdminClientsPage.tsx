import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, Users } from "lucide-react";
import {
  ApiError,
  fetchAdminClients,
  type AdminClientListItem,
  type SkillLevel
} from "@/lib/api";
import { Alert, Badge, Input, type BadgeVariant } from "@/components/ui";

const SKILL_FILTERS: { value: SkillLevel | "all"; label: string }[] = [
  { value: "all", label: "All levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" }
];

function formatError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

const SKILL_VARIANTS: Record<SkillLevel, BadgeVariant> = {
  advanced: "positive-solid",
  intermediate: "positive",
  beginner: "default"
};

export function AdminClientsPage() {
  const [clients, setClients] = useState<AdminClientListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [skill, setSkill] = useState<SkillLevel | "all">("all");

  const reload = useCallback(async (term: string, level: SkillLevel | "all") => {
    setIsLoading(true);
    setError(null);
    try {
      setClients(
        await fetchAdminClients({
          search: term.trim() || undefined,
          skillLevel: level === "all" ? undefined : level
        })
      );
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounce the search term so we don't fire a request per keystroke.
  useEffect(() => {
    const handle = setTimeout(() => void reload(search, skill), 250);
    return () => clearTimeout(handle);
  }, [search, skill, reload]);

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
        <p className="mt-3 text-sm font-bold uppercase tracking-[0.18em] text-clay">Phase 4 · Admin</p>
        <h1 className="mt-1 text-4xl font-black">Clients.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-ink/68">
          Every athlete who has booked or been added. Search by athlete or guardian name, filter by skill
          level, and open a profile for details, booking history, and session notes.
        </p>
      </header>

      <section className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search athlete or guardian…"
              leadingIcon={<Search size={16} />}
              aria-label="Search athlete or guardian"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SKILL_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setSkill(f.value)}
                className={[
                  "focus-ring rounded px-3 py-2 text-xs font-bold uppercase tracking-wide transition",
                  skill === f.value ? "bg-ink text-white" : "bg-white text-ink/60 hover:bg-chalk"
                ].join(" ")}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <Alert variant="error" size="sm" role="alert" className="mt-4">
            {error}
          </Alert>
        ) : null}

        <div className="mt-6 overflow-hidden rounded bg-white shadow-soft">
          {isLoading ? (
            <p className="px-4 py-5 text-sm font-semibold text-ink/60">Loading clients…</p>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <Users className="text-ink/30" />
              <p className="text-sm font-semibold text-ink/60">
                {search || skill !== "all"
                  ? "No clients match those filters."
                  : "No clients yet. They appear here after their first booking."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-ink/10">
              {clients.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/admin/clients/${c.id}`}
                    className="focus-ring flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-chalk/60"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Badge
                        variant={c.skill_level ? SKILL_VARIANTS[c.skill_level] : "info"}
                        className="shrink-0"
                      >
                        {c.skill_level ?? "—"}
                      </Badge>
                      <div className="min-w-0">
                        <p className="truncate font-bold">{c.athlete_name}</p>
                        <p className="truncate text-sm text-ink/65">
                          {c.guardian_name ? `${c.guardian_name} · ` : ""}
                          {c.profile?.email ?? "no email on file"}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-ink/65">
                      {c.session_count} {c.session_count === 1 ? "session" : "sessions"}
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
