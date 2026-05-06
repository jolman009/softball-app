import { CalendarRange, UsersRound, Video } from "lucide-react";

export function AdminDashboardPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-clay">Admin Dashboard</p>
      <h1 className="mt-3 text-4xl font-black">Manage the training operation.</h1>

      <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="rounded bg-white p-6 shadow-soft">
          <div className="flex items-center gap-3">
            <CalendarRange className="text-field" />
            <h2 className="text-xl font-black">Schedule controls</h2>
          </div>
          <ul className="mt-5 space-y-3 text-ink/70">
            <li>Availability windows</li>
            <li>Blocked dates and special openings</li>
            <li>Google Calendar sync status</li>
            <li>Booking approval and session notes</li>
          </ul>
        </div>

        <div className="grid gap-4">
          <div className="rounded bg-white p-6 shadow-soft">
            <UsersRound className="text-clay" />
            <h2 className="mt-4 text-xl font-black">Clients</h2>
            <p className="mt-2 leading-7 text-ink/68">
              Profiles, athlete details, waivers, and private notes will live here.
            </p>
          </div>
          <div className="rounded bg-white p-6 shadow-soft">
            <Video className="text-field" />
            <h2 className="mt-4 text-xl font-black">Resources</h2>
            <p className="mt-2 leading-7 text-ink/68">
              Upload videos, handouts, links, and drills backed by Supabase Storage.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
