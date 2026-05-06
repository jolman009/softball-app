import { CalendarClock, CheckCircle2 } from "lucide-react";

const trainingTypes = ["Batting", "Pitching", "Defense/Infield", "Defense/Outfield", "Other"];
const sampleSlots = ["Mon 5:00 PM", "Mon 6:15 PM", "Wed 5:30 PM", "Sat 9:00 AM"];

export function BookingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <section>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-clay">Booking</p>
          <h1 className="mt-3 text-4xl font-black">Choose a lesson and reserve a clean opening.</h1>
          <p className="mt-4 text-lg leading-8 text-ink/70">
            This placeholder will connect to the API availability engine and Supabase Auth.
          </p>
        </section>

        <section className="rounded bg-white p-6 shadow-soft">
          <div className="flex items-center gap-3">
            <CalendarClock className="text-field" />
            <h2 className="text-xl font-black">Training type</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {trainingTypes.map((type) => (
              <button
                key={type}
                type="button"
                className="focus-ring rounded border border-ink/10 px-4 py-3 text-left font-semibold transition hover:border-field hover:bg-field/5"
              >
                {type}
              </button>
            ))}
          </div>

          <h2 className="mt-8 text-xl font-black">Next openings</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {sampleSlots.map((slot) => (
              <button
                key={slot}
                type="button"
                className="focus-ring flex items-center justify-between rounded border border-ink/10 px-4 py-3 text-left font-semibold transition hover:border-clay hover:bg-clay/5"
              >
                {slot}
                <CheckCircle2 size={18} className="text-clay" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
