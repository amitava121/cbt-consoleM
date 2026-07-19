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
const CentersPage = lazy(() => import("./pages/centers"));
const BatchesPage = lazy(() => import("./pages/batches"));
const SubjectsPage = lazy(() => import("./pages/subjects"));
const QuestionBanksPage = lazy(() => import("./pages/question-banks"));
const QuestionsPage = lazy(() => import("./pages/questions"));
const ExamsPage = lazy(() => import("./pages/exams"));
const ExamBatchesPage = lazy(() => import("./pages/exam-batches"));
const CandidatesPage = lazy(() => import("./pages/candidates"));
const DevicesPage = lazy(() => import("./pages/devices"));
const LiveMonitorPage = lazy(() => import("./pages/live-monitor"));
const AuditLogsPage = lazy(() => import("./pages/audit-logs"));
const SystemSettingsPage = lazy(() => import("./pages/system-settings"));

function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

function PublicOnlyRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Navigate to="/" replace /> : <Outlet />;
}

export default function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <>
      <Toaster position="top-right" richColors />
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
              <Route path="centers" element={<CentersPage />} />
              <Route path="batches" element={<BatchesPage />} />
              <Route path="subjects" element={<SubjectsPage />} />
              <Route path="question-banks" element={<QuestionBanksPage />} />
              <Route path="questions" element={<QuestionsPage />} />
              <Route path="exams" element={<ExamsPage />} />
              <Route path="exam-batches" element={<ExamBatchesPage />} />
              <Route path="candidates" element={<CandidatesPage />} />
              <Route path="devices" element={<DevicesPage />} />
              <Route path="live-monitor" element={<LiveMonitorPage />} />
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
