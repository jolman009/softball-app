import { Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminAvailabilityPage } from "./pages/AdminAvailabilityPage";
import { AdminBookingsPage } from "./pages/AdminBookingsPage";
import { AdminClientDetailPage } from "./pages/AdminClientDetailPage";
import { AdminClientsPage } from "./pages/AdminClientsPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminPlaceholderPage } from "./pages/AdminPlaceholderPage";
import { BookingPage } from "./pages/BookingPage";
import { ClientDashboardPage } from "./pages/ClientDashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="booking" element={<BookingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route element={<ProtectedRoute roles={["client", "admin"]} />}>
          <Route path="dashboard" element={<ClientDashboardPage />} />
        </Route>
        <Route element={<ProtectedRoute roles={["admin"]} />}>
          <Route path="admin" element={<AdminDashboardPage />} />
          <Route path="admin/availability" element={<AdminAvailabilityPage />} />
          <Route path="admin/bookings" element={<AdminBookingsPage />} />
          <Route path="admin/clients" element={<AdminClientsPage />} />
          <Route path="admin/clients/:id" element={<AdminClientDetailPage />} />
          <Route
            path="admin/resources"
            element={
              <AdminPlaceholderPage
                title="Resource library"
                phase="Phase 4"
                description="Upload and organize drills, videos, PDFs, and links shared with clients via Supabase Storage."
              />
            }
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
