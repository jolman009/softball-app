import { Navigate, Outlet, useLocation } from "react-router-dom";
import { hasRole, useAuth } from "@/lib/auth";
import type { AppRole } from "@/lib/supabase";

type ProtectedRouteProps = {
  roles?: AppRole[];
};

export function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { profile, session, isLoading } = useAuth();
  const location = useLocation();
  const bookingFlowConfirmed =
    location.pathname === "/dashboard" &&
    Boolean((location.state as { bookingFlowConfirmed?: boolean } | null)?.bookingFlowConfirmed);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="h-2 w-48 overflow-hidden rounded bg-ink/10">
          <div className="h-full w-1/2 animate-pulse rounded bg-clay" />
        </div>
      </main>
    );
  }

  if (!session && !bookingFlowConfirmed) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (bookingFlowConfirmed && roles?.includes("client")) {
    return <Outlet />;
  }

  if (roles && !hasRole(profile, roles)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
