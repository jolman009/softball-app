import { Link } from "react-router-dom";
import { ArrowLeft, Construction } from "lucide-react";

export type AdminPlaceholderProps = {
  title: string;
  phase: string;
  description: string;
};

/**
 * Lightweight stand-in for admin routes that are linked from the dashboard but
 * whose real implementation lands in a later phase.
 */
export function AdminPlaceholderPage({ title, phase, description }: AdminPlaceholderProps) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-clay">{phase}</p>
      <h1 className="mt-3 text-4xl font-black">{title}</h1>
      <p className="mt-4 max-w-xl leading-7 text-ink/68">{description}</p>

      <div className="mt-8 flex items-center gap-3 rounded bg-white p-5 shadow-soft">
        <Construction className="text-field" size={28} />
        <p className="text-sm font-semibold text-ink/70">
          This page is a placeholder. The full implementation lands in {phase}.
        </p>
      </div>

      <Link
        to="/admin"
        className="focus-ring mt-8 inline-flex items-center gap-2 rounded border border-ink/12 px-5 py-3 font-bold text-ink transition hover:bg-chalk"
      >
        <ArrowLeft size={18} />
        Back to dashboard
      </Link>
    </main>
  );
}
