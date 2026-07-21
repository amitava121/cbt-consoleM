import api from "./api";

export interface DashboardStats {
  users: number;
  institutions: number;
  subjects: number;
  questions: number;
  exams: number;
  candidates: number;
  devices: number;
  activeBatches: number;
  activeAttempts: number;
  violations: number;
  unresolvedViolations: number;
}

export interface RecentExam {
  id: string;
  name: string;
  code: string;
  durationMinutes: number;
  totalMarks: string;
  isActive: boolean;
  createdAt: string;
  subjectName: string | null;
}

export interface RecentViolation {
  id: string;
  violationType: string;
  severity: string;
  isResolved: boolean;
  createdAt: string;
}

export interface ExamStatusBreakdown {
  status: string;
  count: number;
}

export const dashboardService = {
  getStats: () => api.get<unknown, DashboardStats>("/dashboard/stats"),

  getRecentExams: () =>
    api.get<unknown, { data: RecentExam[] }>("/dashboard/recent-exams"),

  getRecentViolations: () =>
    api.get<unknown, { data: RecentViolation[] }>(
      "/dashboard/recent-violations",
    ),

  getExamStatusBreakdown: () =>
    api.get<unknown, { data: ExamStatusBreakdown[] }>(
      "/dashboard/exam-status-breakdown",
    ),
};
