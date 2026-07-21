import type { PaginatedResponse, Subject } from "../types/index.js";
import api from "./api.js";

export const subjectsService = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    institutionId?: string;
    batchId?: string;
  }) => api.get<unknown, PaginatedResponse<Subject>>("/subjects", { params }),

  create: (data: {
    institutionId: string;
    name: string;
    code: string;
    description?: string;
  }) => api.post<unknown, Subject>("/subjects", data),

  update: (
    id: string,
    data: Partial<{
      name: string;
      code: string;
      description: string;
      isActive: boolean;
    }>,
  ) => api.put<unknown, Subject>(`/subjects/${id}`, data),

  getBatchSubjects: (batchId: string) =>
    api.get<unknown, { data: Subject[]; total: number }>(
      `/subjects/batch/${batchId}`,
    ),

  addBatchSubjects: (batchId: string, subjectIds: string[]) =>
    api.post<unknown, { added: number }>(`/subjects/batch/${batchId}`, {
      subjectIds,
    }),

  removeBatchSubject: (batchId: string, subjectId: string) =>
    api.delete(`/subjects/batch/${batchId}/${subjectId}`),

  permanentDelete: (id: string) =>
    api.delete<unknown, { message: string }>(`/subjects/${id}/permanent`),
};
