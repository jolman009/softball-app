import { useMemo, useState } from "react";
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

const trainingTypes = ["Batting", "Pitching", "Defense/Infield", "Defense/Outfield", "Other"] as const;

type TrainingType = (typeof trainingTypes)[number];
type AuthMode = "sign-in" | "create-account";

type Slot = {
  id: string;
  time: string;
  coachNote: string;
};

const mockSlots: Slot[] = [
  { id: "slot-1", time: "9:00 AM", coachNote: "Open cage and field reps" },
  { id: "slot-2", time: "10:30 AM", coachNote: "Great for pitching work" },
  { id: "slot-3", time: "4:00 PM", coachNote: "After school favorite" },
  { id: "slot-4", time: "5:30 PM", coachNote: "Golden hour field time" },
  { id: "slot-5", time: "7:00 PM", coachNote: "Lights available" }
];

const hourlyRate = 30;
const sessionHours = 1;
const todayIso = new Date().toISOString().slice(0, 10);

function getDateLabel(date: string) {
  if (!date) return "Choose a date";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}

export function BookingPage() {
  const navigate = useNavigate();
  const [trainingType, setTrainingType] = useState<TrainingType | null>(null);
  const [otherTraining, setOtherTraining] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const selectedSlot = useMemo(
    () => mockSlots.find((slot) => slot.id === selectedSlotId) ?? null,
    [selectedSlotId]
  );
  const isOtherMissing = trainingType === "Other" && otherTraining.trim().length === 0;
  const trainingLabel = trainingType === "Other" ? otherTraining.trim() || "Other training" : trainingType;
  const total = hourlyRate * sessionHours;
  const canContinue = Boolean(trainingType && selectedDate && selectedSlot && !isOtherMissing);
  const canConfirm =
    authEmail.trim().length > 0 &&
    authPassword.trim().length > 0 &&
    (authMode === "sign-in" || authName.trim().length > 0);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(null);

    if (!canContinue) {
      setFormMessage("Choose a training type, date, and time before confirming.");
      return;
    }

    setShowAuthModal(true);
  }

  function handleConfirm() {
    setShowAuthModal(false);
    navigate("/dashboard", { state: { bookingFlowConfirmed: true } });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
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
                <p className="text-sm text-white/70">$30 per hour</p>
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
                <dd className="font-bold">{selectedSlot?.time ?? "Choose a time"}</dd>
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

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {trainingTypes.map((type) => {
                const isSelected = trainingType === type;

                return (
                  <button
                    key={type}
                    type="button"
                    className={[
                      "focus-ring flex min-h-16 items-center justify-between rounded border px-4 py-3 text-left font-semibold transition",
                      isSelected
                        ? "border-field bg-field text-white"
                        : "border-ink/10 bg-white hover:border-field hover:bg-field/5"
                    ].join(" ")}
                    onClick={() => {
                      setTrainingType(type);
                      setFormMessage(null);
                    }}
                    aria-pressed={isSelected}
                  >
                    <span>{type}</span>
                    {isSelected ? <Check size={18} /> : null}
                  </button>
                );
              })}
            </div>

            {trainingType === "Other" ? (
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
                setSelectedSlotId(null);
                setFormMessage(null);
              }}
              required
            />

            {selectedDate ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {mockSlots.map((slot) => {
                  const isSelected = selectedSlotId === slot.id;

                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className={[
                        "focus-ring min-h-24 rounded border px-4 py-3 text-left transition",
                        isSelected
                          ? "border-clay bg-clay text-white"
                          : "border-ink/10 bg-white hover:border-clay hover:bg-clay/5"
                      ].join(" ")}
                      onClick={() => {
                        setSelectedSlotId(slot.id);
                        setFormMessage(null);
                      }}
                      aria-pressed={isSelected}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-lg font-black">{slot.time}</span>
                        {isSelected ? <Check size={18} /> : null}
                      </span>
                      <span className={["mt-2 block text-sm", isSelected ? "text-white/78" : "text-ink/62"].join(" ")}>
                        {slot.coachNote}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded border border-dashed border-ink/20 bg-chalk px-4 py-5 text-sm font-semibold text-ink/62">
                Select a lesson date to view available mock time slots.
              </div>
            )}
          </section>

          <section className="mt-8 rounded border border-ink/10 bg-chalk p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-ink/45">Summary</p>
                <p className="mt-1 font-black">
                  {trainingLabel ?? "Training"} at {selectedSlot?.time ?? "a selected time"}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 px-4 py-6">
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
              <div className="grid grid-cols-2 rounded bg-chalk p-1">
                <button
                  type="button"
                  className={[
                    "focus-ring rounded px-3 py-2 text-sm font-bold transition",
                    authMode === "sign-in" ? "bg-white text-ink shadow-sm" : "text-ink/64 hover:text-ink"
                  ].join(" ")}
                  onClick={() => setAuthMode("sign-in")}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={[
                    "focus-ring rounded px-3 py-2 text-sm font-bold transition",
                    authMode === "create-account" ? "bg-white text-ink shadow-sm" : "text-ink/64 hover:text-ink"
                  ].join(" ")}
                  onClick={() => setAuthMode("create-account")}
                >
                  Create account
                </button>
              </div>

              <div className="mt-5 rounded border border-ink/10 p-4">
                <p className="font-black">
                  {trainingLabel} on {getDateLabel(selectedDate)}
                </p>
                <p className="mt-1 text-sm text-ink/65">
                  {selectedSlot?.time} for {sessionHours} hour. Total: ${total}.
                </p>
              </div>

              <div className="mt-5 grid gap-4">
                {authMode === "create-account" ? (
                  <div>
                    <label className="block text-sm font-bold" htmlFor="full-name">
                      Full name
                    </label>
                    <input
                      id="full-name"
                      className="focus-ring mt-2 w-full rounded border border-ink/10 px-4 py-3"
                      type="text"
                      value={authName}
                      onChange={(event) => setAuthName(event.target.value)}
                      placeholder="Athlete or parent name"
                      required
                    />
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
                      onChange={(event) => setAuthEmail(event.target.value)}
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
                      onChange={(event) => setAuthPassword(event.target.value)}
                      placeholder="Mock password field"
                      required
                    />
                  </div>
                </div>
              </div>

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
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                >
                  {authMode === "create-account" ? <UserPlus size={18} /> : <CreditCard size={18} />}
                  Confirm booking
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
