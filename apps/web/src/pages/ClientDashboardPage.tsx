import { BookOpen, CalendarDays, ClipboardList } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function ClientDashboardPage() {
  const { profile, user, isEmailVerified } = useAuth();
  const displayName = profile?.first_name ?? user?.email?.split("@")[0] ?? "there";

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-field">Client Dashboard</p>
      <h1 className="mt-3 text-4xl font-black">Welcome back, {displayName}.</h1>
      <p className="mt-4 max-w-2xl leading-7 text-ink/70">
        Your account is signed in as {profile?.role ?? "client"}. Booking history, resources, and coach notes will
        appear here as the scheduling flow comes online.
      </p>

      {!isEmailVerified ? (
        <div className="mt-6 rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
          Check your inbox to verify your email before confirming paid sessions or accessing private resources.
        </div>
      ) : null}

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
