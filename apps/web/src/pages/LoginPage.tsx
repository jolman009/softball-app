import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { KeyRound, LogIn, Mail, RotateCcw, UserPlus } from "lucide-react";
import { GoogleIcon } from "@/components/GoogleIcon";
import { LogoMark } from "@/components/Logo";
import { getRoleHomePath, useAuth } from "@/lib/auth";
import { Alert, Button, FieldWrapper, Input } from "@/components/ui";

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
  const [messageType, setMessageType] = useState<"error" | "success">("error");
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
        setMessageType("success");
        setMessage("Check your email for a secure password reset link.");
        return;
      }

      if (mode === "create-account") {
        const result =
          accountType === "athlete"
            ? await signUpClient({ fullName, athleteName, email, password })
            : await signUpStaff({ fullName, email, password });

        if (result.needsEmailConfirmation) {
          setMessageType("success");
          setMessage("Check your email to confirm the account, then sign in.");
          return;
        }

        navigate(returnPath ?? getRoleHomePath(result.profile), { replace: true });
        return;
      }

      const nextProfile = await signIn({ email, password });
      navigate(returnPath ?? getRoleHomePath(nextProfile), { replace: true });
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setMessage(null);
    setIsSubmitting(true);
    try {
      // The role isn't known until after the OAuth round-trip, so we can't pick
      // /admin vs /dashboard here. If the user was headed somewhere specific
      // (returnPath), send them straight back there; otherwise return to /login,
      // whose effect below routes by role via getRoleHomePath once the profile loads.
      await signInWithGoogle({
        redirectTo: `${window.location.origin}${returnPath ?? "/login"}`
      });
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Unable to start Google sign-in.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[0.82fr_1.18fr]">
      <section>
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-field">
          <LogoMark size={22} />
          On Deck · Account access
        </p>
        <h1 className="mt-3 text-4xl font-black">Sign in, create an account, or reset your password.</h1>
        <p className="mt-4 text-lg leading-8 text-ink/70">
          Your sessions, notes, and training resources live behind a secure sign-in. After you sign in,
          On Deck sends you straight to the right dashboard for your role.
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
        {/* Segmented-control mode picker — bespoke toggle pattern, not mapped to Button primitive */}
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
            {/* Google OAuth button — secondary variant, full-width, lg size */}
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => void handleGoogleSignIn()}
              disabled={isSubmitting}
              iconLeft={<GoogleIcon />}
              className="w-full"
            >
              Continue with Google
            </Button>
            <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.16em] text-ink/65">
              <span className="h-px flex-1 bg-ink/10" />
              or use email
              <span className="h-px flex-1 bg-ink/10" />
            </div>
          </div>
        ) : null}

        <form className={mode === "reset-password" ? "mt-6" : ""} onSubmit={handleSubmit}>
          {mode === "create-account" ? (
            <>
              {/* Segmented-control account type picker — bespoke toggle, not mapped to Button primitive */}
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-ink/65">Account type</p>
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
                <Alert variant="info" size="sm" className="mt-3">
                  Coach and staff accounts are created as standard accounts. Admin access is
                  granted by an existing admin after sign-up.
                </Alert>
              ) : null}

              <div
                className={[
                  "mt-5 grid gap-5",
                  accountType === "athlete" ? "sm:grid-cols-2" : ""
                ].join(" ")}
              >
                <FieldWrapper
                  label={accountType === "athlete" ? "Parent or athlete name" : "Your full name"}
                  htmlFor="full-name"
                >
                  <Input
                    id="full-name"
                    inputSize="lg"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                  />
                </FieldWrapper>
                {accountType === "athlete" ? (
                  <FieldWrapper label="Athlete name" htmlFor="athlete-name">
                    <Input
                      id="athlete-name"
                      inputSize="lg"
                      type="text"
                      value={athleteName}
                      onChange={(event) => setAthleteName(event.target.value)}
                      required
                    />
                  </FieldWrapper>
                ) : null}
              </div>
            </>
          ) : null}

          <FieldWrapper
            label="Email"
            htmlFor="email"
            className={mode === "create-account" ? "mt-5" : ""}
          >
            <Input
              id="email"
              inputSize="lg"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              leadingIcon={<Mail size={18} />}
              required
            />
          </FieldWrapper>

          {mode !== "reset-password" ? (
            <FieldWrapper label="Password" htmlFor="password" className="mt-5">
              <Input
                id="password"
                inputSize="lg"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
            </FieldWrapper>
          ) : null}

          {message ? (
            <Alert variant={messageType} role="alert" className="mt-4">
              {message}
            </Alert>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* "Back to booking" is a <Link>, not a <button> — kept ad-hoc since Button wraps HTMLButtonElement */}
            <Link
              to="/booking"
              className="focus-ring inline-flex items-center justify-center rounded border border-ink/12 px-5 py-3 font-bold text-ink transition hover:bg-chalk"
            >
              Back to booking
            </Link>
            {/* Primary submit — primary variant, lg size, icon left, loading state */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              iconLeft={
                mode === "create-account" ? <UserPlus size={18} /> :
                mode === "reset-password" ? <RotateCcw size={18} /> :
                <LogIn size={18} />
              }
            >
              {mode === "create-account"
                ? "Create account"
                : mode === "reset-password"
                  ? "Send reset link"
                  : "Sign in"}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
