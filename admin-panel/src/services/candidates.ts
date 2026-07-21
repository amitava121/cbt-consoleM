import type {
    BulkImportInput,
    BulkImportResult,
    CandidateDetail,
    CandidateListItem,
    CreateCandidateInput,
    PaginatedResponse,
    UpdateCandidateInput,
} from "../types/index.js";
import api from "./api.js";

export const candidateService = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    batchId?: string;
    isActive?: string;
    institutionId?: string;
  }) =>
    api.get<unknown, PaginatedResponse<CandidateListItem>>("/candidates", {
      params,
    }),

  getById: (id: string) =>
    api.get<unknown, CandidateDetail>(`/candidates/${id}`),

  create: (data: CreateCandidateInput) =>
    api.post<unknown, { id: string }>("/candidates", data),

  update: (id: string, data: UpdateCandidateInput) =>
    api.put<unknown, { id: string }>(`/candidates/${id}`, data),

  bulkImport: (data: BulkImportInput) =>
    api.post<unknown, BulkImportResult>("/candidates/bulk", data),

  delete: (id: string) =>
    api.delete<unknown, { message: string }>(`/candidates/${id}`),

  downloadTemplate: () =>
    api.get("/candidates/template", { responseType: "blob" }),

  assignToBatch: (batchId: string, candidateIds: string[]) =>
    api.post<unknown, { message: string; assigned: number }>(
      "/candidates/assign",
      { batchId, candidateIds },
    ),

  removeFromBatch: (batchId: string, candidateId: string) =>
    api.delete<unknown, { message: string }>("/candidates/remove-from-batch", {
      data: { batchId, candidateId },
    }),
};
