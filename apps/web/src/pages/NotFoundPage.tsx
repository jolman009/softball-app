import { Link } from "react-router-dom";
import { ArrowLeft, CalendarClock, Compass } from "lucide-react";

export function NotFoundPage() {
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[0.82fr_1.18fr]">
      <section>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-clay">404</p>
        <h1 className="mt-3 text-4xl font-black sm:text-5xl">This page is off the field.</h1>
        <p className="mt-4 text-lg leading-8 text-ink/70">
          The link may be old, mistyped, or pointing at something we haven't built yet. Pick a spot below and we'll get
          you back on track.
        </p>
        <div className="mt-8 rounded bg-ink p-5 text-white shadow-soft">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded bg-white/12">
              <Compass size={22} />
            </div>
            <div>
              <h2 className="font-black">Need a hand?</h2>
              <p className="text-sm text-white/70">Most things start from the landing page or the booking flow.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded bg-white p-5 shadow-soft sm:p-6">
        <h2 className="text-xl font-black">Where to next</h2>
        <ul className="mt-5 grid gap-3">
          <li>
            <Link
              to="/"
              className="focus-ring flex items-center justify-between gap-3 rounded border border-ink/10 px-4 py-3 font-bold text-ink transition hover:border-field hover:bg-field/5"
            >
              <span className="inline-flex items-center gap-3">
                <ArrowLeft size={18} className="text-field" />
                Back to the landing page
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/booking"
              className="focus-ring flex items-center justify-between gap-3 rounded border border-ink/10 px-4 py-3 font-bold text-ink transition hover:border-clay hover:bg-clay/5"
            >
              <span className="inline-flex items-center gap-3">
                <CalendarClock size={18} className="text-clay" />
                Book a session
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/login"
              className="focus-ring flex items-center justify-between gap-3 rounded border border-ink/10 px-4 py-3 font-bold text-ink transition hover:border-ink hover:bg-chalk"
            >
              <span>Sign in or create an account</span>
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
