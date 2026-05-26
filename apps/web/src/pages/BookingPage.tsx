import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  CreditCard,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserPlus,
  X
} from "lucide-react";
import { GoogleIcon } from "@/components/GoogleIcon";
import { getRoleHomePath, useAuth } from "@/lib/auth";
import {
  ApiError,
  confirmBooking,
  createBooking,
  fetchAvailability,
  fetchTrainingTypes,
  type AvailabilitySlot,
  type TrainingType
} from "@/lib/api";

const PENDING_BOOKING_KEY = "softball:pendingBooking";

type PendingBooking = {
  trainingTypeId: string;
  startsAt: string;
  endsAt: string;
  otherTrainingText?: string;
};

type AuthMode = "sign-in" | "create-account";

const todayIso = new Date().toISOString().slice(0, 10);

function getDateLabel(date: string) {
  if (!date) return "Choose a date";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}

function formatSlotTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function startOfDayIso(date: string) {
  return new Date(`${date}T00:00:00`).toISOString();
}

function endOfDayIso(date: string) {
  return new Date(`${date}T23:59:59.999`).toISOString();
}

function slotId(slot: AvailabilitySlot) {
  return `${slot.starts_at}__${slot.ends_at}`;
}

function computeSessionTotal(type: TrainingType | null) {
  if (!type) return { hours: 1, rate: 30, total: 30 };
  const hours = type.default_duration_minutes / 60;
  const rate = Number(type.hourly_rate);
  const total = Math.round(hours * rate * 100) / 100;
  return { hours, rate, total };
}

export function BookingPage() {
  const navigate = useNavigate();
  const { profile, signIn, signInWithGoogle, signUpClient } = useAuth();

  // Training types are loaded from the API; the seeded names match the original UI labels.
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [trainingTypesError, setTrainingTypesError] = useState<string | null>(null);
  const [isLoadingTrainingTypes, setIsLoadingTrainingTypes] = useState(true);

  const [trainingTypeId, setTrainingTypeId] = useState<string | null>(null);
  const [otherTraining, setOtherTraining] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [authName, setAuthName] = useState("");
  const [authAthleteName, setAuthAthleteName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  const [isResuming, setIsResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  // StrictMode double-invokes effects in dev; this ref prevents a double-book.
  const resumeStartedRef = useRef(false);

  // Load training types on mount.
  useEffect(() => {
    let isMounted = true;

    fetchTrainingTypes()
      .then((types) => {
        if (!isMounted) return;
        setTrainingTypes(types);
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setTrainingTypesError(error instanceof Error ? error.message : "Unable to load training types.");
      })
      .finally(() => {
        if (isMounted) setIsLoadingTrainingTypes(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // After a Google OAuth round-trip, the user comes back as /booking?resume=1 with a session.
  // If we stashed a booking intent in sessionStorage before the redirect, finish the booking
  // automatically and send them to their dashboard instead of making them re-select.
  useEffect(() => {
    if (!profile) return;
    if (resumeStartedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("resume") !== "1") return;

    const raw = sessionStorage.getItem(PENDING_BOOKING_KEY);
    if (!raw) {
      navigate("/booking", { replace: true });
      return;
    }

    let intent: PendingBooking;
    try {
      intent = JSON.parse(raw) as PendingBooking;
    } catch {
      sessionStorage.removeItem(PENDING_BOOKING_KEY);
      navigate("/booking", { replace: true });
      return;
    }

    sessionStorage.removeItem(PENDING_BOOKING_KEY);
    resumeStartedRef.current = true;
    setIsResuming(true);

    (async () => {
      try {
        const hold = await createBooking({
          trainingTypeId: intent.trainingTypeId,
          startsAt: intent.startsAt,
          endsAt: intent.endsAt,
          otherTrainingText: intent.otherTrainingText
        });
        await confirmBooking(hold.id);
        navigate(getRoleHomePath(profile), { replace: true });
      } catch (err) {
        setResumeError(formatAuthError(err));
        navigate("/booking", { replace: true });
      } finally {
        setIsResuming(false);
      }
    })();
  }, [profile, navigate]);

  const selectedTrainingType = useMemo(
    () => trainingTypes.find((type) => type.id === trainingTypeId) ?? null,
    [trainingTypes, trainingTypeId]
  );
  const isOtherType = selectedTrainingType?.name === "Other";
  const isOtherMissing = isOtherType && otherTraining.trim().length === 0;
  const trainingLabel = isOtherType
    ? otherTraining.trim() || "Other training"
    : selectedTrainingType?.name ?? null;

  // Reload availability whenever the date or training type changes. A request counter
  // drops stale responses if the user clicks again before the previous load finishes.
  const availabilityRequestId = useRef(0);
  useEffect(() => {
    if (!selectedDate || !trainingTypeId) {
      setAvailableSlots([]);
      setSelectedSlotKey(null);
      setSlotsError(null);
      setIsLoadingSlots(false);
      return;
    }

    const requestId = ++availabilityRequestId.current;
    setIsLoadingSlots(true);
    setSlotsError(null);

    fetchAvailability({
      from: startOfDayIso(selectedDate),
      to: endOfDayIso(selectedDate),
      trainingTypeId
    })
      .then((slots) => {
        if (requestId !== availabilityRequestId.current) return;
        setAvailableSlots(slots);
        setSelectedSlotKey(null);
      })
      .catch((error: unknown) => {
        if (requestId !== availabilityRequestId.current) return;
        setAvailableSlots([]);
        setSlotsError(error instanceof Error ? error.message : "Unable to load available times.");
      })
      .finally(() => {
        if (requestId === availabilityRequestId.current) setIsLoadingSlots(false);
      });
  }, [selectedDate, trainingTypeId]);

  const selectedSlot = useMemo(
    () => availableSlots.find((slot) => slotId(slot) === selectedSlotKey) ?? null,
    [availableSlots, selectedSlotKey]
  );

  const { hours: sessionHours, rate: hourlyRate, total } = computeSessionTotal(selectedTrainingType);
  const canContinue = Boolean(selectedTrainingType && selectedDate && selectedSlot && !isOtherMissing);
  const canConfirm =
    authEmail.trim().length > 0 &&
    authPassword.trim().length > 0 &&
    (authMode === "sign-in" || (authName.trim().length > 0 && authAthleteName.trim().length > 0));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(null);

    if (!canContinue) {
      setFormMessage("Choose a training type, date, and time before confirming.");
      return;
    }

    setShowAuthModal(true);
  }

  async function handleConfirm() {
    if (!selectedTrainingType || !selectedSlot) {
      setAuthMessage("Choose a training type and time before confirming.");
      return;
    }

    setAuthMessage(null);
    setIsAuthSubmitting(true);

    try {
      if (authMode === "create-account") {
        const result = await signUpClient({
          fullName: authName,
          athleteName: authAthleteName,
          email: authEmail,
          password: authPassword
        });

        if (result.needsEmailConfirmation) {
          setAuthMessage("Check your email to confirm the account, then sign in to finish booking.");
          return;
        }

        await bookSelectedSlot();
        setShowAuthModal(false);
        navigate(getRoleHomePath(result.profile));
        return;
      }

      const profile = await signIn({ email: authEmail, password: authPassword });
      await bookSelectedSlot();
      setShowAuthModal(false);
      navigate(getRoleHomePath(profile));
    } catch (error) {
      setAuthMessage(formatAuthError(error));
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handleGoogleConfirm() {
    if (!selectedTrainingType || !selectedSlot) {
      setAuthMessage("Choose a training type and time before confirming.");
      return;
    }

    setAuthMessage(null);
    setIsAuthSubmitting(true);

    try {
      const intent: PendingBooking = {
        trainingTypeId: selectedTrainingType.id,
        startsAt: selectedSlot.starts_at,
        endsAt: selectedSlot.ends_at,
        otherTrainingText: isOtherType ? otherTraining.trim() : undefined
      };
      sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(intent));
      await signInWithGoogle({
        redirectTo: `${window.location.origin}/booking?resume=1`
      });
      // The browser is about to navigate away; nothing else to do here.
    } catch (error) {
      sessionStorage.removeItem(PENDING_BOOKING_KEY);
      setAuthMessage(formatAuthError(error));
      setIsAuthSubmitting(false);
    }
  }

  async function bookSelectedSlot() {
    if (!selectedTrainingType || !selectedSlot) {
      throw new Error("A training type and time are required.");
    }

    // Two-step reservation: a hold blocks the slot at the DB layer, then `confirm` flips it
    // to `confirmed`. If the hold succeeds but confirm fails, the hold expires on its own
    // within a few minutes.
    const hold = await createBooking({
      trainingTypeId: selectedTrainingType.id,
      startsAt: selectedSlot.starts_at,
      endsAt: selectedSlot.ends_at,
      otherTrainingText: isOtherType ? otherTraining.trim() : undefined
    });
    await confirmBooking(hold.id);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      {isResuming ? (
        <div className="mb-6 rounded border border-field/20 bg-field/5 px-4 py-3 text-sm font-semibold text-field">
          Signing you in and finishing your booking…
        </div>
      ) : null}
      {resumeError ? (
        <div className="mb-6 rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
          {resumeError}
        </div>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
        <section className="lg:sticky lg:top-24">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-field">Booking</p>
          <h1 className="mt-3 max-w-xl text-4xl font-black sm:text-5xl">
            Reserve a focused softball lesson.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-ink/70">
            Pick the work, choose a date, and hold a one-hour training window. Account sign-in happens before the
            booking is confirmed.
          </p>

          <div className="mt-8 rounded bg-ink p-5 text-white shadow-soft">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded bg-white/12">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h2 className="font-black">Session rate</h2>
                <p className="text-sm text-white/70">${hourlyRate} per hour</p>
              </div>
            </div>
            <dl className="mt-6 grid gap-3 text-sm">
              <div className="flex items-center justify-between border-t border-white/12 pt-3">
                <dt className="text-white/68">Training</dt>
                <dd className="max-w-[12rem] truncate font-bold">{trainingLabel ?? "Not selected"}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-white/12 pt-3">
                <dt className="text-white/68">Date</dt>
                <dd className="font-bold">{getDateLabel(selectedDate)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-white/12 pt-3">
                <dt className="text-white/68">Time</dt>
                <dd className="font-bold">{selectedSlot ? formatSlotTime(selectedSlot.starts_at) : "Choose a time"}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-white/12 pt-3">
                <dt className="text-white/68">Total</dt>
                <dd className="text-xl font-black">${total}</dd>
              </div>
            </dl>
          </div>
        </section>

        <form className="rounded bg-white p-5 shadow-soft sm:p-6" onSubmit={handleSubmit}>
          <section>
            <div className="flex items-center gap-3">
              <CalendarClock className="text-field" />
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-ink/45">Step 1</p>
                <h2 className="text-xl font-black">Training type</h2>
              </div>
            </div>

            {isLoadingTrainingTypes ? (
              <p className="mt-5 rounded border border-dashed border-ink/20 bg-chalk px-4 py-5 text-sm font-semibold text-ink/62">
                Loading training types…
              </p>
            ) : trainingTypesError ? (
              <p className="mt-5 rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
                {trainingTypesError}
              </p>
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {trainingTypes.map((type) => {
                  const isSelected = trainingTypeId === type.id;

                  return (
                    <button
                      key={type.id}
                      type="button"
                      className={[
                        "focus-ring flex min-h-16 items-center justify-between rounded border px-4 py-3 text-left font-semibold transition",
                        isSelected
                          ? "border-field bg-field text-white"
                          : "border-ink/10 bg-white hover:border-field hover:bg-field/5"
                      ].join(" ")}
                      onClick={() => {
                        setTrainingTypeId(type.id);
                        setFormMessage(null);
                      }}
                      aria-pressed={isSelected}
                    >
                      <span>{type.name}</span>
                      {isSelected ? <Check size={18} /> : null}
                    </button>
                  );
                })}
              </div>
            )}

            {isOtherType ? (
              <div className="mt-4">
                <label className="block text-sm font-bold" htmlFor="other-training">
                  Tell us what you want to work on
                </label>
                <input
                  id="other-training"
                  className="focus-ring mt-2 w-full rounded border border-ink/10 px-4 py-3"
                  type="text"
                  value={otherTraining}
                  onChange={(event) => {
                    setOtherTraining(event.target.value);
                    setFormMessage(null);
                  }}
                  placeholder="Example: catching, baserunning, tryout prep"
                  required
                />
                {isOtherMissing ? (
                  <p className="mt-2 text-sm font-semibold text-clay">A short note is required for Other.</p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="mt-8 border-t border-ink/10 pt-8">
            <div className="flex items-center gap-3">
              <Clock3 className="text-clay" />
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-ink/45">Step 2</p>
                <h2 className="text-xl font-black">Date and time</h2>
              </div>
            </div>

            <label className="mt-5 block text-sm font-bold" htmlFor="booking-date">
              Lesson date
            </label>
            <input
              id="booking-date"
              className="focus-ring mt-2 w-full rounded border border-ink/10 px-4 py-3 sm:max-w-xs"
              type="date"
              value={selectedDate}
              min={todayIso}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setSelectedSlotKey(null);
                setFormMessage(null);
              }}
              required
            />

            {!selectedDate || !trainingTypeId ? (
              <div className="mt-5 rounded border border-dashed border-ink/20 bg-chalk px-4 py-5 text-sm font-semibold text-ink/62">
                Pick a training type and a date to see available times.
              </div>
            ) : isLoadingSlots ? (
              <div className="mt-5 rounded border border-dashed border-ink/20 bg-chalk px-4 py-5 text-sm font-semibold text-ink/62">
                Looking up available times…
              </div>
            ) : slotsError ? (
              <p className="mt-5 rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
                {slotsError}
              </p>
            ) : availableSlots.length === 0 ? (
              <div className="mt-5 rounded border border-dashed border-ink/20 bg-chalk px-4 py-5 text-sm font-semibold text-ink/62">
                No openings on this date. Try another day.
              </div>
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {availableSlots.map((slot) => {
                  const key = slotId(slot);
                  const isSelected = selectedSlotKey === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      className={[
                        "focus-ring min-h-16 rounded border px-4 py-3 text-left transition",
                        isSelected
                          ? "border-clay bg-clay text-white"
                          : "border-ink/10 bg-white hover:border-clay hover:bg-clay/5"
                      ].join(" ")}
                      onClick={() => {
                        setSelectedSlotKey(key);
                        setFormMessage(null);
                      }}
                      aria-pressed={isSelected}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-lg font-black">{formatSlotTime(slot.starts_at)}</span>
                        {isSelected ? <Check size={18} /> : null}
                      </span>
                      <span className={["mt-1 block text-sm", isSelected ? "text-white/78" : "text-ink/62"].join(" ")}>
                        Ends {formatSlotTime(slot.ends_at)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mt-8 rounded border border-ink/10 bg-chalk p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-ink/45">Summary</p>
                <p className="mt-1 font-black">
                  {trainingLabel ?? "Training"} at {selectedSlot ? formatSlotTime(selectedSlot.starts_at) : "a selected time"}
                </p>
                <p className="mt-1 text-sm text-ink/65">
                  {getDateLabel(selectedDate)} for {sessionHours} hour at ${hourlyRate}/hour
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-sm font-bold text-ink/55">Due at booking</p>
                <p className="text-3xl font-black">${total}</p>
              </div>
            </div>
          </section>

          {formMessage ? <p className="mt-4 text-sm font-semibold text-clay">{formMessage}</p> : null}

          <button
            type="submit"
            className="focus-ring mt-6 inline-flex w-full items-center justify-center gap-2 rounded bg-ink px-5 py-3 font-bold text-white transition hover:bg-clay disabled:cursor-not-allowed disabled:bg-ink/35 sm:w-auto"
            disabled={!canContinue}
          >
            Continue to confirm
            <ArrowRight size={18} />
          </button>
        </form>
      </div>

      {showAuthModal ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/55 px-4 py-6 sm:items-center">
          <div
            className="w-full max-w-lg rounded bg-white shadow-soft"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-auth-title"
          >
            <div className="flex items-start justify-between gap-4 border-b border-ink/10 p-5">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-field">Almost booked</p>
                <h2 id="booking-auth-title" className="mt-1 text-2xl font-black">
                  Sign in before confirming.
                </h2>
              </div>
              <button
                type="button"
                className="focus-ring flex h-10 w-10 items-center justify-center rounded bg-chalk text-ink transition hover:bg-steel"
                onClick={() => setShowAuthModal(false)}
                aria-label="Close sign-in modal"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5">
              <button
                type="button"
                onClick={() => void handleGoogleConfirm()}
                disabled={!canContinue || isAuthSubmitting}
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

              <div className="grid grid-cols-2 rounded bg-chalk p-1">
                <button
                  type="button"
                  className={[
                    "focus-ring rounded px-3 py-2 text-sm font-bold transition",
                    authMode === "sign-in" ? "bg-white text-ink shadow-sm" : "text-ink/64 hover:text-ink"
                  ].join(" ")}
                  onClick={() => {
                    setAuthMode("sign-in");
                    setAuthMessage(null);
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={[
                    "focus-ring rounded px-3 py-2 text-sm font-bold transition",
                    authMode === "create-account" ? "bg-white text-ink shadow-sm" : "text-ink/64 hover:text-ink"
                  ].join(" ")}
                  onClick={() => {
                    setAuthMode("create-account");
                    setAuthMessage(null);
                  }}
                >
                  Create account
                </button>
              </div>

              <div className="mt-5 rounded border border-ink/10 p-4">
                <p className="font-black">
                  {trainingLabel} on {getDateLabel(selectedDate)}
                </p>
                <p className="mt-1 text-sm text-ink/65">
                  {selectedSlot ? formatSlotTime(selectedSlot.starts_at) : ""} for {sessionHours} hour. Total: ${total}.
                </p>
              </div>

              <div className="mt-5 grid gap-4">
                {authMode === "create-account" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-bold" htmlFor="full-name">
                        Parent or athlete name
                      </label>
                      <input
                        id="full-name"
                        className="focus-ring mt-2 w-full rounded border border-ink/10 px-4 py-3"
                        type="text"
                        value={authName}
                        onChange={(event) => setAuthName(event.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold" htmlFor="athlete-name">
                        Athlete name
                      </label>
                      <input
                        id="athlete-name"
                        className="focus-ring mt-2 w-full rounded border border-ink/10 px-4 py-3"
                        type="text"
                        value={authAthleteName}
                        onChange={(event) => setAuthAthleteName(event.target.value)}
                        required
                      />
                    </div>
                  </div>
                ) : null}
                <div>
                  <label className="block text-sm font-bold" htmlFor="booking-email">
                    Email
                  </label>
                  <div className="relative mt-2">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/42" size={18} />
                    <input
                      id="booking-email"
                      className="focus-ring w-full rounded border border-ink/10 py-3 pl-10 pr-4"
                      type="email"
                      value={authEmail}
                      onChange={(event) => {
                        setAuthEmail(event.target.value);
                        setAuthMessage(null);
                      }}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold" htmlFor="booking-password">
                    Password
                  </label>
                  <div className="relative mt-2">
                    <LockKeyhole
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/42"
                      size={18}
                    />
                    <input
                      id="booking-password"
                      className="focus-ring w-full rounded border border-ink/10 py-3 pl-10 pr-4"
                      type="password"
                      value={authPassword}
                      onChange={(event) => {
                        setAuthPassword(event.target.value);
                        setAuthMessage(null);
                      }}
                      minLength={6}
                      required
                    />
                  </div>
                </div>
              </div>

              {authMessage ? (
                <p className="mt-4 rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
                  {authMessage}
                </p>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  className="focus-ring inline-flex items-center justify-center rounded border border-ink/12 px-5 py-3 font-bold text-ink transition hover:bg-chalk"
                  onClick={() => setShowAuthModal(false)}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded bg-field px-5 py-3 font-bold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:bg-field/40"
                  onClick={() => void handleConfirm()}
                  disabled={!canConfirm || isAuthSubmitting}
                >
                  {authMode === "create-account" ? <UserPlus size={18} /> : <CreditCard size={18} />}
                  {isAuthSubmitting ? "Working..." : "Continue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function formatAuthError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return error.message ?? "This time is no longer available. Pick another slot.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to continue. Please try again.";
}
