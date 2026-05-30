import { Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminAvailabilityPage } from "./pages/AdminAvailabilityPage";
import { AdminBookingsPage } from "./pages/AdminBookingsPage";
import { AdminClientDetailPage } from "./pages/AdminClientDetailPage";
import { AdminClientsPage } from "./pages/AdminClientsPage";
import { AdminAuditLogPage } from "./pages/AdminAuditLogPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminResourcesPage } from "./pages/AdminResourcesPage";
import { AdminUploadReviewPage } from "./pages/AdminUploadReviewPage";
import { AdminUploadsPage } from "./pages/AdminUploadsPage";
import { BookingPage } from "./pages/BookingPage";
import { ClientDashboardPage } from "./pages/ClientDashboardPage";
import { ClientResourcesPage } from "./pages/ClientResourcesPage";
import { ClientUploadDetailPage } from "./pages/ClientUploadDetailPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { ResourceDetailPage } from "./pages/ResourceDetailPage";

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
          <Route path="resources" element={<ClientResourcesPage />} />
          <Route path="resources/:id" element={<ResourceDetailPage />} />
          <Route path="uploads/:id" element={<ClientUploadDetailPage />} />
        </Route>
        <Route element={<ProtectedRoute roles={["admin"]} />}>
          <Route path="admin" element={<AdminDashboardPage />} />
          <Route path="admin/availability" element={<AdminAvailabilityPage />} />
          <Route path="admin/bookings" element={<AdminBookingsPage />} />
          <Route path="admin/clients" element={<AdminClientsPage />} />
          <Route path="admin/clients/:id" element={<AdminClientDetailPage />} />
          <Route path="admin/resources" element={<AdminResourcesPage />} />
          <Route path="admin/uploads" element={<AdminUploadsPage />} />
          <Route path="admin/uploads/:id" element={<AdminUploadReviewPage />} />
          <Route path="admin/audit" element={<AdminAuditLogPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
