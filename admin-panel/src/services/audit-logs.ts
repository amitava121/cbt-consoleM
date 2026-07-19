import api from "./api";

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
  timestamp: string;
  userFullName: string | null;
  userEmail: string | null;
}

export interface AuditLogListResponse {
  data: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogQuery {
  page?: number;
  pageSize?: number;
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
}

export const auditLogService = {
  list: (params: AuditLogQuery) =>
    api.get<unknown, AuditLogListResponse>("/audit-logs", { params }),

  export: (format?: "json" | "csv") =>
    api.get<unknown, AuditLog[] | string>("/audit-logs/export", {
      params: { format },
      responseType: format === "csv" ? "text" : "json",
    }),
};
