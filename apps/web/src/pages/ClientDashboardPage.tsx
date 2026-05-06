import { BookOpen, CalendarDays, ClipboardList } from "lucide-react";

export function ClientDashboardPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-field">Client Dashboard</p>
      <h1 className="mt-3 text-4xl font-black">Sessions, resources, and coach notes.</h1>

      <section className="mt-10 grid gap-6 lg:grid-cols-3">
        {[
          {
            icon: CalendarDays,
            title: "Upcoming sessions",
            body: "Confirmed bookings will appear here with reschedule and cancellation policies."
          },
          {
            icon: ClipboardList,
            title: "Training notes",
            body: "Coach feedback, focus areas, and session history will be visible to the signed-in client."
          },
          {
            icon: BookOpen,
            title: "Resource library",
            body: "Supabase Storage will power drills, videos, PDFs, and athlete-specific materials."
          }
        ].map((item) => (
          <article key={item.title} className="rounded bg-white p-6 shadow-soft">
            <item.icon className="text-clay" />
            <h2 className="mt-4 text-xl font-black">{item.title}</h2>
            <p className="mt-2 leading-7 text-ink/68">{item.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
