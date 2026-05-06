import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-clay">404</p>
      <h1 className="mt-3 text-4xl font-black">Page not found.</h1>
      <Link className="focus-ring mt-6 inline-flex rounded bg-ink px-5 py-3 font-bold text-white" to="/">
        Back home
      </Link>
    </main>
  );
}
