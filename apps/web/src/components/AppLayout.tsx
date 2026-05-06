import { Link, NavLink, Outlet } from "react-router-dom";
import { CalendarDays, LogOut, Shield, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded px-3 py-2 text-sm font-medium transition",
    isActive ? "bg-ink text-white" : "text-ink/70 hover:bg-white/70 hover:text-ink"
  ].join(" ");

export function AppLayout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="page-shell">
      <header className="border-b border-ink/10 bg-chalk/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-lg font-black tracking-normal text-ink">
            Softball Training
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/booking" className={navLinkClass}>
              Book
            </NavLink>
            <NavLink to="/dashboard" className={navLinkClass}>
              Client
            </NavLink>
            <NavLink to="/admin" className={navLinkClass}>
              Admin
            </NavLink>
          </nav>
          <div className="hidden items-center gap-2 sm:flex">
            {profile ? (
              <>
                <span className="inline-flex items-center gap-2 text-sm text-ink/70">
                  {profile.role === "admin" ? <Shield size={16} /> : <UserRound size={16} />}
                  {profile.email}
                </span>
                <button
                  type="button"
                  className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded bg-white text-ink transition hover:bg-steel"
                  onClick={() => void signOut()}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="focus-ring inline-flex items-center gap-2 rounded bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-clay"
              >
                <CalendarDays size={16} />
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
