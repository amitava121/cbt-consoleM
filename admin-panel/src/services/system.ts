import api from "./api";

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  valueType: string;
  description: string | null;
  isEditable: boolean;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface SecurityPolicy {
  id: string;
  policyName: string;
  description: string | null;
  settingsJson: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemSettingListResponse {
  data: SystemSetting[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SecurityPolicyListResponse {
  data: SecurityPolicy[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateSettingInput {
  value: string;
  description?: string;
}

export interface UpdatePolicyInput {
  description?: string;
  settingsJson: Record<string, unknown>;
  isActive?: boolean;
}

export const systemService = {
  listSettings: (params: { page?: number; pageSize?: number; search?: string }) =>
    api.get<unknown, SystemSettingListResponse>("/system-settings", { params }),

  updateSetting: (key: string, data: UpdateSettingInput) =>
    api.put<unknown, SystemSetting>(`/system-settings/${key}`, data),

  listPolicies: (params: { page?: number; pageSize?: number; search?: string }) =>
    api.get<unknown, SecurityPolicyListResponse>("/security-policies", { params }),

  updatePolicy: (id: string, data: UpdatePolicyInput) =>
    api.put<unknown, SecurityPolicy>(`/security-policies/${id}`, data),

  healthDetailed: () =>
    api.get<unknown, {
      status: string;
      timestamp: string;
      uptime: number;
      environment: string;
      database: { status: string; latencyMs: number | null; pool: { total: number; idle: number; waiting: number } };
      memory: { rssMB: number; heapUsedMB: number; heapTotalMB: number; externalMB: number };
      process: { pid: number; nodeVersion: string; platform: string };
    }>("/health/detailed"),
};
