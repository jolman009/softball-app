import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { getRoleHomePath, useAuth } from "@/lib/auth";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { profile, updatePassword, refreshProfile } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordsMismatch =
    confirmPassword.length > 0 && password.length > 0 && password !== confirmPassword;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage("Passwords must match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await updatePassword(password);
      const nextProfile = await refreshProfile();
      navigate(getRoleHomePath(nextProfile ?? profile), { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[0.82fr_1.18fr]">
      <section>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-field">Password reset</p>
        <h1 className="mt-3 text-4xl font-black sm:text-5xl">Choose a new password.</h1>
        <p className="mt-4 text-lg leading-8 text-ink/70">
          Open this page from the reset link Supabase sent to your email. Set a new password and we'll take you to your
          dashboard.
        </p>
        <div className="mt-8 rounded bg-ink p-5 text-white shadow-soft">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded bg-white/12">
              <KeyRound size={22} />
            </div>
            <div>
              <h2 className="font-black">Reset links expire</h2>
              <p className="text-sm text-white/70">
                Use the link within an hour. Request a fresh one from the sign-in page if it stops working.
              </p>
            </div>
          </div>
        </div>
      </section>

      <form className="rounded bg-white p-5 shadow-soft sm:p-6" onSubmit={handleSubmit}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded bg-field/10 text-field">
            <KeyRound size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black">Secure update</h2>
            <p className="text-sm text-ink/62">Use at least six characters.</p>
          </div>
        </div>

        <label className="mt-6 block text-sm font-bold" htmlFor="new-password">
          New password
        </label>
        <input
          id="new-password"
          className="focus-ring mt-2 w-full rounded border border-ink/10 px-4 py-3"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setMessage(null);
          }}
          minLength={6}
          autoComplete="new-password"
          required
        />

        <label className="mt-5 block text-sm font-bold" htmlFor="confirm-password">
          Confirm password
        </label>
        <input
          id="confirm-password"
          className="focus-ring mt-2 w-full rounded border border-ink/10 px-4 py-3"
          type="password"
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            setMessage(null);
          }}
          minLength={6}
          autoComplete="new-password"
          required
          aria-invalid={passwordsMismatch}
        />
        {passwordsMismatch ? (
          <p className="mt-2 text-sm font-semibold text-clay">Passwords don't match yet.</p>
        ) : null}

        {message ? (
          <p className="mt-4 rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
            {message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            to="/login"
            className="focus-ring inline-flex items-center justify-center rounded border border-ink/12 px-5 py-3 font-bold text-ink transition hover:bg-chalk"
          >
            Back to sign in
          </Link>
          <button
            type="submit"
            className="focus-ring inline-flex items-center justify-center rounded bg-ink px-5 py-3 font-bold text-white transition hover:bg-clay disabled:cursor-not-allowed disabled:bg-ink/40"
            disabled={isSubmitting || passwordsMismatch}
          >
            {isSubmitting ? "Updating..." : "Update password"}
          </button>
        </div>
      </form>
    </main>
  );
}
