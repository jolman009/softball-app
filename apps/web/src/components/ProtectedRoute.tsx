import { Navigate, Outlet, useLocation } from "react-router-dom";
import { hasRole, useAuth } from "@/lib/auth";
import type { AppRole } from "@/lib/supabase";

type ProtectedRouteProps = {
  roles?: AppRole[];
};

export function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { profile, session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="h-2 w-48 overflow-hidden rounded bg-ink/10">
          <div className="h-full w-1/2 animate-pulse rounded bg-clay" />
        </div>
      </main>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-clay">Profile required</p>
        <h1 className="mt-3 text-3xl font-black">We could not load your app profile.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-ink/70">
          Your Supabase session is active, but the matching app profile is missing. Try signing out and back in, or
          ask an admin to verify your profile record.
        </p>
      </main>
    );
  }

  if (roles && !hasRole(profile, roles)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
