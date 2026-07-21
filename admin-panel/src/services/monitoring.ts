import api from "./api.js";

export interface ViolationRow {
  id: string;
  attemptId: string;
  violationType: string;
  severity: string;
  description: string;
  evidenceUrl: string | null;
  proctorAction: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ViolationsResponse {
  success: boolean;
  violations: ViolationRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ViolationStats {
  total: number;
  bySeverity: { low: number; medium: number; high: number; critical: number };
  unresolved: number;
}

export interface ProctorEvent {
  id: string;
  attemptId: string;
  eventType: string;
  eventDataJson: unknown;
  mediaUrl: string | null;
  createdAt: string;
}

export const monitoringService = {
  getViolations: (params: {
    page?: number;
    pageSize?: number;
    severity?: string;
    isResolved?: boolean;
  }) => api.get<unknown, ViolationsResponse>("/monitoring/violations", { params }),

  createViolation: (data: {
    attemptId: string;
    violationType: string;
    severity: string;
    description: string;
    evidenceUrl?: string;
  }) => api.post<unknown, { success: boolean; violation: ViolationRow }>("/monitoring/violations", data),

  resolveViolation: (id: string, isResolved: boolean) =>
    api.patch<unknown, { success: boolean; violation: ViolationRow }>(
      `/monitoring/violations/${id}/resolve`,
      { isResolved },
    ),

  proctorAction: (attemptId: string, action: string, reason: string) =>
    api.post<unknown, { success: boolean; action: string; reason: string }>(
      `/monitoring/proctor/${attemptId}/action`,
      { action, reason },
    ),

  getProctorEvents: (attemptId: string) =>
    api.get<unknown, { success: boolean; events: ProctorEvent[] }>(
      `/monitoring/proctor/${attemptId}/events`,
    ),

  getViolationStats: () =>
    api.get<unknown, { success: boolean; stats: ViolationStats }>("/monitoring/violations/stats"),
};
