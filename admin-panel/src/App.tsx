import { Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuthStore } from "./stores/auth-store";

const LoginPage = lazy(() => import("./pages/login"));
const DashboardLayout = lazy(
  () => import("./components/layout/dashboard-layout"),
);
const DashboardPage = lazy(() => import("./pages/dashboard"));
const UsersPage = lazy(() => import("./pages/users"));
const InstitutionsPage = lazy(() => import("./pages/institutions"));
const InstitutionDetailPage = lazy(() => import("./pages/institution-detail"));
const ExamDetailPage = lazy(() => import("./pages/exam-detail"));
const DevicesPage = lazy(() => import("./pages/devices"));
const LiveMonitorPage = lazy(() => import("./pages/live-monitor"));
const ResultsPage = lazy(() => import("./pages/results"));
const AttemptReportPage = lazy(() => import("./pages/attempt-report"));
const ViolationsPage = lazy(() => import("./pages/violations"));
const AnalyticsPage = lazy(() => import("./pages/analytics"));
const AuditLogsPage = lazy(() => import("./pages/audit-logs"));
const SystemSettingsPage = lazy(() => import("./pages/system-settings"));

function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasToken = !!localStorage.getItem("accessToken");
  const location = useLocation();

  if (!isAuthenticated || !hasToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

function PublicOnlyRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasToken = !!localStorage.getItem("accessToken");
  return isAuthenticated && hasToken ? <Navigate to="/" replace /> : <Outlet />;
}

export default function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <>
      <Toaster position="top-right" richColors closeButton />

      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="institutions" element={<InstitutionsPage />} />
              <Route
                path="institutions/:id"
                element={<InstitutionDetailPage />}
              />
              <Route path="devices" element={<DevicesPage />} />
              <Route path="exams/:id" element={<ExamDetailPage />} />
              <Route path="live-monitor" element={<LiveMonitorPage />} />
              <Route path="results" element={<ResultsPage />} />
              <Route path="results/:attemptId" element={<AttemptReportPage />} />
              <Route path="violations" element={<ViolationsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
              <Route path="system-settings" element={<SystemSettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
