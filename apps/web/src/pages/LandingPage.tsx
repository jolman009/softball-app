import { Link } from "react-router-dom";
import { ArrowRight, CalendarCheck, ShieldCheck } from "lucide-react";

export function LandingPage() {
  return (
    <main>
      <section className="relative isolate overflow-hidden bg-ink text-white">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(47,111,78,0.95),rgba(22,25,31,0.74)),url('https://images.unsplash.com/photo-1529768167801-9173d94c2a42?auto=format&fit=crop&w=1800&q=80')] bg-cover bg-center" />
        <div className="relative mx-auto flex min-h-[calc(100svh-73px)] max-w-6xl items-center px-4 py-20">
          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-white/75">
              Softball Training
            </p>
            <h1 className="text-5xl font-black tracking-normal sm:text-7xl">
              Book sharp, focused reps with a coach who knows the calendar.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/82">
              A polished booking and client portal for private lessons, athlete notes, and training resources.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/booking"
                className="focus-ring inline-flex items-center gap-2 rounded bg-white px-5 py-3 font-bold text-ink transition hover:bg-steel"
              >
                Book a session
                <ArrowRight size={18} />
              </Link>
              <Link
                to="/dashboard"
                className="focus-ring inline-flex items-center gap-2 rounded border border-white/40 px-5 py-3 font-bold text-white transition hover:bg-white/10"
              >
                Client dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h2 className="text-3xl font-black">Built around real availability.</h2>
          <p className="mt-4 text-lg leading-8 text-ink/72">
            The app treats the database as the booking source of truth and mirrors confirmed sessions to Google Calendar.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded bg-white p-6 shadow-soft">
            <CalendarCheck className="text-field" />
            <h3 className="mt-4 font-bold">Clean booking flow</h3>
            <p className="mt-2 text-sm leading-6 text-ink/68">
              Training types, available slots, holds, confirmations, and account creation in one path.
            </p>
          </div>
          <div className="rounded bg-white p-6 shadow-soft">
            <ShieldCheck className="text-clay" />
            <h3 className="mt-4 font-bold">Protected dashboards</h3>
            <p className="mt-2 text-sm leading-6 text-ink/68">
              Clients see their sessions and resources. Admins manage bookings, clients, and availability.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
