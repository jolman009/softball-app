import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/dashboard";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      return;
    }

    navigate(from, { replace: true });
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[0.8fr_1.2fr]">
      <section>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-field">Sign in</p>
        <h1 className="mt-3 text-4xl font-black">Access your dashboard.</h1>
        <p className="mt-4 text-lg leading-8 text-ink/70">
          Supabase Auth powers client and admin sessions. New account creation will be wired into the booking flow.
        </p>
      </section>

      <form className="rounded bg-white p-6 shadow-soft" onSubmit={handleSubmit}>
        <label className="block text-sm font-bold" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="focus-ring mt-2 w-full rounded border border-ink/10 px-4 py-3"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label className="mt-5 block text-sm font-bold" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="focus-ring mt-2 w-full rounded border border-ink/10 px-4 py-3"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {message ? <p className="mt-4 text-sm font-semibold text-clay">{message}</p> : null}
        <button
          type="submit"
          className="focus-ring mt-6 inline-flex items-center gap-2 rounded bg-ink px-5 py-3 font-bold text-white transition hover:bg-clay"
        >
          <LogIn size={18} />
          Sign in
        </button>
      </form>
    </main>
  );
}
