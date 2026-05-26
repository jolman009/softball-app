import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { KeyRound, LogIn, Mail, RotateCcw, UserPlus } from "lucide-react";
import { GoogleIcon } from "@/components/GoogleIcon";
import { getRoleHomePath, useAuth } from "@/lib/auth";

type AuthMode = "sign-in" | "create-account" | "reset-password";
type AccountType = "athlete" | "staff";

function getReturnPath(locationState: unknown) {
  const from = (locationState as { from?: { pathname?: string; search?: string } } | null)?.from;
  if (!from?.pathname || from.pathname === "/login") {
    return null;
  }

  return `${from.pathname}${from.search ?? ""}`;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signIn, signInWithGoogle, signUpClient, signUpStaff, requestPasswordReset, isLoading } = useAuth();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [accountType, setAccountType] = useState<AccountType>("athlete");
  const [fullName, setFullName] = useState("");
  const [athleteName, setAthleteName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const returnPath = useMemo(() => getReturnPath(location.state), [location.state]);

  useEffect(() => {
    if (!isLoading && profile) {
      navigate(returnPath ?? getRoleHomePath(profile), { replace: true });
    }
  }, [isLoading, navigate, profile, returnPath]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    try {
      if (mode === "reset-password") {
        await requestPasswordReset(email);
        setMessage("Check your email for a secure password reset link.");
        return;
      }

      if (mode === "create-account") {
        const result =
          accountType === "athlete"
            ? await signUpClient({ fullName, athleteName, email, password })
            : await signUpStaff({ fullName, email, password });

        if (result.needsEmailConfirmation) {
          setMessage("Check your email to confirm the account, then sign in.");
          return;
        }

        navigate(returnPath ?? getRoleHomePath(result.profile), { replace: true });
        return;
      }

      const nextProfile = await signIn({ email, password });
      navigate(returnPath ?? getRoleHomePath(nextProfile), { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setMessage(null);
    setIsSubmitting(true);
    try {
      // After Google returns the user to /dashboard, ProtectedRoute will redirect admins
      // to /admin if needed. We don't have the profile until after the OAuth round-trip.
      await signInWithGoogle({
        redirectTo: `${window.location.origin}${returnPath ?? "/dashboard"}`
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start Google sign-in.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[0.82fr_1.18fr]">
      <section>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-field">Account access</p>
        <h1 className="mt-3 text-4xl font-black">Sign in, create an account, or reset your password.</h1>
        <p className="mt-4 text-lg leading-8 text-ink/70">
          Supabase Auth protects client and admin sessions. The app loads your database profile after sign-in and sends
          you to the right dashboard for your role.
        </p>
        <div className="mt-8 rounded bg-ink p-5 text-white shadow-soft">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded bg-white/12">
              <KeyRound size={22} />
            </div>
            <div>
              <h2 className="font-black">Role-based access</h2>
              <p className="text-sm text-white/70">Clients see sessions and resources. Admins manage the business.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded bg-white p-5 shadow-soft sm:p-6">
        <div className="grid grid-cols-3 rounded bg-chalk p-1">
          {[
            { id: "sign-in", label: "Sign in" },
            { id: "create-account", label: "Create" },
            { id: "reset-password", label: "Reset" }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                "focus-ring rounded px-3 py-2 text-sm font-bold transition",
                mode === item.id ? "bg-white text-ink shadow-sm" : "text-ink/64 hover:text-ink"
              ].join(" ")}
              onClick={() => {
                setMode(item.id as AuthMode);
                setMessage(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {mode !== "reset-password" ? (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={isSubmitting}
              className="focus-ring inline-flex w-full items-center justify-center gap-3 rounded border border-ink/12 bg-white px-5 py-3 font-bold text-ink transition hover:bg-chalk disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.16em] text-ink/45">
              <span className="h-px flex-1 bg-ink/10" />
              or use email
              <span className="h-px flex-1 bg-ink/10" />
            </div>
          </div>
        ) : null}

        <form className={mode === "reset-password" ? "mt-6" : ""} onSubmit={handleSubmit}>
          {mode === "create-account" ? (
            <>
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-ink/55">Account type</p>
              <div className="mt-2 grid grid-cols-2 rounded bg-chalk p-1">
                {[
                  { id: "athlete" as AccountType, label: "Athlete or parent" },
                  { id: "staff" as AccountType, label: "Coach or staff" }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={[
                      "focus-ring rounded px-3 py-2 text-sm font-bold transition",
                      accountType === item.id
                        ? "bg-white text-ink shadow-sm"
                        : "text-ink/64 hover:text-ink"
                    ].join(" ")}
                    onClick={() => {
                      setAccountType(item.id);
                      setMessage(null);
                    }}
                    aria-pressed={accountType === item.id}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {accountType === "staff" ? (
                <p className="mt-3 rounded border border-ink/10 bg-chalk px-3 py-2 text-xs leading-5 text-ink/65">
                  Coach and staff accounts are created as standard accounts. Admin access is
                  granted by an existing admin after sign-up.
                </p>
              ) : null}

              <div
                className={[
                  "mt-5 grid gap-5",
                  accountType === "athlete" ? "sm:grid-cols-2" : ""
                ].join(" ")}
              >
                <div>
                  <label className="block text-sm font-bold" htmlFor="full-name">
                    {accountType === "athlete" ? "Parent or athlete name" : "Your full name"}
                  </label>
                  <input
                    id="full-name"
                    className="focus-ring mt-2 w-full rounded border border-ink/10 px-4 py-3"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                  />
                </div>
                {accountType === "athlete" ? (
                  <div>
                    <label className="block text-sm font-bold" htmlFor="athlete-name">
                      Athlete name
                    </label>
                    <input
                      id="athlete-name"
                      className="focus-ring mt-2 w-full rounded border border-ink/10 px-4 py-3"
                      type="text"
                      value={athleteName}
                      onChange={(event) => setAthleteName(event.target.value)}
                      required
                    />
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          <label className={["block text-sm font-bold", mode === "create-account" ? "mt-5" : ""].join(" ")} htmlFor="email">
            Email
          </label>
          <div className="relative mt-2">
            <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/42" size={18} />
            <input
              id="email"
              className="focus-ring w-full rounded border border-ink/10 py-3 pl-10 pr-4"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          {mode !== "reset-password" ? (
            <>
              <label className="mt-5 block text-sm font-bold" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="focus-ring mt-2 w-full rounded border border-ink/10 px-4 py-3"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
            </>
          ) : null}

          {message ? (
            <p className="mt-4 rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
              {message}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              to="/booking"
              className="focus-ring inline-flex items-center justify-center rounded border border-ink/12 px-5 py-3 font-bold text-ink transition hover:bg-chalk"
            >
              Back to booking
            </Link>
            <button
              type="submit"
              className="focus-ring inline-flex items-center justify-center gap-2 rounded bg-ink px-5 py-3 font-bold text-white transition hover:bg-clay disabled:cursor-not-allowed disabled:bg-ink/40"
              disabled={isSubmitting}
            >
              {mode === "create-account" ? <UserPlus size={18} /> : mode === "reset-password" ? <RotateCcw size={18} /> : <LogIn size={18} />}
              {isSubmitting
                ? "Working..."
                : mode === "create-account"
                  ? "Create account"
                  : mode === "reset-password"
                    ? "Send reset link"
                    : "Sign in"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
